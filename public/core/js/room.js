// ── STATE ─────────────────────────────────────────────────────
const roomCode = window.location.pathname.split('/room/')[1]?.toUpperCase();
const token = API.token();
const storedUser = API.user();
const guestData = JSON.parse(sessionStorage.getItem('sr_guest') || 'null');
const user = storedUser || guestData || { name: 'Guest', guest: true };

if (!roomCode) window.location.href = '/';
if (!storedUser && !guestData) window.location.href = '/join/' + roomCode;

const CURSOR_COLORS = ['#1D9E75','#6366f1','#f59e0b','#ef4444','#8b5cf6','#ec4899','#0ea5e9','#14b8a6'];
let colorIdx = 0;
const peerColors = {};
const peers = {};
const peerTiles = {};
const peerInfo = {};
const cursors = {};

let localStream = null;
let screenStream = null;
let micOn = true;
let camOn = true;
let screenSharing = false;
let activeFeature = null;

const ICE_CONFIG = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' }
  ]
};

// ── SOCKET ────────────────────────────────────────────────────
const socket = io();

// ── INIT ──────────────────────────────────────────────────────
window.addEventListener('DOMContentLoaded', async () => {
  document.getElementById('room-code-badge').textContent = roomCode;
  document.getElementById('room-name-title').textContent = 'Room · ' + roomCode;
  document.getElementById('self-avatar').textContent = initials(user.name);
  document.getElementById('self-name').textContent = user.name;
  addToPeopleList('self', user.name, true, user.guest);
  socket.emit('join-room', { roomCode, user });
  try { await requestMedia(true); } catch {}
  document.getElementById('chat-input').addEventListener('keydown', e => { if (e.key === 'Enter') sendChat(); });
  document.addEventListener('click', e => {
    const picker = document.getElementById('emoji-picker');
    if (!picker.contains(e.target) && e.target.id !== 'feat-emoji') picker.style.display = 'none';
  });
});

// ── MEDIA ─────────────────────────────────────────────────────
async function requestMedia(silent = false) {
  try {
    localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
    const vid = document.getElementById('local-video');
    vid.srcObject = localStream;
    vid.classList.add('active');
    document.getElementById('self-avatar').style.display = 'none';
    document.getElementById('self-name').style.display = 'none';
    document.getElementById('perm-banner').style.display = 'none';
    if (!silent) showToast('Camera & mic connected!');
    socket.emit('media-state', { roomCode, video: true, audio: true });
  } catch (e) {
    if (!silent) showToast('Could not access camera/mic');
    throw e;
  }
}

function toggleMic() {
  if (!localStream) { showToast('Click Allow Access first'); return; }
  micOn = !micOn;
  localStream.getAudioTracks().forEach(t => t.enabled = micOn);
  const btn = document.getElementById('btn-mic');
  btn.textContent = micOn ? '🎙️' : '🔇';
  btn.classList.toggle('off', !micOn);
  document.getElementById('self-mic-off').classList.toggle('hidden', micOn);
  socket.emit('media-state', { roomCode, video: camOn, audio: micOn });
}

function toggleCam() {
  if (!localStream) { showToast('Click Allow Access first'); return; }
  camOn = !camOn;
  localStream.getVideoTracks().forEach(t => t.enabled = camOn);
  const btn = document.getElementById('btn-cam');
  btn.textContent = camOn ? '📷' : '🚫';
  btn.classList.toggle('off', !camOn);
  const vid = document.getElementById('local-video');
  vid.classList.toggle('active', camOn);
  document.getElementById('self-avatar').style.display = camOn ? 'none' : 'flex';
  document.getElementById('self-name').style.display = camOn ? 'none' : 'block';
  socket.emit('media-state', { roomCode, video: camOn, audio: micOn });
}

async function toggleScreen() {
  if (screenSharing) {
    screenStream?.getTracks().forEach(t => t.stop());
    screenSharing = false;
    document.getElementById('btn-screen').classList.remove('off');
    document.getElementById('btn-screen').textContent = '🖥️';
    if (localStream) replaceVideoTrack(localStream.getVideoTracks()[0]);
    showToast('Screen share stopped');
    return;
  }
  try {
    screenStream = await navigator.mediaDevices.getDisplayMedia({ video: true });
    screenSharing = true;
    document.getElementById('btn-screen').classList.add('off');
    document.getElementById('btn-screen').textContent = '⏹️';
    replaceVideoTrack(screenStream.getVideoTracks()[0]);
    screenStream.getVideoTracks()[0].onended = () => toggleScreen();
    showToast('Screen sharing started');
  } catch { showToast('Screen share cancelled'); }
}

