const API = {
  token: () => localStorage.getItem('sr_token'),
  user: () => JSON.parse(localStorage.getItem('sr_user') || 'null'),

  async post(url, body, auth = false) {
    const headers = { 'Content-Type': 'application/json' };
    if (auth) headers['Authorization'] = 'Bearer ' + this.token();
    const res = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body) });
    return { ok: res.ok, status: res.status, data: await res.json() };
  },

  async get(url, auth = false) {
    const headers = {};
    if (auth) headers['Authorization'] = 'Bearer ' + this.token();
    const res = await fetch(url, { headers });
    return { ok: res.ok, status: res.status, data: await res.json() };
  }
};

function showToast(msg, duration = 2500) {
  const t = document.getElementById('toast');
  if (!t) return;
  t.textContent = msg;
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), duration);
}

function initials(name) {
  return (name || '?').split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
}

function escapeHtml(s) {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}
