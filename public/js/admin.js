// واجهة لوحة الأدمن: سجل النشاط + سلة المحذوفات + النسخ الاحتياطية
import { api } from './api.js';
import { $, escapeHtml, toast, confirmDanger } from './ui.js';

const ACTION = {
  add:{t:'إضافة',c:'a-add'}, edit:{t:'تعديل',c:'a-edit'}, delete:{t:'حذف',c:'a-del'},
  restore:{t:'استرجاع',c:'a-res'}, create_invoice:{t:'إنشاء فاتورة',c:'a-add'}, delete_invoice:{t:'حذف فاتورة',c:'a-del'},
};
const KEY_LABELS = { type:'نوع المصروف', amount:'المبلغ', recipient:'المستلم', date:'تاريخ الدفع',
  notes:'الملاحظات', shop:'اسم المحل', rent:'قيمة الإيجار', due:'استحقاق الدفع', paid:'المدفوع',
  remaining:'المتبقي', voucher:'رقم السند', receiptNo:'رقم سند القبض', payer:'الدافع',
  purpose:'مقابل', paymentMethod:'طريقة السداد', paymentNo:'رقم الشيك / التحويل', bank:'البنك',
  paymentDate:'تاريخ السداد' };

const pad = n => String(n).padStart(2,'0');
const dt = iso => { const d = new Date(iso); return `${pad(d.getDate())}/${pad(d.getMonth()+1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`; };

function detail(a){
  if(a.action_type==='edit'){
    const b=a.before_data||{}, af=a.after_data||{};
    const ks=[...new Set([...Object.keys(b),...Object.keys(af)])].filter(k=>(b[k]||'')!==(af[k]||''));
    return ks.map(k=>`<div><span class="dk">${KEY_LABELS[k]||k}:</span> <span class="old">${escapeHtml(b[k]||'—')}</span> ← <span class="new">${escapeHtml(af[k]||'—')}</span></div>`).join('');
  }
  const d = a.action_type==='delete'||a.action_type==='delete_invoice' ? a.before_data : a.after_data;
  if(!d) return '';
  return Object.keys(d).filter(k=>KEY_LABELS[k]&&String(d[k]||'').trim()).map(k=>`${KEY_LABELS[k]}: ${escapeHtml(d[k])}`).join(' — ');
}

let activeTab = 'log';
let logFilter = 'all';

export function initAdmin(){
  $('#adminView').innerHTML = `
    <div class="admin-wrap">
      <header class="admin-top"><h1>🛡️ لوحة الأدمن</h1><button id="adminLogout" class="btn-ghost">خروج</button></header>
      <nav class="admin-tabs">
        <button data-tab="log" class="active">📜 سجل النشاط</button>
        <button data-tab="trash">🗑️ سلة المحذوفات</button>
        <button data-tab="backups">💾 النسخ الاحتياطية</button>
      </nav>
      <div class="admin-body" id="adminBody"></div>
    </div>`;
  $('#adminLogout').addEventListener('click', async () => { await api.post('/api/logout'); location.reload(); });
  $('.admin-tabs').addEventListener('click', e => {
    const b = e.target.closest('button[data-tab]'); if(!b) return;
    activeTab = b.dataset.tab;
    $$tabs().forEach(t => t.classList.toggle('active', t===b));
    loadTab();
  });
  loadTab();
}
const $$tabs = () => [...document.querySelectorAll('.admin-tabs button')];

async function loadTab(){
  const body = $('#adminBody');
  body.innerHTML = '<div class="admin-loading">جارٍ التحميل…</div>';
  try {
    if(activeTab==='log') return renderLog(await api.get('/api/admin/log'));
    if(activeTab==='trash') return renderTrash(await api.get('/api/admin/trash'));
    if(activeTab==='backups') return renderBackups(await api.get('/api/admin/snapshots'));
  } catch { body.innerHTML = '<div class="admin-loading">تعذّر التحميل</div>'; }
}

