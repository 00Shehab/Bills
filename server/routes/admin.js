// لوحة الأدمن — سجل النشاط + سلة المحذوفات + النسخ الاحتياطية
// يعمل مع PostgreSQL عبر db.js (async/await)
import { pool, all, get, run, now } from '../db.js';
import { requireAdmin } from '../auth.js';

const MONTHS = [
  'يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو',
  'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر',
];

const TYPE_TITLES = {
  lower: 'فاتورة البيت الأسفل', upper: 'فاتورة البيت الأعلى', rev: 'فاتورة الإيرادات',
  other: 'معاملات أخرى', receipt: 'سند قبض', letter: 'سند الهاشمي',
  income: 'الدخل', expense: 'المصروفات', incexp: 'الدخل والمصروفات',
};

let dailyTimer = null;
let lastDailySnapshotKey = null;

const safeJson = (value, fallback = null) => {
  if (value === null || value === undefined || value === '') return fallback;
  if (typeof value === 'object') return value;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
};

const toJson = (value) => (value === undefined ? null : JSON.stringify(value));

function invLabel(inv) {
  const meta = safeJson(inv.meta, {}) || {};
  const title = meta.label || meta.title || TYPE_TITLES[inv.type] || inv.type || 'فاتورة';
  const month = MONTHS[Math.max(0, Number(inv.month || 1) - 1)] || String(inv.month || '');
  return `${title} - ${month} ${inv.year || ''}`.trim();
}

function mapActivity(row) {
  return {
    ...row,
    before_data: safeJson(row.before_data, null),
    after_data: safeJson(row.after_data, null),
  };
}

function mapTrashInvoice(row) {
  return {
    id: row.id,
    label: invLabel(row),
    type: row.type,
    month: row.month,
    year: row.year,
    deleted_by: row.deleted_by,
    deleted_at: row.deleted_at,
    created_at: row.created_at,
    updated_at: row.updated_at,
    status: row.status,
    meta: safeJson(row.meta, {}),
  };
}

function mapTrashRow(row) {
  return {
    id: row.id,
    invoice_id: row.invoice_id,
    invoice_label: invLabel(row),
    position: row.position,
    data: safeJson(row.data, {}),
    committed: safeJson(row.committed, null),
    origin_committed: Number(row.origin_committed || 0),
    deleted_by: row.deleted_by,
    deleted_at: row.deleted_at,
    created_at: row.created_at,
    updated_at: row.updated_at,
    status: row.status,
  };
}

async function q(client, sql, params = []) {
  return client.query(sql, params);
}

async function withTx(fn) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    try { await client.query('ROLLBACK'); } catch {}
    throw error;
  } finally {
    client.release();
  }
}

async function resetSerial(client, table, column) {
  await client.query(
    `SELECT setval(
      pg_get_serial_sequence($1, $2),
      COALESCE((SELECT MAX(${column}) FROM ${table}), 1),
      true
    )`,
    [table, column]
  ).catch(() => {});
}

async function fetchSnapshotData(client) {
  // مهم: عميل PostgreSQL واحد لا ينفّذ إلا استعلامًا واحدًا في كل مرة — لذا ننفّذها بالتسلسل
  const users = await q(client, `
    SELECT id, display_name, role, created_at, last_login_at
    FROM users
    ORDER BY id ASC
  `);
  const invoices = await q(client, `
    SELECT *
    FROM invoices
    ORDER BY created_at ASC, id ASC
  `);
  const invoiceRows = await q(client, `
    SELECT *
    FROM invoice_rows
    ORDER BY created_at ASC, position ASC, id ASC
  `);
  const activityLog = await q(client, `
    SELECT *
    FROM activity_log
    ORDER BY id ASC
  `);
  const reads = await q(client, `
    SELECT *
    FROM notification_reads
    ORDER BY username ASC, activity_id ASC
  `);

  return {
    version: 1,
    captured_at: now(),
    users: users.rows,
    invoices: invoices.rows,
    invoice_rows: invoiceRows.rows,
    activity_log: activityLog.rows,
    notification_reads: reads.rows,
  };
}

