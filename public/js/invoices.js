// طبقة الفواتير (واجهة): قائمة + عرض فاتورة + تعديل مباشر — المصدر هو الـ API المركزي
import { api } from './api.js';
import { $, escapeHtml, toast, confirmDanger } from './ui.js';

export const MONTHS = ['يناير','فبراير','مارس','أبريل','مايو','يونيو','يوليو',
                       'أغسطس','سبتمبر','أكتوبر','نوفمبر','ديسمبر'];

export const TYPES = {
  lower: { title:'فاتورة البيت الأسفل', theme:'exp', sumKey:'amount', sumLabel:'إجمالي المصروفات', initial:30,
    sub:'جدول تنظيم وتوثيق المصروفات الشهرية', section:'البيت الأسفل', cols:[
      {key:'type',label:'نوع المصروف',type:'text'},{key:'amount',label:'المبلغ',type:'amount'},
      {key:'recipient',label:'المستلم',type:'text'},{key:'date',label:'تاريخ الدفع',type:'date'},
      {key:'notes',label:'الملاحظات',type:'text'} ] },
  upper: { title:'فاتورة البيت الأعلى', theme:'exp', sumKey:'amount', sumLabel:'إجمالي المصروفات', initial:30,
    sub:'جدول تنظيم وتوثيق المصروفات الشهرية', section:'البيت الأعلى', cols:[
      {key:'type',label:'نوع المصروف',type:'text'},{key:'amount',label:'المبلغ',type:'amount'},
      {key:'recipient',label:'المستلم',type:'text'},{key:'date',label:'تاريخ الدفع',type:'date'},
      {key:'notes',label:'الملاحظات',type:'text'} ] },
  rev: { title:'فاتورة الإيرادات', theme:'rev', sumKey:'rent', sumLabel:'إجمالي الإيرادات', initial:15,
    sub:'جدول تحصيل وإثبات الإيرادات الشهرية', section:null, cols:[
      {key:'shop',label:'اسم المحل',type:'text'},{key:'rent',label:'قيمة الإيجار',type:'amount'},
      {key:'due',label:'استحقاق الدفع',type:'date'},{key:'date',label:'تاريخ الدفع',type:'date'},
      {key:'voucher',label:'رقم السند',type:'text'},{key:'recipient',label:'المستلم',type:'text'},
      {key:'notes',label:'الملاحظات',type:'text'} ] },
  other: { title:'معاملات أخرى', theme:'grn', sumKey:'amount', sumLabel:'إجمالي المصروفات', initial:30,
    sub:'مصاريف شهرية متنوعة', section:null, header:'banner', totalStyle:'box', cols:[
      {key:'type',label:'نوع المصروف',type:'text'},{key:'amount',label:'المبلغ',type:'amount'},
      {key:'recipient',label:'اسم المستلم',type:'text'},{key:'date',label:'تاريخ الدفع',type:'date'},
      {key:'voucher',label:'رقم السند',type:'text'},{key:'notes',label:'الملاحظات',type:'text'} ] },
};

/* ---------- أدوات الأرقام/التواريخ (إنجليزية دائمًا) ---------- */
const toLatin = s => String(s).replace(/[٠-٩]/g,d=>d.charCodeAt(0)-0x0660).replace(/[۰-۹]/g,d=>d.charCodeAt(0)-0x06F0);
const toNum = v => { const n = parseFloat(toLatin(v).replace(/[^\d.\-]/g,'')); return isNaN(n)?0:n; };
const fmtAmount = v => { const n = toNum(v); return n ? n.toLocaleString('en-US') : ''; };
const fmtMoney = n => (n||0).toLocaleString('en-US') + ' ريال';
function todayISO(){ const d=new Date(),m=String(d.getMonth()+1).padStart(2,'0'),day=String(d.getDate()).padStart(2,'0'); return `${d.getFullYear()}-${m}-${day}`; }
function fmtDate(iso){ if(!iso) return ''; const m=/^(\d{4})-(\d{2})-(\d{2})/.exec(iso); return m?`${m[3]}/${m[2]}/${m[1]}`:toLatin(iso); }
function parseDateCell(t){ t=toLatin(t).trim(); if(!t) return ''; let m=/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})$/.exec(t); if(m) return `${m[3]}-${m[2].padStart(2,'0')}-${m[1].padStart(2,'0')}`; m=/^(\d{4})[\/\-.](\d{1,2})[\/\-.](\d{1,2})$/.exec(t); if(m) return `${m[1]}-${m[2].padStart(2,'0')}-${m[3].padStart(2,'0')}`; return t; }
const isEmptyData = d => !d || Object.keys(d).length === 0;

