require('./_fbauth');
// QuickCart — daily billing run (Vercel Cron, see vercel.json).
// Charges the saved card of every account whose free trial or paid month has ended.
//
// It only runs when this is set in Vercel env vars
//   CRON_SECRET     any long random text (Vercel sends it automatically to cron calls)
//   QC_AUTOBILL=0   (optional) switch to a dry-run that only lists who is due. Automatic billing is ON by default.
const { MAIN, enc, fbGet, fbPut, unseal, timingSafe } = require('./_qc');
const { PLANS, PAID_DAYS, BACKUP_ADDON } = require('./_plans');

const iso = (t) => new Date(t).toISOString();
const patch = async (url, data) => { await fetch(url + '.json', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) }); };

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  const secret = process.env.CRON_SECRET;
  if (!secret) return res.status(500).json({ ok: false, error: 'Set CRON_SECRET in Vercel env vars first.' });
  const got = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  if (!timingSafe(got, secret)) return res.status(401).json({ ok: false, error: 'Unauthorized' });
  if (!process.env.PAYSTACK_SECRET_KEY) return res.status(500).json({ ok: false, error: 'PAYSTACK_SECRET_KEY missing' });

  const live = process.env.QC_AUTOBILL !== '0';
  const now = Date.now(), report = { live, due: 0, charged: [], failed: [], skipped: [] };
  const users = (await fbGet(`${MAIN}/users`)) || {};
  for (const key of Object.keys(users)) {
    const u = users[key];
    if (!u || typeof u !== 'object' || u.isStaff || u.plan === 'staff') continue;
    const end = u.status === 'trial' ? u.trialEnds : u.status === 'active' ? u.subExpires : null;
    if (!end || new Date(end).getTime() > now) continue;
    report.due++;
    const plan = PLANS[u.plan] || PLANS.starter;
    const billing = await fbGet(`${MAIN}/billing/${enc(key)}`);
    if (!billing || !billing.sealed) { report.skipped.push({ user: u.username, why: 'no saved card' }); if (live) await patch(`${MAIN}/users/${enc(key)}`, { status: 'expired' }); continue; }
    if (!live) { report.skipped.push({ user: u.username, why: 'dry-run', amount: plan.monthly }); continue; }
    try {
      const tok = unseal(billing.sealed);
      const ref = 'AUTO-' + key.slice(-8).replace(/[^A-Za-z0-9]/g, '') + '-' + Date.now().toString(36);
      const r = await fetch('https://api.paystack.co/transaction/charge_authorization', { method: 'POST', headers: { Authorization: 'Bearer ' + process.env.PAYSTACK_SECRET_KEY, 'Content-Type': 'application/json' }, body: JSON.stringify({ authorization_code: tok.authorization_code, email: tok.email, amount: plan.monthly * 100, currency: 'NGN', reference: ref, metadata: { plan: u.plan, username: u.username, type: 'auto_renewal' } }) });
      const j = await r.json(); const d = j && j.data;
      if (r.ok && d && d.status === 'success') {
        await patch(`${MAIN}/users/${enc(key)}`, { status: 'active', subExpires: iso(now + PAID_DAYS * 86400000), lastPaymentRef: ref, lastPaymentAmount: plan.monthly, lastPaymentDate: iso(now), billingError: null });
        report.charged.push({ user: u.username, amount: plan.monthly });
      } else {
        await patch(`${MAIN}/users/${enc(key)}`, { status: 'expired', billingError: (d && d.gateway_response) || (j && j.message) || 'Card declined', billingFailedAt: iso(now) });
        report.failed.push({ user: u.username, why: (d && d.gateway_response) || (j && j.message) || 'declined' });
      }
    } catch (e) { report.failed.push({ user: u.username, why: e.message }); }
  }
  // Cloud Backup add-on renewals (customer can switch this off in Backup → Cloud)
  report.backup = [];
  for (const key of Object.keys(users)) {
    const u = users[key];
    if (!u || u.isStaff || !u.backupUntil || new Date(u.backupUntil).getTime() > now || u.backupAuto === false || !live) continue;
    const billing = await fbGet(`${MAIN}/billing/${enc(key)}`); if (!billing || !billing.sealed) continue;
    try {
      const tok = unseal(billing.sealed), ref = 'BKP-' + key.slice(-8).replace(/[^A-Za-z0-9]/g, '') + '-' + Date.now().toString(36);
      const r = await fetch('https://api.paystack.co/transaction/charge_authorization', { method: 'POST', headers: { Authorization: 'Bearer ' + process.env.PAYSTACK_SECRET_KEY, 'Content-Type': 'application/json' }, body: JSON.stringify({ authorization_code: tok.authorization_code, email: tok.email, amount: BACKUP_ADDON.monthly * 100, currency: 'NGN', reference: ref, metadata: { type: 'backup_renewal', username: u.username } }) });
      const j = await r.json();
      if (r.ok && j.data && j.data.status === 'success') { await patch(`${MAIN}/users/${enc(key)}`, { backupUntil: iso(now + PAID_DAYS * 86400000) }); report.backup.push({ user: u.username, ok: true }); }
      else report.backup.push({ user: u.username, ok: false });
    } catch (e) { report.backup.push({ user: u.username, ok: false }); }
  }
  return res.status(200).json(Object.assign({ ok: true }, report));
};
