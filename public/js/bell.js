// جرس التنبيهات: يعرض تغييرات الآخرين فقط، مجمَّعةً في «ملخّصات» ذكية بدل تراكم العشرات.
// الفكرة (مبنية على أفضل ممارسات تصميم الإشعارات): اجمع تغييرات نفس الشخص على نفس
// الفاتورة ضمن جلسة زمنية واحدة في إشعار واحد يلخّص العمل (أضاف/عدّل/حذف)، فلا يظهر +99.
import { api } from './api.js';
import { $, escapeHtml } from './ui.js';
import { getState, onChange, markAllRead, markReadLocal } from './notifications.js';
import { navigateToActivity } from './invoices.js';

const KEY_LABELS = {
  type:'نوع المصروف', amount:'المبلغ', recipient:'المستلم', date:'تاريخ الدفع',
  notes:'الملاحظات', shop:'اسم المحل', rent:'قيمة الإيجار', due:'استحقاق الدفع', paid:'المدفوع',
  remaining:'المتبقي', voucher:'رقم السند', receiptNo:'رقم سند القبض', payer:'الدافع',
  purpose:'مقابل', paymentMethod:'طريقة السداد', paymentNo:'رقم الشيك / التحويل', bank:'البنك',
  paymentDate:'تاريخ السداد',
};
const AMOUNT_KEYS = new Set(['amount','rent','paid','remaining']);
const DATE_KEYS = new Set(['date','due','paymentDate']);

// نافذة تجميع الجلسة: تغييرات نفس الشخص على نفس الفاتورة خلال 6 ساعات = إشعار واحد
const GROUP_WINDOW_MS = 6 * 60 * 60 * 1000;
const MAX_GROUPS = 30;

const toLatin = s => String(s ?? '').replace(/[٠-٩]/g,d=>d.charCodeAt(0)-0x0660);
function fmtVal(k, v){
  if(v == null || v === '') return '—';
  if(AMOUNT_KEYS.has(k)){ const n = parseFloat(toLatin(v).replace(/[^\d.\-]/g,'')); return isNaN(n)?String(v):n.toLocaleString('en-US'); }
  if(DATE_KEYS.has(k)){ const m=/^(\d{4})-(\d{2})-(\d{2})/.exec(v); return m?`${m[3]}/${m[2]}/${m[1]}`:String(v); }
  return String(v);
}
function relTime(iso){
  const then = new Date(iso).getTime(), diff = Date.now() - then, m = Math.floor(diff/60000);
  if(m < 1) return 'الآن';
  if(m < 60) return `قبل ${m} د`;
  const h = Math.floor(m/60); if(h < 24) return `قبل ${h} س`;
  const d = Math.floor(h/24); if(d < 7) return `قبل ${d} ي`;
  const dt = new Date(iso); return `${String(dt.getDate()).padStart(2,'0')}/${String(dt.getMonth()+1).padStart(2,'0')}`;
}

/* ---------- التجميع الذكي ---------- */
let lastGroups = [];

function activityKey(it){
  // مفتاح التجميع: الفاعل + الفاتورة (أو الحدث نفسه إن لم تكن مرتبطة بفاتورة)
  return it.actor + '|' + (it.invoice_id || ('act' + it.id));
}
// items مرتّبة من الأحدث إلى الأقدم
function groupActivities(items){
  const groups = [];
  const open = new Map(); // key -> أحدث مجموعة مفتوحة
  for(const it of items){
    const key = activityKey(it);
    const t = new Date(it.created_at).getTime();
    const g = open.get(key);
    if(g && (g.oldestTs - t) <= GROUP_WINDOW_MS){
      g.items.push(it);
      g.oldestTs = t;
      if(!it.read) g.hasUnread = true;
    } else {
      const ng = { key, actor: it.actor, invoice_id: it.invoice_id, items: [it],
                   newestTs: t, oldestTs: t, hasUnread: !it.read };
      groups.push(ng);
      open.set(key, ng);
    }
  }
  return groups;
}
function tally(items){
  const c = { add:0, edit:0, delete:0, create_invoice:0, delete_invoice:0 };
  for(const it of items) if(c[it.action_type] != null) c[it.action_type]++;
  return c;
}
function groupLabel(g){
  for(const it of g.items){               // عنوان الفاتورة من بين «...»
    const m = /«(.+?)»/.exec(it.summary || '');
    if(m) return m[1];
  }
  return (g.items[0].summary || '').replace(/^\s*(أنشأ|حذف)\s+/, '');  // أحداث على مستوى الفاتورة
}

