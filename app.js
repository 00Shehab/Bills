/* =====================================================================
   دفاتر مصاريف وإيرادات الوالد — مدير الفواتير
   - دخول باسم المستخدم (لكل مستخدم حفظه الخاص على هذا الجهاز)
   - صفحة فارغة عند الدخول، ثم إنشاء فواتير مستقلة من زر "معاملة جديدة"
   - كل فاتورة تُعرض وحدها (٣٠ صفًا للبيوت)، تعديل مباشر بالنقر، حذف بتأكيد أحمر
   - الأرقام إنجليزية دائمًا، الخط نفس خط الصورة (DejaVu Sans)
   - تجاوب كامل مع الجوال (الجدول يتحول إلى بطاقات)
===================================================================== */

const MONTHS = ['يناير','فبراير','مارس','أبريل','مايو','يونيو','يوليو',
                'أغسطس','سبتمبر','أكتوبر','نوفمبر','ديسمبر'];

/* أنواع الفواتير */
const TYPES = {
  lower: {
    title: 'فاتورة البيت الأسفل', theme: 'exp', sumKey: 'amount', sumLabel: 'إجمالي المصروفات', initial: 30,
    sub: 'جدول تنظيم وتوثيق المصروفات الشهرية', section: 'البيت الأسفل',
    cols: [
      { key:'type', label:'نوع المصروف', type:'text' },
      { key:'amount', label:'المبلغ', type:'amount' },
      { key:'recipient', label:'المستلم', type:'text' },
      { key:'date', label:'تاريخ الدفع', type:'date' },
      { key:'notes', label:'الملاحظات', type:'text' },
    ],
  },
  upper: {
    title: 'فاتورة البيت الأعلى', theme: 'exp', sumKey: 'amount', sumLabel: 'إجمالي المصروفات', initial: 30,
    sub: 'جدول تنظيم وتوثيق المصروفات الشهرية', section: 'البيت الأعلى',
    cols: [
      { key:'type', label:'نوع المصروف', type:'text' },
      { key:'amount', label:'المبلغ', type:'amount' },
      { key:'recipient', label:'المستلم', type:'text' },
      { key:'date', label:'تاريخ الدفع', type:'date' },
      { key:'notes', label:'الملاحظات', type:'text' },
    ],
  },
  rev: {
    title: 'فاتورة الإيرادات', theme: 'rev', sumKey: 'rent', sumLabel: 'إجمالي الإيرادات', initial: 15,
    sub: 'جدول تحصيل وإثبات الإيرادات الشهرية', section: null,
    cols: [
      { key:'shop', label:'اسم المحل', type:'text' },
      { key:'rent', label:'قيمة الإيجار', type:'amount' },
      { key:'due', label:'استحقاق الدفع', type:'date' },
      { key:'date', label:'تاريخ الدفع', type:'date' },
      { key:'voucher', label:'رقم السند', type:'text' },
      { key:'recipient', label:'المستلم', type:'text' },
      { key:'notes', label:'الملاحظات', type:'text' },
    ],
  },
  other: {
    title: 'معاملات أخرى', theme: 'grn', sumKey: 'amount', sumLabel: 'إجمالي المصروفات', initial: 30,
    sub: 'مصاريف شهرية متنوعة', section: null, header: 'banner', totalStyle: 'box',
    cols: [
      { key:'type', label:'نوع المصروف', type:'text' },
      { key:'amount', label:'المبلغ', type:'amount' },
      { key:'recipient', label:'اسم المستلم', type:'text' },
      { key:'date', label:'تاريخ الدفع', type:'date' },
      { key:'voucher', label:'رقم السند', type:'text' },
      { key:'notes', label:'الملاحظات', type:'text' },
    ],
  },
};

/* ===================== التخزين (لكل متصفح حفظه الخاص تلقائيًا) ===================== */
const STORAGE_KEY = 'bills_walid_v2';
const today = new Date();
let store = loadStore();   // كل البيانات
let openId = null;         // الفاتورة المفتوحة حاليًا

function loadStore() { try { const s = JSON.parse(localStorage.getItem(STORAGE_KEY)); return (s && s.invoices) ? s : { invoices: [] }; } catch { return { invoices: [] }; } }
function save() { localStorage.setItem(STORAGE_KEY, JSON.stringify(store)); }

