// المصادقة أصبحت عبر بوابة Python.
// Bills لم يعد يدير كلمات المرور أو الجلسات.
// الصلاحيات تأتي من الترويسات التي يحقنها الـ Reverse Proxy الموثوق.

export function mountAuth(app) {

  // تسجيل الدخول أصبح مسؤولية البوابة
  app.post('/api/login', (req, res) => {
    return res.status(404).json({
      error: 'Authentication handled by gateway'
    });
  });

  // اختيار المستخدم أصبح مسؤولية البوابة
  app.post('/api/select-user', (req, res) => {
    return res.status(404).json({
      error: 'Authentication handled by gateway'
    });
  });

  // معلومات المستخدم الحالي تأتي من الترويسات
  app.get('/api/me', (req, res) => {
    const role = req.headers['x-role'];
    const user = req.headers['x-user'];

    if (!role) {
      return res.json({
        role: null
      });
    }

    return res.json({
      role,
      user: user || null
    });
  });

  // تسجيل الخروج تنفذه البوابة
  app.post('/api/logout', (req, res) => {
    return res.json({
      ok: true
    });
  });
}

// ======================================================
// Helpers
// ======================================================

function roleOf(req) {
  const role = req.headers['x-role'];

  return typeof role === 'string'
    ? role.toLowerCase()
    : '';
}

function userOf(req) {
  const user = req.headers['x-user'];

  return typeof user === 'string'
    ? user
    : null;
}

// ======================================================
// Middlewares
// ======================================================

export function requireUser(req, res, next) {
  const user = userOf(req);

  if (user) {
    return next();
  }

  return res.status(401).json({
    error: 'يجب تسجيل الدخول'
  });
}

export function requireAdmin(req, res, next) {
  const role = roleOf(req);

  if (role === 'admin') {
    return next();
  }

  return res.status(401).json({
    error: 'صلاحية الأدمن مطلوبة'
  });
}

export function requireAuthed(req, res, next) {
  const role = roleOf(req);

  if (role) {
    return next();
  }

  return res.status(401).json({
    error: 'غير مصرّح'
  });
}
