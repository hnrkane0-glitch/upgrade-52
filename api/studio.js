// QuickCart Backend Studio — server-side Super Admin API.
// All data is stored centrally and every action requires a valid platform-admin session.
const { MAIN, enc, fbGet, fbPut, verifyTok, tokenOf, jbody } = require('./_qc');

const out = (res, code, body) => res.status(code).json(body);
// Store Studio records beneath the existing Firebase-locked backups root.\n// Do NOT move this to a new root path until the broad public $other rule is removed.\n// Server-side access requires FIREBASE_DB_SECRET via api/_fbauth.js.\nconst ROOT = MAIN + '/backups/platform_studio';
const now = () => new Date().toISOString();
const id = () => Date.now().toString(36) + '-' + require('crypto').randomBytes(5).toString('hex');
const clean = (v, max = 160) => String(v == null ? '' : v).trim().slice(0, max);

async function audit(actor, action, detail) {
  const key = id();
  await fbPut(ROOT + '/audit/' + key, { actor, action, detail: clean(detail, 500), at: now() });
}
async function readMap(path) {
  const v = await fbGet(ROOT + '/' + path);
  return v && typeof v === 'object' ? v : {};
}

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  if (req.method !== 'POST') return out(res, 405, { ok: false, error: 'Method not allowed' });
  const session = verifyTok(tokenOf(req));
  if (!session || session.r !== 'admin' || session.u !== 'admin') {
    return out(res, 403, { ok: false, error: 'Backend Studio is restricted to the platform Super Admin.' });
  }
  try {
    const body = jbody(req);
    const action = clean(body.action, 50);

    if (action === 'overview') {
      const [projects, features, releases, auditLog] = await Promise.all([
        readMap('projects'), readMap('features'), readMap('releases'), readMap('audit')
      ]);
      return out(res, 200, {
        ok: true,
        stats: {
          projects: Object.keys(projects).length,
          features: Object.keys(features).length,
          releases: Object.keys(releases).length,
          recentActivity: Object.keys(auditLog).length
        },
        projects: Object.entries(projects).map(([key, value]) => ({ key, ...value })).sort((a,b) => String(b.updatedAt).localeCompare(String(a.updatedAt))).slice(0, 8),
        features: Object.entries(features).map(([key, value]) => ({ key, ...value })).sort((a,b) => String(b.updatedAt).localeCompare(String(a.updatedAt))).slice(0, 12),
        releases: Object.entries(releases).map(([key, value]) => ({ key, ...value })).sort((a,b) => String(b.createdAt).localeCompare(String(a.createdAt))).slice(0, 8),
        audit: Object.entries(auditLog).map(([key, value]) => ({ key, ...value })).sort((a,b) => String(b.at).localeCompare(String(a.at))).slice(0, 15)
      });
    }

    if (action === 'project-create') {
      const title = clean(body.title, 100);
      const prompt = clean(body.prompt, 5000);
      if (!title || !prompt) return out(res, 400, { ok: false, error: 'Add a project name and describe what you want to build.' });
      const key = id();
      const record = {
        title, prompt, status: 'idea',
        scope: clean(body.scope || 'platform', 40),
        target: clean(body.target || 'staging', 40),
        createdAt: now(), updatedAt: now(), createdBy: 'admin',
        note: 'Saved as a Studio project. AI implementation and isolated test execution are not enabled in this foundation release.'
      };
      await fbPut(ROOT + '/projects/' + enc(key), record);
      await audit('admin', 'project.created', title);
      return out(res, 201, { ok: true, key, project: record });
    }

    if (action === 'feature-upsert') {
      const key = clean(body.key || id(), 120).replace(/[^a-zA-Z0-9._-]/g, '-');
      const name = clean(body.name, 100);
      if (!name) return out(res, 400, { ok: false, error: 'Feature name is required.' });
      const existing = await fbGet(ROOT + '/features/' + enc(key)) || {};
      const record = {
        name, description: clean(body.description, 500),
        enabled: body.enabled === true,
        rollout: clean(body.rollout || 'none', 40),
        targetStores: Array.isArray(body.targetStores) ? body.targetStores.map(x => clean(x, 80)).filter(Boolean).slice(0, 100) : (existing.targetStores || []),
        updatedAt: now(), createdAt: existing.createdAt || now(), updatedBy: 'admin'
      };
      await fbPut(ROOT + '/features/' + enc(key), record);
      await audit('admin', 'feature.saved', name + ' (' + key + ')');
      return out(res, 200, { ok: true, key, feature: record });
    }

    if (action === 'project-status') {
      const key = clean(body.key, 120);
      const status = clean(body.status, 40);
      if (!key || !['idea', 'planning', 'in-progress', 'testing', 'ready-for-approval', 'approved', 'rejected', 'archived'].includes(status)) {
        return out(res, 400, { ok: false, error: 'Invalid project status.' });
      }
      const project = await fbGet(ROOT + '/projects/' + enc(key));
      if (!project) return out(res, 404, { ok: false, error: 'Project not found.' });
      project.status = status; project.updatedAt = now();
      await fbPut(ROOT + '/projects/' + enc(key), project);
      await audit('admin', 'project.status', project.title + ' → ' + status);
      return out(res, 200, { ok: true, project });
    }

    return out(res, 400, { ok: false, error: 'Unknown Studio action.' });
  } catch (error) {
    console.error('[studio]', error);
    return out(res, 500, { ok: false, error: error.code === 'NO_ENC_KEY' ? error.message : 'Studio could not complete that request.' });
  }
};
