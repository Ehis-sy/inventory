/* GANKCO Nest 2.6: maintenance lock (screens, banners, Settings) and alert emails (Settings, My account) */
'use strict';

// ================================================================ MAINTENANCE: state
const MAINT_APPS = { all: 'All of Nest', inventory: 'Inventory', po: 'Purchase Order', proforma: 'Proforma Invoice & Quote' };
const MAINT_DESC = {
  all: 'Everyone sees the maintenance screen. Use this for Nest updates.',
  inventory: 'Only the Inventory app is locked. Other apps keep working.',
  po: 'Only the Purchase Order app is locked.',
  proforma: 'Only the Proforma Invoice & Quote app is locked.' };
const I_WRENCH = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/></svg>';
const I_CLOCK = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>';
S.maint = { wins: [], sig: '' };

async function loadMaint() {
  try { S.maint.wins = await q(sb.from('maintenance_windows').select('*').is('ended_at', null).order('starts_at')); }
  catch (e) { S.maint.wins = []; }
}
const mTesters = () => { const t = setting('maintenance_testers', []); return Array.isArray(t) ? t : []; };
const maintExempt = () => realSuper() || mTesters().includes(S.profile?.id);
const mStarted = w => new Date(w.starts_at) <= new Date();
// the window that affects an app right now ('all' windows affect every app)
const maintWin = scope => S.maint.wins.find(w => mStarted(w) && (w.scope === 'all' || w.scope === scope));
const maintLocked = scope => { const w = scope === 'all' ? S.maint.wins.find(w => mStarted(w) && w.scope === 'all') : maintWin(scope); return w && !maintExempt() ? w : null; };
const mNoticeWins = scope => S.maint.wins.filter(w => !mStarted(w) && w.notice_from && new Date(w.notice_from) <= new Date() && (w.scope === 'all' || scope === 'launcher' || w.scope === scope));
const mDismissed = id => { try { return (JSON.parse(localStorage.getItem('nest.mdismiss') || '[]')).includes(id); } catch (e) { return false; } };
const mDismiss = id => { try { const a = JSON.parse(localStorage.getItem('nest.mdismiss') || '[]'); a.push(id); localStorage.setItem('nest.mdismiss', JSON.stringify(a.slice(-30))); } catch (e) { } };
const mTime = d => new Date(d).toLocaleTimeString('en-GB', { hour: 'numeric', minute: '2-digit', hour12: true }).replace(' ', ' ').replace(' ', ' ');
const mWhen = d => { const x = new Date(d), n = new Date(); const same = x.toDateString() === n.toDateString();
  const tmr = new Date(n.getTime() + 864e5).toDateString() === x.toDateString();
  return same ? `today at ${mTime(d)}` : tmr ? `tomorrow at ${mTime(d)}` : `${x.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })} at ${mTime(d)}`; };
const mBack = w => !w.back_by ? null : new Date(w.back_by) < new Date() ? 'late' : (new Date(w.back_by).toDateString() === new Date().toDateString() ? mTime(w.back_by) : `${new Date(w.back_by).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })}, ${mTime(w.back_by)}`);
const mLen = w => { if (!w.back_by) return ''; const m = Math.round((new Date(w.back_by) - new Date(w.starts_at)) / 6e4); return m >= 90 ? `about ${Math.round(m / 60)} hours` : `about ${m} minutes`; };
const maintSig = () => JSON.stringify([maintLocked('all')?.id, maintLocked('inventory')?.id, maintWin('inventory')?.id, maintWin('all')?.id, maintLocked('po')?.id, maintWin('po')?.id,
  mNoticeWins('launcher').map(w => w.id), S.maint.wins.map(w => w.id + ':' + w.back_by), maintExempt()]);

