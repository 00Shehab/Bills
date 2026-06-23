// جرس التنبيهات: يعرض تغييرات الآخرين فقط، والنقر ينقل لموضع التغيير مع تظليل متلاشٍ
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
  const d = new Date(iso); return `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}`;
}

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

function renderItem(act){
  return `<button class="bell-item ${act.read?'read':'unread'}" data-act="${act.id}">
    <div class="bi-top"><span class="bi-dot ${act.action_type}"></span><b>${escapeHtml(act.actor)}</b><span class="bi-time">${relTime(act.created_at)}</span></div>
    <div class="bi-sum">${escapeHtml(act.summary||'')}</div>
    ${buildDetail(act)}
  </button>`;
}

function render(){
  const menu = $('#bellMenu');
  const { items } = getState();
  const hasUnread = items.some(i => !i.read);
  let h = `<div class="bell-head"><span>تنبيهات من الآخرين</span>${hasUnread?`<button class="bell-readall">تحديد الكل كمقروء</button>`:''}</div>`;
  h += items.length
    ? `<div class="bell-list">${items.slice(0,40).map(renderItem).join('')}</div>`
    : `<div class="bell-empty">🔕 لا توجد أي تعديلات من الآخرين</div>`;
  menu.innerHTML = h;
  menu.querySelector('.bell-readall')?.addEventListener('click', async e => {
    e.stopPropagation();
    try { await api.post('/api/activity/read-all'); } catch {}
    markAllRead();
  });
  menu.querySelectorAll('[data-act]').forEach(el => el.addEventListener('click', () => onItem(+el.dataset.act)));
}

async function onItem(id){
  const act = getState().items.find(i => i.id === id);
  if(!act) return;
  if(!act.read){ markReadLocal(id); try { await api.post(`/api/activity/${id}/read`); } catch {} }
  $('#bellMenu').hidden = true;
  navigateToActivity(act);
}

export function initBell(){
  const btn = $('#bellBtn'), menu = $('#bellMenu');
  btn.addEventListener('click', e => { e.stopPropagation(); const open = menu.hidden; menu.hidden = !open; if(open) render(); });
  document.addEventListener('click', e => { if(!menu.hidden && !menu.contains(e.target) && !btn.contains(e.target)) menu.hidden = true; });
  onChange(() => { if(!menu.hidden) render(); });   // حدّث القائمة المفتوحة عند وصول تنبيه
}
