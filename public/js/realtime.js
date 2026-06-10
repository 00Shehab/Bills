// عميل المزامنة اللحظية (SSE): يطبّق تغييرات الآخرين على الفاتورة المفتوحة ويغذّي الجرس
import { api } from './api.js';
import { applyRemoteActivity } from './invoices.js';
import { addIncoming, setInitial } from './notifications.js';

let me = null;
let es = null;

export async function startRealtime(user) {
  me = user;
  try { const { items, unread } = await api.get('/api/activity?scope=all'); setInitial(items, unread); } catch {}
  connect();
}

function connect() {
  if (es) es.close();
  es = new EventSource('/api/stream');           // يعيد الاتصال تلقائيًا عند الانقطاع
  es.onmessage = ev => {
    let d; try { d = JSON.parse(ev.data); } catch { return; }
    if (d.kind !== 'activity' || !d.activity) return;
    const act = d.activity;
    if (act.actor === me) return;                 // لا أرى تغييراتي أنا
    applyRemoteActivity(act);                     // حدّث العرض الحالي
    addIncoming(act);                             // أضِف للجرس
  };
}