/* ===================== أدوات الأرقام والتواريخ ===================== */
function toLatinDigits(s) {
  return String(s).replace(/[٠-٩]/g, d => d.charCodeAt(0) - 0x0660)
                  .replace(/[۰-۹]/g, d => d.charCodeAt(0) - 0x06F0);
}
function toNumber(v) { const n = parseFloat(toLatinDigits(v).replace(/[^\d.\-]/g, '')); return isNaN(n) ? 0 : n; }
function fmtAmount(v) { const n = toNumber(v); return n ? n.toLocaleString('en-US') : ''; }
function fmtMoney(n) { return (n || 0).toLocaleString('en-US') + ' ريال'; }
function todayISO() {
  const d = new Date(), m = String(d.getMonth()+1).padStart(2,'0'), day = String(d.getDate()).padStart(2,'0');
  return `${d.getFullYear()}-${m}-${day}`;
}
function fmtDate(iso) {
  if (!iso) return '';
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : toLatinDigits(iso);
}
function parseDateCell(text) {
  const t = toLatinDigits(text).trim();
  if (!t) return '';
  let m = /^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})$/.exec(t);
  if (m) return `${m[3]}-${m[2].padStart(2,'0')}-${m[1].padStart(2,'0')}`;
  m = /^(\d{4})[\/\-.](\d{1,2})[\/\-.](\d{1,2})$/.exec(t);
  if (m) return `${m[1]}-${m[2].padStart(2,'0')}-${m[3].padStart(2,'0')}`;
  return t;
}
function escapeHtml(s) { return String(s).replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c])); }
function isRowEmpty(row) { return !row || Object.values(row).every(v => !String(v || '').trim()); }
function uid() { return 'inv_' + Date.now().toString(36) + '_' + Math.floor(performance.now()*1000 % 1e6).toString(36); }

/* ===================== عناصر ===================== */
const $ = s => document.querySelector(s);
const listView=$('#listView'), invoiceView=$('#invoiceView');
const addMenu=$('#addMenu'), addBtn=$('#addBtn'), sheetMount=$('#sheetMount');
const invMonth=$('#invMonth'), invYear=$('#invYear'), toastEl=$('#toast');

/* ===================== التنقل بين العروض ===================== */
function showList() {
  openId = null;
  invoiceView.hidden = true;
  listView.hidden = false;
  renderList();
}
function showInvoice(id) {
  openId = id;
  listView.hidden = true;
  invoiceView.hidden = false;
  renderInvoice();
  window.scrollTo(0, 0);
}
$('#homeBtn').addEventListener('click', showList);
$('#backBtn').addEventListener('click', showList);

/* ===================== قائمة الفواتير ===================== */
function renderList() {
  const grid = $('#invoiceGrid'), empty = $('#emptyState');
  grid.innerHTML = '';
  if (!store.invoices.length) { empty.hidden = false; grid.hidden = true; return; }
  empty.hidden = true; grid.hidden = false;

  // الأحدث أولًا
  [...store.invoices].reverse().forEach(inv => {
    const cfg = TYPES[inv.type];
    const count = inv.rows.filter(r => !isRowEmpty(r)).length;
    const total = inv.rows.reduce((a,r) => a + toNumber(r[cfg.sumKey]), 0);
    const card = document.createElement('div');
    card.className = 'inv-card ' + cfg.theme;
    card.innerHTML = `
      <div class="stripe"></div>
      <div class="body">
        <h3>${escapeHtml(cfg.title)}</h3>
        <div class="month">${MONTHS[inv.month]} ${inv.year}</div>
        <div class="stats"><span>عدد البنود: <b>${count}</b></span><span>الإجمالي: <b>${fmtMoney(total)}</b></span></div>
      </div>
      <div class="row-actions">
        <button class="open">فتح الفاتورة</button>
        <button class="del">حذف</button>
      </div>`;
    card.querySelector('.open').addEventListener('click', e => { e.stopPropagation(); showInvoice(inv.id); });
    card.querySelector('.body').addEventListener('click', () => showInvoice(inv.id));
    card.querySelector('.del').addEventListener('click', e => { e.stopPropagation(); deleteInvoice(inv.id); });
    grid.appendChild(card);
  });
}

/* ===================== إنشاء فاتورة ===================== */
function createInvoice(type) {
  const inv = { id: uid(), type, month: today.getMonth(), year: today.getFullYear(),
                createdAt: todayISO(), rows: [] };
  store.invoices.push(inv);
  save();
  showInvoice(inv.id);
  showToast(`تم إنشاء «${TYPES[type].title}»`);
}

/* ===================== عرض فاتورة واحدة ===================== */
function currentInvoice() { return store.invoices.find(i => i.id === openId); }