/* ---------- الحالة ---------- */
let current = null;   // { invoice, rows:[{id,position,data}], extra }
let pendingRefresh = false;
export function getView(){ return current ? 'invoice' : 'list'; }
export function getCurrentInvoiceId(){ return current?.invoice?.id || null; }
const appMain = () => document.getElementById('appMain');
const isEditing = () => document.activeElement?.classList?.contains('edit');

/* ---------- تطبيق تغييرات الآخرين (مزامنة لحظية) ---------- */
export async function applyRemoteActivity(act){
  if(getView() === 'list'){ return showList(); }                 // حدّث القائمة
  if(getView() === 'invoice' && current && act.invoice_id === current.invoice.id){
    if(isEditing()){
      // تحذير لطيف عند تعارض الكتابة على نفس البند (آخر تعديل يغلب)
      const focusedRowId = document.activeElement?.closest?.('tr')?.dataset?.rowid;
      if(act.target_type === 'row' && act.target_id && act.target_id === focusedRowId){
        toast('⚠️ عُدّل هذا البند من مستخدم آخر — سيُحدَّث عند انتهائك');
      }
      pendingRefresh = true; return;                              // لا تقاطع المستخدم أثناء الكتابة
    }
    await refreshOpen();
  }
}
async function refreshOpen(){
  try {
    const data = await api.get('/api/invoices/' + current.invoice.id);
    current.rows = data.rows; current.invoice = data.invoice;
    renderInvoice();
  } catch { showList(); }   // قد تكون الفاتورة حُذفت
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
  document.getElementById('homeBtn').addEventListener('click', showList);
  // تفويض أحداث النقر والتعديل على المحتوى المتغيّر
  appMain().addEventListener('click', onMainClick);
  document.addEventListener('focusout', onCellBlur);
  document.addEventListener('keydown', e => { if(e.key==='Enter' && e.target.closest?.('td.edit')){ e.preventDefault(); e.target.blur(); } });
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
      <div class="empty-state"><div class="empty-illu">📄</div><p class="empty-title">لا توجد فواتير بعد</p>
      <p class="empty-hint">اضغط «معاملة جديدة» بالأعلى لإنشاء أول فاتورة.</p></div></div>`;
    return;
  }
  const cards = invoices.map(inv => {
    const cfg = TYPES[inv.type] || {};
    return `<div class="inv-card ${cfg.theme}" data-open="${inv.id}">
      <div class="stripe"></div>
      <div class="body">
        <h3>${escapeHtml(cfg.title||inv.type)}</h3>
        <div class="month">${MONTHS[inv.month]} ${inv.year}</div>
        <div class="stats"><span>عدد البنود: <b>${inv.count}</b></span><span>الإجمالي: <b>${fmtMoney(inv.total)}</b></span>
          <span style="flex-basis:100%;color:#9a9a9a">أنشأها: ${escapeHtml(inv.created_by||'')}</span></div>
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
    await openInvoice(invoice.id);
    toast(`تم إنشاء «${TYPES[type].title}»`);
  } catch { toast('تعذّر الإنشاء'); }
}

/* ---------- عرض فاتورة ---------- */
export async function openInvoice(id){
  let data;
  try { data = await api.get('/api/invoices/'+id); } catch { return showList(); }
  current = { invoice: data.invoice, rows: data.rows, extra: 0 };
  renderInvoice();
  window.scrollTo(0,0);
}

function rowAtPos(p){ return current.rows.find(r => r.position === p); }

