// طبقة الفواتير (واجهة): قائمة + عرض فاتورة + تعديل مباشر — المصدر هو الـ API المركزي
import { api } from './api.js';
import { $, escapeHtml, toast, confirmDanger } from './ui.js';

export const MONTHS = [
  'يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو',
  'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر',
];

const LOGO_SRC = 'assets/alhashmi-logo.svg';

// أنواع الفواتير
const TYPES = {
  lower: {
    title: 'فاتورة البيت الأسفل',
    theme: 'exp',
    layout: 'table',
    sumKey: 'amount',
    sumLabel: 'إجمالي المصروف',
    initial: 6,
    signature: 'other',
    cols: [
      { key: 'shop', label: 'اسم المحل', type: 'text', ic: 'shop' },
      { key: 'date', label: 'التاريخ', type: 'date', ic: 'cal' },
      { key: 'amount', label: 'المبلغ', type: 'amount', ic: 'money' },
      { key: 'notes', label: 'الملاحظات', type: 'text', ic: 'tag' },
    ],
  },
  upper: {
    title: 'فاتورة البيت الأعلى',
    theme: 'exp',
    layout: 'table',
    sumKey: 'amount',
    sumLabel: 'إجمالي المصروف',
    initial: 6,
    signature: 'other',
    cols: [
      { key: 'shop', label: 'اسم المحل', type: 'text', ic: 'shop' },
      { key: 'date', label: 'التاريخ', type: 'date', ic: 'cal' },
      { key: 'amount', label: 'المبلغ', type: 'amount', ic: 'money' },
      { key: 'notes', label: 'الملاحظات', type: 'text', ic: 'tag' },
    ],
  },
  rev: {
    title: 'فاتورة الإيرادات',
    theme: 'rev',
    layout: 'table',
    sumKey: 'paid',
    sumLabel: 'قيمة الإيرادات',
    initial: 5,
    signature: 'revenue',
    cols: [
      { key: 'recipient', label: 'المستلم', type: 'text' },
      { key: 'amount', label: 'المبلغ', type: 'amount', ic: 'money' },
      { key: 'date', label: 'التاريخ', type: 'date', ic: 'cal' },
      { key: 'voucher', label: 'رقم السند', type: 'number' },
      { key: 'notes', label: 'الملاحظات', type: 'text' },
    ],
  },
  other: {
    title: 'معاملات أخرى',
    theme: 'grn',
    layout: 'table',
    sumKey: 'amount',
    sumLabel: 'الإجمالي',
    initial: 4,
    signature: 'other',
    cols: [
      { key: 'type', label: 'نوع المصروف', type: 'text' },
      { key: 'amount', label: 'المبلغ', type: 'amount', ic: 'money' },
      { key: 'date', label: 'التاريخ', type: 'date', ic: 'cal' },
      { key: 'voucher', label: 'رقم السند', type: 'number' },
      { key: 'notes', label: 'الملاحظات', type: 'text' },
    ],
  },
  receipt: {
    title: 'سند قبض',
    theme: 'receipt',
    layout: 'receipt',
    sumKey: 'amount',
    sumLabel: 'قيمة السند',
    initial: 1,
  },
  letter: {
    title: 'خطابات مجمع الهاشمي',
    theme: 'letter',
    layout: 'letter',
    sumKey: 'amount',
    sumLabel: 'قيمة السند',
    initial: 0,
  },
};

// أيقونات رؤوس الأعمدة
const ICONS = {
  shop: '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"><path d="M4 9l1.2-5h13.6L20 9M5 9v10h14V9M3.5 9h17"/></svg>',
  tag: '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"><path d="M20 11.5 12.5 4H5v7.5L12.5 19z"/><circle cx="8.5" cy="8.5" r="1.3"/></svg>',
  cal: '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"><rect x="3.5" y="5" width="17" height="15" rx="2"/><path d="M3.5 9.5h17M8 3v4M16 3v4"/></svg>',
  money: '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.7"><rect x="2.5" y="6" width="19" height="12" rx="2"/><path d="M6 12h12"/></svg>',
};

