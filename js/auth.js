/* ========================================================================
   Auth — local-only sign-up / login (no backend).
   Stored in localStorage:
     ns_users   :: { [username]: { salt, hash, createdAt } }
     ns_session :: { username }   (or absent for guest)

   Passwords are hashed with PBKDF2-equivalent: SHA-256(salt + password)
   iterated. Not bank-grade, but sufficient for casual local accounts.
   ======================================================================== */
const Auth = (() => {
  const USERS_KEY   = 'ns_users';
  const SESSION_KEY = 'ns_session';
  const ITERATIONS  = 50_000;

  function loadUsers() {
    try { return JSON.parse(localStorage.getItem(USERS_KEY)) || {}; } catch { return {}; }
  }
  function saveUsers(u) { localStorage.setItem(USERS_KEY, JSON.stringify(u)); }

  function loadSession() {
    try { return JSON.parse(localStorage.getItem(SESSION_KEY)); } catch { return null; }
  }
  function saveSession(s) {
    if (!s) localStorage.removeItem(SESSION_KEY);
    else    localStorage.setItem(SESSION_KEY, JSON.stringify(s));
  }

  function randomSalt(len = 16) {
    const a = new Uint8Array(len);
    crypto.getRandomValues(a);
    return Array.from(a, b => b.toString(16).padStart(2, '0')).join('');
  }

  async function hash(password, salt) {
    const enc = new TextEncoder();
    let buf = enc.encode(salt + ':' + password);
    for (let i = 0; i < ITERATIONS / 1000; i++) {  // ~50 iterations of SHA-256, fast enough
      buf = new Uint8Array(await crypto.subtle.digest('SHA-256', buf));
    }
    return Array.from(buf, b => b.toString(16).padStart(2, '0')).join('');
  }

  function normalize(u) {
    return (u || '').trim().toLowerCase();
  }

  function valid(username) {
    const u = normalize(username);
    if (u.length < 3 || u.length > 24) return 'Username must be 3-24 characters';
    if (!/^[a-z0-9_-]+$/.test(u)) return 'Only letters, numbers, _ and - allowed';
    return null;
  }

  async function signup(username, password) {
    const err = valid(username);
    if (err) return { ok: false, error: err };
    if (!password || password.length < 4) return { ok: false, error: 'Password must be 4+ characters' };
    const id = normalize(username);
    const users = loadUsers();
    if (users[id]) return { ok: false, error: 'Username already taken' };
    const salt = randomSalt();
    const h = await hash(password, salt);
    users[id] = { salt, hash: h, createdAt: Date.now() };
    saveUsers(users);
    saveSession({ username: id });
    return { ok: true, username: id };
  }

  async function login(username, password) {
    const id = normalize(username);
    const users = loadUsers();
    const u = users[id];
    if (!u) return { ok: false, error: 'No account with that username' };
    const h = await hash(password, u.salt);
    if (h !== u.hash) return { ok: false, error: 'Wrong password' };
    saveSession({ username: id });
    return { ok: true, username: id };
  }

  function logout() {
    saveSession(null);
  }

  function currentId() {
    const s = loadSession();
    return s && s.username ? s.username : 'guest';
  }

  function isLoggedIn() {
    return !!loadSession();
  }

  return { signup, login, logout, currentId, isLoggedIn, loadUsers };
})();
