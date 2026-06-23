// المصادقة: كلمة سر عامة للمستخدمين + كلمة سر مستقلة للأدمن
// الهوية (activeUser) تُحفظ في الجلسة وتُنسب لكل عملية لاحقة.
import { createHash, timingSafeEqual } from 'node:crypto';
import { CONFIG } from './config.js';
import { db, now } from './db.js';

// مقارنة آمنة زمنيًا (تتجنّب تسريب الطول عبر التجزئة)
function eq(a, b) {
  const ha = createHash('sha256').update(String(a)).digest();
  const hb = createHash('sha256').update(String(b)).digest();
  return ha.length === hb.length && timingSafeEqual(ha, hb);
}

const touchLogin = db.prepare('UPDATE users SET last_login_at=? WHERE display_name=?');

export function mountAuth(app) {
  // 1) كلمة السر العامة → تحدد المسار (أدمن / مستخدم)
  app.post('/api/login', (req, res) => {
    const pw = (req.body && req.body.password) || '';
    if (eq(pw, CONFIG.ADMIN_PASSWORD)) {
      req.session = { role: 'admin', at: now() };
      return res.json({ mode: 'admin' });
    }
    if (eq(pw, CONFIG.USER_PASSWORD)) {
      req.session = { stage: 'pick', at: now() };
      return res.json({ mode: 'user', users: CONFIG.USERS });
    }
    return res.status(401).json({ error: 'كلمة السر غير صحيحة' });
  });

  // 2) اختيار الهوية بعد كلمة سر المستخدمين
  app.post('/api/select-user', async (req, res) => {
    if (!req.session || req.session.stage !== 'pick') {
      return res.status(403).json({ error: 'ابدأ بإدخال كلمة السر أولًا' });
    }
    const name = (req.body && req.body.name) || '';
    if (!CONFIG.USERS.includes(name)) return res.status(400).json({ error: 'مستخدم غير معروف' });
    req.session = { role: 'user', user: name, at: now() };
    try { await touchLogin.run(now(), name); } catch (e) { console.error('touchLogin:', e.message); }
    return res.json({ ok: true, user: name });
  });

  // حالة الجلسة الحالية
  app.get('/api/me', (req, res) => {
    const s = req.session || {};
    if (s.role === 'admin') return res.json({ role: 'admin' });
    if (s.role === 'user') return res.json({ role: 'user', user: s.user });
    if (s.stage === 'pick') return res.json({ role: null, stage: 'pick', users: CONFIG.USERS });
    return res.json({ role: null });
  });

  app.post('/api/logout', (req, res) => { req.session = null; res.json({ ok: true }); });
}

export function requireUser(req, res, next) {
  if (req.session && req.session.role === 'user' && req.session.user) return next();
  res.status(401).json({ error: 'يجب تسجيل الدخول' });
}
export function requireAdmin(req, res, next) {
  if (req.session && req.session.role === 'admin') return next();
  res.status(401).json({ error: 'صلاحية الأدمن مطلوبة' });
}
export function requireAuthed(req, res, next) {
  const r = req.session && req.session.role;
  if (r === 'user' || r === 'admin') return next();
  res.status(401).json({ error: 'غير مصرّح' });
}
