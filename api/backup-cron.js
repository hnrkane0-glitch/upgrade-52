// QuickCart — nightly cloud backups (Vercel Cron). Backs up every customer whose Cloud Backup add-on is
// active and whose "automatic cloud backup" switch is on (Backup page → Cloud).
const { MAIN, enc, fbGet, baseFor, timingSafe } = require('./_qc');
const B = require('./_backup');
module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  const secret = process.env.CRON_SECRET;
  if (!secret) return res.status(500).json({ ok: false, error: 'Set CRON_SECRET in Vercel env vars first.' });
  if (!timingSafe(String(req.headers.authorization || '').replace(/^Bearer\s+/i, ''), secret)) return res.status(401).json({ ok: false, error: 'Unauthorized' });
  const users = (await fbGet(`${MAIN}/users`)) || {}, done = [], failed = [], skipped = [];
  for (const k of Object.keys(users)) {
    const u = users[k]; if (!u || u.isStaff || !B.entitled(u) || !u.username) continue;
    try {
      const cfg = (await fbGet(`${await baseFor(String(u.username).toLowerCase())}/settings/backup`)) || {};
      if (cfg.masterOn === false || cfg.cloudAuto === false) { skipped.push(u.username); continue; }
      const last = (await B.listSnapshots(String(u.username).toLowerCase())).find((x) => x.kind === 'auto');
      if (last && Date.now() - new Date(last.at).getTime() < 20 * 3600 * 1000) { skipped.push(u.username); continue; }
      const m = await B.createSnapshot(String(u.username).toLowerCase(), 'auto'); done.push({ user: u.username, bytes: m.bytes });
    } catch (e) { failed.push({ user: u.username, why: e.message }); }
  }
  res.status(200).json({ ok: true, done, failed, skipped });
};