// ================================================================ MAINTENANCE: what people see
// Called by render(): returns true when a maintenance screen was shown instead of the page
function maintGate(r) {
  const all = maintLocked('all');
  if (all) { renderMaintScreen(all, 'all'); return true; }
  const app = r === 'po' ? 'po' : 'inventory';
  if (r && r !== 'home') { const w = maintLocked(app); if (w) { renderMaintScreen(w, app); return true; } }
  S.maint.screen = null;
  return false;
}
function renderMaintScreen(w, scope) {
  S.shellReady = false; S.maint.screen = scope;
  const app = scope === 'all' ? 'Nest' : MAINT_APPS[w.scope];
  const back = mBack(w);
  const msg = w.message || (scope === 'all' ? 'Nest is being updated to a new version. Your data is safe.' : `The ${app} app is being updated. Your data is safe.`);
  $('#app').innerHTML = `<div class="maint-screen" role="main"><div class="maint-card"><img class="eagle" src="brand/mark.png" alt=""><div>${wordmark()}<div class="sublock">NEST</div></div>
    <div class="maint-pill">${I_WRENCH}${scope === 'all' ? 'Under maintenance' : `${esc(app)} · under maintenance`}</div>
    <h1>${scope === 'all' ? 'We’re updating Nest' : `The ${esc(app)} app is being updated`}</h1>
    <p class="msg">${esc(msg)}${scope !== 'all' ? ' The rest of Nest is working as normal.' : ''}</p>
    <div class="maint-eta"><div><span>Started</span><b>${mTime(w.starts_at)}</b></div><div><span>Back by</span><b>${back === 'late' ? 'Soon' : back ? esc(back) : 'Soon'}</b></div></div>
    ${back === 'late' ? '<p class="note" style="color:#F7C75C">Taking a little longer than planned. Thanks for your patience.</p>' : ''}
    ${scope !== 'all' ? `<div style="margin-top:28px"><a class="btn primary maint-home" href="#/">Back to Nest home</a></div>` : '<div class="maint-bar"><i></i></div>'}
    <p class="note">${scope === 'all' ? 'This page reloads by itself when Nest is ready.' : `This page reopens the ${esc(app)} app by itself when it’s ready.`} <a href="#" id="m-out">Sign out</a></p></div>
    <div class="maint-foot">${esc(CFG.COMPANY || '')} · ${esc(CFG.MOTTO || '')}</div></div>`;
  $('#m-out').onclick = e => { e.preventDefault(); sb.auth.signOut(); };
}
// Banners: heads-up before maintenance, and the "maintenance is on" bar for the Super Admin and testers
function maintBars(scope, inApp) {
  let h = '';
  const on = maintExempt() ? (scope === 'launcher' ? S.maint.wins.filter(mStarted) : [maintWin(scope)].filter(Boolean)) : [];
  on.forEach(w => {
    const names = mTesters().map(id => personName(id)).filter(Boolean);
    h += `<div class="mbanner on${inApp ? ' inapp' : ''}"><span class="mb-ico">${I_WRENCH}</span><span><b>${w.scope === 'all' ? 'Maintenance mode is on' : `${esc(MAINT_APPS[w.scope])} is under maintenance`}</b> · only ${realSuper() ? 'you' : 'the Super Admin'}${names.length ? ` and testers (${esc(names.join(', '))})` : ''} can use ${w.scope === 'all' ? 'Nest' : 'it'}. Everyone else sees the maintenance screen${mBack(w) && mBack(w) !== 'late' ? ` until ${esc(mBack(w))}` : ''}.</span>
      ${realSuper() ? `<button class="btn small" data-mend="${w.id}">Turn off maintenance</button>` : ''}</div>`;
  });
  mNoticeWins(scope).filter(w => !mDismissed(w.id)).forEach(w => {
    h += `<div class="mbanner${inApp ? ' inapp' : ''}"><span class="mb-ico">${I_CLOCK}</span><span><b>Scheduled maintenance ${esc(mWhen(w.starts_at))}</b> · ${w.scope === 'all' ? 'Nest' : `The ${esc(MAINT_APPS[w.scope])} app`} will be unavailable${mLen(w) ? ` for ${mLen(w)}` : ''} while it’s updated. Save your work before then.</span>
      <button class="mb-x" data-mx="${w.id}" aria-label="Dismiss">×</button></div>`;
  });
  return h;
}
function bindMaintBars(root) {
  $$('[data-mx]', root).forEach(b => b.onclick = () => { mDismiss(+b.dataset.mx); b.closest('.mbanner').remove(); });
  $$('[data-mend]', root).forEach(b => b.onclick = async () => {
    b.disabled = true;
    try { await q(sb.rpc('end_maintenance', { p_id: +b.dataset.mend })); await loadMaint(); S.maint.sig = maintSig(); toast('Maintenance is off. Everyone can use Nest again.'); render({ quiet: true }); }
    catch (e) { toast(niceError(e), true); b.disabled = false; }
  });
}
// Launcher tile states
function maintTile(scope) {
  const w = maintWin(scope); if (!w) return null;
  const back = mBack(w);
  return { cls: maintExempt() ? 'maint-open' : 'maint', badge: `<span class="t-maint">${I_WRENCH}Under maintenance</span>`,
    meta: maintExempt() ? `${I_CLOCK}Testers only · back by ${back && back !== 'late' ? esc(back) : 'soon'}` : `${I_CLOCK}${back === 'late' ? 'Back soon' : back ? 'Back by ' + esc(back) : 'Back soon'}` };
}
// Live changes and the clock
async function onMaintChange() {
  const wasScreen = S.maint.screen;
  await loadMaint();
  const sig = maintSig(); if (sig === S.maint.sig) return; S.maint.sig = sig;
  if (wasScreen && !maintLocked(wasScreen) && !maintLocked('all')) { location.reload(); return; }
  if (!document.querySelector('dialog[open]')) render({ quiet: true });
}
function maintTick() {
  const sig = maintSig();
  if (sig !== S.maint.sig) { S.maint.sig = sig; if (!document.querySelector('dialog[open]')) render({ quiet: true }); }
}
setInterval(() => { if (S.session && isActive()) { maintTick(); } }, 30000);
setInterval(() => { if (S.session && isActive()) onMaintChange(); }, 120000);

