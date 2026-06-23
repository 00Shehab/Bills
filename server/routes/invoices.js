// مسارات الفواتير والبنود (CRUD على PostgreSQL) — Server-side
import { randomUUID } from 'node:crypto';
import { db, now } from '../db.js';
import { requireUser } from '../auth.js';
import { trackRowChange, trackInvoiceChange } from '../changeTracker.js';

const VALID_TYPES = ['lower', 'upper', 'rev', 'other', 'receipt', 'letter', 'income', 'expense'];
const SUMKEY = {
  lower: 'amount',
  upper: 'amount',
  rev: 'paid',
  other: 'amount',
  receipt: 'amount',
  letter: 'amount',
  income: 'amount',
  expense: 'amount',
};

const qList = db.prepare(`
  SELECT *
  FROM invoices
  WHERE status = 'active'
  ORDER BY created_at DESC
`);

const qInvoice = db.prepare(`
  SELECT *
  FROM invoices
  WHERE id = ? AND status = 'active'
  LIMIT 1
`);

const qRows = db.prepare(`
  SELECT *
  FROM invoice_rows
  WHERE invoice_id = ? AND status = 'active'
  ORDER BY position ASC, created_at ASC
`);

const insInvoice = db.prepare(`
  INSERT INTO invoices (
    id, type, month, year, created_by, created_at,
    updated_by, updated_at, status, meta
  )
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'active', ?)
`);

const updInvoice = db.prepare(`
  UPDATE invoices
  SET month = ?, year = ?, meta = ?, updated_by = ?, updated_at = ?
  WHERE id = ? AND status = 'active'
`);

const delInvoice = db.prepare(`
  UPDATE invoices
  SET status = 'deleted', deleted_by = ?, deleted_at = ?
  WHERE id = ? AND status = 'active'
`);

const delInvoiceRows = db.prepare(`
  UPDATE invoice_rows
  SET status = 'deleted', deleted_by = ?, deleted_at = ?
  WHERE invoice_id = ? AND status = 'active'
`);

const insRow = db.prepare(`
  INSERT INTO invoice_rows (
    id, invoice_id, position, data, committed, origin_committed,
    created_by, created_at, updated_by, updated_at, status
  )
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active')
`);

const updRowData = db.prepare(`
  UPDATE invoice_rows
  SET data = ?, updated_by = ?, updated_at = ?
  WHERE id = ? AND status = 'active'
`);

const getRow = db.prepare(`
  SELECT *
  FROM invoice_rows
  WHERE id = ?
  LIMIT 1
`);

const delRow = db.prepare(`
  UPDATE invoice_rows
  SET status = 'deleted', deleted_by = ?, deleted_at = ?
  WHERE id = ? AND status = 'active'
`);

const toLatin = (s) =>
  String(s ?? '')
    .replace(/[٠-٩]/g, d => String(d.charCodeAt(0) - 0x0660))
    .replace(/[۰-۹]/g, d => String(d.charCodeAt(0) - 0x06F0));

const num = (v) => {
  const n = parseFloat(toLatin(v).replace(/[^\d.\-]/g, ''));
  return Number.isFinite(n) ? n : 0;
};

const parseMeta = (s) => {
  try {
    return JSON.parse(s || '{}');
  } catch {
    return {};
  }
};

const parseData = (s) => {
  try {
    return JSON.parse(s || '{}');
  } catch {
    return {};
  }
};

const isEmpty = (d) => !d || Object.values(d).every(v => !String(v ?? '').trim());

const rowOut = (r) => ({
  id: r.id,
  position: Number(r.position || 0),
  data: parseData(r.data),
  created_by: r.created_by,
  updated_by: r.updated_by,
});

const invoiceOut = (inv) => ({
  ...inv,
  month: Number(inv.month || 0),
  year: Number(inv.year || 0),
  meta: parseMeta(inv.meta),
});

const ah = (fn) => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch((e) => {
    console.error('[invoices]', e.message);
    if (!res.headersSent) res.status(500).json({ error: 'خطأ في الخادم' });
  });