// أدوات الأرقام/التواريخ
const toLatin = (s) =>
  String(s ?? '')
    .replace(/[٠-٩]/g, d => d.charCodeAt(0) - 0x0660)
    .replace(/[۰-۹]/g, d => d.charCodeAt(0) - 0x06F0);

const toNum = (v) => {
  const n = parseFloat(toLatin(v).replace(/[^\d.\-]/g, ''));
  return Number.isNaN(n) ? 0 : n;
};

const fmtAmount = (v, showZero = false) => {
  const raw = toLatin(v).trim();
  const n = toNum(raw);
  return (n || showZero || raw === '0') ? n.toLocaleString('en-US') : '';
};

const fmtMoney = (n) => `${(n || 0).toLocaleString('en-US')} ريال`;

function fmtDate(iso) {
  if (!iso) return '';
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso));
  return m ? `${m[3]}/${m[2]}/${m[1]}` : toLatin(iso);
}

function parseDateCell(t) {
  t = toLatin(t).trim();
  if (!t) return '';
  let m = /^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})$/.exec(t);
  if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  m = /^(\d{4})[\/\-.](\d{1,2})[\/\-.](\d{1,2})$/.exec(t);
  if (m) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
  return t;
}

const isEmptyData = (d) => !d || Object.values(d).every(v => !String(v ?? '').trim());
const onlyDigits = (s) => toLatin(s).replace(/[^\d]/g, '');

function cleanValue(type, value) {
  const v = toLatin(value).trim();
  if (type === 'amount') {
    const n = toNum(v);
    return n ? String(n) : (v === '0' ? '0' : '');
  }
  if (type === 'date') return parseDateCell(v);
  if (type === 'number') return onlyDigits(v);
  return v;
}

function displayValue(type, value, showZero = false) {
  if (type === 'amount') return (value === '' || value == null) ? '' : fmtAmount(value, showZero);
  if (type === 'date') return fmtDate(value);
  if (type === 'number') return onlyDigits(value);
  return toLatin(value || '');
}

/* ---------- الحالة ---------- */
let current = null;   // { invoice, rows:[{id,position,data}], extra }
let pendingRefresh = false;

export function getView() { return current ? 'invoice' : 'list'; }
export function getCurrentInvoiceId() { return current?.invoice?.id || null; }

const appMain = () => document.getElementById('appMain');
const isEditing = () =>
  document.activeElement?.classList?.contains('edit') ||
  document.activeElement?.classList?.contains('receipt-edit') ||
  document.activeElement?.classList?.contains('letter-edit') ||
  document.activeElement?.classList?.contains('letter-body');

/* ---------- أدوات الحالة ---------- */
function normalizeInvoice(inv) {
  if (!inv) return inv;
  if (!inv.meta || typeof inv.meta !== 'object') {
    try { inv.meta = JSON.parse(inv.meta || '{}'); } catch { inv.meta = {}; }
  }
  return inv;
}

function rowAtPos(p) {
  return current?.rows?.find(r => r.position === p);
}

function invoiceMeta() {
  if (!current) return {};
  current.invoice.meta ||= {};
  return current.invoice.meta;
}

async function saveInvoiceMeta(meta) {
  if (!current) return;
  current.invoice.meta = meta;
  await api.patch(`/api/invoices/${current.invoice.id}`, { meta });
}

async function refreshOpen() {
  if (!current) return;
  try {
    const data = await api.get('/api/invoices/' + current.invoice.id);
    current.rows = data.rows || [];
    current.invoice = normalizeInvoice(data.invoice);
    renderInvoice();
  } catch {
    showList();
  }
}

/* ---------- تطبيق تغييرات الآخرين ---------- */
export async function applyRemoteActivity(act) {
  if (getView() === 'list') {
    return showList();
  }

  if (getView() === 'invoice' && current && act.invoice_id === current.invoice.id) {
    if (isEditing()) {
      const focusedRowId = document.activeElement?.closest?.('tr')?.dataset?.rowid;
      if (act.target_type === 'row' && act.target_id && act.target_id === focusedRowId) {
        toast('عُدّل هذا البند من مستخدم آخر — سيُحدَّث عند انتهائك');
      }
      pendingRefresh = true;
      return;
    }
    await refreshOpen();
  }
}

