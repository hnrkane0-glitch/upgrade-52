/* QuickCart UI kit — in-app dialogs (replaces the browser's prompt/confirm boxes),
   panel loading skeletons, and a global esc() helper.
   Public API:
     QC.form({title, sub, fields, submit, danger, save})  -> Promise<values|null>
     QC.confirm(message, {title, ok, cancel, danger})      -> Promise<boolean>
     QC.alert(message, {title})                            -> Promise<void>
     QC.text(title, text)                                  -> Promise<void>   (shows copyable text)
     QC.panelLoading(panelEl)                              -> shows skeleton until requests settle
   Field: {name,label,type:'text|number|tel|email|date|password|textarea|select|rows',
           value,placeholder,required,hint,options:[{value,label}|'x'],min,max,step,half:true,
           columns:[{name,label,type,placeholder,width}] (rows), addLabel (rows)}
   If `save` (async fn(values)) is given, the dialog stays open showing "Saving…",
   shows any error inside the dialog, and closes only when save succeeds. */
(function () {
  'use strict';
  if (window.QC && window.QC.__ui) return;

  function escH(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
  if (typeof window.esc !== 'function') window.esc = escH;

  var css = '' +
    '.qcm-scrim{position:fixed;inset:0;z-index:100000;background:rgba(6,20,51,.55);backdrop-filter:blur(3px);-webkit-backdrop-filter:blur(3px);display:flex;align-items:center;justify-content:center;padding:16px;opacity:0;transition:opacity .18s ease}' +
    '.qcm-scrim.in{opacity:1}' +
    '.qcm{background:#fff;color:#0a1f44;width:100%;max-width:460px;max-height:calc(100dvh - 32px);display:flex;flex-direction:column;border-radius:18px;box-shadow:0 30px 80px rgba(6,20,51,.35);transform:translateY(14px) scale(.98);transition:transform .22s cubic-bezier(.16,1,.3,1);font-family:var(--font,"Plus Jakarta Sans",system-ui,sans-serif);overflow:hidden}' +
    '.qcm-scrim.in .qcm{transform:none}' +
    '.qcm.wide{max-width:600px}' +
    '.qcm-hd{padding:20px 22px 6px;display:flex;align-items:flex-start;justify-content:space-between;gap:12px}' +
    '.qcm-hd h3{font-family:var(--display,"Bricolage Grotesque",system-ui,sans-serif);font-size:19px;font-weight:800;letter-spacing:-.02em;margin:0;color:#0a1f44}' +
    '.qcm-sub{padding:0 22px;font-size:13px;color:#5b6b8c;line-height:1.5;margin-top:2px}' +
    '.qcm-x{border:0;background:#f1f4fb;color:#0a1f44;width:30px;height:30px;border-radius:50%;cursor:pointer;font-size:16px;line-height:1;flex:none}' +
    '.qcm-x:hover{background:#e3e9f5}' +
    '.qcm-bd{padding:14px 22px 6px;overflow-y:auto;display:grid;grid-template-columns:1fr 1fr;gap:12px 12px}' +
    '.qcm-f{grid-column:1/-1;display:flex;flex-direction:column;gap:5px;min-width:0}' +
    '.qcm-f.half{grid-column:span 1}' +
    '.qcm-f label{font-size:12px;font-weight:700;color:#0a1f44}' +
    '.qcm-f label i{color:#ff5a1f;font-style:normal;margin-left:2px}' +
    '.qcm-f input,.qcm-f select,.qcm-f textarea{width:100%;border:1.5px solid #dbe3f3;border-radius:10px;padding:10px 12px;font-size:14px;background:#fff;color:#0a1f44;outline:none;transition:border-color .15s,box-shadow .15s;font-family:inherit}' +
    '.qcm-f textarea{min-height:84px;resize:vertical}' +
    '.qcm-f input:focus,.qcm-f select:focus,.qcm-f textarea:focus{border-color:#ff5a1f;box-shadow:0 0 0 3px rgba(255,90,31,.16)}' +
    '.qcm-f.bad input,.qcm-f.bad select,.qcm-f.bad textarea{border-color:#d92d20;box-shadow:0 0 0 3px rgba(217,45,32,.1)}' +
    '.qcm-hint{font-size:11.5px;color:#7d8bab;line-height:1.4}' +
    '.qcm-rows{display:flex;flex-direction:column;gap:8px}' +
    '.qcm-row{display:flex;gap:6px;align-items:center}' +
    '.qcm-row input{padding:9px 10px;font-size:13px}' +
    '.qcm-row button{border:0;background:#fdeceb;color:#d92d20;border-radius:8px;width:32px;height:36px;cursor:pointer;flex:none;font-size:15px}' +
    '.qcm-add{align-self:flex-start;border:1.5px dashed #c8d3ec;background:#f7f9fe;color:#0a1f44;border-radius:10px;padding:7px 12px;font-size:12px;font-weight:700;cursor:pointer}' +
    '.qcm-add:hover{border-color:#ff5a1f;color:#ff5a1f}' +
    '.qcm-msg{padding:0 22px;font-size:14px;line-height:1.55;color:#33415f;white-space:pre-line}' +
    '.qcm-pre{margin:12px 22px 0;background:#f6f8fd;border:1px solid #e3e9f5;border-radius:10px;padding:12px;font-size:12.5px;white-space:pre-wrap;max-height:240px;overflow:auto;color:#0a1f44}' +
    '.qcm-err{margin:10px 22px 0;background:#fdeceb;color:#b42318;font-size:12.5px;font-weight:600;padding:9px 12px;border-radius:10px;display:none}' +
    '.qcm-ft{padding:16px 22px 20px;display:flex;gap:10px;justify-content:flex-end}' +
    '.qcm-btn{border:0;border-radius:11px;padding:11px 20px;font-size:14px;font-weight:700;cursor:pointer;font-family:inherit;transition:transform .15s,box-shadow .15s,opacity .15s}' +
    '.qcm-btn:active{transform:scale(.97)}' +
    '.qcm-btn.pri{background:linear-gradient(135deg,#ff5a1f,#ff8a3d);color:#fff;box-shadow:0 8px 20px rgba(255,90,31,.32)}' +
    '.qcm-btn.dng{background:#d92d20;color:#fff;box-shadow:0 8px 20px rgba(217,45,32,.28)}' +
    '.qcm-btn.sec{background:#eef2fb;color:#0a1f44}' +
    '.qcm-btn[disabled]{opacity:.6;cursor:wait}' +
    '.qcm-sp{width:14px;height:14px;border:2px solid rgba(255,255,255,.4);border-top-color:#fff;border-radius:50%;display:inline-block;vertical-align:-2px;margin-right:7px;animation:qcmSpin .7s linear infinite}' +
    '@keyframes qcmSpin{to{transform:rotate(360deg)}}' +
    '@media (max-width:520px){.qcm-scrim{align-items:flex-end;padding:0}.qcm{max-width:none;border-radius:18px 18px 0 0;max-height:92dvh}.qcm-bd{grid-template-columns:1fr}.qcm-f.half{grid-column:1/-1}}' +
    /* panel loading skeleton */
    '.qc-pl{position:relative}' +
    '.qc-pl-ov{position:absolute;inset:0;z-index:30;background:linear-gradient(180deg,#f6f8fd,#eef2fb);padding:4px 0;display:flex;flex-direction:column;gap:16px;animation:qcPlIn .15s ease both;pointer-events:none;border-radius:12px}' +
    '.qc-pl-ov.out{opacity:0;transition:opacity .28s ease}' +
    '@keyframes qcPlIn{from{opacity:0}to{opacity:1}}' +
    '.qc-sk{border-radius:12px;background:linear-gradient(90deg,#e6ecf8 25%,#f4f7fd 37%,#e6ecf8 63%);background-size:400% 100%;animation:qcSk 1.3s ease infinite}' +
    '@keyframes qcSk{0%{background-position:100% 50%}100%{background-position:0 50%}}' +
    '.qc-pl-stats{display:grid;grid-template-columns:repeat(4,1fr);gap:12px}' +
    '@media (max-width:700px){.qc-pl-stats{grid-template-columns:repeat(2,1fr)}}' +
    '.qc-pl-badge{position:absolute;top:10px;right:10px;display:flex;align-items:center;gap:8px;background:#0a1f44;color:#fff;font-size:11px;font-weight:700;padding:7px 12px;border-radius:999px;letter-spacing:.02em}' +
    '.qc-pl-badge b{width:12px;height:12px;border:2px solid rgba(255,255,255,.35);border-top-color:#ff8a3d;border-radius:50%;animation:qcmSpin .7s linear infinite}' +
    '.panel.on.qc-enter{animation:qcPanelIn .35s cubic-bezier(.16,1,.3,1) both}' +
    '@keyframes qcPanelIn{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}';
  var st = document.createElement('style'); st.id = 'qc-ui-css'; st.textContent = css;
  (document.head || document.documentElement).appendChild(st);

  var openCount = 0;
  function lock(on) {
    openCount += on ? 1 : -1;
    document.documentElement.style.overflow = openCount > 0 ? 'hidden' : '';
  }

  function mk(tag, cls, html) { var e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; }

  function shell(opts, bodyEl, footBtns, wide) {
    var scrim = mk('div', 'qcm-scrim');
    var box = mk('div', 'qcm' + (wide ? ' wide' : ''));
    box.setAttribute('role', 'dialog'); box.setAttribute('aria-modal', 'true');
    var hd = mk('div', 'qcm-hd', '<h3>' + escH(opts.title || '') + '</h3>');
    var x = mk('button', 'qcm-x', '&times;'); x.type = 'button'; x.setAttribute('aria-label', 'Close'); hd.appendChild(x);
    box.appendChild(hd);
    if (opts.sub) box.appendChild(mk('div', 'qcm-sub', escH(opts.sub)));
    box.appendChild(bodyEl);
    var err = mk('div', 'qcm-err'); box.appendChild(err);
    var ft = mk('div', 'qcm-ft'); footBtns.forEach(function (b) { ft.appendChild(b); }); box.appendChild(ft);
    scrim.appendChild(box); document.body.appendChild(scrim);
    lock(true);
    requestAnimationFrame(function () { scrim.classList.add('in'); });
    return { scrim: scrim, box: box, x: x, err: err, ft: ft };
  }
  function close(sh, cb) {
    sh.scrim.classList.remove('in');
    setTimeout(function () { if (sh.scrim.parentNode) sh.scrim.parentNode.removeChild(sh.scrim); lock(false); if (cb) cb(); }, 190);
  }

  function rowHtml(col, vals) {
    return '<div class="qcm-row">' + col.map(function (c) {
      var v = vals && vals[c.name] != null ? vals[c.name] : '';
      return '<input data-c="' + escH(c.name) + '" type="' + (c.type || 'text') + '" placeholder="' + escH(c.placeholder || c.label || '') + '" value="' + escH(v) + '" style="flex:' + (c.width || 1) + ';min-width:0"' + (c.step ? ' step="' + c.step + '"' : '') + '>';
    }).join('') + '<button type="button" data-del title="Remove">&times;</button></div>';
  }

  function fieldHtml(f) {
    var id = 'qcf_' + f.name, t = f.type || 'text', v = f.value == null ? '' : f.value;
    var lab = '<label for="' + id + '">' + escH(f.label || f.name) + (f.required ? '<i>*</i>' : '') + '</label>';
    var inner;
    if (t === 'textarea') inner = '<textarea id="' + id + '" name="' + escH(f.name) + '" placeholder="' + escH(f.placeholder || '') + '">' + escH(v) + '</textarea>';
    else if (t === 'select') {
      inner = '<select id="' + id + '" name="' + escH(f.name) + '">' + (f.options || []).map(function (o) {
        var ov = typeof o === 'object' ? o.value : o, ol = typeof o === 'object' ? (o.label != null ? o.label : o.value) : o;
        return '<option value="' + escH(ov) + '"' + (String(ov) === String(v) ? ' selected' : '') + '>' + escH(ol) + '</option>';
      }).join('') + '</select>';
    } else if (t === 'rows') {
      var init = Array.isArray(f.value) && f.value.length ? f.value : [{}];
      inner = '<div class="qcm-rows" data-rows="' + escH(f.name) + '">' + init.map(function (r) { return rowHtml(f.columns, r); }).join('') + '</div>' +
        '<button type="button" class="qcm-add" data-addrow="' + escH(f.name) + '">+ ' + escH(f.addLabel || 'Add row') + '</button>';
      lab = '<label>' + escH(f.label || f.name) + (f.required ? '<i>*</i>' : '') + '</label>';
    } else {
      inner = '<input id="' + id + '" name="' + escH(f.name) + '" type="' + t + '" value="' + escH(v) + '" placeholder="' + escH(f.placeholder || '') + '"' +
        (f.min != null ? ' min="' + f.min + '"' : '') + (f.max != null ? ' max="' + f.max + '"' : '') + (f.step ? ' step="' + f.step + '"' : (t === 'number' ? ' step="any"' : '')) +
        (t === 'number' || t === 'tel' ? ' inputmode="' + (t === 'tel' ? 'tel' : 'decimal') + '"' : '') + ' autocomplete="off">';
    }
    return '<div class="qcm-f' + (f.half ? ' half' : '') + '" data-f="' + escH(f.name) + '">' + lab + inner + (f.hint ? '<div class="qcm-hint">' + escH(f.hint) + '</div>' : '') + '</div>';
  }

  function form(opts) {
    opts = opts || {};
    return new Promise(function (resolve) {
      var fields = opts.fields || [];
      var body = mk('div', 'qcm-bd', fields.map(fieldHtml).join(''));
      var cancel = mk('button', 'qcm-btn sec', escH(opts.cancel || 'Cancel')); cancel.type = 'button';
      var ok = mk('button', 'qcm-btn ' + (opts.danger ? 'dng' : 'pri'), escH(opts.submit || 'Save')); ok.type = 'button';
      var sh = shell(opts, body, [cancel, ok], opts.wide || fields.some(function (f) { return f.type === 'rows'; }));
      var done = false, busy = false;

      function collect() {
        var out = {}, bad = null;
        fields.forEach(function (f) {
          var wrap = body.querySelector('[data-f="' + f.name + '"]'); wrap.classList.remove('bad');
          if (f.type === 'rows') {
            var rows = [].slice.call(wrap.querySelectorAll('.qcm-row')).map(function (r) {
              var o = {}, any = false;
              f.columns.forEach(function (c) { var el = r.querySelector('[data-c="' + c.name + '"]'); var val = el ? el.value.trim() : ''; if (val) any = true; o[c.name] = c.type === 'number' ? (val === '' ? '' : Number(val)) : val; });
              return any ? o : null;
            }).filter(Boolean);
            if (f.required && !rows.length) { wrap.classList.add('bad'); bad = bad || wrap; }
            out[f.name] = rows; return;
          }
          var el = wrap.querySelector('input,select,textarea'); var raw = el.value;
          var val = (f.type === 'password') ? raw : raw.trim();
          if (f.required && val === '') { wrap.classList.add('bad'); bad = bad || el; }
          if (f.type === 'number') { if (val !== '' && isNaN(Number(val))) { wrap.classList.add('bad'); bad = bad || el; } out[f.name] = val === '' ? '' : Number(val); }
          else out[f.name] = val;
        });
        return { out: out, bad: bad };
      }
      function finish(v) { if (done) return; done = true; close(sh, function () { resolve(v); }); }
      async function submit() {
        if (busy) return;
        var c = collect();
        if (c.bad) { sh.err.style.display = 'block'; sh.err.textContent = 'Please fill the highlighted fields.'; try { c.bad.focus(); } catch (e) { } return; }
        sh.err.style.display = 'none';
        if (typeof opts.validate === 'function') { var m = opts.validate(c.out); if (m) { sh.err.style.display = 'block'; sh.err.textContent = m; return; } }
        if (typeof opts.save === 'function') {
          busy = true; ok.disabled = true; cancel.disabled = true; var lbl = ok.innerHTML; ok.innerHTML = '<span class="qcm-sp"></span>Saving…';
          try { await opts.save(c.out); finish(c.out); }
          catch (e) { busy = false; ok.disabled = false; cancel.disabled = false; ok.innerHTML = lbl; sh.err.style.display = 'block'; sh.err.textContent = (e && e.message) ? e.message : 'Could not save. Please try again.'; }
        } else finish(c.out);
      }
      ok.onclick = submit; cancel.onclick = function () { if (!busy) finish(null); }; sh.x.onclick = cancel.onclick;
      sh.scrim.addEventListener('mousedown', function (e) { if (e.target === sh.scrim && !busy) finish(null); });
      sh.box.addEventListener('keydown', function (e) {
        if (e.key === 'Escape' && !busy) { e.stopPropagation(); finish(null); }
        else if (e.key === 'Enter' && e.target.tagName !== 'TEXTAREA' && e.target.tagName !== 'BUTTON') { e.preventDefault(); submit(); }
      });
      body.addEventListener('click', function (e) {
        var a = e.target.closest('[data-addrow]'), d = e.target.closest('[data-del]');
        if (a) {
          var f = fields.filter(function (x) { return x.name === a.getAttribute('data-addrow'); })[0];
          var holder = body.querySelector('[data-rows="' + f.name + '"]'); var tmp = mk('div', '', rowHtml(f.columns, {}));
          holder.appendChild(tmp.firstChild); var inp = holder.lastChild.querySelector('input'); if (inp) inp.focus();
        } else if (d) {
          var row = d.closest('.qcm-row'), parent = row.parentNode;
          if (parent.children.length > 1) parent.removeChild(row); else [].forEach.call(row.querySelectorAll('input'), function (i) { i.value = ''; });
        }
      });
      setTimeout(function () { var first = body.querySelector('input,select,textarea'); if (first) first.focus(); }, 60);
    });
  }

  function confirmBox(message, o) {
    o = Object.assign({}, o || {});
    var verb = (String(message).match(/^\s*([A-Za-z]+)/) || [])[1] || '';
    var destructive = /^(delete|remove|reject|revoke|discard|cancel|clear|reset|suspend)$/i.test(verb);
    if (o.danger === undefined) o.danger = destructive;
    if (!o.ok) o.ok = destructive ? verb.charAt(0).toUpperCase() + verb.slice(1).toLowerCase() : 'Yes, continue';
    if (!o.title) o.title = destructive ? 'Are you sure?' : 'Please confirm';
    return new Promise(function (resolve) {
      var body = mk('div', 'qcm-msg', escH(message)); body.style.padding = '10px 22px 4px';
      var cancel = mk('button', 'qcm-btn sec', escH(o.cancel || 'Cancel')); cancel.type = 'button';
      var ok = mk('button', 'qcm-btn ' + (o.danger ? 'dng' : 'pri'), escH(o.ok)); ok.type = 'button';
      var sh = shell({ title: o.title }, body, [cancel, ok], false);
      var done = false;
      function fin(v) { if (done) return; done = true; close(sh, function () { resolve(v); }); }
      ok.onclick = function () { fin(true); }; cancel.onclick = function () { fin(false); }; sh.x.onclick = cancel.onclick;
      sh.scrim.addEventListener('mousedown', function (e) { if (e.target === sh.scrim) fin(false); });
      sh.box.addEventListener('keydown', function (e) { if (e.key === 'Escape') { e.stopPropagation(); fin(false); } });
      sh.box.setAttribute('tabindex', '-1');
      setTimeout(function () { (o.danger ? cancel : ok).focus(); }, 60);
    });
  }

  function alertBox(message, o) {
    o = o || {};
    return new Promise(function (resolve) {
      var body = mk('div', 'qcm-msg', escH(message)); body.style.padding = '10px 22px 4px';
      var ok = mk('button', 'qcm-btn pri', 'OK'); ok.type = 'button';
      var sh = shell({ title: o.title || 'Notice' }, body, [ok], false);
      function fin() { close(sh, resolve); }
      ok.onclick = fin; sh.x.onclick = fin; setTimeout(function () { ok.focus(); }, 60);
    });
  }

  function textBox(title, text) {
    return new Promise(function (resolve) {
      var body = mk('div', '', ''); body.style.display = 'block';
      var pre = mk('div', 'qcm-pre', escH(text)); body.appendChild(pre);
      var copy = mk('button', 'qcm-btn sec', 'Copy'); copy.type = 'button';
      var ok = mk('button', 'qcm-btn pri', 'Done'); ok.type = 'button';
      var sh = shell({ title: title }, body, [copy, ok], true);
      copy.onclick = function () {
        var r = document.createRange(); r.selectNodeContents(pre); var s = window.getSelection(); s.removeAllRanges(); s.addRange(r);
        try { document.execCommand('copy'); copy.textContent = 'Copied ✓'; } catch (e) { }
      };
      function fin() { close(sh, resolve); }
      ok.onclick = fin; sh.x.onclick = fin;
    });
  }

  /* ───────────── panel loading skeleton ─────────────
     Shows a skeleton over a panel until the network is quiet (all fetches settled),
     for at least 450 ms so the page visibly "loads" like a real site. */
  var inflight = 0, waiters = [];
  var _fetch = window.fetch;
  if (_fetch && !_fetch.__qc) {
    window.fetch = function () {
      inflight++;
      var p = _fetch.apply(this, arguments);
      var d = function () { inflight = Math.max(0, inflight - 1); if (!inflight) setTimeout(flush, 120); };
      p.then(d, d); return p;
    };
    window.fetch.__qc = true;
  }
  function flush() { if (inflight) return; var w = waiters.splice(0); w.forEach(function (fn) { fn(); }); }

  function panelLoading(panel) {
    if (!panel) return;
    if (panel.__qcOv && panel.__qcOv.parentNode) panel.__qcOv.parentNode.removeChild(panel.__qcOv);
    panel.classList.add('qc-pl');
    var ov = mk('div', 'qc-pl-ov',
      '<div class="qc-sk" style="height:34px;width:38%"></div><div class="qc-sk" style="height:14px;width:58%;margin-top:-8px"></div>' +
      '<div class="qc-pl-stats"><div class="qc-sk" style="height:84px"></div><div class="qc-sk" style="height:84px"></div><div class="qc-sk" style="height:84px"></div><div class="qc-sk" style="height:84px"></div></div>' +
      '<div class="qc-sk" style="height:46px"></div><div class="qc-sk" style="height:46px;opacity:.85"></div><div class="qc-sk" style="height:46px;opacity:.7"></div><div class="qc-sk" style="height:46px;opacity:.55"></div>' +
      '<div class="qc-pl-badge"><b></b>Loading…</div>');
    panel.appendChild(ov); panel.__qcOv = ov;
    var started = Date.now(), gone = false;
    function remove() {
      if (gone) return; gone = true;
      ov.classList.add('out'); setTimeout(function () { if (ov.parentNode) ov.parentNode.removeChild(ov); panel.classList.remove('qc-pl'); }, 300);
      panel.classList.remove('qc-enter'); void panel.offsetWidth; panel.classList.add('qc-enter');
      try { QCFlow.done(); } catch (e) { }
    }
    function tryDone() {
      var wait = Math.max(0, 450 - (Date.now() - started));
      setTimeout(function () { if (inflight) waiters.push(tryDone); else remove(); }, wait);
    }
    try { QCFlow.start(); } catch (e) { }
    setTimeout(function () { if (inflight) waiters.push(tryDone); else tryDone(); }, 220);   // let the panel's own loader start its requests first
    setTimeout(remove, 9000);                                                                 // never hang
  }

  window.QC = { __ui: true, form: form, prompt: function (label, o) {
      o = o || {};
      return form({ title: o.title || label, sub: o.sub, submit: o.ok || 'OK', fields: [{ name: 'v', label: o.title ? label : '', type: o.type || 'text', value: o.value, placeholder: o.placeholder, required: !!o.required, hint: o.hint }] })
        .then(function (r) { return r ? r.v : null; });
    }, confirm: confirmBox, alert: alertBox, text: textBox, panelLoading: panelLoading, esc: escH };
})();
