// الإقلاع والتوجيه بين الشاشات — يعتمد على بوابة Python للمصادقة
// البوابة تحقن: X-Role (admin/user) + X-User (اسم المستخدم)
// Bills لا يملك تسجيل دخول خاصاً بعد الآن.
import { api } from './api.js';
import { $, showView, toast, escapeHtml } from './ui.js';
import { initInvoices } from './invoices.js';
import { startRealtime } from './realtime.js';
import { initBell } from './bell.js';
import { initAdmin } from './admin.js';

let activeUser = null;
let appInited = false;

/* ---------- الإقلاع ---------- */
async function boot() {
  let me;
  try { me = await api.get('/api/me'); } catch { me = { role: null }; }
  route(me);
}

function route(me) {
  if (me.role === 'admin') return enterAdmin();
  if (me.role === 'user')  return enterApp(me.user);
  // لا جلسة — البوابة هي المسؤولة عن الدخول
  showView('loginView');
  renderGatewayMessage();
}

/* ---------- رسالة البوابة (بدلاً من تسجيل الدخول) ---------- */
function renderGatewayMessage() {
  const box = $('#loginView');
  if (!box) return;

  // إعادة بناء محتوى شاشة الدخول لتوضيح أن البوابة تتولى المصادقة
  const existingForm = $('#loginForm');
  if (existingForm) existingForm.style.display = 'none';

  const existingError = $('#loginError');
  if (existingError) existingError.hidden = true;

  let msg = $('#gatewayMsg');
  if (!msg) {
    msg = document.createElement('div');
    msg.id = 'gatewayMsg';
    msg.style.cssText = 'text-align:center; padding:24px; color:#4a5568;';
    box.appendChild(msg);
  }
  msg.innerHTML = `
    <div style="font-size:48px; margin-bottom:16px;">🔐</div>
    <h2 style="margin:0 0 8px;">الدخول عبر البوابة</h2>
    <p style="margin:0; color:#718096;">
      المصادقة تتم عبر نظام fin-ops-os.<br>
      إذا كنت ترى هذه الرسالة،<br>
      الرجاء <a href="/" style="color:#3182ce;">الدخول من البوابة الرئيسية</a>.
    </p>
  `;
  msg.hidden = false;
}

/* ---------- التطبيق ---------- */
async function enterApp(user) {
  activeUser = user;
  $('#currentUser').textContent = user;
  showView('appView');
  if (!appInited) { appInited = true; await initInvoices(); initBell(); startRealtime(user); }
}

/* ---------- الأدمن ---------- */
function enterAdmin() {
  showView('adminView');
  initAdmin();
}

/* ---------- الخروج — إعادة توجيه للبوابة ---------- */
$('#logoutBtn').addEventListener('click', async () => {
  // نستدعي /api/logout (يُرجع ok دائماً) ثم نعيد التحميل
  try { await api.post('/api/logout'); } catch {}
  location.href = '/';
});

boot();
