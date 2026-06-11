// لوحة الأدمن: السجل الكامل + سلة المحذوفات + الاسترجاع + النسخ الاحتياطية واللقطات
import fs from 'node:fs';
import path from 'node:path';
import { db, now, DB_PATH, BACKUP_DIR } from '../db.js';
import { requireAdmin } from '../auth.js';
import { recordActivity } from '../changeTracker.js';

const TYPE_TITLES = { lower:'فاتورة البيت الأسفل', upper:'فاتورة البيت الأعلى', rev:'فاتورة الإيرادات', other:'معاملات أخرى', receipt:'سند قبض' };
const MONTHS = ['يناير','فبراير','مارس','أبريل','مايو','يونيو','يوليو','أغسطس','سبتمبر','أكتوبر','نوفمبر','ديسمبر'];

const qLog        = db.prepare(`SELECT * FROM activity_log ORDER BY id DESC LIMIT 300`);
const qDelInv     = db.prepare(`SELECT * FROM invoices WHERE status='deleted' ORDER BY deleted_at DESC`);
const qDelRows    = db.prepare(`SELECT r.*, i.type AS inv_type, i.month AS inv_month, i.year AS inv_year FROM invoice_rows r LEFT JOIN invoices i ON i.id=r.invoice_id WHERE r.status='deleted' ORDER BY r.deleted_at DESC`);
const getInv      = db.prepare(`SELECT * FROM invoices WHERE id=?`);
const getRow      = db.prepare(`SELECT * FROM invoice_rows WHERE id=?`);
const restoreInv  = db.prepare(`UPDATE invoices SET status='active', deleted_by=NULL, deleted_at=NULL WHERE id=?`);
const restoreRow  = db.prepare(`UPDATE invoice_rows SET status='active', deleted_by=NULL, deleted_at=NULL WHERE id=?`);
const insSnap     = db.prepare(`INSERT INTO snapshots(created_by, created_at, note, file_path, kind) VALUES(?,?,?,?,?)`);
const qSnaps      = db.prepare(`SELECT * FROM snapshots ORDER BY id DESC LIMIT 100`);
const getSnap     = db.prepare(`SELECT * FROM snapshots WHERE id=?`);
const lastDaily   = db.prepare(`SELECT * FROM snapshots WHERE kind='daily' ORDER BY id DESC LIMIT 1`);

const parse = s => s ? JSON.parse(s) : null;
const invLabel = (type, month, year) => `${TYPE_TITLES[type]||type} - ${MONTHS[month]} ${year}`;

function createSnapshot(by, kind) {
  db.exec('PRAGMA wal_checkpoint(TRUNCATE)');               // ادمج WAL لنسخة متّسقة
  const stamp = now().replace(/[:.]/g, '-');
  const fp = path.join(BACKUP_DIR, `bills-${stamp}.db`);
  fs.copyFileSync(DB_PATH, fp);
  const note = kind === 'daily' ? 'نسخة يومية تلقائية' : 'نسخة يدوية';
  const info = insSnap.run(by, now(), note, fp, kind);
  return { id: Number(info.lastInsertRowid), created_by: by, created_at: now(), note, kind };
}

// لقطة يومية تلقائية عند الإقلاع (إن مضى أكثر من 24 ساعة)
export function maybeDailySnapshot() {
  const last = lastDaily.get();
  const stale = !last || (Date.now() - new Date(last.created_at).getTime() > 24 * 3600 * 1000);
  if (stale) { try { createSnapshot('النظام', 'daily'); console.log('[backup] daily snapshot created'); } catch (e) { console.error('snapshot failed', e); } }
}