function invoiceLabel(inv) {
  const months = ['يناير','فبراير','مارس','أبريل','مايو','يونيو','يوليو','أغسطس','سبتمبر','أكتوبر','نوفمبر','ديسمبر'];
  const titleMap = {
    lower: 'فاتورة البيت الأسفل',
    upper: 'فاتورة البيت الأعلى',
    rev: 'فاتورة الإيرادات',
    other: 'معاملات أخرى',
    receipt: 'سند قبض',
    letter: 'خطابات مجمع الهاشمي',
    income: 'الدخل',
    expense: 'المصروفات',
  };
  const title = titleMap[inv.type] || inv.type || 'فاتورة';
  const month = months[Math.max(0, Number(inv.month || 1) - 1)] || String(inv.month || '');
  return `${title} - ${month} ${inv.year || ''}`.trim();
}

async function loadInvoiceWithRows(id) {
  const inv = await qInvoice.get(id);
  if (!inv) return null;
  const rows = await qRows.all(id);
  return {
    invoice: invoiceOut(inv),
    rows: rows.map(rowOut),
  };
}

export function mountInvoices(app) {
  // قائمة الفواتير مع العدد والإجمالي
  app.get('/api/invoices', requireUser, ah(async (req, res) => {
    const invoices = await qList.all();
    const list = [];

    for (const inv of invoices) {
      const rows = await qRows.all(inv.id);
      const cfgKey = SUMKEY[inv.type] || 'amount';
      const parsedRows = rows.map(r => parseData(r.data));

      const total = parsedRows.reduce((acc, d) => acc + num(d[cfgKey]), 0);
      const count = parsedRows.filter(d => !isEmpty(d)).length;

      const entry = {
        id: inv.id,
        type: inv.type,
        month: Number(inv.month || 0),
        year: Number(inv.year || 0),
        created_by: inv.created_by,
        created_at: inv.created_at,
        count,
        total,
      };

      // تفصيل فاتورة الإيرادات لعرضه في البطاقة من الخارج: الإيجارات + المُحصّل + المتبقي
      if (inv.type === 'rev') {
        let rent = 0, collected = 0, remaining = 0;
        for (const d of parsedRows) {
          rent += num(d.rent);
          collected += num(d.paid);
          const manual = String(d.remaining ?? '').trim();
          remaining += manual ? num(manual) : Math.max(num(d.rent) - num(d.paid), 0);
        }
        entry.rentTotal = rent;
        entry.collectedTotal = collected;
        entry.remainingTotal = remaining;
      }

      list.push(entry);
    }

    res.json({ invoices: list });
  }));

  // إنشاء فاتورة
  app.post('/api/invoices', requireUser, ah(async (req, res) => {
    const { type } = req.body || {};
    if (!VALID_TYPES.includes(type)) {
      return res.status(400).json({ error: 'نوع غير صالح' });
    }

    const id = 'inv_' + randomUUID();
    const t = now();
    const u = req.session.user || req.session.activeUser || 'user';
    const month = Number(req.body?.month);
    const year = Number(req.body?.year);
    const meta = JSON.stringify(req.body?.meta ?? {});

    await insInvoice.run(
      id,
      type,
      month,
      year,
      u,
      t,
      u,
      t,
      meta
    );

    const invoice = { id, type, month, year, created_by: u, created_at: t, meta: parseMeta(meta) };
    await trackInvoiceChange({ action: 'create_invoice', invoice, actor: u });

    res.json({
      invoice,
    });
  }));

  // فاتورة واحدة + بنودها
  app.get('/api/invoices/:id', requireUser, ah(async (req, res) => {
    const data = await loadInvoiceWithRows(req.params.id);
    if (!data) {
      return res.status(404).json({ error: 'الفاتورة غير موجودة' });
    }
    res.json(data);
  }));

  // تعديل شهر/سنة/بيانات إضافية
  app.patch('/api/invoices/:id', requireUser, ah(async (req, res) => {
    const inv = await qInvoice.get(req.params.id);
    if (!inv) {
      return res.status(404).json({ error: 'الفاتورة غير موجودة' });
    }

    const month = req.body?.month != null ? Number(req.body.month) : Number(inv.month);
    const year = req.body?.year != null ? Number(req.body.year) : Number(inv.year);
    const meta = req.body?.meta != null ? JSON.stringify(req.body.meta || {}) : (inv.meta || '{}');
    const t = now();
    const u = req.session.user || req.session.activeUser || 'user';

    await updInvoice.run(month, year, meta, u, t, inv.id);

    res.json({
      ok: true,
      invoice: {
        ...invoiceOut(inv),
        month,
        year,
        meta: parseMeta(meta),
        updated_by: u,
        updated_at: t,
      },
    });
  }));

  // حذف فاتورة (ناعم) + حذف بنودها أيضًا
  app.delete('/api/invoices/:id', requireUser, ah(async (req, res) => {
    const inv = await qInvoice.get(req.params.id);
    if (!inv) {
      return res.status(404).json({ error: 'الفاتورة غير موجودة' });
    }

    const t = now();
    const u = req.session.user || req.session.activeUser || 'user';

    await delInvoice.run(u, t, inv.id);
    await delInvoiceRows.run(u, t, inv.id);

    await trackInvoiceChange({
      action: 'delete_invoice',
      invoice: invoiceOut(inv),
      actor: u,
    });

    res.json({ ok: true });
  }));

  // إنشاء بند
  app.post('/api/invoices/:id/rows', requireUser, ah(async (req, res) => {
    const inv = await qInvoice.get(req.params.id);
    if (!inv) {
      return res.status(404).json({ error: 'الفاتورة غير موجودة' });
    }

    const id = 'row_' + randomUUID();
    const t = now();
    const u = req.session.user || req.session.activeUser || 'user';
    const data = req.body?.data || {};
    const position = Number(req.body?.position) || 0;

    await insRow.run(
      id,
      inv.id,
      position,
      JSON.stringify(data),
      null,
      0,
      u,
      t,
      u,
      t
    );

    trackRowChange({
      rowId: id,
      invoice: invoiceOut(inv),
      actor: u,
    });

    res.json({
      row: {
        id,
        position,
        data,
        created_by: u,
        updated_by: u,
      },
    });
  }));

  // تعديل بند
  app.patch('/api/invoices/:id/rows/:rid', requireUser, ah(async (req, res) => {
    const inv = await qInvoice.get(req.params.id);
    if (!inv) {
      return res.status(404).json({ error: 'الفاتورة غير موجودة' });
    }

    const r = await getRow.get(req.params.rid);
    if (!r || r.status !== 'active' || r.invoice_id !== inv.id) {
      return res.status(404).json({ error: 'البند غير موجود' });
    }

    const data = req.body?.data || {};
    const t = now();
    const u = req.session.user || req.session.activeUser || 'user';

    await updRowData.run(JSON.stringify(data), u, t, r.id);

    trackRowChange({
      rowId: r.id,
      invoice: invoiceOut(inv),
      actor: u,
    });

    res.json({ ok: true, row: { id: r.id, position: r.position, data } });
  }));

  // حذف بند (ناعم)
  app.delete('/api/invoices/:id/rows/:rid', requireUser, ah(async (req, res) => {
    const inv = await qInvoice.get(req.params.id);
    if (!inv) {
      return res.status(404).json({ error: 'الفاتورة غير موجودة' });
    }

    const r = await getRow.get(req.params.rid);
    if (!r || r.status !== 'active' || r.invoice_id !== inv.id) {
      return res.status(404).json({ error: 'البند غير موجود' });
    }

    const t = now();
    const u = req.session.user || req.session.activeUser || 'user';

    await delRow.run(u, t, r.id);

    trackRowChange({
      rowId: r.id,
      invoice: invoiceOut(inv),
      actor: u,
    });

    res.json({ ok: true });
  }));
}