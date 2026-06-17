// تغذية التنبيهات: يرى المستخدم تغييرات الآخرين فقط (لا تغييراته هو) — PostgreSQL
import { all, get, run, now } from '../db.js';
import { requireUser } from '../auth.js';

const ah = fn => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch(e => {
    console.error('[activity]', e.message);
    if (!res.headersSent) res.status(500).json({ error: 'خطأ في الخادم' });
  });

function shape(a) {
  return {
    id: a.id,
    actor: a.actor,
    action_type: a.action_type,
    target_type: a.target_type,
    target_id: a.target_id,
    invoice_id: a.invoice_id,
    summary: a.summary,
    before_data: a.before_data ? JSON.parse(a.before_data) : null,
    after_data: a.after_data ? JSON.parse(a.after_data) : null,
    created_at: a.created_at,
    read: !!a.is_read,
  };
}

// =====================================================
// Helpers — استخراج المستخدم من ترويسة البوابة
// =====================================================
function userFromReq(req) {
  const u = req.headers['x-user'];
  return typeof u === 'string' && u.trim() ? u.trim() : 'user';
}

export function mountActivity(app) {
  app.get('/api/activity', requireUser, ah(async (req, res) => {
    const me = userFromReq(req);
    const scope = req.query.scope === 'all' ? 'all' : 'unread';

    const unreadSql = `
      SELECT a.*
      FROM activity_log a
      WHERE a.actor != ?
        AND NOT EXISTS (
          SELECT 1
          FROM notification_reads nr
          WHERE nr.activity_id = a.id
            AND nr.username = ?
        )
      ORDER BY a.id DESC
      LIMIT 60
    `;

    const allSql = `
      SELECT
        a.*,
        EXISTS(
          SELECT 1
          FROM notification_reads nr
          WHERE nr.activity_id = a.id
            AND nr.username = ?
        ) AS is_read
      FROM activity_log a
      WHERE a.actor != ?
      ORDER BY a.id DESC
      LIMIT 60
    `;

    const unreadCountSql = `
      SELECT COUNT(*)::int AS c
      FROM activity_log a
      WHERE a.actor != ?
        AND NOT EXISTS (
          SELECT 1
          FROM notification_reads nr
          WHERE nr.activity_id = a.id
            AND nr.username = ?
        )
    `;

    const rows = scope === 'all'
      ? await all(allSql, [me, me])
      : await all(unreadSql, [me, me]);

    const countRow = await get(unreadCountSql, [me, me]);
    const unread = Number(countRow?.c || 0);

    res.json({ items: rows.map(shape), unread });
  }));

  app.post('/api/activity/:id/read', requireUser, ah(async (req, res) => {
    await run(
      `
        INSERT INTO notification_reads(username, activity_id, read_at)
        VALUES (?, ?, ?)
        ON CONFLICT (username, activity_id) DO NOTHING
      `,
      [userFromReq(req), Number(req.params.id), now()]
    );
    res.json({ ok: true });
  }));

  app.post('/api/activity/read-all', requireUser, ah(async (req, res) => {
    const me = userFromReq(req);

    const unreadIds = await all(
      `
        SELECT a.id
        FROM activity_log a
        WHERE a.actor != ?
          AND NOT EXISTS (
            SELECT 1
            FROM notification_reads nr
            WHERE nr.activity_id = a.id
              AND nr.username = ?
          )
      `,
      [me, me]
    );

    const t = now();
    for (const { id } of unreadIds) {
      await run(
        `
          INSERT INTO notification_reads(username, activity_id, read_at)
          VALUES (?, ?, ?)
          ON CONFLICT (username, activity_id) DO NOTHING
        `,
        [me, id, t]
      );
    }

    res.json({ ok: true, marked: unreadIds.length });
  }));
}
