// طبقة الفواتير (واجهة): قائمة + عرض فاتورة + تعديل مباشر — المصدر هو الـ API المركزي
import { api } from './api.js';
import { $, escapeHtml, toast, confirmDanger } from './ui.js';

export const MONTHS = ['يناير','فبراير','مارس','أبريل','مايو','يونيو','يوليو',
                       'أغسطس','سبتمبر','أكتوبر','نوفمبر','ديسمبر'];

const LOGO_SRC = 'assets/alhashmi-logo.svg';

// أيقونات رؤوس أعمدة الإيرادات (مثل الصورة)
const ICONS = {
  shop:'<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"><path d="M4 9l1.2-5h13.6L20 9M5 9v10h14V9M3.5 9h17"/></svg>',
  tag:'<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"><path d="M20 11.5 12.5 4H5v7.5L12.5 19z"/><circle cx="8.5" cy="8.5" r="1.3"/></svg>',
  cal:'<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"><rect x="3.5" y="5" width="17" height="15" rx="2"/><path d="M3.5 9.5h17M8 3v4M16 3v4"/></svg>',
  money:'<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.7"><rect x="2.5" y="6" width="19" height="12" rx="2"/><circle cx="12" cy="12" r="2.6"/></svg>',
  coins:'<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.7"><ellipse cx="12" cy="6.5" rx="7.5" ry="2.8"/><path d="M4.5 6.5v11c0 1.5 3.4 2.8 7.5 2.8s7.5-1.3 7.5-2.8v-11"/></svg>',
  receipt:'<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"><path d="M6 3v18l2-1.2L10 21l2-1.2L14 21l2-1.2L18 21V3l-2 1.2L14 3l-2 1.2L10 3 8 4.2z"/><path d="M9 8.5h6M9 12h6"/></svg>',
  pen:'<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"><path d="M12 20h8M4 20l1-4L16 5l3 3L8 19z"/></svg>',
};

const remainingRevenue = d => {
  const hasAny = String(d?.rent ?? '').trim() || String(d?.paid ?? '').trim();
  if (!hasAny) return '';
  return String(Math.max(toNum(d.rent) - toNum(d.paid), 0));
};

export const TYPES = {
  lower: { title:'بيانات مصروفات البيت الأسفل', theme:'exp', sumKey:'amount', sumLabel:'إجمالي مصروفات البيت', initial:30,
    sub:'جدول تنظيم وتوثيق المصروفات الشهرية للأسرة', section:'البيت الأسفل', sectionNo:'1', cols:[
      {key:'type',label:'نوع المصروف',type:'text'},{key:'amount',label:'المبلغ',type:'amount'},
      {key:'recipient',label:'المستلم',type:'text'},{key:'date',label:'تاريخ الدفع',type:'date'},
      {key:'notes',label:'الملاحظات',type:'text'} ] },
  upper: { title:'بيانات مصروفات البيت الأعلى', theme:'exp', sumKey:'amount', sumLabel:'إجمالي مصروفات البيت', initial:30,
    sub:'جدول تنظيم وتوثيق المصروفات الشهرية للأسرة', section:'البيت الأعلى', sectionNo:'2', cols:[
      {key:'type',label:'نوع المصروف',type:'text'},{key:'amount',label:'المبلغ',type:'amount'},
      {key:'recipient',label:'المستلم',type:'text'},{key:'date',label:'تاريخ الدفع',type:'date'},
      {key:'notes',label:'الملاحظات',type:'text'} ] },
  rev: { title:'فاتورة الإيرادات', theme:'rev', sumKey:'paid', sumLabel:'إجمالي الإيرادات', initial:30,
    sub:'جدول تنظيم وتحصيل الإيرادات الشهرية للمحلات التجارية', section:null, cols:[
      {key:'shop',label:'اسم المحل',type:'text',ic:'shop'},{key:'rent',label:'قيمة الإيجار',type:'amount',ic:'tag'},
      {key:'due',label:'استحقاق الدفع',type:'date',ic:'cal'},{key:'paid',label:'المدفوع',type:'amount',ic:'money'},
      {key:'remaining',label:'المتبقي',type:'amount',computed:remainingRevenue,showZero:true,ic:'coins'},
      {key:'voucher',label:'رقم السند',type:'number',ic:'receipt'},{key:'notes',label:'الملاحظات',type:'text',ic:'pen'} ] },
  other: { title:'مصاريف أخرى', theme:'grn', sumKey:'amount', sumLabel:'إجمالي المصروفات', initial:30,
    sub:'مصاريف شهرية متنوعة', section:null, totalStyle:'box', signature:'other', cols:[
      {key:'type',label:'نوع المصروف',type:'text'},{key:'amount',label:'المبلغ',type:'amount'},
      {key:'recipient',label:'اسم المستلم',type:'text'},{key:'date',label:'تاريخ الدفع',type:'date'},
      {key:'voucher',label:'رقم السند',type:'number'},{key:'notes',label:'الملاحظات',type:'text'} ] },
  receipt: { title:'سند قبض', theme:'receipt', layout:'receipt', sumKey:'amount', sumLabel:'قيمة السند', initial:1 },
  letter: { title:'خطابات مجمع الهاشمي', theme:'letter', layout:'letter', sumKey:'amount', initial:0 },
};

