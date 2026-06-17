// نقطة دخول الخادم — Express: جلسات، مصادقة، واجهة ثابتة، API ومزامنة
import express from 'express';
import cookieSession from 'cookie-session';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { CONFIG } from './config.js';

import {
  initDb,
  tenantStore
} from './db.js';

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
  maxAge: 30 * 24 * 60 * 60 * 1000,
}));

// =====================================================
// Multi-Tenant Middleware
// =====================================================
// البوابة Python تحقن X-Tenant-Schema
// نخزنها في AsyncLocalStorage حتى تصل إلى db.js
// =====================================================

app.use((req, res, next) => {
  const schemaHeader = req.headers['x-tenant-schema'];

  const schema =
    typeof schemaHeader === 'string'
      ? schemaHeader
      : 'public';

  tenantStore.run({ schema }, () => {
    next();
  });
});

// ===== طبقات الـ API =====

mountAuth(app);
mountInvoices(app);
mountActivity(app);
mountAdmin(app);

app.get(
  '/api/stream',
  requireAuthed,
  sseHandler
);

// ===== الواجهة الثابتة =====

app.use(express.static(PUBLIC_DIR));

// أي مسار GET ليس API → نُرجع الواجهة (SPA)

app.use((req, res, next) => {
  if (
    req.method === 'GET' &&
    !req.path.startsWith('/api/')
  ) {
    return res.sendFile(
      path.join(PUBLIC_DIR, 'index.html')
    );
  }

  next();
});

// ===== تشغيل قاعدة البيانات أولاً، ثم السيرفر =====

async function startServer() {
  try {
    await initDb();

    app.listen(CONFIG.PORT, '127.0.0.1', () => {
      console.log(
        `✅ Bills listening on 127.0.0.1:${CONFIG.PORT}`
      );

      maybeDailySnapshot();
    });
  } catch (error) {
    console.error(
      '❌ فشل تشغيل السيرفر:',
      error.message
    );
  }
}

startServer();