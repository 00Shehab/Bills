// مخزن التنبيهات (تغييرات الآخرين) + تحديث عدّاد الجرس
const state = { items: [], unread: 0 };
const listeners = new Set();

export function getState() { return state; }
export function onChange(fn) { listeners.add(fn); return () => listeners.delete(fn); }

function updateBadge() {
  const c = document.getElementById('bellCount');
  if (!c) return;
  c.textContent = state.unread > 99 ? '99+' : String(state.unread);
  c.hidden = state.unread <= 0;
}
function emit() { updateBadge(); listeners.forEach(fn => fn(state)); }

export function setInitial(items, unread) { state.items = items || []; state.unread = unread || 0; emit(); }
export function addIncoming(act) { state.items.unshift({ ...act, read: false }); state.unread++; emit(); }
export function markAllRead() { state.items.forEach(i => i.read = true); state.unread = 0; emit(); }
export function markReadLocal(id) {
  const it = state.items.find(i => i.id === id);
  if (it && !it.read) { it.read = true; state.unread = Math.max(0, state.unread - 1); }
  emit();
}