/* ---------- أدوات الأرقام/التواريخ (إنجليزية دائمًا) ---------- */
const toLatin = s => String(s ?? '').replace(/[٠-٩]/g,d=>d.charCodeAt(0)-0x0660).replace(/[۰-۹]/g,d=>d.charCodeAt(0)-0x06F0);
const toNum = v => { const n = parseFloat(toLatin(v).replace(/[^\d.\-]/g,'')); return isNaN(n)?0:n; };
const fmtAmount = (v, showZero=false) => {
  const raw = toLatin(v).trim();
  const n = toNum(raw);
  return (n || showZero || raw === '0') ? n.toLocaleString('en-US') : '';
};
const fmtMoney = n => (n||0).toLocaleString('en-US') + ' ريال';
function todayISO(){ const d=new Date(),m=String(d.getMonth()+1).padStart(2,'0'),day=String(d.getDate()).padStart(2,'0'); return `${d.getFullYear()}-${m}-${day}`; }
function fmtDate(iso){ if(!iso) return ''; const m=/^(\d{4})-(\d{2})-(\d{2})/.exec(iso); return m?`${m[3]}/${m[2]}/${m[1]}`:toLatin(iso); }
function parseDateCell(t){ t=toLatin(t).trim(); if(!t) return ''; let m=/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})$/.exec(t); if(m) return `${m[3]}-${m[2].padStart(2,'0')}-${m[1].padStart(2,'0')}`; m=/^(\d{4})[\/\-.](\d{1,2})[\/\-.](\d{1,2})$/.exec(t); if(m) return `${m[1]}-${m[2].padStart(2,'0')}-${m[3].padStart(2,'0')}`; return t; }
const isEmptyData = d => !d || Object.values(d).every(v => !String(v ?? '').trim());
const onlyDigits = s => toLatin(s).replace(/[^\d]/g,'');

function cleanValue(type, value) {
  const v = toLatin(value).trim();
  if(type === 'amount'){ const n = toNum(v); return n ? String(n) : (v === '0' ? '0' : ''); }
  if(type === 'date') return parseDateCell(v);
  if(type === 'number') return onlyDigits(v);
  return v;
}
function displayValue(type, value, showZero=false) {
  if(type === 'amount') return (value === '' || value == null) ? '' : fmtAmount(value, showZero);
  if(type === 'date') return fmtDate(value);
  if(type === 'number') return onlyDigits(value);
  return toLatin(value || '');
}

/* ---------- الحالة ---------- */
let current = null;   // { invoice, rows:[{id,position,data}], extra }
let pendingRefresh = false;
export function getView(){ return current ? 'invoice' : 'list'; }
export function getCurrentInvoiceId(){ return current?.invoice?.id || null; }
const appMain = () => document.getElementById('appMain');
const isEditing = () => document.activeElement?.classList?.contains('edit') || document.activeElement?.classList?.contains('receipt-edit');

/* ---------- تطبيق تغييرات الآخرين (مزامنة لحظية) ---------- */
export async function applyRemoteActivity(act){
  if(getView() === 'list'){ return showList(); }
  if(getView() === 'invoice' && current && act.invoice_id === current.invoice.id){
    if(isEditing()){
      const focusedRowId = document.activeElement?.closest?.('tr')?.dataset?.rowid;
      if(act.target_type === 'row' && act.target_id && act.target_id === focusedRowId){
        toast('عُدّل هذا البند من مستخدم آخر — سيُحدَّث عند انتهائك');
      }
      pendingRefresh = true; return;
    }
    await refreshOpen();
  }
}
async function refreshOpen(){
  try {
    const data = await api.get('/api/invoices/' + current.invoice.id);
    current.rows = data.rows; current.invoice = normalizeInvoice(data.invoice);
    renderInvoice();
  } catch { showList(); }
}

/* ---------- الانتقال من التنبيه إلى موضع التغيير + التظليل المتلاشي ---------- */
export async function navigateToActivity(act){
  if(act.target_type === 'invoice'){
    if(act.action_type === 'delete_invoice'){ await showList(); toast('حُذفت هذه الفاتورة'); return; }
    await openInvoice(act.invoice_id);
    return;
  }
  await openInvoice(act.invoice_id);
  const tr = appMain().querySelector(`tr[data-rowid="${CSS.escape(act.target_id)}"]`);
  if(tr){ tr.scrollIntoView({ behavior:'smooth', block:'center' }); flashRow(tr, act.action_type); }
  else { toast(act.action_type === 'delete' ? 'حُذف هذا البند ' : 'انتقلت إلى الفاتورة'); }
}
function flashRow(tr, action){
  const cls = action === 'add' ? 'hl-add' : action === 'delete' ? 'hl-del' : 'hl-edit';
  tr.classList.add(cls);
  setTimeout(() => tr.classList.remove(cls), 2600);
}

/* ---------- الإقلاع ---------- */
export async function initInvoices(){
  wireAddMenu();
  wireSignaturePad();
  document.getElementById('homeBtn').addEventListener('click', showList);
  appMain().addEventListener('click', onMainClick);
  document.addEventListener('focusout', onCellBlur);
  document.addEventListener('beforeinput', onBeforeInput);
  document.addEventListener('keydown', e => {
    if(e.key === 'Enter' && e.target.closest?.('[contenteditable="true"]')){ e.preventDefault(); e.target.blur(); }
  });
  await showList();
}