/* ---------- الانتقال من التنبيه إلى موضع التغيير ---------- */
export async function navigateToActivity(act) {
  if (act.target_type === 'invoice') {
    if (act.action_type === 'delete_invoice') {
      await showList();
      toast('حُذفت هذه الفاتورة');
      return;
    }
    await openInvoice(act.invoice_id);
    return;
  }

  await openInvoice(act.invoice_id);
  const tr = appMain().querySelector(`tr[data-rowid="${CSS.escape(act.target_id)}"]`);
  if (tr) {
    tr.scrollIntoView({ behavior: 'smooth', block: 'center' });
    flashRow(tr, act.action_type);
  } else {
    toast(act.action_type === 'delete' ? 'حُذف هذا البند' : 'انتقلت إلى الفاتورة');
  }
}

function flashRow(tr, action) {
  const cls = action === 'add' ? 'hl-add' : action === 'delete' ? 'hl-del' : 'hl-edit';
  tr.classList.add(cls);
  setTimeout(() => tr.classList.remove(cls), 2600);
}

/* ---------- الإقلاع ---------- */
export async function initInvoices() {
  wireAddMenu();
  wireSignaturePad();

  document.getElementById('homeBtn')?.addEventListener('click', showList);
  appMain().addEventListener('click', onMainClick);
  document.addEventListener('focusout', onCellBlur);
  document.addEventListener('beforeinput', onBeforeInput);
  document.addEventListener('keydown', e => {
    if (e.key === 'Enter' && e.target.closest?.('[contenteditable="true"]')) {
      e.preventDefault();
      e.target.blur();
    }
  });

  await showList();
}

/* ---------- قائمة الفواتير ---------- */
export async function showList() {
  current = null;
  let invoices = [];
  try {
    ({ invoices } = await api.get('/api/invoices'));
  } catch {
    toast('تعذّر تحميل الفواتير');
  }
  renderList(invoices);
}

function renderList(invoices) {
  if (!invoices.length) {
    appMain().innerHTML = `
      <div class="list-view">
        <div class="list-head"><h2>قائمة الفواتير</h2></div>
        <div class="empty-state">
          <img src="${LOGO_SRC}" alt="" class="empty-logo">
          <p class="empty-title">لا توجد فواتير بعد</p>
          <p class="empty-hint">اضغط «معاملة جديدة» بالأعلى لإنشاء أول فاتورة.</p>
        </div>
      </div>`;
    return;
  }

  const cards = invoices.map(inv => {
    const cfg = TYPES[inv.type] || TYPES.other;
    const monthLabel = MONTHS[Number(inv.month) || 0] || '';
    return `
      <div class="inv-card ${cfg.theme}" data-open="${inv.id}">
        <div class="stripe"></div>
        <div class="body">
          <div class="card-top">
            <img src="${LOGO_SRC}" alt="" class="card-logo">
            <span class="kind-badge">${escapeHtml(cfg.title || inv.type)}</span>
          </div>
          <h3>${escapeHtml(cfg.title || inv.type)}</h3>
          <div class="month">${escapeHtml(monthLabel)} ${escapeHtml(inv.year)}</div>
          <div class="stats">
            <span>عدد البنود: <b>${inv.count}</b></span>
            <span>الإجمالي: <b>${fmtMoney(inv.total)}</b></span>
          </div>
        </div>
      </div>`;
  }).join('');

  appMain().innerHTML = `
    <div class="list-view">
      <div class="list-head"><h2>قائمة الفواتير</h2></div>
      <div class="invoice-grid">${cards}</div>
    </div>`;

  appMain().querySelectorAll('[data-open]').forEach(el => {
    el.addEventListener('click', () => openInvoice(el.dataset.open));
  });
}

/* ---------- عرض فاتورة ---------- */
export async function openInvoice(id) {
  let data;
  try {
    data = await api.get('/api/invoices/' + id);
  } catch {
    return showList();
  }
  current = {
    invoice: normalizeInvoice(data.invoice),
    rows: data.rows || [],
    extra: 0,
  };
  renderInvoice();
  window.scrollTo(0, 0);
}

