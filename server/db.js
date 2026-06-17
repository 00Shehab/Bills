// طبقة قاعدة البيانات — PostgreSQL محلي (سيرفرك). متعدّد المستأجرين:
// كل طلب يعمل داخل schema الفريق القادم من ترويسة X-Tenant-Schema (تحقنها البوابة).
// نُبقي واجهة db.prepare(sql).all/get/run، مع تحويل ? إلى $1,$2.. تلقائيًا.
import pg from 'pg';
import { AsyncLocalStorage } from 'node:async_hooks';
import { CONFIG } from './config.js';

const { Pool } = pg;

if (!CONFIG.DATABASE_URL) {
  console.error('[db] تحذير: DATABASE_URL غير مضبوط — اضبطه في .env');
}

// SSL فقط إن طُلب صراحةً في الرابط (مثل Neon)؛ PostgreSQL المحلي بلا SSL.
const NEEDS_SSL = /sslmode=require|ssl=true/i.test(CONFIG.DATABASE_URL || '');
export const pool = new Pool({
  connectionString: CONFIG.DATABASE_URL || '',
  ssl: NEEDS_SSL ? { rejectUnauthorized: false } : false,
  max: 5,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 15000,
});
pool.on('error', e => console.error('[pg] خطأ في مجمّع الاتصالات:', e.message));

export const now = () => new Date().toISOString();

// schema الفريق الحالي محفوظ طوال عمر الطلب (يضبطه middleware من الترويسة)
export const tenantStore = new AsyncLocalStorage();
function currentSchema() {
  const store = tenantStore.getStore();
  const schema = store && store.schema;
  return (schema && /^t_[a-z0-9_]+$/.test(schema)) ? schema : 'public';
}
// يضبط search_path على schema فريق الطلب لاتصال معيّن (يُستخدم أيضًا في معاملات الأدمن)
export async function applySchema(client) {
  await client.query(`SET search_path TO "${currentSchema()}", public`);
}

// تحويل علامات ? إلى $1,$2.. لتتوافق مع PostgreSQL
function toPg(sql) { let i = 0; return sql.replace(/\?/g, () => '$' + (++i)); }

// كل نداء: يسحب اتصالًا، يضبط search_path على فريق الطلب، ينفّذ، ثم يُرجع الاتصال
async function withClient(fn) {
  const client = await pool.connect();
  try {
    await applySchema(client);
    return await fn(client);
  } finally {
    client.release();
  }
}

export async function all(sql, params = []) {
  return withClient(c => c.query(toPg(sql), params).then(r => r.rows));
}
export async function get(sql, params = []) {
  return withClient(c => c.query(toPg(sql), params).then(r => r.rows[0]));
}
export async function run(sql, params = []) {
  return withClient(c => c.query(toPg(sql), params).then(
    r => ({ rowCount: r.rowCount, rows: r.rows, lastInsertRowid: r.rows[0]?.id })));
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

// تهيئة الجداول وزرع المستخدمين — تُستدعى مرة عند الإقلاع
export async function initDb() {
  if (!CONFIG.DATABASE_URL) {
    throw new Error(
      'DATABASE_URL مفقود — لا يمكن الاتصال بقاعدة البيانات'
    );
  }

  const client = await pool.connect();

  try {
    await client.query('SELECT 1');
    console.log('[db] PostgreSQL connection OK');
  } finally {
    client.release();
  }
}
