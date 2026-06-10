// طبقة الاتصال بالـ API (كل النداءات تمر من هنا)
async function req(method, path, body) {
  const opts = { method, credentials: 'same-origin', headers: {} };
  if (body !== undefined) {
    opts.headers['Content-Type'] = 'application/json';
    opts.body = JSON.stringify(body);
  }
  const res = await fetch(path, opts);
  let data = null;
  try { data = await res.json(); } catch { /* لا جسم */ }
  if (!res.ok) {
    const err = new Error((data && data.error) || ('HTTP ' + res.status));
    err.status = res.status; err.data = data;
    throw err;
  }
  return data;
}

export const api = {
  get:   (p) => req('GET', p),
  post:  (p, b) => req('POST', p, b),
  patch: (p, b) => req('PATCH', p, b),
  del:   (p) => req('DELETE', p),
};