function renderInvoice() {
  if (!current) return showList();
  const inv = current.invoice;
  const cfg = TYPES[inv.type] || TYPES.other;

  let h = `<div class="invoice-view">${renderToolbar(inv)}
    <section class="sheet sheet-${cfg.theme}" id="sheetMount">`;

  if (cfg.layout === 'receipt') {
    h += renderReceipt(inv);
  } else if (cfg.layout === 'letter') {
    h += renderLetter(inv);
  } else {
    h += renderSheetHeader(inv, cfg);
    h += renderTable(inv, cfg);
    h += renderTotal(cfg);
    if (cfg.signature === 'revenue') h += renderSignatureFooter('revenue');
    if (cfg.signature === 'other') h += renderSignatureFooter('other');
  }

  h += `</section></div>`;
  appMain().innerHTML = h;

  updateTotal();

  appMain().querySelectorAll('[data-meta="month"]').forEach(el => {
    el.addEventListener('change', e => changeMeta('month', Number(e.target.value)));
  });
  appMain().querySelectorAll('[data-meta="year"]').forEach(el => {
    el.addEventListener('change', e => changeMeta('year', Number(e.target.value)));
  });
}

function renderToolbar(inv) {
  const currentMonth = Number(inv.month) || 0;
  return `<div class="invoice-toolbar">
    <button class="btn-ghost" data-action="back">→ رجوع للقائمة</button>
    <div class="invoice-meta">
      <label class="meta-pick">الشهر:
        <select data-meta="month">
          ${MONTHS.map((m, i) => `<option value="${i}" ${i === currentMonth ? 'selected' : ''}>${m}</option>`).join('')}
        </select>
        <select data-meta="year">${yearOptions(Number(inv.year) || new Date().getFullYear())}</select>
      </label>
      <button class="btn-ghost" data-action="print">طباعة</button>
      <button class="btn-danger" data-action="delete-invoice">حذف الفاتورة</button>
    </div>
  </div>`;
}

function yearOptions(sel) {
  const by = new Date().getFullYear();
  let s = '';
  for (let y = by - 3; y <= by + 4; y++) {
    s += `<option value="${y}" ${y === sel ? 'selected' : ''}>${y}</option>`;
  }
  return s;
}

function renderSheetHeader(inv, cfg) {
  const month = MONTHS[Number(inv.month) || 0] || '';
  const title = cfg.theme === 'exp'
    ? `مصاريف بيوت الوالد شهر ( ${month} ) لعام ${inv.year}`
    : cfg.theme === 'rev'
      ? `إيرادات شهر ( ${month} ) لعام ${inv.year} م`
      : 'مصاريف أخرى';

  const sub = cfg.theme === 'grn'
    ? `مصاريف شهر ( ${month} ) لعام ${inv.year}`
    : (cfg.sub || '');

  return `<div class="sheet-accent ${cfg.theme}"></div>
    <header class="sheet-letterhead ${cfg.theme}">
      <div class="sheet-brand"><img src="${LOGO_SRC}" alt="الهاشمي" class="sheet-logo-img"></div>
      <div class="sheet-heading">
        <h1>${escapeHtml(title)}</h1>
        <p>${escapeHtml(sub)}</p>
      </div>
    </header>
    <div class="ornament-line ${cfg.theme}"><span></span></div>
    ${cfg.section ? `<div class="section-ribbon ${cfg.theme}">${cfg.sectionNo || 1}. ${escapeHtml(cfg.section)}</div>` : ''}`;
}