/* ----- سجل النشاط ----- */
function renderLog({ items }){
  const filtered = items.filter(a => logFilter==='all' ? true
    : logFilter==='delete' ? (a.action_type==='delete'||a.action_type==='delete_invoice')
    : a.action_type===logFilter);
  const rows = filtered.map(a => {
    const act = ACTION[a.action_type] || { t:a.action_type, c:'' };
    return `<tr>
      <td class="t-time">${dt(a.created_at)}</td>
      <td class="t-actor">${escapeHtml(a.actor)}</td>
      <td><span class="a-badge ${act.c}">${act.t}</span></td>
      <td class="t-detail"><div class="t-sum">${escapeHtml(a.summary||'')}</div><div class="t-diff">${detail(a)}</div></td>
    </tr>`;
  }).join('');
  $('#adminBody').innerHTML = `
    <div class="admin-filter">تصفية:
      <select id="logFilter">
        <option value="all">الكل</option><option value="add">إضافة</option>
        <option value="edit">تعديل</option><option value="delete">حذف</option><option value="restore">استرجاع</option>
      </select>
      <span class="muted">عدد العمليات: ${filtered.length}</span>
    </div>
    <table class="admin-table"><thead><tr><th>الوقت</th><th>المنفّذ</th><th>العملية</th><th>التفاصيل</th></tr></thead>
    <tbody>${rows || '<tr><td colspan="4" class="empty">لا توجد عمليات</td></tr>'}</tbody></table>`;
  const sel = $('#logFilter'); sel.value = logFilter;
  sel.addEventListener('change', () => { logFilter = sel.value; loadTab(); });
}

/* ----- سلة المحذوفات ----- */
function renderTrash({ invoices, rows }){
  const invHtml = invoices.length ? invoices.map(i => `
    <div class="trash-item"><div><b>${escapeHtml(i.label)}</b><div class="muted">حذفها: ${escapeHtml(i.deleted_by||'—')} • ${i.deleted_at?dt(i.deleted_at):''}</div></div>
      <button class="btn-ghost" data-restore="invoice" data-id="${i.id}">استرجاع</button></div>`).join('')
    : '<div class="empty">لا توجد فواتير محذوفة</div>';
  const rowHtml = rows.length ? rows.map(r => {
    const brief = Object.keys(r.data||{}).filter(k=>KEY_LABELS[k]).map(k=>`${KEY_LABELS[k]}: ${escapeHtml(r.data[k])}`).join(' — ') || '(بند فارغ)';
    return `<div class="trash-item"><div>${brief}<div class="muted">في «${escapeHtml(r.invoice_label)}» • حذفه: ${escapeHtml(r.deleted_by||'—')} • ${r.deleted_at?dt(r.deleted_at):''}</div></div>
      <button class="btn-ghost" data-restore="row" data-id="${r.id}">استرجاع</button></div>`;
  }).join('') : '<div class="empty">لا توجد بنود محذوفة</div>';
  $('#adminBody').innerHTML = `<h3 class="admin-h">الفواتير المحذوفة</h3>${invHtml}<h3 class="admin-h">البنود المحذوفة</h3>${rowHtml}`;
  $('#adminBody').querySelectorAll('[data-restore]').forEach(b => b.addEventListener('click', async () => {
    try { await api.post(`/api/admin/restore/${b.dataset.restore}/${b.dataset.id}`); toast('تم الاسترجاع'); loadTab(); }
    catch { toast('تعذّر الاسترجاع'); }
  }));
}

/* ----- النسخ الاحتياطية ----- */
function renderBackups({ snapshots }){
  const list = snapshots.length ? snapshots.map(s => `
    <div class="trash-item"><div><b>${escapeHtml(s.note||'نسخة')}</b> <span class="kind ${s.kind}">${s.kind==='daily'?'يومية':'يدوية'}</span>
      <div class="muted">${dt(s.created_at)} • ${escapeHtml(s.created_by||'')}</div></div>
      <button class="btn-danger" data-snap="${s.id}">استرجاع هذه النسخة</button></div>`).join('')
    : '<div class="empty">لا توجد نسخ بعد</div>';
  $('#adminBody').innerHTML = `
    <div class="admin-filter"><button class="btn-primary" id="snapNow"><span class="plus">+</span> إنشاء نسخة احتياطية الآن</button>
      <span class="muted">الاسترجاع يأخذ نسخة أمان من الحالة الراهنة تلقائيًا قبل التنفيذ.</span></div>
    ${list}`;
  $('#snapNow').addEventListener('click', async () => { try { await api.post('/api/admin/snapshot'); toast('تم إنشاء نسخة'); loadTab(); } catch { toast('تعذّر'); } });
  $('#adminBody').querySelectorAll('[data-snap]').forEach(b => b.addEventListener('click', async () => {
    const ok = await confirmDanger({ title:'استرجاع نسخة كاملة',
      text:'سيُستبدل المحتوى الحالي بالكامل ببيانات هذه النسخة.<br>(تُحفظ نسخة أمان من الحالة الراهنة أولًا.)', okLabel:'نعم، استرجع' });
    if(!ok) return;
    try { await api.post(`/api/admin/restore-snapshot/${b.dataset.snap}`); toast('تم استرجاع النسخة'); loadTab(); }
    catch { toast('تعذّر الاسترجاع'); }
  }));
}
