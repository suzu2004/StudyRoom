if (localStorage.getItem('sr_token')) window.location.href = '/dashboard';

async function doLogin() {
  const btn = document.getElementById('btn');
  const err = document.getElementById('err');
  const email = document.getElementById('email').value.trim();
  const password = document.getElementById('password').value;
  err.classList.add('hidden');
  if (!email || !password) { err.textContent = 'Please fill in all fields.'; err.classList.remove('hidden'); return; }
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span>';
  const { ok, data } = await API.post('/api/auth/login', { email, password });
  if (!ok) {
    err.textContent = data.error || 'Login failed';
    err.classList.remove('hidden');
    btn.disabled = false;
    btn.textContent = 'Login';
    return;
  }
  localStorage.setItem('sr_token', data.token);
  localStorage.setItem('sr_user', JSON.stringify(data.user));
  window.location.href = '/dashboard';
}

async function doSignup() {
  const btn = document.getElementById('btn');
  const err = document.getElementById('err');
  const name = document.getElementById('name').value.trim();
  const email = document.getElementById('email').value.trim();
  const password = document.getElementById('password').value;
  err.classList.add('hidden');
  if (!name || !email || !password) { err.textContent = 'Please fill in all fields.'; err.classList.remove('hidden'); return; }
  if (password.length < 6) { err.textContent = 'Password must be at least 6 characters.'; err.classList.remove('hidden'); return; }
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span>';
  const { ok, data } = await API.post('/api/auth/signup', { name, email, password });
  if (!ok) {
    err.textContent = data.error || 'Signup failed';
    err.classList.remove('hidden');
    btn.disabled = false;
    btn.textContent = 'Create account';
    return;
  }
  localStorage.setItem('sr_token', data.token);
  localStorage.setItem('sr_user', JSON.stringify(data.user));
  window.location.href = '/dashboard';
}

document.addEventListener('keydown', e => {
  if (e.key !== 'Enter') return;
  if (document.getElementById('name')) doSignup();
  else doLogin();
});