export function mountAdmin(app) {
  // السجل الكامل (كل العمليات)
  app.get('/api/admin/log', requireAdmin, (req, res) => {
    const items = qLog.all().map(a => ({
      id: a.id, actor: a.actor, action_type: a.action_type, target_type: a.target_type,
      invoice_id: a.invoice_id, summary: a.summary,
      before_data: parse(a.before_data), after_data: parse(a.after_data), created_at: a.created_at,
    }));
    res.json({ items });
  });

  // سلة المحذوفات
  app.get('/api/admin/trash', requireAdmin, (req, res) => {
    const invoices = qDelInv.all().map(i => ({ id: i.id, label: invLabel(i.type, i.month, i.year),
      deleted_by: i.deleted_by, deleted_at: i.deleted_at }));
    const rows = qDelRows.all().map(r => ({ id: r.id, invoice_id: r.invoice_id,
      invoice_label: r.inv_type != null ? invLabel(r.inv_type, r.inv_month, r.inv_year) : '—',
      data: parse(r.data), deleted_by: r.deleted_by, deleted_at: r.deleted_at }));
    res.json({ invoices, rows });
  });

  // استرجاع فاتورة
  app.post('/api/admin/restore/invoice/:id', requireAdmin, (req, res) => {
    const inv = getInv.get(req.params.id);
    if (!inv) return res.status(404).json({ error: 'غير موجودة' });
    restoreInv.run(inv.id);
    recordActivity({ actor: 'الأدمن', action: 'restore', targetType: 'invoice', targetId: inv.id,
      invoiceId: inv.id, summary: `استرجع ${invLabel(inv.type, inv.month, inv.year)}`, before: null,
      after: { type: inv.type, month: inv.month, year: inv.year } });
    res.json({ ok: true });
  });

  // استرجاع بند
  app.post('/api/admin/restore/row/:id', requireAdmin, (req, res) => {
    const r = getRow.get(req.params.id);
    if (!r) return res.status(404).json({ error: 'غير موجود' });
    restoreRow.run(r.id);
    recordActivity({ actor: 'الأدمن', action: 'restore', targetType: 'row', targetId: r.id,
      invoiceId: r.invoice_id, summary: 'استرجع بندًا محذوفًا', before: null, after: parse(r.data) });
    res.json({ ok: true });
  });

  // النسخ الاحتياطية
  app.get('/api/admin/snapshots', requireAdmin, (req, res) => res.json({ snapshots: qSnaps.all() }));
  app.post('/api/admin/snapshot', requireAdmin, (req, res) => {
    try { res.json({ snapshot: createSnapshot('الأدمن', 'manual') }); }
    catch (e) { res.status(500).json({ error: 'تعذّر إنشاء النسخة' }); }
  });

  // استرجاع نسخة كاملة (يأخذ نسخة أمان من الحالية أولًا)
  app.post('/api/admin/restore-snapshot/:id', requireAdmin, (req, res) => {
    const snap = getSnap.get(Number(req.params.id));
    if (!snap || !fs.existsSync(snap.file_path)) return res.status(404).json({ error: 'النسخة غير موجودة' });
    try {
      createSnapshot('الأدمن (أمان قبل الاسترجاع)', 'manual');
      db.exec('PRAGMA wal_checkpoint(TRUNCATE)');
      const p = snap.file_path.replace(/\\/g, '/');
      db.exec(`ATTACH DATABASE '${p}' AS snap`);
      db.exec('BEGIN');
      db.exec('DELETE FROM invoices');
      const snapInvoiceCols = db.prepare('PRAGMA snap.table_info(invoices)').all().map(c => c.name);
      if (snapInvoiceCols.includes('meta')) {
        db.exec(`INSERT INTO invoices SELECT * FROM snap.invoices`);
      } else {
        db.exec(`INSERT INTO invoices(id,type,month,year,created_by,created_at,updated_by,updated_at,deleted_by,deleted_at,status,meta)
                 SELECT id,type,month,year,created_by,created_at,updated_by,updated_at,deleted_by,deleted_at,status,'{}' FROM snap.invoices`);
      }
      for (const t of ['invoice_rows', 'activity_log', 'notification_reads']) {
        db.exec(`DELETE FROM ${t}`);
        db.exec(`INSERT INTO ${t} SELECT * FROM snap.${t}`);
      }
      db.exec('COMMIT');
      db.exec('DETACH DATABASE snap');
      res.json({ ok: true });
    } catch (e) {
      try { db.exec('ROLLBACK'); db.exec('DETACH DATABASE snap'); } catch {}
      res.status(500).json({ error: 'تعذّر الاسترجاع' });
    }
  });
}
