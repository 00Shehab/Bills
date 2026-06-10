// أدوات واجهة مشتركة: المحدّدات، التنقل بين الشاشات، التنبيه (toast)، نافذة التأكيد
export const $  = (s, r = document) => r.querySelector(s);
export const $$ = (s, r = document) => [...r.querySelectorAll(s)];

export function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"]/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;' }[c]));
}

const VIEWS = ['loginView', 'pickView', 'appView', 'adminView'];
export function showView(id) {
  VIEWS.forEach(v => { const el = document.getElementById(v); if (el) el.hidden = (v !== id); });
}

let toastTimer = null;
export function toast(msg) {
  const t = $('#toast');
  t.textContent = msg; t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.hidden = true; }, 2400);
}

// نافذة تأكيد حمراء تُعيد Promise<boolean>
let confirmResolve = null;
export function confirmDanger({ title = 'تأكيد', text = '', okLabel = 'تأكيد' } = {}) {
  $('#confirmTitle').textContent = title;
  $('#confirmText').innerHTML = text;
  $('#confirmOk').textContent = okLabel;
  $('#confirmOverlay').hidden = false;
  return new Promise(res => { confirmResolve = res; });
}
function closeConfirm(val) {
  $('#confirmOverlay').hidden = true;
  if (confirmResolve) { confirmResolve(val); confirmResolve = null; }
}
$('#confirmCancel').addEventListener('click', () => closeConfirm(false));
$('#confirmOk').addEventListener('click', () => closeConfirm(true));
$('#confirmOverlay').addEventListener('click', e => { if (e.target === $('#confirmOverlay')) closeConfirm(false); });
document.addEventListener('keydown', e => { if (e.key === 'Escape' && !$('#confirmOverlay').hidden) closeConfirm(false); });