function renderInvoice() {
  const inv = currentInvoice();
  if (!inv) { showList(); return; }
  const cfg = TYPES[inv.type];

  // محددات الشهر/السنة
  invMonth.innerHTML = MONTHS.map((m,i)=>`<option value="${i}">${m}</option>`).join('');
  const by = today.getFullYear();
  let years = ''; for (let y=by-3; y<=by+4; y++) years += `<option value="${y}">${y}</option>`;
  invYear.innerHTML = years;
  invMonth.value = inv.month; invYear.value = inv.year;

  // عدد الصفوف المعروضة = الأكبر بين العدد الأساسي وعدد البنود المُدخلة
  const shown = Math.max(cfg.initial, inv.rows.length);

  let html = '';
  if (cfg.header === 'banner') {
    // ترويسة على شكل لافتة ملوّنة (تصميم "معاملات أخرى")
    html += `<div class="banner ${cfg.theme}"><h1>${escapeHtml(cfg.title)}</h1><p>مصاريف شهر ${MONTHS[inv.month]} لعام ${inv.year}</p></div>`;
  } else {
    html += `<h1 class="sheet-title">${escapeHtml(cfg.title)} — ${MONTHS[inv.month]} ${inv.year}</h1>`;
    html += `<p class="sheet-sub">${escapeHtml(cfg.sub)}</p>`;
    html += `<div class="rule rule-${cfg.theme}"></div>`;
    if (cfg.section) html += `<div class="section-bar exp">${escapeHtml(cfg.section)}</div>`;
  }

  html += `<table class="grid ${cfg.theme}"><thead><tr><th class="meem">م</th>`;
  cfg.cols.forEach(c => html += `<th>${c.label}</th>`);
  html += `</tr></thead><tbody>`;

  for (let i = 0; i < shown; i++) {
    const row = inv.rows[i] || null;        // الصفوف الزائدة فارغة (تظهر على الكمبيوتر فقط)
    html += `<tr><td class="meem">${i+1}</td>`;
    cfg.cols.forEach(c => {
      const raw = row ? (row[c.key] || '') : '';
      let disp = raw;
      if (c.type === 'amount') disp = fmtAmount(raw);
      else if (c.type === 'date') disp = fmtDate(raw);
      html += `<td class="edit" contenteditable="true" data-idx="${i}" data-key="${c.key}" data-type="${c.type}" data-label="${c.label}">${escapeHtml(disp)}</td>`;
    });
    html += `</tr>`;
  }
  html += `</tbody></table>`;
  html += `<button type="button" class="add-row-btn" id="addRowBtn"><span style="font-size:16px">+</span> إضافة بند جديد</button>`;

  if (cfg.totalStyle === 'box') {
    // صندوق إجمالي مستقل (تصميم "معاملات أخرى")
    html += `<div class="total-box ${cfg.theme}"><span class="tb-label">${cfg.sumLabel}:</span><span class="tb-value" id="invTotal"></span></div>`;
  } else {
    html += `<div class="total-row ${cfg.theme}-total"><div class="total-label">${cfg.sumLabel}</div><div class="total-value" id="invTotal"></div></div>`;
  }
  if (cfg.theme === 'rev') html += `<div class="sheet-foot"><span>${escapeHtml(cfg.title)} - ${MONTHS[inv.month]} ${inv.year}</span><span>صفحة 1 من 1</span></div>`;

  sheetMount.className = 'sheet sheet-' + cfg.theme;
  sheetMount.innerHTML = html;
  updateInvoiceTotal();
  $('#addRowBtn').addEventListener('click', addRow);
}

function updateInvoiceTotal() {
  const inv = currentInvoice(); if (!inv) return;
  const cfg = TYPES[inv.type];
  const total = inv.rows.reduce((a,r) => a + toNumber(r[cfg.sumKey]), 0);
  const el = $('#invTotal'); if (el) el.textContent = fmtMoney(total);
}

/* تعديل الشهر/السنة للفاتورة المفتوحة */
invMonth.addEventListener('change', () => { const inv=currentInvoice(); if(inv){inv.month=+invMonth.value; save(); renderInvoice();} });
invYear .addEventListener('change', () => { const inv=currentInvoice(); if(inv){inv.year =+invYear.value;  save(); renderInvoice();} });

/* إضافة بند: على الجوال يكشف صفًا جديدًا للكتابة، وعلى الكمبيوتر يضيف صفًا بعد الـ30 */
function addRow() {
  const inv = currentInvoice(); if (!inv) return;
  const cfg = TYPES[inv.type];
  const tbody = sheetMount.querySelector('tbody');

  // ابحث عن أول صف فارغ مخفي (على الجوال) لكشفه
  const rows = [...tbody.querySelectorAll('tr')];
  let target = rows.find(tr => {
    const cells = [...tr.querySelectorAll('td.edit')];
    return cells.every(c => !c.textContent.trim()) && !tr.classList.contains('reveal');
  });
  if (target) {
    target.classList.add('reveal');
  } else {
    // لا يوجد صف فارغ: أضِف صفًا حقيقيًا جديدًا
    inv.rows.push({});
    save();
    renderInvoice();
    const allRows = sheetMount.querySelectorAll('tbody tr');
    target = allRows[allRows.length - 1];
    target.classList.add('reveal');
  }
  const firstCell = target.querySelector('td.edit');
  if (firstCell) { firstCell.scrollIntoView({behavior:'smooth', block:'center'}); firstCell.focus(); }
}

