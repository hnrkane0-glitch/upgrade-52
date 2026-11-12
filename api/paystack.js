require('./_fbauth');
// QuickCart — subscription payments with Paystack (Vercel serverless function).
//
//   GET  /api/paystack?action=plans     → plan prices (single source of truth)
//   POST /api/paystack {action:'verify', reference, kind:'trial'|'pay', username}
//        Asks Paystack whether the payment really happened (never trusts the browser), checks
//        the amount / email, activates the trial or plan, saves the card for later billing
//        (encrypted) and refunds the ₦50 card-check charge.
//
// Env (Vercel → Settings → Environment Variables):
//   PAYSTACK_SECRET_KEY  sk_live_… of the QuickCart platform account   (required)
//   QC_ENC_KEY           long random text; encrypts saved card tokens   (required to save cards)
const { MAIN, enc, fbGet, fbPut, seal, unseal, jbody, verifyTok, tokenOf } = require('./_qc');
const { PLANS, TRIAL_DAYS, CARD_CHECK_KOBO, PAID_DAYS, BACKUP_ADDON } = require('./_plans');

const PS = 'https://api.paystack.co';
const out = (res, code, obj) => res.status(code).json(obj);
const psFetch = async (path, opt) => {
  const r = await fetch(PS + path, Object.assign({}, opt, { headers: Object.assign({ Authorization: 'Bearer ' + process.env.PAYSTACK_SECRET_KEY, 'Content-Type': 'application/json' }, (opt && opt.headers) || {}) }));
  let j = null; try { j = await r.json(); } catch (e) { j = {}; }
  return { ok: r.ok, status: r.status, json: j };
};
const patch = async (url, data) => {
  const r = await fetch(url + '.json', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
  if (!r.ok) throw new Error('Database write failed (' + r.status + ')');
};
async function findUser(username) {
  username = String(username || '').trim();
  if (!/^[A-Za-z0-9._@+-]{2,80}$/.test(username)) return null;
  const r = await fetch(`${MAIN}/users.json?orderBy="username"&equalTo="${enc(username)}"`);
  if (!r.ok) return null;
  const d = await r.json();
  if (!d || typeof d !== 'object') return null;
  const key = Object.keys(d).find((k) => d[k] && !d[k].isStaff);
  return key ? { key, user: d[key] } : null;
}

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  try {
    if (req.method === 'GET') {
      if ((req.query && req.query.action) === 'plans') return out(res, 200, { ok: true, plans: PLANS, trialDays: TRIAL_DAYS, cardCheck: CARD_CHECK_KOBO / 100, backup: BACKUP_ADDON });
      return out(res, 404, { ok: false, error: 'Unknown action' });
    }
    if (req.method !== 'POST') return out(res, 405, { ok: false, error: 'Method not allowed' });
    if (!process.env.PAYSTACK_SECRET_KEY) return out(res, 500, { ok: false, code: 'NO_SECRET', error: 'Payments are not fully set up yet: add PAYSTACK_SECRET_KEY in Vercel → Settings → Environment Variables and redeploy.' });

    const b = jbody(req);
    const tok = verifyTok(tokenOf(req));
    if (!tok || tok.r !== 'owner') return out(res, 401, { ok: false, code: 'NO_SESSION', error: 'Please log in again to continue.' });
    const key = tok.k;
    const user = await fbGet(`${MAIN}/users/${enc(key)}`);
    if (!user) return out(res, 404, { ok: false, error: 'We could not find your account. Please log in again.' });
    const plan = PLANS[user.plan] || PLANS.starter;

    if (b.action === 'card') {   // what card is saved?
      const bill = await fbGet(`${MAIN}/billing/${enc(key)}`);
      return out(res, 200, { ok: true, status: user.status, trialEnds: user.trialEnds || null, subExpires: user.subExpires || null, plan: user.plan, planName: plan.name, monthly: plan.monthly, backupUntil: user.backupUntil || null, card: bill ? { last4: bill.last4, brand: bill.brand, bank: bill.bank, exp: (bill.expMonth || '') + '/' + (bill.expYear || '') } : null });
    }
    if (b.action === 'remove-card') {
      await fetch(`${MAIN}/billing/${enc(key)}.json`, { method: 'DELETE' });
      await patch(`${MAIN}/users/${enc(key)}`, { cardLast4: null, cardBrand: null, cardRemovedAt: new Date().toISOString() });
      const left = user.status === 'trial' ? 'Your trial continues until ' + new Date(user.trialEnds).toLocaleDateString('en-NG') + ', then the account will lock unless you add a card again.' : 'Automatic renewal is off. Your plan stays active until it ends.';
      return out(res, 200, { ok: true, message: 'Card removed. ' + left });
    }
    if (b.action !== 'verify') return out(res, 400, { ok: false, error: 'Unknown action' });
    const reference = String(b.reference || '').trim();
    const kind = ['pay', 'card', 'backup'].includes(b.kind) ? b.kind : 'trial';
    if (!/^[A-Za-z0-9_.=-]{6,100}$/.test(reference)) return out(res, 400, { ok: false, error: 'Bad payment reference' });

    // Already processed? (page refresh / double callback) → return the stored result.
    const seen = await fbGet(`${MAIN}/payments/${enc(reference)}`);
    if (seen && seen.ok) return out(res, 200, Object.assign({ ok: true, repeat: true }, seen));

    const v = await psFetch('/transaction/verify/' + enc(reference));
    const d = v.json && v.json.data;
    if (!v.ok || !d) return out(res, 502, { ok: false, error: (v.json && v.json.message) || 'Paystack could not confirm this payment.' });
    if (d.status !== 'success') return out(res, 402, { ok: false, error: 'Payment was not completed (' + d.status + ').' });
    if (String(d.currency || 'NGN') !== 'NGN') return out(res, 402, { ok: false, error: 'Unexpected currency.' });
    const want = kind === 'pay' ? plan.monthly * 100 : kind === 'backup' ? BACKUP_ADDON.monthly * 100 : CARD_CHECK_KOBO;
    if (Number(d.amount) < want) return out(res, 402, { ok: false, error: 'The amount paid does not match your plan.' });
    const mail = String((d.customer && d.customer.email) || '').toLowerCase();
    if (user.email && mail && mail !== String(user.email).toLowerCase()) return out(res, 402, { ok: false, error: 'This payment was made with a different email address.' });

    const now = Date.now(), iso = (t) => new Date(t).toISOString();
    const a = d.authorization || {};
    const card = { last4: a.last4 || '', brand: a.brand || a.card_type || '', bank: a.bank || '', expMonth: a.exp_month || '', expYear: a.exp_year || '', reusable: !!a.reusable };

    // Save the card token (encrypted) so the plan can be renewed automatically.
    let cardSaved = false, warn = '';
    if (kind !== 'backup' && a.reusable && a.authorization_code) {
      try {
        await fbPut(`${MAIN}/billing/${enc(key)}`, Object.assign({ plan: user.plan || 'starter', email: user.email || mail, updatedAt: iso(now), sealed: seal({ authorization_code: a.authorization_code, customer_code: d.customer && d.customer.customer_code, email: mail || user.email }) }, card));
        cardSaved = true;
      } catch (e) { warn = e.code === 'NO_ENC_KEY' ? 'Card verified, but QC_ENC_KEY is missing on the server so it could not be saved for automatic renewal.' : 'Card verified, but it could not be saved for renewal.'; }
    } else if (kind !== 'backup') warn = 'This card cannot be saved for automatic renewal, so it cannot be used for a free trial. Please use another card.';

    if ((kind === 'trial' || kind === 'card') && !cardSaved) return out(res, 402, { ok: false, error: warn || 'This card cannot be used for automatic billing. Please use a different debit card.' });
    let update, message;
    if (kind === 'backup') {
      const from = user.backupUntil && new Date(user.backupUntil).getTime() > now ? new Date(user.backupUntil).getTime() : now;
      update = { backupUntil: iso(from + PAID_DAYS * 86400000), backupPaymentRef: reference };
      message = 'Cloud Backup is active until ' + new Date(update.backupUntil).toLocaleDateString('en-NG') + '.';
    } else if (kind === 'card') {
      update = { cardRef: reference, cardAdded: iso(now), cardLast4: card.last4, cardBrand: card.brand, status: user.status === 'pending_card' ? 'trial' : user.status, trialEnds: user.status === 'pending_card' ? iso(now + TRIAL_DAYS * 86400000) : user.trialEnds };
      if (update.trialEnds === undefined) delete update.trialEnds;
      message = 'Card saved. It will be charged automatically when your ' + (user.status === 'active' ? 'plan renews' : 'trial ends') + '.';
    } else if (kind === 'pay') {
      update = { status: 'active', plan: user.plan || 'starter', subExpires: iso(now + PAID_DAYS * 86400000), lastPaymentRef: reference, lastPaymentAmount: d.amount / 100, lastPaymentDate: iso(now) };
      message = 'Payment confirmed — your ' + plan.name + ' plan is active.';
    } else {
      const keepEnd = user.trialEnds && new Date(user.trialEnds).getTime() > now ? user.trialEnds : iso(now + TRIAL_DAYS * 86400000);
      update = { status: 'trial', trialEnds: keepEnd, cardRef: reference, cardAdded: iso(now), cardLast4: card.last4, cardBrand: card.brand };
      message = 'Card verified — your ' + TRIAL_DAYS + '-day free trial has started.';
    }
    await patch(`${MAIN}/users/${enc(key)}`, update);

    // Give the ₦50 card-check charge back right away.
    let refunded = false;
    if (kind === 'trial' || kind === 'card') {
      const rf = await psFetch('/refund', { method: 'POST', body: JSON.stringify({ transaction: reference }) });
      refunded = rf.ok && rf.json && rf.json.status !== false;
      if (!refunded) warn = (warn ? warn + ' ' : '') + 'Your ₦50 card check could not be refunded automatically — please contact support.';
    }

    const result = { ok: true, kind, message, backupUntil: update.backupUntil || null, cardSaved, refunded, card: { last4: card.last4, brand: card.brand }, trialEnds: update.trialEnds || null, subExpires: update.subExpires || null, warn };
    try { await fbPut(`${MAIN}/payments/${enc(reference)}`, Object.assign({ user: key, at: iso(now) }, result)); } catch (e) { /* non-fatal */ }
    return out(res, 200, result);
  } catch (e) {
    return out(res, 500, { ok: false, error: e && e.message ? e.message : 'Server error' });
  }
};