function replaceVideoTrack(track) {
  Object.values(peers).forEach(pc => {
    const sender = pc.getSenders().find(s => s.track?.kind === 'video');
    if (sender && track) sender.replaceTrack(track);
  });
}

// ── WebRTC ────────────────────────────────────────────────────
function createPeer(socketId) {
  const pc = new RTCPeerConnection(ICE_CONFIG);
  if (localStream) localStream.getTracks().forEach(t => pc.addTrack(t, localStream));
  const remoteStream = new MediaStream();
  pc.ontrack = e => {
    remoteStream.addTrack(e.track);
    const vid = document.getElementById('vid-' + socketId);
    if (vid) {
      vid.srcObject = remoteStream;
      vid.classList.add('active');
      const av = document.getElementById('av-' + socketId);
      const nm = document.getElementById('nm-' + socketId);
      if (av) av.style.display = 'none';
      if (nm) nm.style.display = 'none';
    }
  };
  pc.onicecandidate = e => {
    if (e.candidate) socket.emit('ice-candidate', { to: socketId, candidate: e.candidate });
  };
  pc.onconnectionstatechange = () => {
    if (['disconnected','failed','closed'].includes(pc.connectionState)) removePeer(socketId);
  };
  peers[socketId] = pc;
  return pc;
}

async function callPeer(socketId) {
  const pc = createPeer(socketId);
  const offer = await pc.createOffer();
  await pc.setLocalDescription(offer);
  socket.emit('offer', { to: socketId, offer });
}

// ── SOCKET EVENTS ─────────────────────────────────────────────
socket.on('room-peers', async peers => {
  for (const { socketId, user: u } of peers) {
    peerInfo[socketId] = u;
    addVideoTile(socketId, u.name, u.guest);
    addToPeopleList(socketId, u.name, false, u.guest);
    await callPeer(socketId);
  }
});

socket.on('user-joined', ({ socketId, user: u }) => {
  peerInfo[socketId] = u;
  addVideoTile(socketId, u.name, u.guest);
  addToPeopleList(socketId, u.name, false, u.guest);
  showToast(`${u.name} joined`);
});

socket.on('user-left', ({ socketId }) => {
  const name = peerInfo[socketId]?.name || 'Someone';
  removePeer(socketId);
  showToast(`${name} left`);
});

socket.on('room-count', count => {
  document.getElementById('online-count').textContent = count;
});

socket.on('offer', async ({ from, offer }) => {
  const pc = createPeer(from);
  await pc.setRemoteDescription(new RTCSessionDescription(offer));
  const answer = await pc.createAnswer();
  await pc.setLocalDescription(answer);
  socket.emit('answer', { to: from, answer });
});

socket.on('answer', async ({ from, answer }) => {
  if (peers[from]) await peers[from].setRemoteDescription(new RTCSessionDescription(answer));
});

socket.on('ice-candidate', async ({ from, candidate }) => {
  if (peers[from]) await peers[from].addIceCandidate(new RTCIceCandidate(candidate));
});

socket.on('peer-media-state', ({ socketId, video, audio }) => {
  const mic = document.getElementById('mic-' + socketId);
  if (mic) mic.classList.toggle('hidden', audio);
  const vid = document.getElementById('vid-' + socketId);
  if (vid) vid.classList.toggle('active', video && vid.srcObject);
});

// ── CURSORS ───────────────────────────────────────────────────
const videoArea = document.getElementById('video-area');
videoArea.addEventListener('mousemove', e => {
  const rect = videoArea.getBoundingClientRect();
  const x = ((e.clientX - rect.left) / rect.width * 100).toFixed(2);
  const y = ((e.clientY - rect.top) / rect.height * 100).toFixed(2);
  socket.emit('cursor-move', { roomCode, x: parseFloat(x), y: parseFloat(y) });
});

videoArea.addEventListener('mouseleave', () => {
  Object.values(cursors).forEach(c => c.style.opacity = '0');
});

