// الخوارزمية الذكية لتتبّع التغييرات
// المبدأ: كل تعديل على بند يعيد ضبط «نافذة استقرار». عند انتهائها نقارن الحالة
// النهائية بآخر حالة مستقرّة (committed) ونسجّل/نبثّ التغيير الصافي فقط — فلا تُسجّل
// التغييرات المؤقتة أو الملغاة قبل الاستقرار.
import { db, now } from './db.js';
import { broadcast } from './sse.js';
import { CONFIG } from './config.js';

const TYPE_TITLES = { lower:'فاتورة البيت الأسفل', upper:'فاتورة البيت الأعلى', rev:'فاتورة الإيرادات', other:'معاملات أخرى' };
const MONTHS = ['يناير','فبراير','مارس','أبريل','مايو','يونيو','يوليو','أغسطس','سبتمبر','أكتوبر','نوفمبر','ديسمبر'];
const invLabel = inv => `${TYPE_TITLES[inv.type] || inv.type} - ${MONTHS[inv.month]} ${inv.year}`;

const getRow       = db.prepare('SELECT * FROM invoice_rows WHERE id=?');
const setCommitted = db.prepare('UPDATE invoice_rows SET committed=?, origin_committed=1 WHERE id=?');
const insLog       = db.prepare(`INSERT INTO activity_log(actor,action_type,target_type,target_id,invoice_id,summary,before_data,after_data,created_at) VALUES(?,?,?,?,?,?,?,?,?)`);

const pending = new Map(); // rowId -> { timer, actor, invoice }
const isEmpty  = d => !d || Object.keys(d).length === 0;
const sameData = (a, b) => JSON.stringify(a || {}) === JSON.stringify(b || {});

function logActivity({ actor, action, targetType, targetId, invoiceId, summary, before, after }) {
  const t = now();
  const info = insLog.run(actor, action, targetType, targetId, invoiceId, summary,
    before ? JSON.stringify(before) : null, after ? JSON.stringify(after) : null, t);
  const activity = {
    id: Number(info.lastInsertRowid), actor, action_type: action,
    target_type: targetType, target_id: targetId, invoice_id: invoiceId,
    summary, before_data: before || null, after_data: after || null, created_at: t,
  };
  broadcast({ kind: 'activity', activity });
  return activity;
}

// تُستدعى عند انتهاء نافذة الاستقرار لبندٍ ما
function settle(rowId) {
  const p = pending.get(rowId);
  pending.delete(rowId);
  if (!p) return;
  const r = getRow.get(rowId);
  if (!r) return;
  const { actor, invoice } = p;
  const data = JSON.parse(r.data || '{}');
  const committed = r.committed ? JSON.parse(r.committed) : null;

  if (r.status === 'deleted') {
    // حذف: يُسجّل فقط إن كان البند قد استقرّ ورآه الآخرون من قبل
    if (r.origin_committed === 1) {
      logActivity({ actor, action: 'delete', targetType: 'row', targetId: rowId, invoiceId: r.invoice_id,
        summary: `حذف بندًا من «${invLabel(invoice)}»`, before: committed, after: null });
    }
    return; // origin=0 → صامت (إضافة لم يرها أحد ثم حُذفت)
  }

  if (r.origin_committed === 0) {
    // أول استقرار: إضافة (إن كان فيه محتوى)
    if (!isEmpty(data)) {
      setCommitted.run(JSON.stringify(data), rowId);
      logActivity({ actor, action: 'add', targetType: 'row', targetId: rowId, invoiceId: r.invoice_id,
        summary: `أضاف بندًا في «${invLabel(invoice)}»`, before: null, after: data });
    }
    // فارغ → لا شيء
  } else {
    // بند مستقر: نسجّل التغيير الصافي فقط
    if (!sameData(data, committed)) {
      setCommitted.run(JSON.stringify(data), rowId);
      logActivity({ actor, action: 'edit', targetType: 'row', targetId: rowId, invoiceId: r.invoice_id,
        summary: `عدّل بندًا في «${invLabel(invoice)}»`, before: committed, after: data });
    }
  }
}

// كل تغيير على بند (إضافة/تعديل/حذف) يعيد ضبط نافذة الاستقرار
export function trackRowChange({ rowId, invoice, actor }) {
  const ex = pending.get(rowId);
  if (ex) clearTimeout(ex.timer);
  const timer = setTimeout(() => settle(rowId), CONFIG.SETTLE_MS);
  if (timer.unref) timer.unref();
  pending.set(rowId, { timer, actor, invoice });
}

// تسجيل حدث وبثّه مباشرة (يستخدمه الأدمن للاسترجاع مثلًا)
export function recordActivity(opts) { return logActivity(opts); }

// أحداث على مستوى الفاتورة (إنشاء/حذف) — تُسجّل مباشرة
export function trackInvoiceChange({ action, invoice, actor }) {
  if (action === 'create_invoice') {
    logActivity({ actor, action, targetType: 'invoice', targetId: invoice.id, invoiceId: invoice.id,
      summary: `أنشأ ${invLabel(invoice)}`, before: null, after: { type: invoice.type, month: invoice.month, year: invoice.year } });
  } else if (action === 'delete_invoice') {
    logActivity({ actor, action, targetType: 'invoice', targetId: invoice.id, invoiceId: invoice.id,
      summary: `حذف ${invLabel(invoice)}`, before: { type: invoice.type, month: invoice.month, year: invoice.year }, after: null });
  }
}