// ================================================================ MAINTENANCE: Settings panel (Super Admin)
function maintPanel() {
  const wins = S.maint.wins;
  const testers = mTesters().map(id => personName(id)).filter(Boolean);
  const card = w => {
    const started = mStarted(w), back = mBack(w);
    return `<div class="mwin ${started ? 'on' : ''}">
      <div class="mwin-top"><b>${esc(MAINT_APPS[w.scope])}</b>${started ? chip('overdue', 'On now') : chip('pending', 'Scheduled')}</div>
      <div class="mwin-msg">${esc(w.message || (w.scope === 'all' ? 'Nest is being updated to a new version. Your data is safe.' : `The ${MAINT_APPS[w.scope]} app is being updated.`))}</div>
      <dl class="kv mwin-kv"><dt>${started ? 'Started' : 'Starts'}</dt><dd>${fdt(w.starts_at)}</dd><dt>Back by</dt><dd>${w.back_by ? fdt(w.back_by) + (back === 'late' ? ' ' + chip('overdue', 'running late') : '') : '—'}</dd>
        ${!started ? `<dt>Heads-up</dt><dd>${w.notice_from ? 'From ' + fdt(w.notice_from) : 'None'}</dd>` : ''}<dt>Set by</dt><dd>${esc(w.created_by_name || '')}</dd></dl>
      <div class="actionrow">${started ? `<button class="btn small" data-mext="${w.id}" data-min="15">+15 min</button><button class="btn small" data-mext="${w.id}" data-min="30">+30 min</button>
        <button class="btn small primary" data-mend="${w.id}">End maintenance</button>` : `<button class="btn small danger" data-mend="${w.id}">Cancel</button>`}</div></div>`;
  };
  return `<section class="panel" id="maint"><header><h2>Maintenance</h2>${wins.some(mStarted) ? chip('overdue', 'On now') : wins.length ? chip('pending', 'Scheduled') : chip('ok', 'Off')}
      <div class="right"><button class="btn small primary" type="button" id="m-new">${I_WRENCH}Schedule maintenance</button></div></header><div class="body">
    <p class="muted">Lock all of Nest or a single app while you update it. People see a maintenance screen with your message and the time it’s back, and nothing can be saved until you end it. You and your testers can still use Nest to check the update.</p>
    ${wins.length ? `<div class="mwins">${wins.map(card).join('')}</div>` : ''}
    <div class="mtesters"><div><b>Testers</b><div class="sub">${testers.length ? esc(testers.join(', ')) : 'No testers yet. Only you can use Nest during maintenance.'}</div></div>
      <button class="btn small" type="button" id="m-test">${ico('users')}Choose testers</button></div></div></section>`;
}
function bindMaintPanel(main) {
  bindMaintBars(main);
  const nw = $('#m-new', main); if (nw) nw.onclick = scheduleMaint;
  const tt = $('#m-test', main); if (tt) tt.onclick = chooseTesters;
  $$('[data-mext]', main).forEach(b => b.onclick = async () => {
    try { await q(sb.rpc('extend_maintenance', { p_id: +b.dataset.mext, p_minutes: +b.dataset.min })); await loadMaint(); toast(`Back-by time moved ${b.dataset.min} minutes later`); render({ quiet: true }); }
    catch (e) { toast(niceError(e), true); }
  });
}
function scheduleMaint() {
  const pad = n => String(n).padStart(2, '0');
  const local = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  const later = new Date(); later.setHours(later.getHours() + 3, 0, 0, 0);
  return modal({
    title: 'Schedule maintenance', submit: 'Schedule', wide: true,
    sub: 'Everyone affected sees your message and the back-by time. You can extend it or end it early.',
    body: `<div class="pjf-sec">What to lock</div>
      <div class="mscope">${Object.entries(MAINT_APPS).map(([k, l], i) => `<label class="mopt"><input type="radio" name="scope" value="${k}" ${i === 0 ? 'checked' : ''}><span><b>${esc(l)}</b><span class="sub">${esc(MAINT_DESC[k])}</span></span></label>`).join('')}</div>
      <div class="pjf-sec">When</div>
      <div class="segi" id="m-when"><label><input type="radio" name="when" value="now" checked><span>Start now</span></label><label><input type="radio" name="when" value="later"><span>Schedule for later</span></label></div>
      <div class="row3 mt">
        <label class="f m-later" hidden>Starts<input type="datetime-local" name="starts" value="${local(later)}"></label>
        <label class="f">Back by<input type="datetime-local" name="back" required></label>
        <label class="f m-later" hidden>Heads-up banner<select name="notice"><option value="0">No heads-up</option><option value="30">30 minutes before</option><option value="60">1 hour before</option><option value="120" selected>2 hours before</option><option value="1440">1 day before</option></select></label></div>
      <label class="f">Message<span class="hint">Optional. Shown on the maintenance screen.</span><textarea name="message" rows="2" placeholder="Nest is being updated to a new version. Your data is safe."></textarea></label>`,
    onOpen: d => {
      const f = $('form', d), back = $('[name=back]', d);
      const setBack = () => { const now = f.when.value === 'later' ? new Date(f.starts.value) : new Date(); back.value = local(new Date(now.getTime() + 30 * 6e4)); };
      $$('[name=when]', d).forEach(r => r.onchange = () => { $$('.m-later', d).forEach(x => x.hidden = f.when.value !== 'later'); setBack(); });
      $('[name=starts]', d).onchange = setBack; setBack();
    },
    onSubmit: async x => {
      const starts = x.when === 'later' ? new Date(x.starts) : new Date();
      if (x.when === 'later' && !(starts > new Date())) throw new Error('Choose a start time in the future, or pick Start now.');
      if (!x.back) throw new Error('Choose the back-by time.');
      const back = new Date(x.back); if (!(back > starts)) throw new Error('The back-by time must be after the start.');
      await q(sb.rpc('schedule_maintenance', { p_scope: x.scope, p_message: x.message || '', p_starts_at: starts.toISOString(), p_back_by: back.toISOString(), p_notice_minutes: x.when === 'later' ? +x.notice : 0 }));
      await loadMaint(); S.maint.sig = maintSig();
      toast(x.when === 'later' ? `Maintenance scheduled for ${mWhen(starts)}` : `${MAINT_APPS[x.scope]} is now under maintenance`); render({ quiet: true });
    }
  });
}
function chooseTesters() {
  const cur = new Set(mTesters());
  const ppl = Object.values(S.people).filter(p => ['admin', 'staff'].includes(p.role)).sort((a, b) => (a.full_name || a.email).localeCompare(b.full_name || b.email));
  return modal({
    title: 'Testers', submit: 'Save testers',
    sub: 'Testers can use Nest during maintenance, to help check an update before everyone comes back.',
    body: ppl.length ? `<div class="checklist">${ppl.map(p => `<label class="checkrow"><input type="checkbox" name="t_${p.id}" ${cur.has(p.id) ? 'checked' : ''}><span><b>${esc(p.full_name || p.email)}</b><span class="sub">${esc(ROLE_LABEL[p.role])}${p.job_title ? ' · ' + esc(p.job_title) : ''}</span></span></label>`).join('')}</div>` : '<div class="empty">No admins or staff yet.</div>',
    onSubmit: async x => {
      const ids = Object.keys(x).filter(k => k.startsWith('t_') && x[k]).map(k => k.slice(2));
      await q(sb.rpc('set_maintenance_testers', { p_ids: ids })); await loadLookups(); toast(ids.length ? `${plural(ids.length, 'tester')} saved` : 'No testers'); render({ quiet: true });
    }
  });
}