/* ---------- قائمة الفواتير ---------- */
export async function showList(){
  current = null;
  let invoices = [];
  try { ({ invoices } = await api.get('/api/invoices')); } catch { toast('تعذّر تحميل الفواتير'); }
  renderList(invoices);
}
function renderList(invoices){
  if(!invoices.length){
    appMain().innerHTML = `<div class="list-view"><div class="list-head"><h2>قائمة الفواتير</h2></div>
      <div class="empty-state"><img src="${LOGO_SRC}" alt="" class="empty-logo"><p class="empty-title">لا توجد فواتير بعد</p>
      <p class="empty-hint">اضغط «معاملة جديدة» بالأعلى لإنشاء أول فاتورة.</p></div></div>`;
    return;
  }
  const cards = invoices.map(inv => {
    const cfg = TYPES[inv.type] || {};
    return `<div class="inv-card ${cfg.theme}" data-open="${inv.id}">
      <div class="stripe"></div>
      <div class="body">
        <div class="card-top"><img src="${LOGO_SRC}" alt="" class="card-logo"><span class="kind-badge">${escapeHtml(cfg.title||inv.type)}</span></div>
        <h3>${escapeHtml(cfg.title||inv.type)}</h3>
        <div class="month">${MONTHS[inv.month]} ${inv.year}</div>
        <div class="stats"><span>عدد البنود: <b>${inv.count}</b></span><span>الإجمالي: <b>${fmtMoney(inv.total)}</b></span>
          <span style="flex-basis:100%;color:#7f8b84">أنشأها: ${escapeHtml(inv.created_by||'')}</span></div>
      </div>
      <div class="row-actions"><button class="open" data-open="${inv.id}">فتح الفاتورة</button>
        <button class="del" data-del="${inv.id}">حذف</button></div></div>`;
  }).join('');
  appMain().innerHTML = `<div class="list-view"><div class="list-head"><h2>قائمة الفواتير</h2></div>
    <div class="invoice-grid">${cards}</div></div>`;
}

/* ---------- إنشاء فاتورة ---------- */
async function createInvoice(type){
  const d = new Date();
  try {
    const { invoice } = await api.post('/api/invoices', { type, month: d.getMonth(), year: d.getFullYear() });
    // التاريخ التلقائي عند الإنشاء (سند قبض / سند الهاشمي) — قابل للتعديل لاحقًا
    if(type === 'receipt'){ try { await api.post(`/api/invoices/${invoice.id}/rows`, { position:0, data:{ date: todayISO() } }); } catch {} }
    await openInvoice(invoice.id);
    if(type === 'letter'){ const m = invoiceMeta(); if(!m.date){ m.date = todayISO(); try { await saveInvoiceMeta(m); renderInvoice(); } catch {} } }
    toast(`تم إنشاء «${TYPES[type].title}»`);
  } catch { toast('تعذّر الإنشاء'); }
}

/* ---------- عرض فاتورة ---------- */
export async function openInvoice(id){
  let data;
  try { data = await api.get('/api/invoices/'+id); } catch { return showList(); }
  current = { invoice: normalizeInvoice(data.invoice), rows: data.rows, extra: 0 };
  renderInvoice();
  window.scrollTo(0,0);
}

function normalizeInvoice(inv) {
  if(!inv.meta || typeof inv.meta !== 'object'){
    try { inv.meta = JSON.parse(inv.meta || '{}'); } catch { inv.meta = {}; }
  }
  return inv;
}
function rowAtPos(p){ return current.rows.find(r => r.position === p); }
function invoiceMeta(){ current.invoice.meta ||= {}; return current.invoice.meta; }
async function saveInvoiceMeta(meta){
  current.invoice.meta = meta;
  await api.patch('/api/invoices/'+current.invoice.id, { meta });
}

function renderInvoice(){
  const inv = current.invoice, cfg = TYPES[inv.type];
  let h = `<div class="invoice-view">${renderToolbar(inv)}
    <section class="sheet sheet-${cfg.theme}" id="sheetMount">`;

  if(cfg.layout === 'receipt'){
    h += renderReceipt(inv);
  } else if(cfg.layout === 'letter'){
    h += renderLetter(inv);
  } else {
    h += renderSheetHeader(inv, cfg);
    h += renderTable(inv, cfg);
    h += renderTotal(cfg);
    if(cfg.theme === 'rev') h += renderSignatureFooter('revenue');
    if(cfg.signature === 'other') h += renderSignatureFooter('other');
  }
  h += `</section></div>`;

  appMain().innerHTML = h;
  updateTotal();
  applyPrintOrientation();   // اضبط اتجاه ورق الطباعة (A4) حسب نوع الفاتورة مسبقًا
  appMain().querySelectorAll('[data-meta="month"]').forEach(el => el.addEventListener('change', e => changeMeta('month', +e.target.value)));
  appMain().querySelectorAll('[data-meta="year"]').forEach(el => el.addEventListener('change', e => changeMeta('year', +e.target.value)));
}
function renderToolbar(inv){
  return `<div class="invoice-toolbar">
    <button type="button" class="btn-ghost" data-action="back">→ رجوع للقائمة</button>
    <div class="invoice-meta">
      <label class="meta-pick">الشهر:
        <select data-meta="month">${MONTHS.map((m,i)=>`<option value="${i}" ${i===inv.month?'selected':''}>${m}</option>`).join('')}</select>
        <select data-meta="year">${yearOptions(inv.year)}</select>
      </label>
      <button type="button" class="btn-primary btn-print" data-action="print">🖨️ طباعة / حفظ PDF</button>
      <button type="button" class="btn-danger" data-action="delete-invoice">حذف الفاتورة</button>
    </div></div>`;
}