function renderTable(inv, cfg) {
  const maxPos = current.rows.reduce((m, r) => Math.max(m, (Number(r.position) || 0) + 1), 0);
  const shown = Math.max(cfg.initial || 0, maxPos, current.extra || 0);

  let h = `<div class="table-shell ${cfg.theme}">
    <table class="grid ${cfg.theme}">
      <thead>
        <tr>
          <th class="meem">م</th>
          ${cfg.cols.map(c => `<th>${c.ic && ICONS[c.ic] ? `<span class="th-ic">${ICONS[c.ic]}</span>` : ''}<span class="th-lbl">${escapeHtml(c.label)}</span></th>`).join('')}
        </tr>
      </thead>
      <tbody>`;

  for (let i = 0; i < shown; i++) {
    const r = rowAtPos(i);
    const data = r?.data || {};
    h += `<tr data-pos="${i}"${r ? ` data-rowid="${r.id}"` : ''}>
      <td class="meem">${i + 1}${r ? `<button class="row-del" data-delrow="${r.id}" title="حذف البند">×</button>` : ''}</td>`;

    cfg.cols.forEach(c => {
      const val = c.computed ? c.computed(data) : (data[c.key] || '');
      const disp = displayValue(c.type, val, c.showZero);
      if (c.computed) {
        h += `<td class="computed" data-computed="${c.key}" data-label="${escapeHtml(c.label)}">${escapeHtml(disp)}</td>`;
      } else {
        h += `<td class="edit" contenteditable="true" data-key="${c.key}" data-type="${c.type}" data-label="${escapeHtml(c.label)}">${escapeHtml(disp)}</td>`;
      }
    });

    h += `</tr>`;
  }

  h += `</tbody></table></div>
    <button type="button" class="add-row-btn" data-action="add-row">
      <span style="font-size:16px">+</span> إضافة بند جديد
    </button>`;
  return h;
}

function renderTotal(cfg) {
  const icon = `<svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="3" width="14" height="18" rx="2"/><path d="M9 8h6M9 12h6M9 16h3"/></svg>`;
  return `<div class="summary-area ${cfg.theme}">
    <div class="summary-box ${cfg.theme}">
      <span class="summary-label"><span class="summary-ic">${icon}</span>${escapeHtml(cfg.sumLabel)}</span>
      <span class="summary-value" id="invTotal"></span>
    </div>
  </div>`;
}

function renderSignatureFooter(kind) {
  const slots = kind === 'receipt'
    ? [['receiver', 'المستلم'], ['accountant', 'المحاسب'], ['recipient', 'المسلّم']]
    : kind === 'revenue'
      ? [['accountant', 'توقيع المحاسب'], ['management', 'اعتماد الإدارة']]
      : [['accountant', 'توقيع المحاسب'], ['management', 'توقيع الإدارة']];

  return `<div class="signature-slots ${kind}">
    ${slots.map(([slot, label]) => renderSignatureSlot(slot, label)).join('')}
  </div>`;
}

function renderSignatureSlot(slot, label) {
  const src = invoiceMeta().signatures?.[slot] || '';
  return `<button type="button" class="signature-slot" data-signature-slot="${slot}" data-signature-label="${escapeHtml(label)}">
    <span class="signature-caption">${escapeHtml(label)}</span>
    <span class="signature-line">${src ? `<img src="${escapeHtml(src)}" alt="${escapeHtml(label)}">` : ''}</span>
    <span class="signature-word">التوقيع</span>
  </button>`;
}

