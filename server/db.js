// طبقة قاعدة البيانات — PostgreSQL سحابية (Neon) عبر مكتبة pg.
// كل العمليات غير متزامنة (Promises). نُبقي واجهة db.prepare(sql).all/get/run
// المتوافقة مع باقي الكود، مع تحويل تلقائي لعلامات ? إلى $1,$2.. ودعم RETURNING.
import pg from 'pg';
import { CONFIG } from './config.js';

const { Pool } = pg;

if (!CONFIG.DATABASE_URL) {
  console.error('[db] تحذير: DATABASE_URL غير مضبوط — اضبطه في .env أو متغيرات بيئة المنصة');
}

export const pool = new Pool({
  connectionString: CONFIG.DATABASE_URL,
  ssl: { rejectUnauthorized: false },   // مطلوب للاتصال بـ Neon
  max: 5,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 15000,
});
pool.on('error', e => console.error('[pg] خطأ في مجمّع الاتصالات:', e.message));

export const now = () => new Date().toISOString();

// تحويل علامات ? إلى $1,$2.. لتتوافق مع PostgreSQL
function toPg(sql) { let i = 0; return sql.replace(/\?/g, () => '$' + (++i)); }

export async function all(sql, params = []) { return (await pool.query(toPg(sql), params)).rows; }
export async function get(sql, params = []) { return (await pool.query(toPg(sql), params)).rows[0]; }
export async function run(sql, params = []) {
  const r = await pool.query(toPg(sql), params);
  return { rowCount: r.rowCount, rows: r.rows, lastInsertRowid: r.rows[0]?.id };
}

// واجهة متوافقة مع الكود القائم — لكنها الآن ترجع Promises (تتطلب await)
export const db = {
  prepare(sql) {
    return {
      all: (...a) => all(sql, a),
      get: (...a) => get(sql, a),
      run: (...a) => run(sql, a),
    };
  },
  query: (sql, params = []) => pool.query(toPg(sql), params),
  exec: (sql) => pool.query(sql),
};

const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  display_name TEXT UNIQUE NOT NULL,
  role TEXT NOT NULL DEFAULT 'user',
  created_at TEXT NOT NULL,
  last_login_at TEXT
);
CREATE TABLE IF NOT EXISTS invoices (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  month INTEGER NOT NULL,
  year INTEGER NOT NULL,
  created_by TEXT,
  created_at TEXT NOT NULL,
  updated_by TEXT,
  updated_at TEXT,
  deleted_by TEXT,
  deleted_at TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  meta TEXT DEFAULT '{}'
);
CREATE TABLE IF NOT EXISTS invoice_rows (
  id TEXT PRIMARY KEY,
  invoice_id TEXT NOT NULL,
  position INTEGER NOT NULL,
  data TEXT NOT NULL DEFAULT '{}',
  committed TEXT,
  origin_committed INTEGER NOT NULL DEFAULT 0,
  created_by TEXT,
  created_at TEXT NOT NULL,
  updated_by TEXT,
  updated_at TEXT,
  deleted_by TEXT,
  deleted_at TEXT,
  status TEXT NOT NULL DEFAULT 'active'
);
CREATE TABLE IF NOT EXISTS activity_log (
  id SERIAL PRIMARY KEY,
  actor TEXT NOT NULL,
  action_type TEXT NOT NULL,
  target_type TEXT NOT NULL,
  target_id TEXT,
  invoice_id TEXT,
  summary TEXT,
  before_data TEXT,
  after_data TEXT,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS notification_reads (
  username TEXT NOT NULL,
  activity_id INTEGER NOT NULL,
  read_at TEXT NOT NULL,
  PRIMARY KEY (username, activity_id)
);
CREATE TABLE IF NOT EXISTS snapshots (
  id SERIAL PRIMARY KEY,
  created_by TEXT,
  created_at TEXT NOT NULL,
  note TEXT,
  kind TEXT NOT NULL DEFAULT 'manual',
  data TEXT
);
CREATE INDEX IF NOT EXISTS idx_rows_invoice ON invoice_rows(invoice_id);
CREATE INDEX IF NOT EXISTS idx_activity_id ON activity_log(id DESC);
`;

// تهيئة الجداول وزرع المستخدمين — تُستدعى مرة عند الإقلاع
export async function initDb() {
  if (!CONFIG.DATABASE_URL) throw new Error('DATABASE_URL مفقود — لا يمكن الاتصال بقاعدة البيانات');
  await pool.query(SCHEMA);
  const seed = 'INSERT INTO users(display_name, role, created_at) VALUES($1,$2,$3) ON CONFLICT (display_name) DO NOTHING';
  for (const name of CONFIG.USERS) await pool.query(seed, [name, 'user', now()]);
  console.log('[db] PostgreSQL جاهزة ومتصلة بـ Neon');
}