/* ---------- تفاصيل العنصر المفرد ---------- */
function buildDetail(act){
  if(act.action_type === 'edit'){
    const b = act.before_data||{}, a = act.after_data||{};
    const keys = [...new Set([...Object.keys(b), ...Object.keys(a)])].filter(k => (b[k]||'') !== (a[k]||''));
    if(!keys.length) return '';
    return keys.map(k => `<div class="bi-diff"><span class="dk">${KEY_LABELS[k]||k}:</span> <span class="old">${escapeHtml(fmtVal(k,b[k]))}</span> ← <span class="new">${escapeHtml(fmtVal(k,a[k]))}</span></div>`).join('');
  }
  const d = act.action_type === 'delete' ? act.before_data : act.after_data;
  if(!d || typeof d !== 'object') return '';
  const parts = Object.keys(d).filter(k => KEY_LABELS[k] && String(d[k]||'').trim())
    .slice(0,3).map(k => `${KEY_LABELS[k]}: ${escapeHtml(fmtVal(k,d[k]))}`);
  return parts.length ? `<div class="bi-brief">${parts.join(' — ')}</div>` : '';
}
function renderSingle(act){
  return `<button class="bell-item ${act.read?'read':'unread'}" data-act="${act.id}">
    <div class="bi-top"><span class="bi-dot ${act.action_type}"></span><b>${escapeHtml(act.actor)}</b><span class="bi-time">${relTime(act.created_at)}</span></div>
    <div class="bi-sum">${escapeHtml(act.summary||'')}</div>
    ${buildDetail(act)}
  </button>`;
}

/* ---------- عرض المجموعة (ملخّص) ---------- */
function renderGroup(g){
  if(g.items.length === 1) return renderSingle(g.items[0]);
  const c = tally(g.items);
  const label = groupLabel(g);
  const total = g.items.length;
  const chips = [];
  if(c.add)            chips.push(`<span class="bi-chip add">➕ أضاف ${c.add}</span>`);
  if(c.edit)           chips.push(`<span class="bi-chip edit">✏️ عدّل ${c.edit}</span>`);
  if(c.delete)         chips.push(`<span class="bi-chip del">🗑️ حذف ${c.delete}</span>`);
  if(c.create_invoice) chips.push(`<span class="bi-chip add">📄 أنشأ الفاتورة</span>`);
  if(c.delete_invoice) chips.push(`<span class="bi-chip del">🗑️ حذف الفاتورة</span>`);
  return `<button class="bell-item group ${g.hasUnread?'unread':'read'}" data-group="${escapeHtml(g.key)}">
    <div class="bi-top">
      <span class="bi-dot multi"></span><b>${escapeHtml(g.actor)}</b>
      <span class="bi-count">${total} تغييرات</span>
      <span class="bi-time">${relTime(g.items[0].created_at)}</span>
    </div>
    <div class="bi-sum">${escapeHtml(label)}</div>
    <div class="bi-chips">${chips.join('')}</div>
  </button>`;
}

/* ---------- البناء والعدّاد ---------- */
function setBadge(n){
  const c = document.getElementById('bellCount');
  if(!c) return;
  c.textContent = n > 9 ? '9+' : String(n);
  c.hidden = n <= 0;
}
function recompute(){
  const { items } = getState();
  lastGroups = groupActivities(items);
  setBadge(lastGroups.filter(g => g.hasUnread).length);   // العدّاد = عدد الملخّصات غير المقروءة
  const menu = $('#bellMenu');
  if(menu && !menu.hidden) render();
}
function render(){
  const menu = $('#bellMenu');
  const groups = lastGroups;
  const hasUnread = groups.some(g => g.hasUnread);
  let h = `<div class="bell-head"><span>تنبيهات من الآخرين</span>${hasUnread?`<button class="bell-readall">تحديد الكل كمقروء</button>`:''}</div>`;
  h += groups.length
    ? `<div class="bell-list">${groups.slice(0, MAX_GROUPS).map(renderGroup).join('')}</div>`
    : `<div class="bell-empty">🔕 لا توجد أي تعديلات من الآخرين</div>`;
  menu.innerHTML = h;
  menu.querySelector('.bell-readall')?.addEventListener('click', async e => {
    e.stopPropagation();
    try { await api.post('/api/activity/read-all'); } catch {}
    markAllRead();
  });
  menu.querySelectorAll('[data-act]').forEach(el => el.addEventListener('click', () => onSingle(+el.dataset.act)));
  menu.querySelectorAll('[data-group]').forEach(el => el.addEventListener('click', () => onGroup(el.dataset.group)));
}

async function onSingle(id){
  const act = getState().items.find(i => i.id === id);
  if(!act) return;
  if(!act.read){ markReadLocal(id); try { await api.post(`/api/activity/${id}/read`); } catch {} }
  $('#bellMenu').hidden = true;
  navigateToActivity(act);
}
async function onGroup(key){
  const g = lastGroups.find(x => x.key === key);
  if(!g) return;
  const unread = g.items.filter(i => !i.read);
  unread.forEach(i => markReadLocal(i.id));                              // تحديث فوري للعدّاد
  unread.forEach(i => { api.post(`/api/activity/${i.id}/read`).catch(()=>{}); });
  $('#bellMenu').hidden = true;
  navigateToActivity(g.items[0]);                                       // افتح الفاتورة على آخر تغيير
}

export function initBell(){
  const btn = $('#bellBtn'), menu = $('#bellMenu');
  btn.addEventListener('click', e => { e.stopPropagation(); const open = menu.hidden; menu.hidden = !open; if(open) render(); });
  document.addEventListener('click', e => { if(!menu.hidden && !menu.contains(e.target) && !btn.contains(e.target)) menu.hidden = true; });
  onChange(recompute);     // أعِد الحساب (العدّاد + القائمة) عند وصول/قراءة أي تنبيه
  recompute();
}
