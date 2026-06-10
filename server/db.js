// طبقة قاعدة البيانات — SQLite المدمج في Node (node:sqlite)
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { CONFIG } from './config.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const DATA_DIR = path.join(__dirname, '..', 'data');
export const BACKUP_DIR = path.join(DATA_DIR, 'backups');
mkdirSync(BACKUP_DIR, { recursive: true });

export const DB_PATH = path.join(DATA_DIR, 'bills.db');
export const db = new DatabaseSync(DB_PATH);
db.exec('PRAGMA journal_mode = WAL;');
db.exec('PRAGMA foreign_keys = ON;');

export const now = () => new Date().toISOString();

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
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
  status TEXT NOT NULL DEFAULT 'active'
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
  id INTEGER PRIMARY KEY AUTOINCREMENT,
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
  user TEXT NOT NULL,
  activity_id INTEGER NOT NULL,
  read_at TEXT NOT NULL,
  PRIMARY KEY (user, activity_id)
);

CREATE TABLE IF NOT EXISTS snapshots (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  created_by TEXT,
  created_at TEXT NOT NULL,
  note TEXT,
  file_path TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'manual'
);

CREATE INDEX IF NOT EXISTS idx_rows_invoice ON invoice_rows(invoice_id);
CREATE INDEX IF NOT EXISTS idx_activity_created ON activity_log(id DESC);
`);

// زرع المستخدمين المعتمدين (هوية تشغيل)
const seed = db.prepare('INSERT OR IGNORE INTO users(display_name, role, created_at) VALUES(?,?,?)');
for (const name of CONFIG.USERS) seed.run(name, 'user', now());

console.log('[db] ready at', DB_PATH);