function renderReceipt(inv) {
  const d = rowAtPos(0)?.data || {};

  const f = (key, type, placeholder = '', cls = '') => {
    const val = displayValue(type, d[key] || '');
    return `<span class="receipt-edit ${cls}" contenteditable="true" data-key="${key}" data-type="${type}" data-placeholder="${escapeHtml(placeholder)}">${escapeHtml(val)}</span>`;
  };

  const method = d.paymentMethod || '';
  const mb = (key, label) => `<button type="button" class="receipt-method ${method === key ? 'active' : ''}" data-receipt-method="${key}"><span></span>${label}</button>`;

  return `<div class="receipt-page">
    <div class="receipt-corner top-right"></div><div class="receipt-corner top-left"></div>
    <div class="receipt-corner bottom-right"></div><div class="receipt-corner bottom-left"></div>
    <header class="receipt-head">
      <div class="receipt-side">
        <div class="receipt-inline"><b>رقم سند القبض:</b> ${f('receiptNo', 'number', '0000', 'small')}</div>
        <div class="receipt-inline"><b>التاريخ:</b> ${f('date', 'date', '20__ / __ / __', 'small')}</div>
      </div>
      <div class="receipt-title"><span>سند قبض</span></div>
      <div class="receipt-logo"><img src="${LOGO_SRC}" alt="الهاشمي"></div>
    </header>
    <div class="receipt-line"><span class="receipt-label">استلمنا من السيد /</span>${f('payer', 'text', 'اسم الدافع')}</div>
    <div class="receipt-line amount-line"><span class="receipt-label">مبلغ وقدره (بالأرقام):</span>${f('amount', 'amount', '0', 'amount-field')}<span class="currency">ريال</span></div>
    <div class="receipt-line"><span class="receipt-label">وذلك مقابل:</span>${f('purpose', 'text', 'سبب السداد')}</div>
    <div class="receipt-paybox">
      <div class="pay-methods">
        <span class="pay-title">طريقة السداد:</span>
        ${mb('cash', 'نقدًا')}
        ${mb('transfer', 'تحويل بنكي')}
        ${mb('check', 'شيك')}
      </div>
      <div class="pay-fields">
        <div>رقم الشيك / التحويل: ${f('paymentNo', 'number', '')}</div>
        <div>البنك: ${f('bank', 'text', '')}</div>
        <div>التاريخ: ${f('paymentDate', 'date', '')}</div>
      </div>
    </div>
    ${renderSignatureFooter('receipt')}
  </div>`;
}

function renderLetter(inv) {
  const m = invoiceMeta();
  const f = (key, ph) => `<span class="letter-edit" contenteditable="true" data-letter="${key}" data-type="text" data-placeholder="${escapeHtml(ph)}">${escapeHtml(m[key] || '')}</span>`;
  const sigSrc = m.signatures?.letter || '';

  return `<div class="letter-page">
    <div class="letter-frame"><span class="lc tr"></span><span class="lc tl"></span><span class="lc br"></span><span class="lc bl"></span></div>
    <header class="letter-head">
      <div class="letter-logo"><img src="${LOGO_SRC}" alt="الهاشمي"></div>
      <div class="letter-basmala">بسم الله الرحمن الرحيم</div>
      <div class="letter-fields">
        <div><b>الرقـم :</b> ${f('number', '.')}</div>
        <div><b>التاريـخ :</b> ${f('date', '.')}</div>
        <div><b>الموافق :</b> ${f('hijri', '.')}</div>
      </div>
    </header>
    <div class="letter-body" contenteditable="true" data-letter-body="1" data-placeholder="اكتب نص السند هنا…">${escapeHtml(m.body || '')}</div>
    <footer class="letter-foot">
      <div class="letter-admin">إدارة مجمع الهاشمي</div>
      <div class="letter-sign-row">
        <div class="lsr-name"><b>الاسـم :</b> ${f('name', '.')}</div>
        <button type="button" class="letter-sign signature-slot" data-signature-slot="letter" data-signature-label="التوقيع">
          <span class="lsr-label"><b>التوقيع :</b></span>
          <span class="signature-line">${sigSrc ? `<img src="${escapeHtml(sigSrc)}" alt="التوقيع">` : ''}</span>
        </button>
      </div>
    </footer>
  </div>`;
}

function updateTotal() {
  if (!current) return;
  const cfg = TYPES[current.invoice.type] || TYPES.other;
  const total = current.rows.reduce((a, r) => a + toNum(r.data?.[cfg.sumKey]), 0);
  const el = $('#invTotal');
  if (el) el.textContent = fmtMoney(total);
}

async function changeMeta(field, val) {
  current.invoice[field] = val;
  try {
    await api.patch('/api/invoices/' + current.invoice.id, { [field]: val });
  } catch {
    toast('تعذّر الحفظ');
  }
  renderInvoice();
}

