// الإقلاع والتوجيه بين الشاشات + تدفّق المصادقة
import { api } from './api.js';
import { $, showView, toast, escapeHtml } from './ui.js';
import { initInvoices } from './invoices.js';
import { startRealtime } from './realtime.js';
import { initBell } from './bell.js';
import { initAdmin } from './admin.js';

let activeUser = null;
let appInited = false;

async function boot() {
  let me;
  try { me = await api.get('/api/me'); } catch { me = { role: null }; }
  route(me);
}

function route(me) {
  if (me.role === 'admin') return enterAdmin();
  if (me.role === 'user')  return enterApp(me.user);
  if (me.stage === 'pick') { renderPick(me.users || []); return showView('pickView'); }
  showView('loginView');
  setTimeout(() => $('#passInput')?.focus(), 50);
}

/* ---------- كلمة السر ---------- */
$('#loginForm').addEventListener('submit', async e => {
  e.preventDefault();
  const err = $('#loginError'); err.hidden = true;
  const btn = $('#loginBtn'); btn.disabled = true;
  try {
    const r = await api.post('/api/login', { password: $('#passInput').value });
    $('#passInput').value = '';
    if (r.mode === 'admin') enterAdmin();
    else { renderPick(r.users || []); showView('pickView'); }
  } catch (ex) {
    err.textContent = ex.data?.error || 'تعذّر الدخول';
    err.hidden = false;
  } finally { btn.disabled = false; }
});

/* ---------- اختيار الهوية ---------- */
function renderPick(users) {
  const box = $('#userButtons'); box.innerHTML = '';
  users.forEach(u => {
    const b = document.createElement('button');
    b.className = 'user-pick';
    b.innerHTML = `<span class="u-ava">${escapeHtml(u.slice(0, 1))}</span><span>${escapeHtml(u)}</span>`;
    b.addEventListener('click', async () => {
      try { const r = await api.post('/api/select-user', { name: u }); enterApp(r.user); }
      catch (ex) { toast(ex.data?.error || 'تعذّر الاختيار'); }
    });
    box.appendChild(b);
  });
}
$('#backToLogin').addEventListener('click', async () => {
  await api.post('/api/logout'); showView('loginView'); $('#passInput').focus();
});

/* ---------- التطبيق ---------- */
async function enterApp(user) {
  activeUser = user;
  $('#currentUser').textContent = user;
  showView('appView');
  if (!appInited) { appInited = true; await initInvoices(); initBell(); startRealtime(user); }
}
$('#logoutBtn').addEventListener('click', async () => { await api.post('/api/logout'); location.reload(); });

/* ---------- الأدمن ---------- */
function enterAdmin() {
  showView('adminView');
  initAdmin();
}

boot();