/* ---------- الطباعة / حفظ PDF (يدعم الأيفون + يطبع تصميم الكمبيوتر على ورق A4) ---------- */
function pdfFileName(){
  const inv = current?.invoice; if(!inv) return 'فاتورة';
  const cfg = TYPES[inv.type] || {};
  const base = cfg.title || inv.type;
  return (inv.month != null && inv.year)
    ? `${base} - ${MONTHS[inv.month]} ${inv.year}`
    : base;
}
function applyPrintOrientation(){
  const cfg = TYPES[current?.invoice?.type] || {};
  const portrait = cfg.layout === 'receipt' || cfg.layout === 'letter';
  const orient = portrait ? 'portrait' : 'landscape';
  let st = document.getElementById('printPageStyle');
  if(!st){ st = document.createElement('style'); st.id = 'printPageStyle'; document.head.appendChild(st); }
  st.textContent = `@page { size: A4 ${orient}; margin: ${portrait ? '12mm' : '8mm'}; }`;
  document.documentElement.classList.toggle('print-portrait', portrait);
  document.documentElement.classList.toggle('print-landscape', !portrait);
}
function printInvoice(){
  if(getView() !== 'invoice') return;
  // ثبّت أي خلية قيد التعديل قبل الطباعة (تجنّب فقدان آخر تعديل أو ظهور مؤشّر الكتابة)
  const ae = document.activeElement;
  if(ae && typeof ae.blur === 'function' && (ae.isContentEditable || ae.tagName === 'INPUT')) ae.blur();
  applyPrintOrientation();
  const prevTitle = document.title;
  document.title = pdfFileName();          // يصبح اسم ملف الـ PDF المقترح عند الحفظ
  const restore = () => { document.title = prevTitle; };
  window.addEventListener('afterprint', restore, { once: true });
  setTimeout(restore, 4000);               // احتياط لأجهزة لا تطلق afterprint (أيفون)
  try {
    if(typeof window.print === 'function') window.print();
    else throw new Error('no-print');
  } catch {
    restore();
    toast('لإتمام الطباعة: افتح الصفحة في Safari ثم زر المشاركة ⬆️ واختر «طباعة»');
  }
}
function renderSheetHeader(inv, cfg){
  const month = MONTHS[inv.month];
  const title = cfg.theme === 'exp'
    ? `مصاريف بيوت الوالد شهر ( ${month} ) لعام ${inv.year}`
    : cfg.theme === 'rev'
      ? `إيرادات شهر ( ${month} ) لعام ${inv.year} م`
      : 'مصاريف أخرى';
  const sub = cfg.theme === 'grn' ? `مصاريف شهر ( ${month} ) لعام ${inv.year}` : cfg.sub;
  return `<div class="sheet-accent ${cfg.theme}"></div>
    <header class="sheet-letterhead ${cfg.theme}">
      <div class="sheet-brand"><img src="${LOGO_SRC}" alt="الهاشمي" class="sheet-logo-img"></div>
      <div class="sheet-heading">
        <h1>${escapeHtml(title)}</h1>
        <p>${escapeHtml(sub)}</p>
      </div>
    </header>
    <div class="ornament-line ${cfg.theme}"><span></span></div>
    ${cfg.section ? `<div class="section-ribbon ${cfg.theme}">${cfg.sectionNo}. ${escapeHtml(cfg.section)}</div>` : ''}`;
}
function renderTable(inv, cfg){
  const maxPos = current.rows.reduce((m,r)=>Math.max(m,r.position+1), 0);
  const shown = Math.max(cfg.initial, maxPos, current.extra);
  let h = `<div class="table-shell ${cfg.theme}"><table class="grid ${cfg.theme}"><thead><tr><th class="meem">م</th>${cfg.cols.map(c=>`<th><span class="th-lbl">${c.label}</span>${c.ic && ICONS[c.ic] ? `<span class="th-ic">${ICONS[c.ic]}</span>` : ''}</th>`).join('')}</tr></thead><tbody>`;
  for(let i=0;i<shown;i++){
    const r = rowAtPos(i), data = r?.data || {};
    h += `<tr data-pos="${i}"${r?` data-rowid="${r.id}"`:''}><td class="meem">${i+1}${r?`<button class="row-del" data-delrow="${r.id}" title="حذف البند">×</button>`:''}</td>`;
    cfg.cols.forEach(c=>{
      const val = c.computed ? c.computed(data) : (data[c.key] || '');
      const disp = displayValue(c.type, val, c.showZero);
      if(c.computed){
        h += `<td class="computed" data-computed="${c.key}" data-label="${c.label}">${escapeHtml(disp)}</td>`;
      } else {
        h += `<td class="edit" contenteditable="true" data-key="${c.key}" data-type="${c.type}" data-label="${c.label}">${escapeHtml(disp)}</td>`;
      }
    });
    h += `</tr>`;
  }
  h += `</tbody></table></div><button type="button" class="add-row-btn" data-action="add-row"><span style="font-size:16px">+</span> إضافة بند جديد</button>`;
  return h;
}
function renderTotal(cfg){
  const icon = `<svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="3" width="14" height="18" rx="2"/><path d="M9 8h6M9 12h6M9 16h3"/></svg>`;
  return `<div class="summary-area ${cfg.theme}">
    <div class="summary-box ${cfg.theme}">
      <span class="summary-label"><span class="summary-ic">${icon}</span>${cfg.sumLabel}</span>
      <span class="summary-value" id="invTotal"></span>
    </div>
  </div>`;
}
function renderSignatureFooter(kind){
  const slots = kind === 'receipt'
    ? [['receiver','المستلم'],['accountant','المحاسب'],['recipient','المسلّم']]
    : kind === 'revenue'
      ? [['accountant','توقيع المحاسب'],['management','اعتماد الإدارة']]
      : [['accountant','توقيع المحاسب'],['management','توقيع الإدارة']];
  return `<div class="signature-slots ${kind}">
    ${slots.map(([slot,label]) => renderSignatureSlot(slot, label)).join('')}
  </div>`;
}
function renderSignatureSlot(slot, label){
  const src = invoiceMeta().signatures?.[slot] || '';
  return `<button type="button" class="signature-slot" data-signature-slot="${slot}" data-signature-label="${escapeHtml(label)}">
    <span class="signature-caption">${escapeHtml(label)}</span>
    <span class="signature-line">${src ? `<img src="${escapeHtml(src)}" alt="${escapeHtml(label)}">` : ''}</span>
    <span class="signature-word">التوقيع</span>
  </button>`;
}
function yearOptions(sel){ const by=new Date().getFullYear(); let s=''; for(let y=by-3;y<=by+4;y++) s+=`<option value="${y}" ${y===sel?'selected':''}>${y}</option>`; return s; }