async function createSnapshot({ createdBy = 'admin', note = 'نسخة احتياطية', kind = 'manual' } = {}) {
  return withTx(async (client) => {
    const data = await fetchSnapshotData(client);
    const inserted = await q(
      client,
      `
        INSERT INTO snapshots (created_by, created_at, note, kind, data)
        VALUES ($1, $2, $3, $4, $5)
        RETURNING *
      `,
      [createdBy, now(), note, kind, JSON.stringify(data)]
    );
    return inserted.rows[0];
  });
}

async function restoreFromSnapshot(snapshotId, createdBy = 'admin') {
  const snap = await get(
    `
      SELECT *
      FROM snapshots
      WHERE id = $1
      LIMIT 1
    `,
    [snapshotId]
  );

  if (!snap) {
    const err = new Error('النسخة غير موجودة');
    err.status = 404;
    throw err;
  }

  const data = safeJson(snap.data, null);
  if (!data || typeof data !== 'object') {
    const err = new Error('النسخة الاحتياطية تالفة');
    err.status = 400;
    throw err;
  }

  // نحفظ نسخة أمان قبل الاسترجاع
  await createSnapshot({
    createdBy,
    kind: 'pre_restore',
    note: `نسخة أمان قبل استرجاع: ${snap.note || `Snapshot #${snap.id}`}`,
  });

  await withTx(async (client) => {
    // نحافظ على جدول snapshots نفسه، ونستبدل البيانات التشغيلية فقط
    await q(client, `DELETE FROM notification_reads`);
    await q(client, `DELETE FROM activity_log`);
    await q(client, `DELETE FROM invoice_rows`);
    await q(client, `DELETE FROM invoices`);
    await q(client, `DELETE FROM users`);

    // users
    if (Array.isArray(data.users)) {
      for (const u of data.users) {
        await q(
          client,
          `
            INSERT INTO users (id, display_name, role, created_at, last_login_at)
            VALUES ($1, $2, $3, $4, $5)
          `,
          [
            u.id ?? null,
            u.display_name ?? '',
            u.role ?? 'user',
            u.created_at ?? now(),
            u.last_login_at ?? null,
          ]
        );
      }
      await resetSerial(client, 'users', 'id');
    }

    // invoices
    if (Array.isArray(data.invoices)) {
      for (const inv of data.invoices) {
        await q(
          client,
          `
            INSERT INTO invoices (
              id, type, month, year, created_by, created_at,
              updated_by, updated_at, deleted_by, deleted_at, status, meta
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
          `,
          [
            inv.id,
            inv.type ?? 'other',
            Number(inv.month ?? 1),
            Number(inv.year ?? new Date().getFullYear()),
            inv.created_by ?? null,
            inv.created_at ?? now(),
            inv.updated_by ?? null,
            inv.updated_at ?? null,
            inv.deleted_by ?? null,
            inv.deleted_at ?? null,
            inv.status ?? 'active',
            typeof inv.meta === 'string' ? inv.meta : JSON.stringify(inv.meta ?? {}),
          ]
        );
      }
    }

    // invoice_rows
    if (Array.isArray(data.invoice_rows)) {
      for (const row of data.invoice_rows) {
        await q(
          client,
          `
            INSERT INTO invoice_rows (
              id, invoice_id, position, data, committed, origin_committed,
              created_by, created_at, updated_by, updated_at,
              deleted_by, deleted_at, status
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
          `,
          [
            row.id,
            row.invoice_id,
            Number(row.position ?? 0),
            typeof row.data === 'string' ? row.data : JSON.stringify(row.data ?? {}),
            row.committed == null ? null : (typeof row.committed === 'string' ? row.committed : JSON.stringify(row.committed)),
            Number(row.origin_committed ?? 0),
            row.created_by ?? null,
            row.created_at ?? now(),
            row.updated_by ?? null,
            row.updated_at ?? null,
            row.deleted_by ?? null,
            row.deleted_at ?? null,
            row.status ?? 'active',
          ]
        );
      }
    }

    // activity_log
    if (Array.isArray(data.activity_log)) {
      for (const act of data.activity_log) {
        await q(
          client,
          `
            INSERT INTO activity_log (
              id, actor, action_type, target_type, target_id, invoice_id,
              summary, before_data, after_data, created_at
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
          `,
          [
            act.id ?? null,
            act.actor ?? 'admin',
            act.action_type ?? 'restore',
            act.target_type ?? 'system',
            act.target_id ?? null,
            act.invoice_id ?? null,
            act.summary ?? 'استرجاع نسخة احتياطية',
            act.before_data == null
              ? null
              : (typeof act.before_data === 'string' ? act.before_data : JSON.stringify(act.before_data)),
            act.after_data == null
              ? null
              : (typeof act.after_data === 'string' ? act.after_data : JSON.stringify(act.after_data)),
            act.created_at ?? now(),
          ]
        );
      }
      await resetSerial(client, 'activity_log', 'id');
    }

    // notification_reads
    if (Array.isArray(data.notification_reads)) {
      for (const r of data.notification_reads) {
        await q(
          client,
          `
            INSERT INTO notification_reads (username, activity_id, read_at)
            VALUES ($1, $2, $3)
          `,
          [r.username, Number(r.activity_id), r.read_at ?? now()]
        );
      }
    }
  });

  return snap;
}