function renderInvoice(){
  const inv = current.invoice, cfg = TYPES[inv.type];
  const maxPos = current.rows.reduce((m,r)=>Math.max(m,r.position+1), 0);
  const shown = Math.max(cfg.initial, maxPos, current.extra);

  let h = `<div class="invoice-view"><div class="invoice-toolbar">
    <button class="btn-ghost" data-action="back">→ رجوع للقائمة</button>
    <div class="invoice-meta">
      <label class="meta-pick">الشهر:
        <select data-meta="month">${MONTHS.map((m,i)=>`<option value="${i}" ${i===inv.month?'selected':''}>${m}</option>`).join('')}</select>
        <select data-meta="year">${yearOptions(inv.year)}</select>
      </label>
      <button class="btn-ghost" data-action="print">🖨 طباعة</button>
      <button class="btn-danger" data-action="delete-invoice">🗑 حذف الفاتورة</button>
    </div></div>
    <section class="sheet sheet-${cfg.theme}" id="sheetMount">`;

  if(cfg.header==='banner'){
    h += `<div class="banner ${cfg.theme}"><h1>${escapeHtml(cfg.title)}</h1><p>مصاريف شهر ${MONTHS[inv.month]} لعام ${inv.year}</p></div>`;
  } else {
    h += `<h1 class="sheet-title">${escapeHtml(cfg.title)} — ${MONTHS[inv.month]} ${inv.year}</h1>
      <p class="sheet-sub">${escapeHtml(cfg.sub)}</p><div class="rule rule-${cfg.theme}"></div>`;
    if(cfg.section) h += `<div class="section-bar exp">${escapeHtml(cfg.section)}</div>`;
  }

  h += `<table class="grid ${cfg.theme}"><thead><tr><th class="meem">م</th>${cfg.cols.map(c=>`<th>${c.label}</th>`).join('')}<th class="col-actions"></th></tr></thead><tbody>`;
  for(let i=0;i<shown;i++){
    const r = rowAtPos(i), data = r?.data || {};
    h += `<tr data-pos="${i}"${r?` data-rowid="${r.id}"`:''}><td class="meem">${i+1}</td>`;
    cfg.cols.forEach(c=>{
      let disp = data[c.key] || '';
      if(c.type==='amount') disp = fmtAmount(disp); else if(c.type==='date') disp = fmtDate(disp);
      h += `<td class="edit" contenteditable="true" data-key="${c.key}" data-type="${c.type}" data-label="${c.label}">${escapeHtml(disp)}</td>`;
    });
    h += `<td class="col-actions">${r ? `<button class="row-del" data-delrow="${r.id}" title="حذف البند">🗑</button>` : ''}</td></tr>`;
  }
  h += `</tbody></table><button type="button" class="add-row-btn" data-action="add-row"><span style="font-size:16px">+</span> إضافة بند جديد</button>`;

  if(cfg.totalStyle==='box'){
    h += `<div class="total-box ${cfg.theme}"><span class="tb-label">${cfg.sumLabel}:</span><span class="tb-value" id="invTotal"></span></div>`;
  } else {
    h += `<div class="total-row ${cfg.theme}-total"><div class="total-label">${cfg.sumLabel}</div><div class="total-value" id="invTotal"></div></div>`;
  }
  if(cfg.theme==='rev') h += `<div class="sheet-foot"><span>${escapeHtml(cfg.title)} - ${MONTHS[inv.month]} ${inv.year}</span><span>صفحة 1 من 1</span></div>`;
  h += `</section></div>`;

  appMain().innerHTML = h;
  updateTotal();
  // محددات الشهر/السنة
  $('[data-meta="month"]').addEventListener('change', e => changeMeta('month', +e.target.value));
  $('[data-meta="year"]').addEventListener('change', e => changeMeta('year', +e.target.value));
}
function yearOptions(sel){ const by=new Date().getFullYear(); let s=''; for(let y=by-3;y<=by+4;y++) s+=`<option value="${y}" ${y===sel?'selected':''}>${y}</option>`; return s; }

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
  const openId = e.target.closest('[data-open]')?.getAttribute('data-open');
  if(openId){ openInvoice(openId); return; }
  const delId = e.target.closest('[data-del]')?.getAttribute('data-del');
  if(delId){ e.stopPropagation(); deleteInvoice(delId); return; }
  const delRow = e.target.closest('[data-delrow]')?.getAttribute('data-delrow');
  if(delRow){ e.stopPropagation(); deleteRow(delRow); return; }
  const action = e.target.closest('[data-action]')?.getAttribute('data-action');
  if(action==='back') return showList();
  if(action==='print') return window.print();
  if(action==='delete-invoice') return deleteInvoice(current.invoice.id);
  if(action==='add-row') return addRow();
}