// ================================================================ ALERT EMAILS: Settings panel (Super Admin)
async function alertsPanel() {
  const a = setting('alerts', {}) || {};
  let st = null; try { st = await q(sb.rpc('alert_status')); } catch (e) { st = null; }
  const s = st?.state || {};
  const recent = (st?.recent || []).slice(0, 8);
  const why = r => { let m = ''; try { const j = JSON.parse(r.answer || ''); m = j.message || j.code || ''; } catch (e) { m = (r.answer || '').slice(0, 160); }
    const hint = r.status_code === 401 ? 'The API key is wrong, or Brevo is blocking unknown IP addresses (Brevo → Security → Authorised IPs).' : r.status_code === 400 ? 'Brevo didn’t accept the email: check the sender address is verified in Brevo.' : r.status_code === 402 ? 'The Brevo account has run out of email credits.' : r.status_code === 429 ? 'Too many emails at once: Brevo will accept them again shortly.' : '';
    return `${m ? `<div class="sub">Brevo: “${esc(m)}”</div>` : ''}${hint ? `<div class="sub">${esc(hint)}</div>` : ''}`; };
  const res = r => r.error ? `<span class="neg">${esc(r.error)}</span>` : r.status_code == null ? '<span class="sub">Sending…</span>' : r.status_code < 300 ? '<span class="pos">Accepted by Brevo</span>' : `<span class="neg">Brevo said ${r.status_code}</span>${why(r)}`;
  const ppl = Object.values(S.people).filter(p => !['pending', 'disabled'].includes(p.role)).sort((x, y) => (x.full_name || x.email).localeCompare(y.full_name || y.email));
  return `<section class="panel" id="alerts"><header><h2>Alert emails</h2>${!a.enabled ? chip('muted', 'Paused') : a.test_mode ? chip('pending', 'Test mode') : chip('ok', 'On for everyone')}</header><div class="body">
    <p class="muted">A morning email at <b>7:30 am, Monday to Friday</b> with each person’s own to-dos, and a <b>Monday</b> email with low stock and faulty items (Management get a weekly summary). Sent from nest-alerts@gankcoenergy.com. Nobody gets an empty email.</p>
    <div class="astatus">
      <div class="${st?.key ? 'ok' : 'bad'}"><b>${st?.key ? '✔' : '✖'} Brevo API key</b><span>${st?.key ? 'Found in Supabase Vault' : 'Missing: add it in Supabase (see the 2.6 setup guide)'}</span></div>
      <div class="${st?.schedule ? 'ok' : 'bad'}"><b>${st?.schedule ? '✔' : '✖'} Schedule</b><span>${st?.schedule ? '7:30 am Mon–Fri · Monday 7:35 am' : 'Not set up: run the 2.6 SQL file again after switching on pg_cron'}</span></div>
      <div><b>Last daily run</b><span>${s.last_daily_on ? `${fd(s.last_daily_on)} · ${plural(+s.last_daily_sent || 0, 'email')}` : 'Not yet'}</span></div>
      <div><b>Last Monday run</b><span>${s.last_weekly_on ? `${fd(s.last_weekly_on)} · ${plural(+s.last_weekly_sent || 0, 'email')}` : 'Not yet'}</span></div></div>
    <form id="af" class="aform">
      <label class="switch"><input type="checkbox" name="enabled" ${a.enabled !== false ? 'checked' : ''}><span class="sw"></span><span><b>Send alert emails</b><span class="sub">Turn off to pause every alert email.</span></span></label>
      <label class="switch"><input type="checkbox" name="test_mode" ${a.test_mode !== false ? 'checked' : ''}><span class="sw"></span><span><b>Test mode</b><span class="sub">Only Super Admins receive the scheduled emails. Turn off when you’re happy, to send them to everyone.</span></span></label>
      <div><button class="btn primary" type="submit">Save</button></div></form>
    <div class="atry"><div class="pjf-sec">Try it</div>
      <div class="row3"><label class="f">Email for<select id="a-as">${ppl.map(p => opt(p.id, `${p.full_name || p.email} · ${ROLE_LABEL[p.role]}`, S.profile.id)).join('')}</select></label>
        <label class="f">Which email<select id="a-kind"><option value="daily">Daily (7:30 am)</option><option value="weekly">Monday</option></select></label>
        <div class="f atry-btns"><span>&nbsp;</span><div class="actionrow"><button class="btn" type="button" id="a-prev">${ico('pdf')}Preview</button><button class="btn tagbtn" type="button" id="a-send">Send to me now</button></div></div></div>
      <div class="sub">Shows exactly what that person would get today, using live data. “Send to me now” emails it to you, marked [Test].</div></div>
    ${recent.length ? `<div class="pjf-sec">Recent emails</div><div class="tablewrap"><table class="t stack"><thead><tr><th>Sent</th><th>To</th><th>Subject</th><th>Result</th></tr></thead><tbody>
      ${recent.map(r => `<tr><td class="nowrap">${fdt(r.sent_at)}</td><td>${esc(r.email || '')}${r.test ? ' ' + chip('muted', 'test') : ''}</td><td class="full">${esc(r.subject || '')}</td><td>${res(r)}</td></tr>`).join('')}</tbody></table></div>` : ''}
  </div></section>`;
}
function bindAlertsPanel(main) {
  const f = $('#af', main); if (!f) return;
  f.onsubmit = async e => {
    e.preventDefault();
    try { await q(sb.rpc('save_alert_settings', { p_enabled: f.enabled.checked, p_test_mode: f.test_mode.checked })); await loadLookups(); toast(!f.enabled.checked ? 'Alert emails paused' : f.test_mode.checked ? 'Saved: test mode, only Super Admins get them' : 'Saved: alert emails go to everyone'); render({ quiet: true }); }
    catch (ex) { toast(niceError(ex), true); }
  };
  const as = () => $('#a-as', main).value, kind = () => $('#a-kind', main).value;
  $('#a-prev', main).onclick = async () => {
    try {
      const e = await q(sb.rpc('preview_alert', { p_kind: kind(), p_as: as() }));
      if (!e) return toast(`${personName(as())} has nothing in the ${kind() === 'daily' ? 'daily' : 'Monday'} email today, so it wouldn’t be sent.`);
      modal({ title: e.subject, submit: '', cancel: 'Close', wide: true, sub: `Preview of the email for ${esc(personName(as()))}`,
        body: '<iframe class="aprev" title="Email preview"></iframe>', onOpen: d => { const fr = $('iframe', d); fr.srcdoc = e.html.replace(/https?:\/\/[^"']+\/brand\/logo-full\.png/g, 'brand/logo-full.png'); fr.onload = () => { fr.style.height = Math.min(fr.contentDocument.body.scrollHeight + 10, 4000) + 'px'; }; } });
    } catch (ex) { toast(niceError(ex), true); }
  };
  $('#a-send', main).onclick = async ev => {
    const b = ev.currentTarget; b.disabled = true;
    try { const r = await q(sb.rpc('send_test_alert', { p_kind: kind(), p_as: as() })); toast(r.sent ? `Sent to ${r.to}. Check your inbox (and spam the first time).` : r.message); setTimeout(() => render({ quiet: true }), 2500); }
    catch (ex) { toast(niceError(ex), true); } finally { b.disabled = false; }
  };
}

// ================================================================ ALERT EMAILS: My account
function myAlertsPanel() {
  const p = S.profile; const on = p.email_alerts !== false;
  const what = isMgmt() ? 'a <b>Monday weekly summary</b>: stock, Job planner readiness, ship-in cost and sign-offs'
    : isAdmin() ? 'a <b>7:30 am summary</b> (Monday to Friday) of what needs you, and a <b>Monday</b> email with low stock and faulty items'
    : 'a <b>7:30 am summary</b> (Monday to Friday) of your own to-dos: receipts to confirm, items due back, the monthly count';
  return `<section class="panel"><header><h2>Email alerts</h2>${on ? chip('ok', 'On') : chip('muted', 'Off')}</header><div class="body">
    <p class="muted">Nest sends you ${what}. Only on days when there’s something for you.</p>
    <label class="switch"><input type="checkbox" id="my-alerts" ${on ? 'checked' : ''}><span class="sw"></span><span><b>Email me these alerts</b><span class="sub">Sent to ${esc(p.email)}</span></span></label></div></section>`;
}
function bindMyAlerts(main) {
  const c = $('#my-alerts', main); if (!c) return;
  c.onchange = async () => {
    try { await q(sb.rpc('set_email_alerts', { p_on: c.checked })); S.profile.email_alerts = c.checked; toast(c.checked ? 'Alert emails on' : 'Alert emails off'); render({ quiet: true }); }
    catch (e) { c.checked = !c.checked; toast(niceError(e), true); }
  };
}
