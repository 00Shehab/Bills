// نقطة دخول الخادم — Express: جلسات، مصادقة، واجهة ثابتة، API ومزامنة
import express from 'express';
import cookieSession from 'cookie-session';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { CONFIG } from './config.js';
import { initDb } from './db.js'; // استيراد دالة تهيئة قاعدة البيانات السحابية
import { mountAuth, requireAuthed } from './auth.js';
import { mountInvoices } from './routes/invoices.js';
import { mountActivity } from './routes/activity.js';
import { mountAdmin, maybeDailySnapshot } from './routes/admin.js';
import { sseHandler } from './sse.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.join(__dirname, '..', 'public');

const app = express();
app.use(express.json({ limit: '1mb' }));
app.use(cookieSession({
  name: 'station_sess',
  keys: [CONFIG.SESSION_SECRET],
  httpOnly: true,
  sameSite: 'lax',
  maxAge: 30 * 24 * 60 * 60 * 1000, // 30 يومًا
}));

// ===== طبقات الـ API =====
mountAuth(app);
mountInvoices(app);
mountActivity(app);
mountAdmin(app);
app.get('/api/stream', requireAuthed, sseHandler);   // المزامنة اللحظية

// ===== الواجهة الثابتة =====
app.use(express.static(PUBLIC_DIR));
// أي مسار GET ليس API → نُرجع الواجهة (SPA)
app.use((req, res, next) => {
  if (req.method === 'GET' && !req.path.startsWith('/api/')) {
    return res.sendFile(path.join(PUBLIC_DIR, 'index.html'));
  }
  next();
});

// ===== تشغيل قاعدة البيانات أولاً، ثم السيرفر =====
async function startServer() {
  try {
    await initDb(); // انتظار الاتصال بقاعدة بيانات Neon السحابية
    app.listen(CONFIG.PORT, () => {
      console.log(`✅ نظام المحطة يعمل بامتياز على المنفذ: ${CONFIG.PORT}`);
      maybeDailySnapshot();   // لقطة يومية تلقائية إن لزم
    });
  } catch (error) {
    console.error('❌ فشل تشغيل السيرفر أو الاتصال بقاعدة البيانات:', error.message);
  }
}

startServer();