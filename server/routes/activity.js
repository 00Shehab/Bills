// تغذية التنبيهات: يرى المستخدم تغييرات الآخرين فقط (لا تغييراته هو)
import { db, now } from '../db.js';
import { requireUser } from '../auth.js';

const qUnread = db.prepare(`
  SELECT a.* FROM activity_log a
  WHERE a.actor != ?
    AND NOT EXISTS (SELECT 1 FROM notification_reads nr WHERE nr.activity_id=a.id AND nr.user=?)
  ORDER BY a.id DESC LIMIT 60`);
const qAll = db.prepare(`
  SELECT a.*, EXISTS(SELECT 1 FROM notification_reads nr WHERE nr.activity_id=a.id AND nr.user=?) AS is_read
  FROM activity_log a WHERE a.actor != ? ORDER BY a.id DESC LIMIT 60`);
const qUnreadCount = db.prepare(`
  SELECT COUNT(*) AS c FROM activity_log a
  WHERE a.actor != ?
    AND NOT EXISTS (SELECT 1 FROM notification_reads nr WHERE nr.activity_id=a.id AND nr.user=?)`);
const qUnreadIds = db.prepare(`
  SELECT a.id FROM activity_log a
  WHERE a.actor != ?
    AND NOT EXISTS (SELECT 1 FROM notification_reads nr WHERE nr.activity_id=a.id AND nr.user=?)`);
const markRead = db.prepare(`INSERT OR IGNORE INTO notification_reads(user, activity_id, read_at) VALUES(?,?,?)`);

function shape(a) {
  return {
    id: a.id, actor: a.actor, action_type: a.action_type, target_type: a.target_type,
    target_id: a.target_id, invoice_id: a.invoice_id, summary: a.summary,
    before_data: a.before_data ? JSON.parse(a.before_data) : null,
    after_data: a.after_data ? JSON.parse(a.after_data) : null,
    created_at: a.created_at, read: !!a.is_read,
  };
}

export function mountActivity(app) {
  app.get('/api/activity', requireUser, (req, res) => {
    const me = req.session.user;
    const scope = req.query.scope === 'all' ? 'all' : 'unread';
    const rows = scope === 'all' ? qAll.all(me, me) : qUnread.all(me, me);
    const count = qUnreadCount.get(me, me).c;
    res.json({ items: rows.map(shape), unread: count });
  });

  app.post('/api/activity/:id/read', requireUser, (req, res) => {
    markRead.run(req.session.user, Number(req.params.id), now());
    res.json({ ok: true });
  });

  app.post('/api/activity/read-all', requireUser, (req, res) => {
    const me = req.session.user;
    const ids = qUnreadIds.all(me, me);
    const t = now();
    for (const { id } of ids) markRead.run(me, id, t);
    res.json({ ok: true, marked: ids.length });
  });
}
