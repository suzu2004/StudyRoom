const token = API.token();
const user = API.user();
if (!token || !user) window.location.href = '/';

let createdRoom = null;

window.addEventListener('DOMContentLoaded', () => {
  document.getElementById('sb-name').textContent = user.name;
  document.getElementById('sb-avatar').textContent = initials(user.name);
  document.getElementById('settings-name').value = user.name;
  document.getElementById('settings-email').value = user.email;
  const h = new Date().getHours();
  const g = h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
  document.getElementById('greeting').textContent = `${g}, ${user.name.split(' ')[0]} 👋`;
  loadRooms();
});

function setPanel(id, el) {
  document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  document.getElementById('panel-' + id).classList.add('active');
  if (el) el.classList.add('active');
  if (id === 'rooms') loadMyRooms();
}

async function loadRooms() {
  const { ok, data } = await API.get('/api/rooms/mine', true);
  if (ok) renderRoomList('recent-rooms', data);
}

async function loadMyRooms() {
  const { ok, data } = await API.get('/api/rooms/mine', true);
  if (ok) renderRoomList('my-rooms-list', data);
}

function renderRoomList(id, rooms) {
  const el = document.getElementById(id);
  if (!rooms.length) { el.innerHTML = '<div style="font-size:13px;color:var(--hint);padding:10px 0">No rooms yet. Create one!</div>'; return; }
  el.innerHTML = rooms.map(r => {
    const live = new Date(r.expires_at) > new Date();
    return `<div class="room-item" onclick="window.location.href='/room/${r.code}'">
      <div class="room-dot ${live ? 'live' : ''}"></div>
      <div class="room-item-info">
        <strong>${escapeHtml(r.name)}</strong>
        <span>${new Date(r.created_at).toLocaleDateString()} · <span style="font-family:var(--mono);font-weight:600">${r.code}</span> · PIN: <span style="font-family:var(--mono);font-weight:600">${r.pin}</span></span>
      </div>
      ${r.is_public ? '<span class="badge public">Public</span>' : ''}
      ${live ? '<span class="badge">Live</span>' : ''}
    </div>`;
  }).join('');
}

async function handleCreate() {
  const btn = document.getElementById('create-btn');
  if (createdRoom) { window.location.href = '/room/' + createdRoom.code; return; }
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span>';
  const name = document.getElementById('room-name-input').value.trim() || 'Study Room';
  const topic = document.getElementById('room-topic').value;
  const is_public = document.getElementById('room-public').checked;
  const { ok, data } = await API.post('/api/rooms/create', { name, topic, is_public }, true);
  if (!ok) { showToast('Failed to create room'); btn.disabled = false; btn.textContent = 'Create Room'; return; }
  createdRoom = data;
  document.getElementById('room-code-display').textContent = data.code;
  document.getElementById('room-pin-display').textContent = data.pin;
  document.getElementById('share-link-text').textContent = `${window.location.origin}/join/${data.code}`;
  document.getElementById('code-section').classList.remove('hidden');
  btn.disabled = false;
  btn.textContent = 'Go to Room →';
  loadRooms();
}

function openCreate() {
  createdRoom = null;
  document.getElementById('code-section').classList.add('hidden');
  document.getElementById('create-btn').textContent = 'Create Room';
  openModal('modal-create');
}

function openJoin() {
  document.getElementById('join-code').value = '';
  document.getElementById('join-pin').value = '';
  document.getElementById('join-err').classList.add('hidden');
  openModal('modal-join');
  setTimeout(() => document.getElementById('join-code').focus(), 200);
}

function openJoinLink() {
  document.getElementById('link-input').value = '';
  document.getElementById('link-pin').value = '';
  document.getElementById('link-err').classList.add('hidden');
  openModal('modal-link');
}

async function doJoinFromDash() {
  const code = document.getElementById('join-code').value.trim().toUpperCase();
  const pin = document.getElementById('join-pin').value.trim();
  const err = document.getElementById('join-err');
  err.classList.add('hidden');
  if (code.length < 4) { err.textContent = 'Enter a valid code'; err.classList.remove('hidden'); return; }
  if (pin.length !== 4) { err.textContent = 'PIN must be 4 digits'; err.classList.remove('hidden'); return; }
  const { ok, data } = await API.post('/api/rooms/validate', { code, pin });
  if (!ok) { err.textContent = data.error || 'Room not found'; err.classList.remove('hidden'); return; }
  window.location.href = '/room/' + code;
}

async function doJoinLink() {
  const link = document.getElementById('link-input').value.trim();
  const pin = document.getElementById('link-pin').value.trim();
  const err = document.getElementById('link-err');
  err.classList.add('hidden');
  const match = link.match(/\/join\/([A-Z0-9]{4,8})/i) || link.match(/\/room\/([A-Z0-9]{4,8})/i);
  if (!match) { err.textContent = 'Invalid invite link'; err.classList.remove('hidden'); return; }
  if (pin.length !== 4) { err.textContent = 'PIN must be 4 digits'; err.classList.remove('hidden'); return; }
  const code = match[1].toUpperCase();
  const { ok, data } = await API.post('/api/rooms/validate', { code, pin });
  if (!ok) { err.textContent = data.error || 'Room not found'; err.classList.remove('hidden'); return; }
  window.location.href = '/room/' + code;
}

function copyCode() {
  const code = document.getElementById('room-code-display').textContent;
  const pin = document.getElementById('room-pin-display').textContent;
  navigator.clipboard.writeText(`Room Code: ${code}\nPIN: ${pin}\nLink: ${window.location.origin}/join/${code}`);
  showToast('Copied code, PIN & link!');
}

function copyLink() {
  navigator.clipboard.writeText(document.getElementById('share-link-text').textContent);
  showToast('Link copied!');
}

function openModal(id) { document.getElementById(id).classList.add('open'); }
function closeModal(id) { document.getElementById(id).classList.remove('open'); }

document.querySelectorAll('.modal-overlay').forEach(o => {
  o.addEventListener('click', e => { if (e.target === o) o.classList.remove('open'); });
});

document.addEventListener('keydown', e => {
  if (e.key === 'Escape') document.querySelectorAll('.modal-overlay.open').forEach(m => m.classList.remove('open'));
  if (e.key === 'Enter' && document.getElementById('modal-join').classList.contains('open')) doJoinFromDash();
});

function logout() {
  localStorage.removeItem('sr_token');
  localStorage.removeItem('sr_user');
  window.location.href = '/';
}