function renderReceipt(inv){
  const d = rowAtPos(0)?.data || {};
  const f = (key, type, placeholder='', cls='') => {
    const val = displayValue(type, d[key] || '');
    return `<span class="receipt-edit ${cls}" contenteditable="true" data-key="${key}" data-type="${type}" data-placeholder="${escapeHtml(placeholder)}">${escapeHtml(val)}</span>`;
  };
  const method = d.paymentMethod || '';
  const mb = (key, label) => `<button type="button" class="receipt-method ${method===key?'active':''}" data-receipt-method="${key}"><span></span>${label}</button>`;
  return `<div class="receipt-page">
    <div class="receipt-corner top-right"></div><div class="receipt-corner top-left"></div>
    <div class="receipt-corner bottom-right"></div><div class="receipt-corner bottom-left"></div>
    <header class="receipt-head">
      <div class="receipt-side">
        <div class="receipt-inline"><b>رقم سند القبض:</b> ${f('receiptNo','number','0000','small')}</div>
        <div class="receipt-inline"><b>التاريخ:</b> ${f('date','date','20__ / __ / __','small')}</div>
      </div>
      <div class="receipt-title"><span>سند قبض</span></div>
      <div class="receipt-logo"><img src="${LOGO_SRC}" alt="الهاشمي"></div>
    </header>
    <div class="receipt-line"><span class="receipt-label">استلمنا من السيد /</span>${f('payer','text','اسم الدافع')}</div>
    <div class="receipt-line amount-line"><span class="receipt-label">مبلغ وقدره (بالأرقام):</span>${f('amount','amount','0','amount-field')}<span class="currency">ريال</span></div>
    <div class="receipt-line"><span class="receipt-label">وذلك مقابل:</span>${f('purpose','text','سبب السداد')}</div>
    <div class="receipt-paybox">
      <div class="pay-methods"><span class="pay-title">طريقة السداد:</span>${mb('cash','نقدًا')}${mb('transfer','تحويل بنكي')}${mb('check','شيك')}</div>
      <div class="pay-fields">
        <div>رقم الشيك / التحويل: ${f('paymentNo','number','')}</div>
        <div>البنك: ${f('bank','text','')}</div>
        <div>التاريخ: ${f('paymentDate','date','')}</div>
      </div>
    </div>
    ${renderSignatureFooter('receipt')}
  </div>`;
}