/* ---------- النقر داخل المحتوى ---------- */
function onMainClick(e) {
  const delId = e.target.closest('[data-del]')?.getAttribute('data-del');
  if (delId) { e.stopPropagation(); deleteInvoice(delId); return; }

  const delRow = e.target.closest('[data-delrow]')?.getAttribute('data-delrow');
  if (delRow) { e.stopPropagation(); deleteRow(delRow); return; }

  const methodBtn = e.target.closest('[data-receipt-method]');
  if (methodBtn) { e.stopPropagation(); setReceiptMethod(methodBtn.dataset.receiptMethod); return; }

  const sigBtn = e.target.closest('[data-signature-slot]');
  if (sigBtn) { e.stopPropagation(); openSignature(sigBtn.dataset.signatureSlot, sigBtn.dataset.signatureLabel); return; }

  const action = e.target.closest('[data-action]')?.getAttribute('data-action');
  if (action === 'back') return showList();
  if (action === 'print') return window.print();
  if (action === 'delete-invoice') return deleteInvoice(current.invoice.id);
  if (action === 'add-row') return addRow();

  const openId = e.target.closest('[data-open]')?.getAttribute('data-open');
  if (openId) { openInvoice(openId); }
}

/* ---------- CRUD ---------- */
async function deleteInvoice(id) {
  const inv = current && current.invoice.id === id ? current.invoice : null;
  const label = inv ? `${TYPES[inv.type]?.title || inv.type} - ${MONTHS[Number(inv.month) || 0]} ${inv.year}` : 'هذه الفاتورة';

  const ok = await confirmDanger({
    title: 'تأكيد حذف الفاتورة',
    text: `سيتم حذف «<b>${escapeHtml(label)}</b>» نهائيًا.<br>`,
    okLabel: 'نعم، احذف',
  });
  if (!ok) return;

  try {
    await api.del('/api/invoices/' + id);
    toast('تم حذف الفاتورة');
    showList();
  } catch {
    toast('تعذّر الحذف');
  }
}

async function deleteRow(rid) {
  const ok = await confirmDanger({
    title: 'حذف بند',
    text: 'سيتم حذف هذا السطر',
    okLabel: 'نعم، احذف',
  });
  if (!ok) return;

  try {
    await api.del(`/api/invoices/${current.invoice.id}/rows/${rid}`);
    current.rows = current.rows.filter(r => r.id !== rid);
    renderInvoice();
    toast('تم حذف البند');
  } catch {
    toast('تعذّر الحذف');
  }
}

function rowDataFromTr(tr) {
  const data = {};
  tr.querySelectorAll('td.edit').forEach(c => {
    const key = c.dataset.key;
    const type = c.dataset.type;
    const v = cleanValue(type, c.textContent);
    if (v) data[key] = v;
  });
  return data;
}

function receiptDataFromDom() {
  const data = {};
  appMain().querySelectorAll('.receipt-edit').forEach(c => {
    const v = cleanValue(c.dataset.type, c.textContent);
    if (v) data[c.dataset.key] = v;
  });
  const active = appMain().querySelector('.receipt-method.active')?.dataset?.receiptMethod;
  if (active) data.paymentMethod = active;
  return data;
}

function letterMetaFromDom() {
  const meta = { ...invoiceMeta() };
  appMain().querySelectorAll('[data-letter]').forEach(el => {
    const key = el.dataset.letter;
    meta[key] = (el.textContent || '').trim();
  });
  const body = appMain().querySelector('.letter-body')?.textContent || '';
  meta.body = body.trim();
  return meta;
}

async function upsertRow(pos, data, tr = null) {
  const invId = current.invoice.id;
  let rid = tr?.dataset?.rowid || rowAtPos(pos)?.id;

  if (rid) {
    await api.patch(`/api/invoices/${invId}/rows/${rid}`, { data });
    const ex = current.rows.find(r => r.id === rid);
    if (ex) ex.data = data;
    return ex;
  }

  if (!isEmptyData(data)) {
    const { row } = await api.post(`/api/invoices/${invId}/rows`, { position: pos, data });
    current.rows.push({ id: row.id, position: pos, data });
    if (tr) {
      tr.dataset.rowid = row.id;
      const meemCell = tr.querySelector('td.meem');
      if (meemCell && !meemCell.querySelector('.row-del')) {
        meemCell.insertAdjacentHTML('beforeend', `<button class="row-del" data-delrow="${row.id}" title="حذف البند">×</button>`);
      }
    }
    return row;
  }

  return null;
}