/* ===================== التعديل المباشر ===================== */
document.addEventListener('focusout', e => {
  const td = e.target.closest && e.target.closest('td.edit');
  if (!td || !openId) return;
  const inv = currentInvoice(); if (!inv) return;
  const idx = +td.getAttribute('data-idx');
  const key = td.getAttribute('data-key');
  const ctype = td.getAttribute('data-type');
  while (inv.rows.length <= idx) inv.rows.push({});   // توسيع المصفوفة حتى هذا الصف
  const row = inv.rows[idx];

  let val = toLatinDigits(td.textContent.trim());
  if (ctype === 'amount') { const n = toNumber(val); row[key] = n ? String(n) : ''; td.textContent = fmtAmount(n); updateInvoiceTotal(); }
  else if (ctype === 'date') { const iso = parseDateCell(val); row[key] = iso; td.textContent = fmtDate(iso); }
  else { row[key] = val; td.textContent = val; }

  // التاريخ التلقائي: عند بدء إدخال بند، يُملأ تاريخ الدفع بتاريخ اليوم إن كان فارغًا
  if (!isRowEmpty(row) && 'date' in getRowKeys(inv.type) && !row.date) {
    row.date = todayISO();
    const dateCell = td.closest('tr').querySelector('td.edit[data-key="date"]');
    if (dateCell) dateCell.textContent = fmtDate(row.date);
  }
  save();
});
function getRowKeys(type) { const o={}; TYPES[type].cols.forEach(c=>o[c.key]=1); return o; }

document.addEventListener('keydown', e => {
  if (e.key === 'Enter' && e.target.closest && e.target.closest('td.edit')) { e.preventDefault(); e.target.blur(); }
});

/* ===================== حذف الفاتورة (تأكيد أحمر) ===================== */
let pendingDelete = null;
function deleteInvoice(id) {
  const inv = store.invoices.find(i => i.id === id); if (!inv) return;
  pendingDelete = id;
  $('#confirmText').innerHTML = `سيتم حذف «<b>${escapeHtml(TYPES[inv.type].title)} - ${MONTHS[inv.month]} ${inv.year}</b>» نهائيًا،<br>ولا يمكن التراجع عن هذا الإجراء.`;
  $('#confirmOverlay').hidden = false;
}
$('#confirmCancel').addEventListener('click', () => { $('#confirmOverlay').hidden = true; pendingDelete = null; });
$('#confirmOverlay').addEventListener('click', e => { if (e.target === $('#confirmOverlay')) { $('#confirmOverlay').hidden = true; pendingDelete = null; } });
$('#confirmDelete').addEventListener('click', () => {
  if (!pendingDelete) return;
  store.invoices = store.invoices.filter(i => i.id !== pendingDelete);
  save();
  $('#confirmOverlay').hidden = true;
  const wasOpen = (openId === pendingDelete);
  pendingDelete = null;
  showToast('تم حذف الفاتورة');
  if (wasOpen) showList(); else renderList();
});
$('#deleteInvBtn').addEventListener('click', () => { if (openId) deleteInvoice(openId); });

/* ===================== القائمة المنسدلة (إضافة) ===================== */
addBtn.addEventListener('click', e => {
  e.stopPropagation();
  const open = addMenu.hidden;
  addMenu.hidden = !open;
  addBtn.setAttribute('aria-expanded', String(open));
});
addMenu.addEventListener('click', e => {
  const btn = e.target.closest('button[data-type]'); if (!btn) return;
  closeMenu(); createInvoice(btn.getAttribute('data-type'));
});
document.addEventListener('click', closeMenu);
function closeMenu() { if (!addMenu.hidden) { addMenu.hidden = true; addBtn.setAttribute('aria-expanded','false'); } }
$('#emptyAddBtn').addEventListener('click', e => { e.stopPropagation(); addBtn.click(); });

/* ===================== الطباعة / المفاتيح / التنبيه ===================== */
$('#printInvBtn').addEventListener('click', () => window.print());
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') { closeMenu(); if (!$('#confirmOverlay').hidden) { $('#confirmOverlay').hidden = true; pendingDelete = null; } }
});
let toastTimer = null;
function showToast(msg) { toastEl.textContent = msg; toastEl.hidden = false; clearTimeout(toastTimer); toastTimer = setTimeout(() => toastEl.hidden = true, 2200); }

/* ===================== الإقلاع ===================== */
(function init() {
  showList();   // يفتح مباشرة على قائمة الفواتير (الحفظ تلقائي لكل متصفح)
})();