function renderLetter(inv){
  const m = invoiceMeta();
  const f = (key, ph) => `<span class="letter-edit" contenteditable="true" data-letter="${key}" data-type="text" data-placeholder="${escapeHtml(ph)}">${escapeHtml(m[key]||'')}</span>`;
  const sigSrc = m.signatures?.letter || '';
  return `<div class="letter-page">
    <div class="letter-frame"><span class="lc tr"></span><span class="lc tl"></span><span class="lc br"></span><span class="lc bl"></span></div>
    <header class="letter-head">
      <div class="letter-logo"><img src="${LOGO_SRC}" alt="الهاشمي"></div>
      <div class="letter-basmala">بسم الله الرحمن الرحيم</div>
      <div class="letter-fields">
        <div><b>الرقـم :</b> ${f('number','............')}</div>
        <div><b>التاريـخ :</b> ${f('date','............')}</div>
        <div><b>الموافق :</b> ${f('hijri','............')}</div>
      </div>
    </header>
    <div class="letter-body" contenteditable="true" data-letter-body="1" data-placeholder="اكتب نص السند هنا…">${escapeHtml(m.body||'')}</div>
    <footer class="letter-foot">
      <div class="letter-admin">إدارة مجمع الهاشمي</div>
      <div class="letter-sign-row">
        <div class="lsr-name"><b>الاسـم :</b> ${f('name','............')}</div>
        <button type="button" class="letter-sign signature-slot" data-signature-slot="letter" data-signature-label="التوقيع">
          <span class="lsr-label"><b>التوقيع :</b></span>
          <span class="signature-line">${sigSrc ? `<img src="${escapeHtml(sigSrc)}" alt="التوقيع">` : ''}</span>
        </button>
      </div>
    </footer>
  </div>`;
}

function updateTotal(){
  if(!current) return;
  const cfg = TYPES[current.invoice.type];
  const total = current.rows.reduce((a,r)=> a + toNum(r.data?.[cfg.sumKey]), 0);
  const el = $('#invTotal'); if(el) el.textContent = fmtMoney(total);
}

async function changeMeta(field, val){
  current.invoice[field] = val;
  try { await api.patch('/api/invoices/'+current.invoice.id, { [field]: val }); } catch { toast('تعذّر الحفظ'); }
  renderInvoice();
}

/* ---------- النقر داخل المحتوى ---------- */
function onMainClick(e){
  const delId = e.target.closest('[data-del]')?.getAttribute('data-del');
  if(delId){ e.stopPropagation(); deleteInvoice(delId); return; }
  const delRow = e.target.closest('[data-delrow]')?.getAttribute('data-delrow');
  if(delRow){ e.stopPropagation(); deleteRow(delRow); return; }
  const methodBtn = e.target.closest('[data-receipt-method]');
  if(methodBtn){ e.stopPropagation(); setReceiptMethod(methodBtn.dataset.receiptMethod); return; }
  const sigBtn = e.target.closest('[data-signature-slot]');
  if(sigBtn){ e.stopPropagation(); openSignature(sigBtn.dataset.signatureSlot, sigBtn.dataset.signatureLabel); return; }
  const action = e.target.closest('[data-action]')?.getAttribute('data-action');
  if(action==='back') return showList();
  if(action==='print') return printInvoice();
  if(action==='delete-invoice') return deleteInvoice(current.invoice.id);
  if(action==='add-row') return addRow();
  const openId = e.target.closest('[data-open]')?.getAttribute('data-open');
  if(openId){ openInvoice(openId); return; }
}

async function deleteInvoice(id){
  const inv = current && current.invoice.id===id ? current.invoice : null;
  const label = inv ? `${TYPES[inv.type].title} - ${MONTHS[inv.month]} ${inv.year}` : 'هذه الفاتورة';
  const ok = await confirmDanger({ title:'تأكيد حذف الفاتورة',
    text:`سيتم حذف «<b>${escapeHtml(label)}</b>» نهائيًا.<br>`, okLabel:'نعم، احذف' });
  if(!ok) return;
  try { await api.del('/api/invoices/'+id); toast('تم حذف الفاتورة'); showList(); }
  catch { toast('تعذّر الحذف'); }
}

async function deleteRow(rid){
  const ok = await confirmDanger({ title:'حذف بند',
    text:'سيتم حذف هذا السطر', okLabel:'نعم، احذف' });
  if(!ok) return;
  try {
    await api.del(`/api/invoices/${current.invoice.id}/rows/${rid}`);
    current.rows = current.rows.filter(r => r.id !== rid);
    renderInvoice();
    toast('تم حذف البند');
  } catch { toast('تعذّر الحذف'); }
}