socket.on('cursor-move', ({ socketId, name, x, y }) => {
  if (!cursors[socketId]) {
    const color = getCursorColor(socketId);
    const el = document.createElement('div');
    el.className = 'remote-cursor';
    el.innerHTML = `<div class="remote-cursor-dot" style="background:${color}"></div><div class="remote-cursor-label" style="background:${color}">${escapeHtml(name)}</div>`;
    document.getElementById('cursor-overlay').appendChild(el);
    cursors[socketId] = el;
  }
  const c = cursors[socketId];
  c.style.left = x + '%';
  c.style.top = y + '%';
  c.style.opacity = '1';
});

// ── CHAT ──────────────────────────────────────────────────────
function sendChat() {
  const input = document.getElementById('chat-input');
  const message = input.value.trim();
  if (!message) return;
  socket.emit('chat-message', { roomCode, message });
  input.value = '';
}

socket.on('chat-message', ({ socketId, name, message, time }) => {
  const isMe = socketId === socket.id;
  const msgs = document.getElementById('chat-messages');
  const div = document.createElement('div');
  div.className = 'chat-msg' + (isMe ? ' mine' : '');
  div.innerHTML = `<div class="msg-sender">${escapeHtml(isMe ? 'You' : name)}<span class="msg-time">${time}</span></div><div class="msg-bubble">${escapeHtml(message)}</div>`;
  msgs.appendChild(div);
  msgs.scrollTop = msgs.scrollHeight;
  if (!isMe && document.getElementById('tab-chat').classList.contains('active') === false) {
    document.getElementById('tab-chat').style.color = 'var(--danger)';
  }
});

// ── REACTIONS ─────────────────────────────────────────────────
function sendReaction(emoji) {
  socket.emit('send-reaction', { roomCode, emoji });
  spawnReaction(emoji, 'tile-self');
  document.getElementById('emoji-picker').style.display = 'none';
}

socket.on('reaction', ({ socketId, emoji }) => {
  const tileId = 'tile-' + socketId;
  spawnReaction(emoji, tileId);
});

socket.on('hand-raised', ({ socketId, name }) => {
  showToast(`✋ ${name} raised their hand`);
  spawnReaction('✋', 'tile-' + socketId);
});

function spawnReaction(emoji, tileId) {
  const tile = document.getElementById(tileId);
  if (!tile) return;
  const span = document.createElement('span');
  span.className = 'reaction-burst';
  span.textContent = emoji;
  span.style.left = Math.random() * 60 + 20 + '%';
  span.style.bottom = '20%';
  tile.appendChild(span);
  setTimeout(() => span.remove(), 900);
}

function toggleEmojiPicker() {
  const p = document.getElementById('emoji-picker');
  p.style.display = p.style.display === 'flex' ? 'none' : 'flex';
}

// ── FEATURE PANEL ─────────────────────────────────────────────
const FEATURES = {
  whiteboard: { title: 'Whiteboard', src: '/features/whiteboard/index.html' },
  timer:      { title: 'Pomodoro Timer', src: '/features/timer/index.html' },
  files:      { title: 'File Sharing', src: '/features/files/index.html' }
};

function toggleFeature(name) {
  const wrap = document.getElementById('feat-panel-wrap');
  const btn = document.getElementById('feat-' + (name === 'whiteboard' ? 'wb' : name === 'timer' ? 'timer' : 'files'));
  if (activeFeature === name) { closeFeature(); return; }
  activeFeature = name;
  document.querySelectorAll('.feat-btn').forEach(b => b.classList.remove('active'));
  if (btn) btn.classList.add('active');
  const f = FEATURES[name];
  document.getElementById('feat-panel-title').textContent = f.title;
  document.getElementById('feat-panel-body').innerHTML = `<iframe src="${f.src}?room=${roomCode}" style="width:100%;height:100%;border:none;flex:1" allow="camera;microphone"></iframe>`;
  wrap.classList.add('open');
}

function closeFeature() {
  activeFeature = null;
  document.querySelectorAll('.feat-btn').forEach(b => b.classList.remove('active'));
  document.getElementById('feat-panel-wrap').classList.remove('open');
  document.getElementById('feat-panel-body').innerHTML = '';
}

