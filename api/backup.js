// QuickCart — Cloud Backup (paid add-on).
//   POST /api/backup {action: status | create | list-chunk | restore | delete | auto-renew, owner?, id?}
// Owners manage their own backups; the platform admin can list, download and restore ANY customer's
// backup (owner = their username) so a customer who loses data can always be helped.
const { MAIN, enc, fbGet, jbody, verifyTok, tokenOf } = require('./_qc');
const B = require('./_backup');
const out = (res, c, o) => res.status(c).json(o);

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return out(res, 405, { ok: false, error: 'Method not allowed' });
  try {
    const b = jbody(req), tok = verifyTok(tokenOf(req));
    if (!tok || tok.r === 'staff') return out(res, 401, { ok: false, code: 'NO_SESSION', error: 'Please log in as the store owner.' });
    const isAdmin = tok.r === 'admin';
    const owner = isAdmin ? String(b.owner || 'admin').trim().toLowerCase() : String(tok.u).toLowerCase();
    if (!/^[a-z0-9._@+-]{1,80}$/.test(owner)) return out(res, 400, { ok: false, error: 'Bad owner' });

    let acct = null;
    if (!isAdmin) acct = await fbGet(`${MAIN}/users/${enc(tok.k)}`);
    else if (owner !== 'admin') {
      const r = await fetch(`${MAIN}/users.json?orderBy="username"&equalTo=${enc(JSON.stringify(owner))}`); const d = r.ok ? await r.json() : null;
      if (d) { const k = Object.keys(d).find((x) => !d[x].isStaff); if (k) { acct = d[k]; acct.__key = k; } }
    }
    const ok = isAdmin || B.entitled(acct);

    if (b.action === 'status') {
      const list = ok || isAdmin ? await B.listSnapshots(owner) : [];
      return out(res, 200, { ok: true, entitled: ok, backupUntil: acct && acct.backupUntil || null, autoRenew: acct ? acct.backupAuto !== false : true, list });
    }
    if (!ok) return out(res, 402, { ok: false, code: 'NEEDS_ADDON', error: 'Cloud Backup is a paid add-on. Subscribe in Backup → Cloud to use it.' });

    if (b.action === 'create') { const meta = await B.createSnapshot(owner, 'manual'); return out(res, 200, { ok: true, meta }); }
    if (b.action === 'list-chunk') {   // download piece by piece (keeps each response small)
      const meta = await fbGet(`${MAIN}/backups/${enc(owner)}/${enc(String(b.id))}/meta`); if (!meta) return out(res, 404, { ok: false, error: 'Backup not found.' });
      if (!b.name) return out(res, 200, { ok: true, meta });
      const parts = await fbGet(`${MAIN}/backups/${enc(owner)}/${enc(String(b.id))}/d/${enc(String(b.name))}`);
      const arr = Array.isArray(parts) ? parts : Object.values(parts || {});
      const i = Number(b.i || 0); return out(res, 200, { ok: true, text: arr[i] || '', total: arr.length });
    }
    if (b.action === 'restore') { const r = await B.restoreSnapshot(owner, String(b.id)); return out(res, 200, Object.assign({ ok: true }, r)); }
    if (b.action === 'delete') { await fetch(`${MAIN}/backups/${enc(owner)}/${enc(String(b.id))}.json`, { method: 'DELETE' }); return out(res, 200, { ok: true }); }
    if (b.action === 'auto-renew') {
      if (isAdmin || !acct) return out(res, 400, { ok: false, error: 'Not applicable' });
      await fetch(`${MAIN}/users/${enc(tok.k)}.json`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ backupAuto: !!b.on }) });
      return out(res, 200, { ok: true });
    }
    return out(res, 400, { ok: false, error: 'Unknown action' });
  } catch (e) { return out(res, 500, { ok: false, error: e && e.message ? e.message : 'Server error' }); }
};