/* ---------- التعديل المباشر ---------- */
function rowDataFromTr(tr){
  const data = {};
  tr.querySelectorAll('td.edit').forEach(c=>{
    const key=c.dataset.key, type=c.dataset.type;
    const v = cleanValue(type, c.textContent);
    if(v) data[key]=v;
  });
  return data;
}
function receiptDataFromDom(){
  const data = {};
  appMain().querySelectorAll('.receipt-edit').forEach(c => {
    const v = cleanValue(c.dataset.type, c.textContent);
    if(v) data[c.dataset.key] = v;
  });
  const active = appMain().querySelector('.receipt-method.active')?.dataset?.receiptMethod;
  if(active) data.paymentMethod = active;
  return data;
}
async function upsertRow(pos, data, tr=null){
  const invId = current.invoice.id;
  let rid = tr?.dataset?.rowid || rowAtPos(pos)?.id;
  if(rid){
    await api.patch(`/api/invoices/${invId}/rows/${rid}`, { data });
    const ex=current.rows.find(r=>r.id===rid); if(ex) ex.data=data;
    return ex;
  }
  if(!isEmptyData(data)){
    const { row } = await api.post(`/api/invoices/${invId}/rows`, { position:pos, data });
    current.rows.push({ id:row.id, position:pos, data });
    if(tr){
      tr.dataset.rowid = row.id;
      const meemCell = tr.querySelector('td.meem');
      if(meemCell && !meemCell.querySelector('.row-del')) meemCell.insertAdjacentHTML('beforeend', `<button class="row-del" data-delrow="${row.id}" title="حذف البند">×</button>`);
    }
    return row;
  }
  return null;
}
async function onCellBlur(e){
  const td = e.target.closest?.('td.edit');
  const receiptField = e.target.closest?.('.receipt-edit');
  if(getView() !== 'invoice') return;
  if(receiptField){ await saveReceiptField(receiptField); return; }
  const letterEl = e.target.closest?.('[data-letter], [data-letter-body]');
  if(letterEl){ await saveLetter(); return; }
  if(!td) return;

  const tr = td.closest('tr'); const pos = +tr.dataset.pos;
  const cfg = TYPES[current.invoice.type];
  const data = rowDataFromTr(tr);
  const hasDate = cfg.cols.some(c=>c.key==='date');
  if(hasDate && !isEmptyData(data) && !data.date) data.date = todayISO();

  td.textContent = displayValue(td.dataset.type, cleanValue(td.dataset.type, td.textContent));
  if(data.date){ const dc = tr.querySelector('td.edit[data-key="date"]'); if(dc && !dc.textContent.trim()) dc.textContent = fmtDate(data.date); }

  try { await upsertRow(pos, data, tr); }
  catch { toast('تعذّر الحفظ'); }
  updateComputedCells(tr);
  updateTotal();
  if(pendingRefresh){ pendingRefresh = false; refreshOpen(); }
}
async function saveReceiptField(field){
  field.textContent = displayValue(field.dataset.type, cleanValue(field.dataset.type, field.textContent));
  const data = receiptDataFromDom();
  try { await upsertRow(0, data); }
  catch { toast('تعذّر الحفظ'); }
  updateTotal();
}
async function saveLetter(){
  const m = invoiceMeta();
  appMain().querySelectorAll('[data-letter]').forEach(el => {
    const v = toLatin(el.textContent).trim();      // الأرقام لاتينية دائمًا
    m[el.dataset.letter] = v;
    if(el.textContent !== v && document.activeElement !== el) el.textContent = v;
  });
  const body = appMain().querySelector('[data-letter-body]');
  if(body) m.body = body.innerText;
  try { await saveInvoiceMeta(m); }
  catch { toast('تعذّر الحفظ'); }
}
async function setReceiptMethod(method){
  appMain().querySelectorAll('.receipt-method').forEach(b => b.classList.toggle('active', b.dataset.receiptMethod === method));
  const data = receiptDataFromDom();
  data.paymentMethod = method;
  try { await upsertRow(0, data); toast('تم تحديث طريقة السداد'); }
  catch { toast('تعذّر الحفظ'); }
}
function updateComputedCells(tr){
  const cfg = TYPES[current.invoice.type];
  if(!cfg?.cols?.some(c => c.computed)) return;
  const data = rowDataFromTr(tr);
  cfg.cols.filter(c=>c.computed).forEach(c => {
    const cell = tr.querySelector(`[data-computed="${c.key}"]`);
    if(cell) cell.textContent = displayValue(c.type, c.computed(data), c.showZero);
  });
}
function onBeforeInput(e){
  const el = e.target.closest?.('[contenteditable="true"][data-type]');
  if(!el || !e.data || !e.inputType?.startsWith('insert')) return;
  const type = el.dataset.type;
  const ok = type === 'number' ? /^[\d٠-٩۰-۹]+$/.test(e.data)
    : type === 'amount' ? /^[\d٠-٩۰-۹.,]+$/.test(e.data)
      : type === 'date' ? /^[\d٠-٩۰-۹\/\-.]+$/.test(e.data)
        : true;
  if(!ok) e.preventDefault();
}

/* ---------- إضافة بند ---------- */
function addRow(){
  const tbody = appMain().querySelector('tbody');
  if(!tbody) return;
  const rows = [...tbody.querySelectorAll('tr')];
  let target = rows.find(tr => [...tr.querySelectorAll('td.edit')].every(c=>!c.textContent.trim()) && !tr.classList.contains('reveal'));
  if(target){ target.classList.add('reveal'); }
  else { current.extra = rows.length + 1; renderInvoice(); const all = appMain().querySelectorAll('tbody tr'); target = all[all.length-1]; target.classList.add('reveal'); }
  const first = target.querySelector('td.edit');
  if(first){ first.scrollIntoView({behavior:'smooth',block:'center'}); first.focus(); }
}

/* ---------- التوقيع ---------- */
let signatureSlot = null;
let drawing = false;
let signatureHasInk = false;
let sigCanvas, sigCtx;