// postMessage bridge — features talk to socket through room
window.addEventListener('message', e => {
  const { type, data } = e.data || {};
  if (!type) return;
  if (type === 'WHITEBOARD_DRAW') socket.emit('whiteboard-draw', { roomCode, data });
  if (type === 'WHITEBOARD_CLEAR') socket.emit('whiteboard-clear', { roomCode });
  if (type === 'TIMER_START') socket.emit('timer-start', { roomCode, duration: data.duration });
  if (type === 'TIMER_STOP') socket.emit('timer-stop', { roomCode });
  if (type === 'TIMER_REQUEST') socket.emit('timer-request', { roomCode });
});

socket.on('whiteboard-draw', ({ data }) => {
  const frame = document.querySelector('#feat-panel-body iframe');
  if (frame) frame.contentWindow.postMessage({ type: 'DRAW', data }, '*');
});

socket.on('whiteboard-clear', () => {
  const frame = document.querySelector('#feat-panel-body iframe');
  if (frame) frame.contentWindow.postMessage({ type: 'CLEAR' }, '*');
});

socket.on('timer-sync', data => {
  const frame = document.querySelector('#feat-panel-body iframe');
  if (frame) frame.contentWindow.postMessage({ type: 'TIMER_SYNC', data }, '*');
});

socket.on('timer-done', () => {
  showToast('⏰ Timer done!');
  const frame = document.querySelector('#feat-panel-body iframe');
  if (frame) frame.contentWindow.postMessage({ type: 'TIMER_DONE' }, '*');
});

// ── DOM HELPERS ───────────────────────────────────────────────
function addVideoTile(socketId, name, guest = false) {
  const grid = document.getElementById('video-grid');
  const div = document.createElement('div');
  div.className = 'video-tile';
  div.id = 'tile-' + socketId;
  div.innerHTML = `
    <video id="vid-${socketId}" autoplay playsinline></video>
    <div class="tile-avatar" id="av-${socketId}">${initials(name)}</div>
    <div class="tile-name" id="nm-${socketId}">${escapeHtml(name)}</div>
    <div class="tile-mic-off hidden" id="mic-${socketId}">🔇</div>
    ${guest ? `<div class="tile-guest-tag">Guest</div>` : ''}
  `;
  grid.appendChild(div);
  peerTiles[socketId] = div;
}

function removePeer(socketId) {
  if (peers[socketId]) { peers[socketId].close(); delete peers[socketId]; }
  if (peerTiles[socketId]) { peerTiles[socketId].remove(); delete peerTiles[socketId]; }
  if (cursors[socketId]) { cursors[socketId].remove(); delete cursors[socketId]; }
  delete peerInfo[socketId];
  const row = document.getElementById('peer-row-' + socketId);
  if (row) row.remove();
}

function addToPeopleList(socketId, name, isYou = false, guest = false) {
  const list = document.getElementById('people-list');
  const div = document.createElement('div');
  div.className = 'peer-row';
  div.id = 'peer-row-' + socketId;
  div.innerHTML = `
    <div class="peer-av">${initials(name)}</div>
    <div class="peer-name">${escapeHtml(name)}</div>
    ${isYou ? '<span class="peer-you">You</span>' : ''}
    ${guest && !isYou ? '<span class="peer-guest">Guest</span>' : ''}
  `;
  list.appendChild(div);
}

// ── TABS ──────────────────────────────────────────────────────
function setTab(tab) {
  document.querySelectorAll('.rsb-tab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.rsb-panel').forEach(p => p.classList.remove('active'));
  document.getElementById('tab-' + tab).classList.add('active');
  document.getElementById('rsb-' + tab).classList.add('active');
  document.getElementById('tab-' + tab).style.color = '';
}

// ── LEAVE ─────────────────────────────────────────────────────
function leaveRoom() {
  localStream?.getTracks().forEach(t => t.stop());
  screenStream?.getTracks().forEach(t => t.stop());
  Object.values(peers).forEach(pc => pc.close());
  socket.disconnect();
  sessionStorage.removeItem('sr_guest');
  window.location.href = storedUser ? '/dashboard' : '/lobby';
}

window.addEventListener('beforeunload', e => { e.preventDefault(); e.returnValue = ''; });

// ── UTILS ─────────────────────────────────────────────────────
function getCursorColor(socketId) {
  if (!peerColors[socketId]) {
    peerColors[socketId] = CURSOR_COLORS[colorIdx % CURSOR_COLORS.length];
    colorIdx++;
  }
  return peerColors[socketId];
}
