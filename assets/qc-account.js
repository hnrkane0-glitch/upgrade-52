/* QuickCart — Billing & Card, Backup, Outlets & Sync pages for the owner dashboard. */
(function () {
  'use strict';
  var PUB = 'pk_live_1d3267660c9ae41a643c52a2d04493ea4e0e98ca';
  var $ = function (id) { return document.getElementById(id); };
  var esc = window.esc;
  var money = function (n) { return '₦' + Math.round(Number(n) || 0).toLocaleString('en-NG'); };
  var isAdmin = function () { return localStorage.getItem('qc_logged_user') === 'admin' && !QCDB.isStaff(); };
  var fdate = function (d) { return d ? new Date(d).toLocaleDateString('en-NG', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'; };
  var ftime = function (d) { return d ? new Date(d).toLocaleString('en-NG', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : 'never'; };
  var bytes = function (n) { return n > 1048576 ? (n / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(n / 1024)) + ' KB'; };
  var tok = function () { return localStorage.getItem('qc_token') || ''; };
  async function api(path, body) {
    try {
      var r = await fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + tok() }, body: JSON.stringify(body || {}) });
      var j = {}; try { j = await r.json(); } catch (e) {} if (j.ok === undefined) j.ok = r.ok; return j;
    } catch (e) { return { ok: false, error: 'Network problem. Check your connection and try again.' }; }
  }
  function loadPaystack() {
    return new Promise(function (res) { if (window.PaystackPop) return res(); var s = document.createElement('script'); s.src = 'https://js.paystack.co/v1/inline.js'; s.onload = res; s.onerror = res; document.head.appendChild(s); });
  }
  async function pay(kind, kobo, channels, label) {
    await loadPaystack();
    if (!window.PaystackPop) { await QC.alert('The secure payment window could not load. Check your internet connection and try again.', { title: 'Payment unavailable' }); return null; }
    var ref = kind.toUpperCase() + '-' + Date.now().toString(36).toUpperCase();
    var got = await new Promise(function (resolve) {
      var done = false; function fin(v) { if (!done) { done = true; resolve(v); } }
      try { PaystackPop.setup({ key: PUB, email: localStorage.getItem('qc_sub_email') || '', amount: kobo, currency: 'NGN', ref: ref, channels: channels, label: label, metadata: { type: kind, username: localStorage.getItem('qc_logged_user') || '' },
        callback: function (r) { fin(r.reference); }, onClose: function () { setTimeout(function () { fin(null); }, 1500); } }).openIframe(); }
      catch (e) { fin(null); }
    });
    if (!got) return null;
    var j = await api('/api/paystack', { action: 'verify', reference: got, kind: kind });
    if (!j.ok) { await QC.alert((j.error || 'We could not confirm the payment.') + ' If you were charged, contact support with reference ' + got + '.', { title: 'Payment not confirmed' }); return null; }
    return j;
  }
  var box = function (title, inner, right) { return '<div class="box" style="margin-bottom:16px;"><div class="box-hd"><h3>' + title + '</h3>' + (right || '') + '</div><div style="padding:16px 18px;font-size:13px;line-height:1.6;">' + inner + '</div></div>'; };
  var tgl = function (id, on, label) { return '<label style="display:flex;align-items:center;gap:10px;cursor:pointer;font-weight:600;"><input type="checkbox" id="' + id + '" ' + (on ? 'checked' : '') + ' style="width:18px;height:18px;accent-color:#ff5a1f;"> <span>' + label + '</span></label>'; };

  /* ───────────────── BILLING & CARD ───────────────── */
  async function loadBilling() {
    var el = $('bill-body'); if (!el) return;
    if (isAdmin()) { el.innerHTML = box('Platform owner account', 'This is the QuickCart platform account — it has no subscription or card. Customers manage their billing here.'); return; }
    el.innerHTML = '<div class="empty-row" style="padding:30px;text-align:center;">Loading…</div>';
    var j = await api('/api/paystack', { action: 'card' });
    if (!j.ok) { el.innerHTML = box('Billing', '<span style="color:var(--red);">' + esc(j.error || 'Could not load billing.') + '</span>'); return; }
    var end = j.status === 'trial' ? j.trialEnds : j.subExpires, days = end ? Math.ceil((new Date(end) - Date.now()) / 86400000) : null;
    var st = j.status === 'trial' ? 'Free trial' : j.status === 'active' ? 'Active' : j.status === 'pending_card' ? 'Waiting for your card' : esc(j.status);
    var h = box('Your plan', '<div style="display:flex;gap:28px;flex-wrap:wrap;"><div><div style="font-size:11px;color:var(--ink3);">PLAN</div><div style="font-size:20px;font-weight:800;">' + esc(j.planName) + '</div><div>' + money(j.monthly) + ' / month</div></div>' +
      '<div><div style="font-size:11px;color:var(--ink3);">STATUS</div><div style="font-size:20px;font-weight:800;">' + st + '</div>' + (end ? '<div>' + (j.status === 'trial' ? 'Trial ends ' : 'Renews ') + fdate(end) + (days != null ? ' (' + Math.max(0, days) + ' day' + (days === 1 ? '' : 's') + ' left)' : '') + '</div>' : '') + '</div></div>',
      '<button class="btn btn-orange btn-sm" onclick="QCAcct.payNow()">Pay now / renew</button>');
    if (j.card) {
      h += box('Card for automatic payment', '<div style="display:flex;align-items:center;gap:14px;flex-wrap:wrap;"><div style="font-size:26px;">💳</div><div style="flex:1;min-width:200px;"><strong style="text-transform:capitalize;">' + esc(j.card.brand || 'Card') + '</strong> ending <strong>' + esc(j.card.last4) + '</strong> · expires ' + esc(j.card.exp) + '<br><span style="color:var(--ink3);">' +
        (j.status === 'trial' ? 'We will charge ' + money(j.monthly) + ' to this card automatically when your trial ends on ' + fdate(end) + '.' : 'We will charge ' + money(j.monthly) + ' to this card automatically when your plan renews on ' + fdate(end) + '.') + '</span></div>' +
        '<button class="btn btn-grey btn-sm" onclick="QCAcct.changeCard()">Replace card</button> <button class="btn btn-red btn-sm" onclick="QCAcct.removeCard()">Remove card</button></div>');
    } else {
      h += box('Card for automatic payment', '<div style="background:#fff4e5;border:1px solid #ffd9a0;padding:12px 14px;border-radius:10px;margin-bottom:12px;">⚠ <strong>No card on file.</strong> ' + (j.status === 'trial' ? 'Your account will lock when the trial ends on ' + fdate(end) + ' unless you add a card or pay.' : 'Add a card so your plan renews without interruption.') + '</div>' +
        '<button class="btn btn-orange btn-sm" onclick="QCAcct.changeCard()">+ Add card</button><div style="margin-top:8px;font-size:11px;color:var(--ink3);">We charge ₦50 to verify the card and refund it straight away.</div>');
    }
    el.innerHTML = h;
  }
  async function changeCard() {
    var r = await pay('card', 5000, ['card'], 'Add card — automatic billing'); if (!r) return;
    toast('✅ ' + r.message); loadBilling();
  }
  async function removeCard() {
    if (!await QC.confirm('Remove your saved card? Automatic payment will stop. If you are still on your free trial, the trial continues until it ends, then the account locks unless you add a card or pay.', { title: 'Remove card', ok: 'Remove card', danger: true })) return;
    var j = await api('/api/paystack', { action: 'remove-card' });
    if (!j.ok) { toast('❌ ' + (j.error || 'Could not remove card')); return; }
    toast('✅ ' + j.message); loadBilling();
  }
  async function payNow() {
    var j = await api('/api/paystack', { action: 'card' }); if (!j.ok) { toast('❌ ' + j.error); return; }
    var r = await pay('pay', j.monthly * 100, ['card', 'bank', 'ussd', 'bank_transfer'], 'QuickCart ' + j.planName + ' — monthly'); if (!r) return;
    toast('✅ ' + r.message); loadBilling();
  }

  /* ───────────────── BACKUP ───────────────── */
  var SENSITIVE = ['users', 'billing', 'payments', 'backups', 'dbmap', 'domains', 'terminal_vault'];
  var cfg = { masterOn: true, cloudAuto: true, drive: false, driveEvery: 'daily' };
  async function loadCfg() { try { var r = await fetch(getSettingsDB() + '/backup.json'); var v = await r.json(); if (v && typeof v === 'object') cfg = Object.assign(cfg, v); } catch (e) {} return cfg; }
  async function saveCfg(p) { cfg = Object.assign(cfg, p); try { await fetch(getSettingsDB() + '/backup.json', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(p) }); } catch (e) {} }

  async function collectLocal() {
    var base = getUserNS(), top = await (await fetch(base + '/.json?shallow=true')).json(), nodes = {}; top = Object.keys(top || {});
    for (var i = 0; i < top.length; i++) {
      var n = top[i]; if (SENSITIVE.indexOf(n) > -1) continue;
      var v = await (await fetch(base + '/' + encodeURIComponent(n) + '.json')).json(); if (v === null) continue;
      if (n === 'settings' && v && v.staff) Object.keys(v.staff).forEach(function (k) { if (v.staff[k]) delete v.staff[k].password; });
      nodes[n] = v;
    }
    return { format: 'quickcart-backup', version: 1, exportedAt: new Date().toISOString(), owner: QCDB.owner() || 'admin', business: localStorage.getItem('qc_biz_name') || '', nodes: nodes };
  }
  function fileName() { var d = new Date(), p = function (x) { return String(x).padStart(2, '0'); }; return 'quickcart-backup-' + (QCDB.owner() || 'admin') + '-' + d.getFullYear() + p(d.getMonth() + 1) + p(d.getDate()) + '-' + p(d.getHours()) + p(d.getMinutes()) + '.json'; }
  function download(name, obj) { var a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([typeof obj === 'string' ? obj : JSON.stringify(obj)], { type: 'application/json' })); a.download = name; document.body.appendChild(a); a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 800); }

  /* external drive / folder (File System Access API: Chrome, Edge, Android Chrome desktop) */
  function idb() { return new Promise(function (res, rej) { var q = indexedDB.open('qc_backup', 1); q.onupgradeneeded = function () { q.result.createObjectStore('h'); }; q.onsuccess = function () { res(q.result); }; q.onerror = rej; }); }
  async function hGet() { try { var d = await idb(); return await new Promise(function (r) { var q = d.transaction('h').objectStore('h').get('dir'); q.onsuccess = function () { r(q.result || null); }; q.onerror = function () { r(null); }; }); } catch (e) { return null; } }
  async function hSet(h) { var d = await idb(); return new Promise(function (r) { var t = d.transaction('h', 'readwrite'); if (h) t.objectStore('h').put(h, 'dir'); else t.objectStore('h').delete('dir'); t.oncomplete = r; }); }
  var canDir = function () { return typeof window.showDirectoryPicker === 'function'; };
  async function pickFolder() {
    if (!canDir()) { await QC.alert('Your browser cannot save straight to a drive folder. Use Chrome or Edge on a computer — or use "Download backup file" and save it to your external drive yourself.', { title: 'Not supported here' }); return; }
    try { var h = await showDirectoryPicker({ mode: 'readwrite' }); await hSet(h); await saveCfg({ drive: true, driveName: h.name }); toast('✅ Folder selected: ' + h.name); loadBackup(); } catch (e) { /* cancelled */ }
  }
  async function writeToFolder(data, interactive) {
    var h = await hGet(); if (!h) return false;
    var perm = await h.queryPermission({ mode: 'readwrite' });
    if (perm !== 'granted') { if (!interactive) return false; perm = await h.requestPermission({ mode: 'readwrite' }); if (perm !== 'granted') return false; }
    var f = await h.getFileHandle(fileName(), { create: true }), w = await f.createWritable(); await w.write(JSON.stringify(data)); await w.close();
    try { var names = []; for await (var e of h.values()) if (e.kind === 'file' && /^quickcart-backup-/.test(e.name)) names.push(e.name); names.sort().reverse().slice(15).forEach(function (n) { h.removeEntry(n).catch(function () {}); }); } catch (e) {}
    return true;
  }
  async function driveNow(interactive) {
    if (!cfg.masterOn && !interactive) return;
    var data = await collectLocal(), ok = false;
    try { ok = await writeToFolder(data, true); } catch (e) { ok = false; }
    if (!ok) { download(fileName(), data); toast('⬇ Backup file downloaded — save it to your external drive'); }
    else toast('✅ Backup saved to your drive folder');
    await saveCfg({ lastDriveAt: new Date().toISOString() }); if ($('p-backup') && $('p-backup').classList.contains('on')) loadBackup();
  }
  async function autoDrive() {   // runs while the dashboard is open
    await loadCfg(); if (!cfg.masterOn || !cfg.drive) return;
    var gap = cfg.driveEvery === 'weekly' ? 7 * 86400000 : cfg.driveEvery === 'hourly' ? 3600000 : 86400000;
    if (cfg.lastDriveAt && Date.now() - new Date(cfg.lastDriveAt).getTime() < gap) return;
    try { var d = await collectLocal(); if (await writeToFolder(d, false)) { await saveCfg({ lastDriveAt: new Date().toISOString() }); } } catch (e) {}
  }

  async function safetyCopy() { try { download('before-restore-' + fileName(), await collectLocal()); } catch (e) {} }
  async function restoreNodes(nodes) {
    var base = getUserNS(), names = Object.keys(nodes), n = 0;
    for (var i = 0; i < names.length; i++) { if (SENSITIVE.indexOf(names[i]) > -1) continue; var r = await fetch(base + '/' + encodeURIComponent(names[i]) + '.json', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(nodes[names[i]]) }); if (!r.ok) throw new Error('Could not write ' + names[i] + ' (' + r.status + ')'); n++; }
    return n;
  }
  function restoreFile() {
    var inp = document.createElement('input'); inp.type = 'file'; inp.accept = '.json,application/json';
    inp.onchange = async function () {
      var f = inp.files[0]; if (!f) return; var d; try { d = JSON.parse(await f.text()); } catch (e) { return QC.alert('That file is not a valid backup.', { title: 'Cannot read file' }); }
      if (!d || d.format !== 'quickcart-backup' || !d.nodes) return QC.alert('That is not a QuickCart backup file.', { title: 'Wrong file' });
      var k = Object.keys(d.nodes).length;
      if (!await QC.confirm('Restore ' + k + ' sections from the backup made on ' + ftime(d.exportedAt) + ' (' + (d.business || d.owner) + ')?\n\nThis REPLACES your current products, orders, customers and settings with the copy in this file. A safety copy of your current data will download first.', { title: 'Restore from file', ok: 'Restore now', danger: true })) return;
      await safetyCopy(); try { var n = await restoreNodes(d.nodes); toast('✅ Restored ' + n + ' sections'); setTimeout(function () { location.reload(); }, 1200); } catch (e) { QC.alert(e.message, { title: 'Restore failed' }); }
    }; inp.click();
  }

  var _cloud = null;
  async function loadBackup() {
    var el = $('backup-body'); if (!el) return; await loadCfg();
    var staff = QCDB.isStaff(); if (staff) { el.innerHTML = box('Backup', 'Only the store owner can manage backups.'); return; }
    var cl = isAdmin() ? { ok: true, entitled: true, list: await (async function () { var j = await api('/api/backup', { action: 'status', owner: 'admin' }); return j.list || []; })() } : await api('/api/backup', { action: 'status' });
    _cloud = cl; var off = !cfg.masterOn;
    var h = box('Backups', tgl('bk-master', cfg.masterOn, 'Automatic backups are <strong>' + (cfg.masterOn ? 'ON' : 'OFF') + '</strong>') + '<div style="color:var(--ink3);font-size:12px;margin-top:6px;">Turn this off to pause every automatic backup (drive and cloud). You can still back up by hand.</div>');
    h += box('1 · External hard drive / folder (free)',
      tgl('bk-drive', cfg.drive, 'Save backups to my drive folder automatically') +
      '<div style="margin:10px 0;color:var(--ink3);">' + (cfg.driveName ? 'Folder: <strong>' + esc(cfg.driveName) + '</strong> · ' : 'No folder chosen yet · ') + 'Last backup: <strong>' + ftime(cfg.lastDriveAt) + '</strong></div>' +
      '<div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;"><select id="bk-every" class="sinput" style="width:auto;"><option value="hourly">Every hour</option><option value="daily">Every day</option><option value="weekly">Every week</option></select>' +
      '<button class="btn btn-grey btn-sm" onclick="QCAcct.pickFolder()">📁 Choose drive / folder</button> <button class="btn btn-orange btn-sm" onclick="QCAcct.driveNow()">Back up now</button> <button class="btn btn-grey btn-sm" onclick="QCAcct.downloadNow()">⬇ Download backup file</button> <button class="btn btn-grey btn-sm" onclick="QCAcct.restoreFile()">⤴ Restore from file</button></div>' +
      '<div style="margin-top:8px;font-size:11px;color:var(--ink3);">Plug in your external drive, press “Choose drive / folder”, and backups are written there while this dashboard is open (Chrome / Edge). On phones, use “Download backup file”.</div>');
    var cloudInner;
    if (!cl.ok) cloudInner = '<span style="color:var(--red);">' + esc(cl.error || 'Could not load') + '</span>';
    else if (!cl.entitled) cloudInner = '<div style="display:flex;gap:16px;flex-wrap:wrap;align-items:center;"><div style="flex:1;min-width:220px;">Your data is copied to QuickCart’s secure cloud every night and kept for 14 days. If you ever lose your device or data, restore it in one click — or we can find and restore it for you.<br><strong>' + money(window.__bkPrice || 2500) + ' / month</strong>, billed to your saved card.</div><button class="btn btn-orange" onclick="QCAcct.subBackup()">Subscribe to Cloud Backup</button></div>';
    else {
      cloudInner = '<div style="margin-bottom:10px;">' + (isAdmin() ? 'Platform account — included.' : 'Active until <strong>' + fdate(cl.backupUntil) + '</strong>') + '</div>' +
        '<div style="display:flex;gap:18px;flex-wrap:wrap;margin-bottom:12px;">' + tgl('bk-cloud', cfg.cloudAuto, 'Back up to the cloud every night') + (isAdmin() ? '' : tgl('bk-renew', cl.autoRenew, 'Renew automatically')) + '</div>' +
        '<button class="btn btn-orange btn-sm" onclick="QCAcct.cloudNow()">☁ Back up to cloud now</button>' + listHtml(cl.list, '');
    }
    h += box('2 · Cloud backup (subscription)', cloudInner);
    if (isAdmin()) h += box('3 · Recover a customer’s data (platform admin)', '<div style="display:flex;gap:8px;flex-wrap:wrap;"><input class="sinput" id="bk-find" placeholder="Customer username" style="max-width:260px;"><button class="btn btn-orange btn-sm" onclick="QCAcct.findCustomer()">Find backups</button><button class="btn btn-grey btn-sm" onclick="QCAcct.grant()">Give free Cloud Backup…</button></div><div id="bk-found" style="margin-top:12px;"></div>');
    el.innerHTML = h;
    var ev = $('bk-every'); if (ev) { ev.value = cfg.driveEvery || 'daily'; ev.onchange = function () { saveCfg({ driveEvery: ev.value }); }; }
    var m = $('bk-master'); if (m) m.onchange = async function () { await saveCfg({ masterOn: m.checked }); loadBackup(); };
    var d = $('bk-drive'); if (d) d.onchange = async function () { if (d.checked && !(await hGet())) { d.checked = false; await pickFolder(); return; } await saveCfg({ drive: d.checked }); };
    var c = $('bk-cloud'); if (c) c.onchange = function () { saveCfg({ cloudAuto: c.checked }); };
    var rn = $('bk-renew'); if (rn) rn.onchange = function () { api('/api/backup', { action: 'auto-renew', on: rn.checked }); };
  }
  function listHtml(list, owner) {
    if (!list || !list.length) return '<div style="margin-top:12px;color:var(--ink3);">No cloud backups yet.</div>';
    return '<div style="overflow-x:auto;margin-top:12px;"><table><thead><tr><th>Date</th><th>Type</th><th>Size</th><th>Records</th><th></th></tr></thead><tbody>' + list.map(function (b) {
      return '<tr><td>' + ftime(b.at) + '</td><td>' + (b.kind === 'auto' ? 'Nightly' : 'Manual') + '</td><td>' + bytes(b.bytes) + '</td><td>' + (b.records || '—') + '</td><td style="white-space:nowrap;"><button class="btn btn-grey btn-sm" onclick="QCAcct.cloudDownload(\'' + b.id + '\',\'' + owner + '\')">Download</button> <button class="btn btn-orange btn-sm" onclick="QCAcct.cloudRestore(\'' + b.id + '\',\'' + owner + '\')">Restore</button> <button class="btn btn-red btn-sm" onclick="QCAcct.cloudDelete(\'' + b.id + '\',\'' + owner + '\')">Del</button></td></tr>';
    }).join('') + '</tbody></table></div>';
  }
  async function cloudNow() {
    toast('☁ Backing up…'); var j = await api('/api/backup', { action: 'create' });
    if (!j.ok) { QC.alert(j.error || 'Backup failed', { title: 'Cloud backup' }); return; } toast('✅ Cloud backup done (' + bytes(j.meta.bytes) + ')'); loadBackup();
  }
  async function subBackup() {
    var r = await pay('backup', (window.__bkPrice || 2500) * 100, ['card', 'bank', 'ussd', 'bank_transfer'], 'Cloud Backup — monthly'); if (!r) return;
    toast('✅ ' + r.message); await api('/api/backup', { action: 'create' }); loadBackup();
  }
  async function cloudDownload(id, owner) {
    toast('Preparing download…'); var m = await api('/api/backup', { action: 'list-chunk', id: id, owner: owner || undefined }); if (!m.ok) return QC.alert(m.error, { title: 'Download failed' });
    var nodes = {}, names = Object.keys(m.meta.nodes || {});
    for (var i = 0; i < names.length; i++) { var txt = '', t = 1; for (var c = 0; c < t; c++) { var p = await api('/api/backup', { action: 'list-chunk', id: id, name: names[i], i: c, owner: owner || undefined }); if (!p.ok) return QC.alert(p.error, { title: 'Download failed' }); t = p.total; txt += p.text; } try { nodes[names[i]] = JSON.parse(txt); } catch (e) {} }
    download('quickcart-cloud-' + (owner || QCDB.owner() || 'admin') + '-' + id + '.json', { format: 'quickcart-backup', version: 1, exportedAt: m.meta.at, owner: owner || QCDB.owner() || 'admin', nodes: nodes }); toast('✅ Downloaded');
  }
  async function cloudRestore(id, owner) {
    if (!await QC.confirm('Restore this cloud backup' + (owner ? ' for ' + owner : '') + '? It REPLACES the current products, orders, customers and settings with this copy.' + (owner ? '' : ' A safety copy of your current data downloads first.'), { title: 'Restore from cloud', ok: 'Restore now', danger: true })) return;
    if (!owner) await safetyCopy();
    var j = await api('/api/backup', { action: 'restore', id: id, owner: owner || undefined });
    if (!j.ok) return QC.alert(j.error, { title: 'Restore failed' }); toast('✅ Restored ' + j.restored + ' sections'); if (!owner) setTimeout(function () { location.reload(); }, 1200);
  }
  async function cloudDelete(id, owner) { if (!await QC.confirm('Delete this cloud backup?', { title: 'Delete backup', ok: 'Delete', danger: true })) return; await api('/api/backup', { action: 'delete', id: id, owner: owner || undefined }); owner ? findCustomer() : loadBackup(); }
  async function findCustomer() {
    var u = ($('bk-find').value || '').trim().toLowerCase(); if (!u) return; var j = await api('/api/backup', { action: 'status', owner: u });
    $('bk-found').innerHTML = j.ok ? '<strong>' + esc(u) + '</strong> — ' + (j.list.length ? j.list.length + ' backup(s)' : 'no cloud backups found') + listHtml(j.list, u) : '<span style="color:var(--red);">' + esc(j.error) + '</span>';
  }
  async function grant() {
    var r = await QC.form({ title: 'Give free Cloud Backup', submit: 'Grant', fields: [{ name: 'u', label: 'Customer username', required: true }, { name: 'days', label: 'Days', type: 'number', value: 30, required: true }] }); if (!r) return;
    var l = await api('/api/auth', { action: 'admin-users' }); var rec = (l.users || []).find(function (x) { return String(x.username || '').toLowerCase() === r.u.toLowerCase(); });
    if (!rec) return QC.alert('No customer with that username.', { title: 'Not found' });
    var j = await api('/api/auth', { action: 'admin-user-set', key: rec.key, patch: { backupUntil: new Date(Date.now() + r.days * 86400000).toISOString() } }); toast(j.ok ? '✅ Cloud Backup granted' : '❌ ' + j.error);
  }

  /* ───────────────── OUTLETS & SYNC ───────────────── */
  var outlets = {};
  async function loadOutletList() { try { var r = await fetch(getSettingsDB() + '/outlets.json'); outlets = (await r.json()) || {}; } catch (e) { outlets = {}; } return outlets; }
  async function fillOutletSelect() {
    var s = $('hr-outlet'); if (!s) return; var o = await loadOutletList(), cur = s.value;
    s.innerHTML = '<option value="">All outlets / head office</option>' + Object.keys(o).map(function (k) { return '<option value="' + esc(o[k].name) + '">' + esc(o[k].name) + '</option>'; }).join(''); s.value = cur;
  }
  function addOutlet() {
    QC.form({ title: 'Add outlet / branch', sub: 'Staff and POS terminals can be assigned to it, and its sales are reported separately.', submit: 'Add outlet',
      fields: [{ name: 'name', label: 'Outlet name', required: true, placeholder: 'e.g. Ikeja Branch' }, { name: 'address', label: 'Address (optional)' }, { name: 'phone', label: 'Phone (optional)', type: 'tel' }],
      save: async function (v) {
        await loadOutletList(); if (Object.keys(outlets).some(function (k) { return outlets[k].name.toLowerCase() === v.name.toLowerCase(); })) throw new Error('You already have an outlet with that name.');
        var id = 'o-' + Date.now().toString(36); var r = await fetch(getSettingsDB() + '/outlets/' + id + '.json', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: v.name, address: v.address || '', phone: v.phone || '', createdAt: new Date().toISOString() }) });
        if (!r.ok) throw new Error('Could not save (' + r.status + ')'); await loadOutlets();
      } }).then(function (r) { if (r) toast('✅ ' + r.name + ' added'); });
  }
  async function delOutlet(id) {
    var o = outlets[id]; if (!o || !await QC.confirm('Delete outlet "' + o.name + '"? Its past sales stay in your records.', { title: 'Delete outlet', ok: 'Delete', danger: true })) return;
    await fetch(getSettingsDB() + '/outlets/' + id + '.json', { method: 'DELETE' }); toast('Outlet deleted'); loadOutlets();
  }
  async function loadOutlets() {
    var el = $('outlets-body'); if (!el) return; await loadOutletList();
    var range = ($('out-range') || {}).value || '30', since = range === 'all' ? 0 : Date.now() - Number(range) * 86400000;
    var ords = {}, staff = {}; try { ords = (await (await fetch(getOrdersDB() + '.json')).json()) || {}; } catch (e) {} try { staff = (await (await fetch(getSettingsDB() + '/staff.json')).json()) || {}; } catch (e) {}
    var byO = {}, byC = {}, devs = {}, offl = 0, total = 0, rev = 0, today = new Date().toDateString();
    Object.keys(ords).forEach(function (k) {
      var o = ords[k]; if (!o || typeof o !== 'object') return; var t = new Date(o.createdAt || o.date || 0).getTime(); if (since && t < since) return;
      if (o.status === 'cancelled' || o.status === 'declined' || o.status === 'refunded') return;
      var on = o.source === 'pos' ? (o.outlet || 'Main / unassigned') : 'Online store', amt = Number(o.total) || 0;
      var a = byO[on] = byO[on] || { n: 0, rev: 0, today: 0, off: 0 }; a.n++; a.rev += amt; if (new Date(t).toDateString() === today) a.today += amt; if (o.offline) { a.off++; offl++; }
      if (o.source === 'pos') { var c = byC[(o.cashier || '—') + '|' + on] = byC[(o.cashier || '—') + '|' + on] || { n: 0, rev: 0, who: o.cashier || '—', out: on }; c.n++; c.rev += amt; if (o.terminal) devs[o.terminal] = 1; }
      total++; rev += amt;
    });
    var names = Object.keys(outlets).map(function (k) { return outlets[k].name; });
    Object.keys(byO).forEach(function (n) { if (names.indexOf(n) < 0) names.push(n); });
    var h = '<div class="stats"><div class="stat"><div class="stat-l">Sales (all outlets)</div><div class="stat-v">' + total + '</div></div><div class="stat"><div class="stat-l">Revenue</div><div class="stat-v">' + money(rev) + '</div></div><div class="stat"><div class="stat-l">POS devices seen</div><div class="stat-v">' + Object.keys(devs).length + '</div></div><div class="stat"><div class="stat-l">Offline sales synced</div><div class="stat-v">' + offl + '</div></div></div>';
    h += '<div class="box" style="margin-bottom:16px;"><div class="box-hd"><h3>Outlets</h3><div style="display:flex;gap:6px;"><select id="out-range" class="sinput" onchange="QCAcct.loadOutlets()" style="width:auto;"><option value="1">Today</option><option value="7">7 days</option><option value="30">30 days</option><option value="all">All time</option></select><button class="btn btn-orange btn-sm" onclick="QCAcct.addOutlet()">+ Add Outlet</button></div></div><div style="overflow-x:auto;"><table><thead><tr><th>Outlet</th><th>Sales</th><th>Revenue</th><th>Today</th><th>Synced from offline</th><th>Staff</th><th></th></tr></thead><tbody>' +
      (names.length ? names.map(function (n) { var a = byO[n] || { n: 0, rev: 0, today: 0, off: 0 }, id = Object.keys(outlets).filter(function (k) { return outlets[k].name === n; })[0], sc = Object.keys(staff).filter(function (k) { return staff[k] && staff[k].outlet === n; }).length;
        return '<tr><td><strong>' + esc(n) + '</strong></td><td>' + a.n + '</td><td style="font-family:\'DM Mono\',monospace;">' + money(a.rev) + '</td><td>' + money(a.today) + '</td><td>' + a.off + '</td><td>' + sc + '</td><td>' + (id ? '<button class="btn btn-red btn-sm" onclick="QCAcct.delOutlet(\'' + id + '\')">Del</button>' : '') + '</td></tr>'; }).join('') : '<tr class="empty-row"><td colspan="7">No outlets yet. Add your branches, then assign staff to them in Human Resources.</td></tr>') + '</tbody></table></div></div>';
    var cs = Object.keys(byC).map(function (k) { return byC[k]; }).sort(function (a, b) { return b.rev - a.rev; });
    h += '<div class="box"><div class="box-hd"><h3>Sales by staff / cashier</h3></div><div style="overflow-x:auto;"><table><thead><tr><th>Cashier</th><th>Outlet</th><th>Sales</th><th>Revenue</th></tr></thead><tbody>' + (cs.length ? cs.map(function (c) { return '<tr><td>' + esc(c.who) + '</td><td>' + esc(c.out) + '</td><td>' + c.n + '</td><td>' + money(c.rev) + '</td></tr>'; }).join('') : '<tr class="empty-row"><td colspan="4">No POS sales in this period.</td></tr>') + '</tbody></table></div></div>';
    h += '<div style="margin-top:14px;font-size:12px;color:var(--ink3);line-height:1.6;">✅ Every POS terminal, outlet and staff login writes to this one account, so all sales appear here and in Orders, Accounting and Inventory automatically. If a terminal loses internet it keeps selling and uploads its sales (and stock changes) by itself when the connection returns.</div>';
    var rs = $('out-range'); $('outlets-body').innerHTML = h; $('out-range').value = range;
  }

  /* ───────────────── wire into the dashboard ───────────────── */
  function init() {
    var anchor = $('p-customers'); if (!anchor || $('p-billing')) return;
    anchor.insertAdjacentHTML('afterend',
      '<div class="panel" id="p-outlets"><div class="ptitle">Outlets &amp; Sync</div><div class="psub">All your branches, POS terminals and staff in one place — every sale synced to this account.</div><div id="outlets-body"></div></div>' +
      '<div class="panel" id="p-backup"><div class="ptitle">Backup</div><div class="psub">Keep a copy of everything you do — on your own drive, or in the QuickCart cloud.</div><div id="backup-body"></div></div>' +
      '<div class="panel" id="p-billing"><div class="ptitle">Billing &amp; Card</div><div class="psub">Your plan, your card and automatic payment.</div><div id="bill-body"></div></div>');
    var nav = Array.prototype.filter.call(document.querySelectorAll('.sb'), function (e) { return (e.getAttribute('onclick') || '').indexOf("go('customers'") > -1; })[0];
    if (nav) nav.insertAdjacentHTML('afterend', '<div class="sb" onclick="go(\'outlets\',this)">🏬 Outlets &amp; Sync</div><div class="sb" onclick="go(\'backup\',this)">☁️ Backup</div>' + (isAdmin() ? '' : '<div class="sb" onclick="go(\'billing\',this)">💳 Billing &amp; Card</div>'));
    var g = window.go; window.go = function (n, el) {
      g.apply(this, arguments);
      if (n === 'outlets') loadOutlets(); else if (n === 'backup') loadBackup(); else if (n === 'billing') loadBilling(); else if (n === 'hr') fillOutletSelect();
    };
    var es = window.editStaff; if (typeof es === 'function') window.editStaff = function (k) { es.apply(this, arguments); setTimeout(function () { var s = $('hr-outlet'), st = window._staff && window._staff[k]; if (s && st) s.value = st.outlet || ''; }, 250); };
    fetch('/api/paystack?action=plans').then(function (r) { return r.json(); }).then(function (j) { if (j && j.backup) window.__bkPrice = j.backup.monthly; }).catch(function () {});
    setTimeout(autoDrive, 4000); setInterval(autoDrive, 30 * 60 * 1000);
  }
  window.QCAcct = { changeCard: changeCard, removeCard: removeCard, payNow: payNow, pickFolder: pickFolder, driveNow: function () { return driveNow(true); }, downloadNow: async function () { download(fileName(), await collectLocal()); toast('⬇ Backup downloaded'); }, restoreFile: restoreFile,
    cloudNow: cloudNow, subBackup: subBackup, cloudDownload: cloudDownload, cloudRestore: cloudRestore, cloudDelete: cloudDelete, findCustomer: findCustomer, grant: grant, addOutlet: addOutlet, delOutlet: delOutlet, loadOutlets: loadOutlets, fillOutletSelect: fillOutletSelect };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