function wireSignaturePad(){
  sigCanvas = $('#signatureCanvas');
  if(!sigCanvas) return;
  sigCtx = sigCanvas.getContext('2d');
  $('#signatureCancel').addEventListener('click', closeSignature);
  $('#signatureClear').addEventListener('click', clearSignatureCanvas);
  $('#signatureSave').addEventListener('click', saveSignature);
  sigCanvas.addEventListener('pointerdown', startSignatureStroke);
  sigCanvas.addEventListener('pointermove', moveSignatureStroke);
  sigCanvas.addEventListener('pointerup', endSignatureStroke);
  sigCanvas.addEventListener('pointercancel', endSignatureStroke);
  window.addEventListener('resize', () => { if(!$('#signatureView').hidden) sizeSignatureCanvas(); });
}
function openSignature(slot, label){
  signatureSlot = slot;
  $('#signatureTitle').textContent = label || 'التوقيع';
  $('#signatureView').hidden = false;
  document.body.classList.add('signature-active');
  requestAnimationFrame(() => {
    sizeSignatureCanvas();
    const src = invoiceMeta().signatures?.[signatureSlot];
    if(src) drawExistingSignature(src);
  });
}
function closeSignature(){
  $('#signatureView').hidden = true;
  document.body.classList.remove('signature-active');
  signatureSlot = null;
}
function sizeSignatureCanvas(){
  const rect = sigCanvas.getBoundingClientRect();
  const ratio = Math.max(window.devicePixelRatio || 1, 1);
  sigCanvas.width = Math.max(320, Math.floor(rect.width * ratio));
  sigCanvas.height = Math.max(220, Math.floor(rect.height * ratio));
  sigCtx.setTransform(ratio, 0, 0, ratio, 0, 0);
  sigCtx.lineWidth = 3.2;
  sigCtx.lineCap = 'round';
  sigCtx.lineJoin = 'round';
  sigCtx.strokeStyle = '#073f25';
  clearSignatureCanvas(false);
}
function drawExistingSignature(src){
  const img = new Image();
  img.onload = () => {
    const rect = sigCanvas.getBoundingClientRect();
    sigCtx.drawImage(img, 0, 0, rect.width, rect.height);
    signatureHasInk = true;
  };
  img.src = src;
}
function clearSignatureCanvas(markEmpty=true){
  const rect = sigCanvas.getBoundingClientRect();
  sigCtx.clearRect(0, 0, rect.width, rect.height);
  if(markEmpty) signatureHasInk = false;
}
function canvasPoint(e){
  const r = sigCanvas.getBoundingClientRect();
  return { x: e.clientX - r.left, y: e.clientY - r.top };
}
function startSignatureStroke(e){
  e.preventDefault();
  drawing = true; signatureHasInk = true;
  sigCanvas.setPointerCapture?.(e.pointerId);
  const p = canvasPoint(e);
  sigCtx.beginPath();
  sigCtx.moveTo(p.x, p.y);
}
function moveSignatureStroke(e){
  if(!drawing) return;
  e.preventDefault();
  const p = canvasPoint(e);
  sigCtx.lineTo(p.x, p.y);
  sigCtx.stroke();
}
function endSignatureStroke(e){
  if(!drawing) return;
  drawing = false;
  sigCanvas.releasePointerCapture?.(e.pointerId);
}
async function saveSignature(){
  if(!signatureSlot) return;
  const meta = invoiceMeta();
  meta.signatures ||= {};
  const cropped = signatureHasInk ? croppedSignatureDataUrl() : '';
  if(cropped) meta.signatures[signatureSlot] = cropped;
  else delete meta.signatures[signatureSlot];
  try {
    await saveInvoiceMeta(meta);
    closeSignature();
    renderInvoice();
    toast('تم حفظ التوقيع');
  } catch { toast('تعذّر حفظ التوقيع'); }
}
function croppedSignatureDataUrl(){
  const { width, height } = sigCanvas;
  const data = sigCtx.getImageData(0, 0, width, height).data;
  let minX = width, minY = height, maxX = -1, maxY = -1;
  for(let y = 0; y < height; y++){
    for(let x = 0; x < width; x++){
      const alpha = data[(y * width + x) * 4 + 3];
      if(alpha > 8){
        if(x < minX) minX = x;
        if(y < minY) minY = y;
        if(x > maxX) maxX = x;
        if(y > maxY) maxY = y;
      }
    }
  }
  if(maxX < 0 || maxY < 0) return '';
  const pad = Math.round(26 * Math.max(window.devicePixelRatio || 1, 1));
  minX = Math.max(0, minX - pad);
  minY = Math.max(0, minY - pad);
  maxX = Math.min(width - 1, maxX + pad);
  maxY = Math.min(height - 1, maxY + pad);
  const cropW = maxX - minX + 1;
  const cropH = maxY - minY + 1;
  const out = document.createElement('canvas');
  out.width = cropW;
  out.height = cropH;
  out.getContext('2d').drawImage(sigCanvas, minX, minY, cropW, cropH, 0, 0, cropW, cropH);
  return out.toDataURL('image/png');
}

/* ---------- قائمة «معاملة جديدة» ---------- */
function wireAddMenu(){
  const addBtn = $('#addBtn'), addMenu = $('#addMenu');
  addBtn.addEventListener('click', e => { e.stopPropagation(); const open=addMenu.hidden; addMenu.hidden=!open; addBtn.setAttribute('aria-expanded',String(open)); });
  addMenu.addEventListener('click', e => { const b=e.target.closest('button[data-type]'); if(!b) return; addMenu.hidden=true; addBtn.setAttribute('aria-expanded','false'); createInvoice(b.getAttribute('data-type')); });
  document.addEventListener('click', () => { if(!addMenu.hidden) addMenu.hidden=true; });
}