async function addRow() {
  if (!current) return;
  const pos = current.rows.reduce((m, r) => Math.max(m, (Number(r.position) || 0) + 1), 0);
  const { row } = await api.post(`/api/invoices/${current.invoice.id}/rows`, { position: pos, data: {} });
  current.rows.push({ id: row.id, position: pos, data: {} });
  renderInvoice();
}

function setReceiptMethod(method) {
  if (!current) return;
  const data = receiptDataFromDom();
  data.paymentMethod = method;
  upsertRow(0, data, null)
    .then(() => renderInvoice())
    .catch(() => toast('تعذّر الحفظ'));
}

async function openSignature(slot, label) {
  const currentMeta = invoiceMeta();
  currentMeta.signatures ||= {};
  const value = prompt(`الصق رابط/بيانات التوقيع لـ ${label}`, currentMeta.signatures[slot] || '');
  if (value === null) return;
  currentMeta.signatures[slot] = value.trim();
  try {
    await saveInvoiceMeta(currentMeta);
    renderInvoice();
  } catch {
    toast('تعذّر حفظ التوقيع');
  }
}

/* ---------- حفظ التعديلات عند الخروج من الخلية ---------- */
async function onCellBlur(e) {
  const target = e.target;
  if (!current) return;

  try {
    if (target.matches('.edit') || target.closest?.('td.edit')) {
      const td = target.matches('.edit') ? target : target.closest('td.edit');
      const tr = td.closest('tr');
      const data = rowDataFromTr(tr);
      const pos = Number(tr.dataset.pos || 0);
      await upsertRow(pos, data, tr);
    }

    if (target.matches('.receipt-edit') || target.closest?.('.receipt-edit')) {
      const data = receiptDataFromDom();
      await upsertRow(0, data, null);
    }

    if (target.matches('.letter-edit') || target.closest?.('.letter-edit') || target.matches('.letter-body')) {
      const meta = letterMetaFromDom();
      await saveInvoiceMeta(meta);
    }
  } catch {
    toast('تعذّر الحفظ');
  }

  if (pendingRefresh && !isEditing()) {
    pendingRefresh = false;
    await refreshOpen();
  }
}

function onBeforeInput() {
  // احتفظنا بها للتوافق مع الواجهة الحالية
}

/* ---------- إنشاء فاتورة جديدة ---------- */
async function createInvoice(type) {
  const cfg = TYPES[type];
  if (!cfg) return toast('نوع غير صالح');

  const now = new Date();
  const month = now.getMonth();
  const year = now.getFullYear();

  try {
    const { invoice } = await api.post('/api/invoices', { type, month, year });
    toast(`تم إنشاء ${cfg.title}`);
    await openInvoice(invoice.id);
  } catch {
    toast('تعذّر إنشاء الفاتورة');
  }
}

/* ---------- قائمة «معاملة جديدة» ---------- */
function wireAddMenu() {
  const addBtn = $('#addBtn');
  const addMenu = $('#addMenu');
  if (!addBtn || !addMenu) return;

  addBtn.addEventListener('click', e => {
    e.stopPropagation();
    const open = addMenu.hidden;
    addMenu.hidden = !open;
    addBtn.setAttribute('aria-expanded', String(open));
  });

  addMenu.addEventListener('click', e => {
    const b = e.target.closest('button[data-type]');
    if (!b) return;
    addMenu.hidden = true;
    addBtn.setAttribute('aria-expanded', 'false');
    createInvoice(b.getAttribute('data-type'));
  });

  document.addEventListener('click', () => {
    if (!addMenu.hidden) addMenu.hidden = true;
  });
}

function wireSignaturePad() {
  // التوقيع هنا يدار عبر prompt داخل openSignature
}

/* ---------- تطبيق تغييرات الآخرين على العرض المفتوح ---------- */
export async function refreshCurrentView() {
  if (current) await refreshOpen();
}