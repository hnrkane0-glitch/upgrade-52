// QuickCart — accounts & sessions (Vercel serverless function).
// Passwords are verified HERE, never in the browser, and the browser never downloads the users table.
//
//   POST /api/auth  {action, ...}
//   public:  login, staff-login, register
//   token:   me, change-password, staff-save, staff-status, staff-list
//   admin:   admin-users, admin-user-create, admin-user-set, admin-dbmap
//
// Env: QC_ENC_KEY (required), QC_ADMIN_PASSWORD (platform admin login, username "admin"),
//      FIREBASE_DB_SECRET (needed once the database rules are locked down).
const { MAIN, enc, fbGet, fbPut, hashPw, checkPw, isHashed, signTok, verifyTok, tokenOf, timingSafe, jbody, validDb } = require('./_qc');
const { PLANS } = require('./_plans');

const out = (res, code, o) => res.status(code).json(o);
const hide = (u) => { const o = Object.assign({}, u); ['password', 'resetToken', 'resetExpires', 'resetTokenHash', 'sealed'].forEach((k) => delete o[k]); Object.keys(o).forEach((k) => { if (/^reset/i.test(k)) delete o[k]; }); return o; };
const patch = async (path, data) => { const r = await fetch(`${MAIN}/${path}.json`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) }); if (!r.ok) throw new Error('Database write failed (' + r.status + ')'); };
async function findBy(field, value) {
  // 1) fast indexed query (needs ".indexOn" in the Firebase rules)
  let d = null, r = await fetch(`${MAIN}/users.json?orderBy="${field}"&equalTo=${enc(JSON.stringify(String(value)))}`);
  if (r.ok) { d = await r.json(); }
  // 2) fallback = how upgrade 50 worked: read /users and match here (no index needed, case-insensitive)
  if (!r.ok || !d || typeof d !== 'object' || !Object.keys(d).length) {
    const r2 = await fetch(`${MAIN}/users.json`);
    if (r2.status === 401 || r2.status === 403) throw new Error('Database access denied. Add FIREBASE_DB_SECRET in Vercel (or restore your previous Firebase rules), then redeploy.');
    if (!r2.ok) { if (r.ok) return []; throw new Error('Could not read the users database (' + r2.status + ').'); }
    const all = (await r2.json()) || {}; const want = String(value).trim().toLowerCase();
    d = {}; Object.keys(all).forEach((k) => { const u = all[k]; if (u && typeof u === 'object' && String(u[field] || '').trim().toLowerCase() === want) d[k] = u; });
  }
  return Object.keys(d).map((k) => ({ key: k, u: d[k] })).filter((x) => x.u && typeof x.u === 'object');
}
async function findLogin(id) {   // by username, then by e-mail (case-insensitive)
  id = String(id || '').trim(); const lo = id.toLowerCase(); let hits = await findBy('username', id);
  if (!hits.length && lo !== id) hits = await findBy('username', lo);
  if (!hits.length) hits = await findBy('email', id);
  if (!hits.length && lo !== id) hits = await findBy('email', lo);
  return hits;
}
const hasAccess = (u) => { const now = Date.now(); return (u.trialEnds && new Date(u.trialEnds) > now && u.status !== 'revoked' && u.status !== 'suspended') || (u.subExpires && new Date(u.subExpires) > now && u.status !== 'revoked') || (u.status === 'active' && !u.subExpires && !u.trialEnds); };
const expiredMsg = 'Your subscription has expired. Please renew to continue.';
function ownerView(o) { return { username: o.username, email: o.email, plan: o.plan, businessName: o.businessName, status: o.status, trialEnds: o.trialEnds, subExpires: o.subExpires }; }
const ADMIN = { username: 'admin', email: 'admin@quickcart.ng', plan: 'premium', status: 'active', businessName: 'QuickCart' };
const adminOk = (p) => p && p.r === 'admin';
const ownerOf = (p, b) => (p.r === 'admin' ? String(b.owner || 'admin').toLowerCase() : String(p.u).toLowerCase());

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return out(res, 405, { ok: false, error: 'Method not allowed' });
  try {
    const b = jbody(req), act = b.action;
    const tok = verifyTok(tokenOf(req));

    /* ───────── public ───────── */
    if (act === 'login') {
      const id = String(b.user || '').trim(), pw = String(b.pass || '');
      if (!id || !pw) return out(res, 400, { ok: false, error: 'Please enter your email and password.' });
      if (id.toLowerCase() === 'admin' || id.toLowerCase() === ADMIN.email) {
        const ap = process.env.QC_ADMIN_PASSWORD;
        if (!ap) return out(res, 403, { ok: false, error: 'Platform admin login is not set up. Add QC_ADMIN_PASSWORD in Vercel → Environment Variables.' });
        if (!timingSafe(pw, ap)) return out(res, 401, { ok: false, error: 'Invalid email or password. Please try again.' });
        return out(res, 200, { ok: true, token: signTok({ u: 'admin', r: 'admin', k: 'admin' }, 1), user: ADMIN });
      }
      const hits = await findLogin(id);
      const m = hits.find((x) => checkPw(pw, x.u.password));
      if (!m) return out(res, 401, { ok: false, error: 'Invalid email or password. Please try again.' });
      if (m.u.isStaff) return out(res, 403, { ok: false, error: 'This is a staff account. Please use the Staff Login tab.' });
      if (!isHashed(m.u.password)) { try { await patch('users/' + enc(m.key), { password: hashPw(pw) }); } catch (e) { /* retry next login */ } }
      const u = hide(m.u);
      if (m.u.status === 'revoked' || m.u.status === 'suspended') return out(res, 403, { ok: false, error: 'This account has been disabled. Please contact support.' });
      if (m.u.status === 'pending_card') return out(res, 200, { ok: true, needsCard: true, token: signTok({ u: m.u.username, r: 'owner', k: m.key }), user: u });
      if (!hasAccess(m.u)) return out(res, 403, { ok: false, error: expiredMsg, user: u, token: signTok({ u: m.u.username, r: 'owner', k: m.key }, 1), expired: true });
      return out(res, 200, { ok: true, token: signTok({ u: m.u.username, r: 'owner', k: m.key }), user: u });
    }

    if (act === 'staff-login') {
      const company = String(b.company || '').trim().toLowerCase(), un = String(b.user || '').trim().toLowerCase(), pw = String(b.pass || '');
      if (!company || !un || !pw) return out(res, 400, { ok: false, error: 'Enter the Company ID, your username and your password.' });
      let owner;
      if (company === 'admin' || company === ADMIN.email) owner = ADMIN;
      else owner = (await findBy('email', company)).map((x) => x.u).find((u) => !u.isStaff) || (await findBy('email', b.company.trim())).map((x) => x.u).find((u) => !u.isStaff);
      if (!owner) return out(res, 404, { ok: false, error: 'Company ID not found. Use the store email your boss subscribed with.' });
      const on = String(owner.username || '').toLowerCase();
      const mine = (await findBy('username', un)).filter((x) => x.u.isStaff && String(x.u.owner || '').toLowerCase() === on);
      if (!mine.length) return out(res, 404, { ok: false, error: 'No staff with that username in this company.' });
      const rec = mine.find((x) => checkPw(pw, x.u.password));
      if (!rec) return out(res, 401, { ok: false, error: 'Wrong password. Please try again.' });
      if (rec.u.status && rec.u.status !== 'active') return out(res, 403, { ok: false, error: 'Your account is suspended. Please contact your boss.' });
      if (on !== 'admin' && !hasAccess(owner)) return out(res, 403, { ok: false, error: "This company's subscription has expired. Please tell your boss to renew." });
      if (!isHashed(rec.u.password)) { try { await patch('users/' + enc(rec.key), { password: hashPw(pw) }); } catch (e) { } }
      return out(res, 200, { ok: true, token: signTok({ u: rec.u.username, r: 'staff', o: on, k: rec.key }, 3), rec: hide(rec.u), owner: ownerView(owner) });
    }

    if (act === 'register') {
      const name = String(b.name || '').trim(), email = String(b.email || '').trim().toLowerCase(), biz = String(b.biz || '').trim(), pw = String(b.pass || ''), phone = String(b.phone || '').trim();
      const plan = PLANS[b.plan] ? b.plan : 'starter';
      if (!name || !email || !pw || !biz) return out(res, 400, { ok: false, error: 'Please fill in all required fields.' });
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return out(res, 400, { ok: false, error: 'Please enter a valid email.' });
      if (pw.length < 6) return out(res, 400, { ok: false, error: 'Password must be at least 6 characters.' });
      if ((await findBy('email', email)).length) return out(res, 409, { ok: false, error: 'An account with this email already exists. Please log in.' });
      const username = biz.toLowerCase().replace(/[^a-z0-9]/g, '_').replace(/__+/g, '_').slice(0, 20) + '_' + Date.now().toString(36).slice(-4);
      const key = 'user_' + username;
      const rec = { name, email, phone, businessName: biz, username, password: hashPw(pw), plan, status: 'pending_card', createdAt: new Date().toISOString(), source: 'landing' };
      await fbPut(`${MAIN}/users/${enc(key)}`, rec);
      return out(res, 200, { ok: true, needsCard: true, token: signTok({ u: username, r: 'owner', k: key }), user: hide(rec) });
    }

    /* ───────── needs a valid session ───────── */
    if (!tok) return out(res, 401, { ok: false, code: 'NO_SESSION', error: 'Your session has expired. Please log in again.' });

    if (act === 'me') {
      if (tok.r === 'admin') return out(res, 200, { ok: true, user: ADMIN, role: 'admin' });
      const u = await fbGet(`${MAIN}/users/${enc(tok.k)}`); if (!u) return out(res, 404, { ok: false, error: 'Account not found.' });
      const bill = await fbGet(`${MAIN}/billing/${enc(tok.r === 'staff' ? 'user_' + tok.o : tok.k)}`);
      return out(res, 200, { ok: true, role: tok.r, user: hide(u), card: bill ? { last4: bill.last4, brand: bill.brand, exp: (bill.expMonth || '') + '/' + (bill.expYear || '') } : null });
    }

    if (act === 'change-password') {
      if (tok.r === 'admin') return out(res, 400, { ok: false, error: 'Change the admin password in Vercel (QC_ADMIN_PASSWORD).' });
      const np = String(b.newPass || ''); if (np.length < 6) return out(res, 400, { ok: false, error: 'Password must be at least 6 characters.' });
      const u = await fbGet(`${MAIN}/users/${enc(tok.k)}`); if (!u) return out(res, 404, { ok: false, error: 'Account not found.' });
      if (!b.force && !checkPw(String(b.oldPass || ''), u.password)) return out(res, 401, { ok: false, error: 'Current password is wrong.' });
      await patch('users/' + enc(tok.k), { password: hashPw(np) });
      return out(res, 200, { ok: true });
    }

    if (act === 'verify-password') {   // re-ask password before showing sensitive settings
      if (tok.r === 'admin') return out(res, 200, { ok: timingSafe(String(b.pass || ''), process.env.QC_ADMIN_PASSWORD || '\u0000') });
      const u = await fbGet(`${MAIN}/users/${enc(tok.k)}`);
      return out(res, 200, { ok: !!u && checkPw(String(b.pass || ''), u.password) });
    }

    /* staff management: the owner (or platform admin) only */
    if (act === 'staff-save' || act === 'staff-status' || act === 'staff-list') {
      if (tok.r === 'staff') return out(res, 403, { ok: false, error: 'Only the owner can manage staff.' });
      const owner = ownerOf(tok, b);
      if (act === 'staff-list') {
        const all = await findBy('owner', owner);
        return out(res, 200, { ok: true, staff: all.filter((x) => x.u.isStaff).map((x) => Object.assign({ key: x.key }, hide(x.u))) });
      }
      if (act === 'staff-status') {
        const key = String(b.key || ''); const u = await fbGet(`${MAIN}/users/${enc(key)}`);
        if (!u || !u.isStaff || String(u.owner || '').toLowerCase() !== owner) return out(res, 404, { ok: false, error: 'Staff not found.' });
        if (!['active', 'suspended'].includes(b.status)) return out(res, 400, { ok: false, error: 'Bad status' });
        await patch('users/' + enc(key), { status: b.status }); return out(res, 200, { ok: true });
      }
      const username = String(b.username || '').trim().toLowerCase();
      if (!/^[a-z0-9._-]{2,40}$/.test(username) || username === 'admin') return out(res, 400, { ok: false, error: 'Username must be 2–40 letters, numbers, dots or dashes.' });
      const base = { modules: Array.isArray(b.modules) ? b.modules.map(String).slice(0, 60) : [], fullname: String(b.fullname || '').slice(0, 80), email: String(b.email || '').slice(0, 120), department: String(b.department || '').slice(0, 60), role: String(b.role || 'staff').slice(0, 40), outlet: String(b.outlet || '').slice(0, 60), phone: String(b.phone || '').slice(0, 30) };
      if (b.key) {
        const u = await fbGet(`${MAIN}/users/${enc(b.key)}`);
        if (!u || !u.isStaff || String(u.owner || '').toLowerCase() !== owner) return out(res, 404, { ok: false, error: 'Staff not found.' });
        const up = Object.assign({}, base); if (b.password) { if (String(b.password).length < 6) return out(res, 400, { ok: false, error: 'Password must be at least 6 characters.' }); up.password = hashPw(b.password); }
        await patch('users/' + enc(b.key), up); return out(res, 200, { ok: true, key: b.key });
      }
      if (!b.password || String(b.password).length < 6) return out(res, 400, { ok: false, error: 'Password must be at least 6 characters.' });
      if ((await findBy('username', username)).length) return out(res, 409, { ok: false, error: 'That username is already taken — choose another.' });
      const key = 'staff-' + username + '-' + Date.now().toString(36);
      await fbPut(`${MAIN}/users/${enc(key)}`, Object.assign({}, base, { owner, username, password: hashPw(b.password), plan: 'staff', status: 'active', isStaff: true, email: base.email || username + '@staff.local', createdAt: new Date().toISOString() }));
      return out(res, 200, { ok: true, key });
    }

    /* ───────── platform admin only ───────── */
    if (!adminOk(tok)) return out(res, 403, { ok: false, error: 'Admin only.' });

    if (act === 'admin-users') {
      const r = await fetch(`${MAIN}/users.json`); const d = (await r.json()) || {};
      const users = Object.keys(d).filter((k) => /^(user_|staff-)/.test(k) && d[k] && typeof d[k] === 'object').map((k) => Object.assign({ key: k }, hide(d[k])));
      return out(res, 200, { ok: true, users });
    }
    if (act === 'admin-user-create') {
      const u = b.user || {}; const username = String(u.username || '').trim().toLowerCase();
      if (!username || !u.password) return out(res, 400, { ok: false, error: 'Username and password are required.' });
      if ((await findBy('username', username)).length) return out(res, 409, { ok: false, error: 'That username is already taken.' });
      const key = 'user_' + username + '_' + Date.now();
      const rec = Object.assign({}, u, { username, password: hashPw(u.password), createdManually: true, createdAt: new Date().toISOString() });
      await fbPut(`${MAIN}/users/${enc(key)}`, rec);
      if (rec.dbUrl && validDb(rec.dbUrl)) await fbPut(`${MAIN}/dbmap/${enc(username)}`, rec.dbUrl);
      return out(res, 200, { ok: true, key });
    }
    if (act === 'admin-user-set') {
      const allowed = ['status', 'plan', 'dbUrl', 'trialEnds', 'subExpires', 'notes', 'backupUntil'], up = {};
      allowed.forEach((k) => { if (b.patch && k in b.patch) up[k] = b.patch[k]; });
      if (up.dbUrl && !validDb(up.dbUrl)) return out(res, 400, { ok: false, error: 'Not a valid Firebase database URL.' });
      await patch('users/' + enc(String(b.key)), up); return out(res, 200, { ok: true });
    }
    if (act === 'admin-dbmap') {
      if (!validDb(b.url)) return out(res, 400, { ok: false, error: 'Not a valid Firebase database URL.' });
      const un = String(b.username || '').trim().toLowerCase(); if (!/^[a-z0-9._@+-]{1,80}$/.test(un)) return out(res, 400, { ok: false, error: 'Bad username' });
      await fbPut(`${MAIN}/dbmap/${enc(un)}`, String(b.url).replace(/\/+$/, '')); return out(res, 200, { ok: true });
    }
    return out(res, 400, { ok: false, error: 'Unknown action' });
  } catch (e) {
    return out(res, 500, { ok: false, error: e && e.message ? e.message : 'Server error' });
  }
};