async function deleteInvoice(id){
  const inv = current && current.invoice.id===id ? current.invoice : null;
  const label = inv ? `${TYPES[inv.type].title} - ${MONTHS[inv.month]} ${inv.year}` : 'هذه الفاتورة';
  const ok = await confirmDanger({ title:'تأكيد حذف الفاتورة',
    text:`سيتم حذف «<b>${escapeHtml(label)}</b>» نهائيًا.<br>يمكن للأدمن استرجاعها لاحقًا.`, okLabel:'نعم، احذف' });
  if(!ok) return;
  try { await api.del('/api/invoices/'+id); toast('تم حذف الفاتورة'); showList(); }
  catch { toast('تعذّر الحذف'); }
}

async function deleteRow(rid){
  const ok = await confirmDanger({ title:'حذف بند',
    text:'سيتم حذف هذا البند، ويمكن للأدمن استرجاعه لاحقًا.', okLabel:'نعم، احذف' });
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
    let v = toLatin(c.textContent.trim());
    if(type==='amount'){ const n=toNum(v); v = n?String(n):''; }
    else if(type==='date'){ v = parseDateCell(v); }
    if(v) data[key]=v;
  });
  return data;
}
async function onCellBlur(e){
  const td = e.target.closest?.('td.edit');
  if(!td || getView()!=='invoice') return;
  const tr = td.closest('tr'); const pos = +tr.dataset.pos;
  const cfg = TYPES[current.invoice.type];
  const data = rowDataFromTr(tr);
  // التاريخ التلقائي عند بدء إدخال البند
  const hasDate = cfg.cols.some(c=>c.key==='date');
  if(hasDate && !isEmptyData(data) && !data.date) data.date = todayISO();
  // إعادة تنسيق الخلية المعدّلة
  if(td.dataset.type==='amount') td.textContent = fmtAmount(td.textContent);
  else if(td.dataset.type==='date') td.textContent = fmtDate(parseDateCell(td.textContent));
  else td.textContent = toLatin(td.textContent.trim());
  if(data.date){ const dc = tr.querySelector('td.edit[data-key="date"]'); if(dc && !dc.textContent.trim()) dc.textContent = fmtDate(data.date); }

  const invId = current.invoice.id;
  let rid = tr.dataset.rowid;
  try {
    if(rid){ await api.patch(`/api/invoices/${invId}/rows/${rid}`, { data }); const ex=current.rows.find(r=>r.id===rid); if(ex) ex.data=data; }
    else if(!isEmptyData(data)){
      const { row } = await api.post(`/api/invoices/${invId}/rows`, { position:pos, data });
      tr.dataset.rowid = row.id;
      current.rows.push({ id:row.id, position:pos, data });
      const actCell = tr.querySelector('td.col-actions');   // أظهر زر الحذف فورًا للبند الجديد
      if(actCell) actCell.innerHTML = `<button class="row-del" data-delrow="${row.id}" title="حذف البند">🗑</button>`;
    }
  } catch { toast('تعذّر الحفظ'); }
  updateTotal();
  if(pendingRefresh){ pendingRefresh = false; refreshOpen(); }   // طبّق تغييرات الآخرين المؤجّلة
}

/* ---------- إضافة بند ---------- */
function addRow(){
  const tbody = appMain().querySelector('tbody');
  const rows = [...tbody.querySelectorAll('tr')];
  let target = rows.find(tr => [...tr.querySelectorAll('td.edit')].every(c=>!c.textContent.trim()) && !tr.classList.contains('reveal'));
  if(target){ target.classList.add('reveal'); }
  else { current.extra = rows.length + 1; renderInvoice(); const all = appMain().querySelectorAll('tbody tr'); target = all[all.length-1]; target.classList.add('reveal'); }
  const first = target.querySelector('td.edit');
  if(first){ first.scrollIntoView({behavior:'smooth',block:'center'}); first.focus(); }
}

/* ---------- قائمة «معاملة جديدة» ---------- */
function wireAddMenu(){
  const addBtn = $('#addBtn'), addMenu = $('#addMenu');
  addBtn.addEventListener('click', e => { e.stopPropagation(); const open=addMenu.hidden; addMenu.hidden=!open; addBtn.setAttribute('aria-expanded',String(open)); });
  addMenu.addEventListener('click', e => { const b=e.target.closest('button[data-type]'); if(!b) return; addMenu.hidden=true; createInvoice(b.getAttribute('data-type')); });
  document.addEventListener('click', () => { if(!addMenu.hidden) addMenu.hidden=true; });
}
