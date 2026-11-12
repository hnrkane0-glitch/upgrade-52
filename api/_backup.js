// QuickCart — cloud backup engine. Snapshots are stored in OUR database under /backups/<owner>/<id>,
// which browsers cannot read (see database.rules.json): only these server functions touch it.
const { MAIN, enc, baseFor, fbGet } = require('./_qc');

const CHUNK = 600000;                 // characters per stored piece
const SKIP_ALWAYS = ['terminal_vault'];
const SKIP_MAIN = ['users', 'billing', 'payments', 'backups', 'dbmap', 'domains', 'terminal_vault'];
const KEEP = { auto: 14, manual: 20 };

const put = async (url, val) => { const r = await fetch(url + '.json', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(val) }); if (!r.ok) throw new Error('Backup storage write failed (' + r.status + ')'); };
const del = (url) => fetch(url + '.json', { method: 'DELETE' });

function scrub(name, val) {            // never copy credentials into a backup
  if (name === 'settings' && val && val.staff && typeof val.staff === 'object') Object.keys(val.staff).forEach((k) => { if (val.staff[k] && typeof val.staff[k] === 'object') delete val.staff[k].password; });
  return val;
}

async function createSnapshot(owner, kind) {
  const base = await baseFor(owner);
  const rs = await fetch(base + '/.json?shallow=true'); if (!rs.ok) throw new Error('Could not read the store database (' + rs.status + ').');
  const top = Object.keys((await rs.json()) || {});
  const skip = base === MAIN ? SKIP_MAIN : SKIP_ALWAYS;
  const id = new Date().toISOString().replace(/[-:T.Z]/g, '').slice(0, 14) + '-' + Math.random().toString(36).slice(2, 6);
  const root = `${MAIN}/backups/${enc(owner)}/${id}`;
  const nodes = {}; let bytes = 0, records = 0;
  for (const name of top) {
    if (skip.includes(name)) continue;
    const r = await fetch(`${base}/${enc(name)}.json`); if (!r.ok) continue;
    const val = scrub(name, await r.json()); if (val === null) continue;
    const text = JSON.stringify(val); bytes += text.length;
    records += val && typeof val === 'object' ? Object.keys(val).length : 1;
    const parts = []; for (let i = 0; i < text.length; i += CHUNK) parts.push(text.slice(i, i + CHUNK));
    await put(`${root}/d/${enc(name)}`, parts);
    nodes[name] = parts.length;
  }
  const meta = { id, at: new Date().toISOString(), kind: kind || 'manual', bytes, records, nodes };
  await put(`${root}/meta`, meta);
  await prune(owner);
  return meta;
}

async function listSnapshots(owner) {
  const m = await fbGet(`${MAIN}/backups/${enc(owner)}`) || {};   // reads everything once; fine for ≤ 34 snapshots
  return Object.keys(m).map((k) => m[k] && m[k].meta).filter(Boolean).sort((a, b) => (a.at < b.at ? 1 : -1));
}
async function prune(owner) {
  const all = await listSnapshots(owner);
  for (const kind of ['auto', 'manual']) {
    const old = all.filter((x) => x.kind === kind).slice(KEEP[kind]);
    for (const o of old) await del(`${MAIN}/backups/${enc(owner)}/${o.id}`);
  }
}
async function readNode(owner, id, name) {
  const parts = await fbGet(`${MAIN}/backups/${enc(owner)}/${enc(id)}/d/${enc(name)}`);
  if (!parts) return null;
  return JSON.parse((Array.isArray(parts) ? parts : Object.values(parts)).join(''));
}
async function restoreSnapshot(owner, id) {
  const meta = await fbGet(`${MAIN}/backups/${enc(owner)}/${enc(id)}/meta`); if (!meta) throw new Error('Backup not found.');
  const base = await baseFor(owner); let n = 0;
  for (const name of Object.keys(meta.nodes || {})) {
    if (base === MAIN && SKIP_MAIN.includes(name)) continue;
    const val = await readNode(owner, id, name); if (val === null) continue;
    await put(`${base}/${enc(name)}`, val); n++;
  }
  return { restored: n, at: meta.at };
}
const entitled = (u) => !!(u && u.backupUntil && new Date(u.backupUntil).getTime() > Date.now());
module.exports = { createSnapshot, listSnapshots, readNode, restoreSnapshot, entitled, prune };