function extractActor(req) {
  const s = req.session || {};
  return s.user || s.role || 'admin';
}

export function mountAdmin(app) {
  app.get('/api/admin/log', requireAdmin, async (req, res) => {
    try {
      const rows = await all(`
        SELECT *
        FROM activity_log
        ORDER BY id DESC
        LIMIT 1000
      `);
      res.json({ items: rows.map(mapActivity) });
    } catch (error) {
      console.error('[admin/log]', error);
      res.status(500).json({ error: 'تعذّر تحميل سجل النشاط' });
    }
  });

  app.get('/api/admin/trash', requireAdmin, async (req, res) => {
    try {
      const [invRows, rowRows] = await Promise.all([
        all(`
          SELECT *
          FROM invoices
          WHERE status = 'deleted'
          ORDER BY deleted_at DESC NULLS LAST, id DESC
        `),
        all(`
          SELECT r.*, i.type, i.month, i.year, i.meta
          FROM invoice_rows r
          JOIN invoices i ON i.id = r.invoice_id
          WHERE r.status = 'deleted'
          ORDER BY r.deleted_at DESC NULLS LAST, r.id DESC
        `),
      ]);

      res.json({
        invoices: invRows.map(mapTrashInvoice),
        rows: rowRows.map(mapTrashRow),
      });
    } catch (error) {
      console.error('[admin/trash]', error);
      res.status(500).json({ error: 'تعذّر تحميل سلة المحذوفات' });
    }
  });

  app.get('/api/admin/snapshots', requireAdmin, async (req, res) => {
    try {
      const rows = await all(`
        SELECT id, created_by, created_at, note, kind
        FROM snapshots
        ORDER BY id DESC
      `);
      res.json({
        snapshots: rows,
      });
    } catch (error) {
      console.error('[admin/snapshots]', error);
      res.status(500).json({ error: 'تعذّر تحميل النسخ الاحتياطية' });
    }
  });

  app.post('/api/admin/snapshot', requireAdmin, async (req, res) => {
    try {
      const createdBy = extractActor(req);
      const note = req.body?.note || 'نسخة احتياطية يدوية';
      const snap = await createSnapshot({ createdBy, note, kind: 'manual' });
      res.json({ ok: true, snapshot: snap });
    } catch (error) {
      console.error('[admin/snapshot]', error);
      res.status(500).json({ error: 'تعذّر إنشاء النسخة الاحتياطية' });
    }
  });

  app.post('/api/admin/restore/:kind/:id', requireAdmin, async (req, res) => {
    const { kind, id } = req.params;
    const actor = extractActor(req);

    try {
      if (kind === 'invoice') {
        const inv = await get(`
          SELECT *
          FROM invoices
          WHERE id = $1
          LIMIT 1
        `, [id]);

        if (!inv || inv.status !== 'deleted') {
          return res.status(404).json({ error: 'الفاتورة غير موجودة أو ليست محذوفة' });
        }

        await withTx(async (client) => {
          await q(
            client,
            `
              UPDATE invoices
              SET status = 'active', deleted_by = NULL, deleted_at = NULL
              WHERE id = $1
            `,
            [id]
          );

          await q(
            client,
            `
              UPDATE invoice_rows
              SET status = 'active', deleted_by = NULL, deleted_at = NULL
              WHERE invoice_id = $1
            `,
            [id]
          );

          await q(
            client,
            `
              INSERT INTO activity_log (
                actor, action_type, target_type, target_id, invoice_id,
                summary, before_data, after_data, created_at
              )
              VALUES ($1, 'restore', 'invoice', $2, $2, $3, $4, $5, $6)
            `,
            [
              actor,
              id,
              `استرجاع الفاتورة «${invLabel(inv)}»`,
              toJson({ ...inv, status: 'deleted' }),
              toJson({ ...inv, status: 'active' }),
              now(),
            ]
          );
        });

        return res.json({ ok: true });
      }

      if (kind === 'row') {
        const row = await get(`
          SELECT r.*, i.type, i.month, i.year, i.meta
          FROM invoice_rows r
          JOIN invoices i ON i.id = r.invoice_id
          WHERE r.id = $1
          LIMIT 1
        `, [id]);

        if (!row || row.status !== 'deleted') {
          return res.status(404).json({ error: 'البند غير موجود أو ليس محذوفًا' });
        }

        await withTx(async (client) => {
          await q(
            client,
            `
              UPDATE invoice_rows
              SET status = 'active', deleted_by = NULL, deleted_at = NULL
              WHERE id = $1
            `,
            [id]
          );

          await q(
            client,
            `
              INSERT INTO activity_log (
                actor, action_type, target_type, target_id, invoice_id,
                summary, before_data, after_data, created_at
              )
              VALUES ($1, 'restore', 'row', $2, $3, $4, $5, $6, $7)
            `,
            [
              actor,
              id,
              row.invoice_id,
              `استرجاع بند في «${invLabel(row)}»`,
              toJson({ ...row, status: 'deleted' }),
              toJson({ ...row, status: 'active' }),
              now(),
            ]
          );
        });

        return res.json({ ok: true });
      }

      return res.status(400).json({ error: 'نوع الاسترجاع غير معروف' });
    } catch (error) {
      console.error('[admin/restore]', error);
      res.status(error.status || 500).json({ error: error.message || 'تعذّر الاسترجاع' });
    }
  });

  app.post('/api/admin/restore-snapshot/:id', requireAdmin, async (req, res) => {
    const actor = extractActor(req);
    const snapshotId = Number(req.params.id);

    try {
      const restored = await restoreFromSnapshot(snapshotId, actor);

      // نضيف سجلًا واضحًا لعملية الاسترجاع نفسها
      await run(
        `
          INSERT INTO activity_log (
            actor, action_type, target_type, target_id, invoice_id,
            summary, before_data, after_data, created_at
          )
          VALUES ($1, 'restore', 'snapshot', $2, NULL, $3, NULL, $4, $5)
        `,
        [
          actor,
          String(snapshotId),
          `استرجاع نسخة احتياطية: ${restored.note || `Snapshot #${restored.id}`}`,
          toJson({ snapshot_id: restored.id, kind: restored.kind }),
          now(),
        ]
      );

      res.json({ ok: true });
    } catch (error) {
      console.error('[admin/restore-snapshot]', error);
      res.status(error.status || 500).json({ error: error.message || 'تعذّر استرجاع النسخة' });
    }
  });
}

export function maybeDailySnapshot() {
  const startTimer = () => {
    if (dailyTimer) return;
    dailyTimer = setInterval(() => {
      void maybeDailySnapshot();
    }, 60 * 60 * 1000);
  };

  startTimer();

  const todayKey = new Date().toISOString().slice(0, 10);
  if (lastDailySnapshotKey === todayKey) return;
  lastDailySnapshotKey = todayKey;

  const start = `${todayKey}T00:00:00.000Z`;
  const end = `${new Date(Date.parse(start) + 24 * 60 * 60 * 1000).toISOString()}`;

  (async () => {
    try {
      const existing = await get(
        `
          SELECT id
          FROM snapshots
          WHERE kind = 'daily'
            AND created_at >= $1
            AND created_at < $2
          LIMIT 1
        `,
        [start, end]
      );

      if (existing) return;

      await createSnapshot({
        createdBy: 'system',
        kind: 'daily',
        note: `نسخة يومية ${todayKey}`,
      });
      console.log(`[admin] تم إنشاء النسخة اليومية: ${todayKey}`);
    } catch (error) {
      console.error('[admin/daily-snapshot]', error.message);
    }
  })();
}