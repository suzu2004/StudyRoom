async function doJoin() {
  const btn = document.getElementById('btn');
  const err = document.getElementById('err');
  const guestName = document.getElementById('guestName').value.trim();
  const code = document.getElementById('code').value.trim().toUpperCase();
  const pin = document.getElementById('pin').value.trim();
  err.classList.add('hidden');
  if (!guestName) { err.textContent = 'Please enter your name.'; err.classList.remove('hidden'); return; }
  if (code.length < 4) { err.textContent = 'Enter a valid room code.'; err.classList.remove('hidden'); return; }
  if (pin.length !== 4) { err.textContent = 'PIN must be 4 digits.'; err.classList.remove('hidden'); return; }
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span>';
  const { ok, data } = await API.post('/api/rooms/validate', { code, pin });
  if (!ok) {
    err.textContent = data.error || 'Could not join room';
    err.classList.remove('hidden');
    btn.disabled = false;
    btn.textContent = 'Join Room →';
    return;
  }
  sessionStorage.setItem('sr_guest', JSON.stringify({ name: guestName, guest: true }));
  window.location.href = '/room/' + code;
}

window.addEventListener('DOMContentLoaded', () => {
  const pathCode = window.location.pathname.split('/join/')[1];
  if (pathCode) {
    document.getElementById('code').value = pathCode.toUpperCase();
    document.getElementById('pin').focus();
  }
});

document.addEventListener('keydown', e => { if (e.key === 'Enter') doJoin(); });
