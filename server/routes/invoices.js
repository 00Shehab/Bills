// مسارات الفواتير والبنود (CRUD على القاعدة المركزية)
// الكتابة تمر عبر changeTracker لتسجيل النشاط والبثّ (يُفعّل في المرحلة 3).
import { randomUUID } from 'node:crypto';
import { db, now } from '../db.js';
import { requireUser } from '../auth.js';
import { trackRowChange, trackInvoiceChange } from '../changeTracker.js';

const VALID_TYPES = ['lower', 'upper', 'rev', 'other'];
const SUMKEY = { lower: 'amount', upper: 'amount', rev: 'rent', other: 'amount' };

const qList       = db.prepare(`SELECT * FROM invoices WHERE status='active' ORDER BY created_at DESC`);
const qInvoice    = db.prepare(`SELECT * FROM invoices WHERE id=? AND status='active'`);
const qRows       = db.prepare(`SELECT * FROM invoice_rows WHERE invoice_id=? AND status='active' ORDER BY position ASC`);
const insInvoice  = db.prepare(`INSERT INTO invoices(id,type,month,year,created_by,created_at,updated_by,updated_at,status) VALUES(?,?,?,?,?,?,?,?,'active')`);
const updInvoice  = db.prepare(`UPDATE invoices SET month=?, year=?, updated_by=?, updated_at=? WHERE id=?`);
const delInvoice  = db.prepare(`UPDATE invoices SET status='deleted', deleted_by=?, deleted_at=? WHERE id=?`);
const insRow      = db.prepare(`INSERT INTO invoice_rows(id,invoice_id,position,data,committed,origin_committed,created_by,created_at,updated_by,updated_at,status) VALUES(?,?,?,?,?,?,?,?,?,?,'active')`);
const updRowData  = db.prepare(`UPDATE invoice_rows SET data=?, updated_by=?, updated_at=? WHERE id=?`);
const getRow      = db.prepare(`SELECT * FROM invoice_rows WHERE id=?`);
const delRow      = db.prepare(`UPDATE invoice_rows SET status='deleted', deleted_by=?, deleted_at=? WHERE id=?`);

const toLatin = s => String(s ?? '').replace(/[٠-٩]/g, d => d.charCodeAt(0) - 0x0660).replace(/[۰-۹]/g, d => d.charCodeAt(0) - 0x06F0);
const num = v => parseFloat(toLatin(v).replace(/[^\d.\-]/g, '')) || 0;
const rowOut = r => ({ id: r.id, position: r.position, data: JSON.parse(r.data || '{}'),
                       created_by: r.created_by, updated_by: r.updated_by });
const isEmpty = d => !d || Object.values(d).every(v => !String(v ?? '').trim());

export function mountInvoices(app) {
  // قائمة الفواتير مع عدد البنود والإجمالي
  app.get('/api/invoices', requireUser, (req, res) => {
    const list = qList.all().map(inv => {
      const rows = qRows.all(inv.id).map(r => JSON.parse(r.data || '{}'));
      const sk = SUMKEY[inv.type] || 'amount';
      const total = rows.reduce((a, d) => a + num(d[sk]), 0);
      const count = rows.filter(d => !isEmpty(d)).length;
      return { id: inv.id, type: inv.type, month: inv.month, year: inv.year,
               created_by: inv.created_by, created_at: inv.created_at, count, total };
    });
    res.json({ invoices: list });
  });

  // إنشاء فاتورة
  app.post('/api/invoices', requireUser, (req, res) => {
    const { type } = req.body || {};
    if (!VALID_TYPES.includes(type)) return res.status(400).json({ error: 'نوع غير صالح' });
    const id = 'inv_' + randomUUID();
    const t = now(), u = req.session.user;
    const month = Number(req.body.month), year = Number(req.body.year);
    insInvoice.run(id, type, month, year, u, t, u, t);
    trackInvoiceChange({ action: 'create_invoice', invoice: { id, type, month, year }, actor: u });
    res.json({ invoice: { id, type, month, year, created_by: u, created_at: t } });
  });

  // فاتورة واحدة + بنودها
  app.get('/api/invoices/:id', requireUser, (req, res) => {
    const inv = qInvoice.get(req.params.id);
    if (!inv) return res.status(404).json({ error: 'الفاتورة غير موجودة' });
    res.json({ invoice: inv, rows: qRows.all(inv.id).map(rowOut) });
  });

  // تعديل شهر/سنة
  app.patch('/api/invoices/:id', requireUser, (req, res) => {
    const inv = qInvoice.get(req.params.id);
    if (!inv) return res.status(404).json({ error: 'الفاتورة غير موجودة' });
    const month = req.body.month != null ? Number(req.body.month) : inv.month;
    const year = req.body.year != null ? Number(req.body.year) : inv.year;
    updInvoice.run(month, year, req.session.user, now(), inv.id);
    res.json({ ok: true });
  });

  // حذف فاتورة (ناعم)
  app.delete('/api/invoices/:id', requireUser, (req, res) => {
    const inv = qInvoice.get(req.params.id);
    if (!inv) return res.status(404).json({ error: 'الفاتورة غير موجودة' });
    delInvoice.run(req.session.user, now(), inv.id);
    trackInvoiceChange({ action: 'delete_invoice', invoice: inv, actor: req.session.user });
    res.json({ ok: true });
  });

  // إنشاء بند
  app.post('/api/invoices/:id/rows', requireUser, (req, res) => {
    const inv = qInvoice.get(req.params.id);
    if (!inv) return res.status(404).json({ error: 'الفاتورة غير موجودة' });
    const id = 'row_' + randomUUID();
    const t = now(), u = req.session.user;
    const data = req.body.data || {};
    const position = Number(req.body.position) || 0;
    insRow.run(id, inv.id, position, JSON.stringify(data), null, 0, u, t, u, t);
    trackRowChange({ rowId: id, invoice: inv, actor: u, newData: data });
    res.json({ row: { id, position, data } });
  });

  // تعديل بند
  app.patch('/api/invoices/:id/rows/:rid', requireUser, (req, res) => {
    const r = getRow.get(req.params.rid);
    if (!r || r.status !== 'active') return res.status(404).json({ error: 'البند غير موجود' });
    const data = req.body.data || {};
    updRowData.run(JSON.stringify(data), req.session.user, now(), r.id);
    const inv = qInvoice.get(r.invoice_id);
    trackRowChange({ rowId: r.id, invoice: inv, actor: req.session.user, newData: data });
    res.json({ ok: true });
  });

  // حذف بند (ناعم)
  app.delete('/api/invoices/:id/rows/:rid', requireUser, (req, res) => {
    const r = getRow.get(req.params.rid);
    if (!r || r.status !== 'active') return res.status(404).json({ error: 'البند غير موجود' });
    delRow.run(req.session.user, now(), r.id);
    const inv = qInvoice.get(r.invoice_id);
    trackRowChange({ rowId: r.id, invoice: inv, actor: req.session.user, deleted: true });
    res.json({ ok: true });
  });
}
