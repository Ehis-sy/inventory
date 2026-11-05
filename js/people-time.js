/* GANKCO Nest 3.0.3 — PeopleCore: Discover, Leave, Company (announcements, policies, holidays), HR Time & pay and Engage, leave settings */
'use strict';

const MOODS = [[1, '😄', 'Happy'], [2, '🤩', 'Excited'], [3, '🙏', 'Grateful'], [4, '😌', 'Relaxed'], [5, '😰', 'Stressed'], [6, '😠', 'Angry'], [7, '😔', 'Sad']];
const LEAVE_ST = { pending: ['pending', 'Waiting'], approved: ['ok', 'Approved'], rejected: ['rejected', 'Not approved'], cancelled: ['muted', 'Cancelled'] };
const OUT_CHIP = { leave: 'pending', training: 'reserved', job: 'out' };
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const thisYear = () => +localISO(0).slice(0, 4);
const fdd = d => d ? new Date(String(d).slice(0, 10) + 'T00:00:00').toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' }) : '—';
const nDays = n => `${+n % 1 ? (+n).toFixed(1) : +n} ${+n === 1 ? 'day' : 'days'}`;
const hrRange = (a, b) => a === b ? fdd(a) : `${fdd(a)} – ${fdd(b)}`;
function hrOpenFile(f) {
  if (!f?.data) return toast('That file is empty', true);
  const bin = atob(f.data); const a = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) a[i] = bin.charCodeAt(i);
  const url = URL.createObjectURL(new Blob([a], { type: f.mime || 'application/octet-stream' }));
  const w = /pdf|image/.test(f.mime || '') ? window.open(url, '_blank') : null;
  if (!w) { const l = document.createElement('a'); l.href = url; l.download = f.file_name || 'file'; l.click(); }
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}
const hrReadFile = file => new Promise((res, rej) => { if (!file) return res(null); if (file.size > 8 * 1024 * 1024) return rej(new Error(`${file.name} is bigger than 8 MB`));
  const r = new FileReader(); r.onload = () => res({ file_name: file.name, mime: file.type, data: String(r.result).split(',')[1] }); r.onerror = () => rej(new Error('The file couldn’t be read')); r.readAsDataURL(file); });
const hrText = t => esc(t || '').replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1" target="_blank" rel="noopener">$1</a>').replace(/\n/g, '<br>');

// working days between two dates (no weekends or public holidays), like the database counts them
let HR_HOL = { at: 0, days: new Set(), list: [] };
async function hrHolidays() {
  if (HR_HOL.at && Date.now() - HR_HOL.at < 300000) return HR_HOL;
  const list = await q(sb.from('hr_holidays').select('*').order('day')).catch(() => []);
  HR_HOL = { at: Date.now(), list, days: new Set(list.map(h => h.day)) };
  return HR_HOL;
}
function hrCountDays(from, to, working) {
  if (!from || !to || to < from) return 0;
  let n = 0; const d = new Date(from + 'T00:00:00'), e = new Date(to + 'T00:00:00');
  for (; d <= e; d.setDate(d.getDate() + 1)) { const iso = localDay(d); const wd = d.getDay(); if (!working || (wd !== 0 && wd !== 6 && !HR_HOL.days.has(iso))) n++; }
  return n;
}
const localDay = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

// ================================================================ DISCOVER
const hrDiscover = {
  async load() {
    const me = hrMe(); const first = (me?.preferred_name || me?.first_name || (S.profile.full_name || '').split(' ')[0] || '');
    const [dz, feed] = await Promise.all([q(sb.rpc('hr_discover')), q(sb.rpc('hr_feed'))]);
    this.dz = dz;
    const hour = +new Date().toLocaleString('en-GB', { hour: 'numeric', hour12: false, timeZone: 'Africa/Lagos' });
    const hello = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
    const ann = feed.announcements, toConfirm = ann.filter(a => a.require_confirm && !a.confirmed_at), polConfirm = feed.policies.filter(p => p.require_confirm && !p.confirmed_at);
    const needs = [
      ...S.hr.appr.slice(0, 4).map(r => ({ i: 'check', t: r.title, s: `${r.who || ''} · waiting for you`, a: '#/people/approvals', b: 'Review' })),
      ...(S.hr.appr.length > 4 ? [{ i: 'check', t: `${S.hr.appr.length - 4} more to approve`, s: '', a: '#/people/approvals', b: 'Open' }] : []),
      ...toConfirm.map(a => ({ i: 'bell', t: `Read and confirm: ${a.title}`, s: 'Announcement from HR', a: '#/people/company/announcements', b: 'Read' })),
      ...polConfirm.map(p => ({ i: 'audit', t: `Read and confirm: ${p.title}`, s: `Policy · version ${p.version}`, a: '#/people/company/policies', b: 'Read' }))];
    const bal = dz.balance; const next = dz.holidays[0]; const toNext = next ? Math.round((new Date(next.day + 'T00:00:00') - new Date(localISO(0) + 'T00:00:00')) / 864e5) : null;
    const c = dz.celebrations; const outT = dz.out;
    let hr = '';
    if (isHR()) {
      const all = await q(sb.from('hr_employees').select('id,status,position_id,profile_id,confirmation_due,confirmed_on'));
      const act = all.filter(e => e.status === 'active');
      const conf = act.filter(e => e.confirmation_due && !e.confirmed_on && hrDays(e.confirmation_due) <= 30), noLink = act.filter(e => !e.profile_id);
      const filled = new Set(act.map(e => e.position_id)); const vacant = S.hr.positions.filter(p => p.active && !p.is_external && !filled.has(p.id));
      hr = `<section class="panel full"><header><h2>HR at a glance</h2><span class="meta">Only HR sees this</span><div class="right"><a class="btn small" href="#/people/staff">${ico('audit')}Staff records</a></div></header>
        <div class="board b4 hr-board"><a class="kpi" href="#/people/staff"><div class="n">${act.length}</div><div class="l">Active staff</div></a>
          <a class="kpi ${conf.length ? 'warn' : ''}" href="#/people/staff?v=confirm"><div class="n">${conf.length}</div><div class="l">Confirmations due in 30 days</div></a>
          <a class="kpi" href="#/people/org"><div class="n">${vacant.length}</div><div class="l">Vacant positions</div></a>
          <a class="kpi ${noLink.length ? 'warn' : ''}" href="#/people/staff?v=nolink"><div class="n">${noLink.length}</div><div class="l">Not linked to a Nest sign-in</div></a></div></section>`;
    }
    return `<div class="dz">
      <section class="dz-greet full"><img class="bgmark" src="brand/mark.png" alt="">
        <h1>${hello}${first ? ', ' + esc(first) : ''}</h1><div class="sub">${new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'Africa/Lagos' })}${me?.card?.title ? ' · ' + esc(me.card.title) : ''}</div>
        <div class="hr-qa bare"><a href="#/people/work/leave?apply=1">${ico('plan')}Apply for leave</a><a href="#/people/work/requisition">${ico('plus')}New requisition</a><a href="#/people/pay">${ico('pay')}My payslip</a><a href="#/people/me">${ico('user')}My profile</a></div>
        ${me ? `<div class="mood" id="mood">${dz.mood_done ? '<span class="q">Thanks for checking in today. See you tomorrow.</span>' : `<span class="q">How are you feeling today?</span>${MOODS.map(([k, e, l]) => `<button type="button" data-mood="${k}">${e} ${l}</button>`).join('')}`}
          <span class="anon">${ico('lock')}Anonymous: HR only sees team trends</span></div>` : ''}
      </section>
      ${hr}
      ${needs.length ? `<section class="panel needs"><header><h2>Needs you</h2><span class="meta">${needs.length}</span></header><ul class="list">${needs.map(n => `<li><span class="ni2">${ico(n.i)}</span><div style="flex:1;min-width:0"><div class="name">${esc(n.t)}</div>${n.s ? `<div class="sub">${esc(n.s)}</div>` : ''}</div><a class="btn small" href="${n.a}">${n.b}</a></li>`).join('')}</ul></section>` : ''}
      <section class="panel ${needs.length ? '' : 'full'}"><header><h2>At a glance</h2></header><div class="glance">
        <div><div class="n">${bal && bal.left != null ? (+bal.left % 1 ? (+bal.left).toFixed(1) : +bal.left) : '—'} <small>days</small></div><div class="l">${bal ? esc(bal.name) + ' left' : 'Leave left'}</div>${bal && +bal.entitled ? `<div class="bar"><i style="width:${Math.max(0, Math.min(100, bal.left / (+bal.entitled + +bal.carried + +bal.adjusted || 1) * 100))}%"></i></div>` : ''}</div>
        <div><div class="n">${dz.requests_waiting}</div><div class="l">${dz.requests_waiting === 1 ? 'Request' : 'Requests'} waiting<br><a class="sub" href="#/people/approvals?tab=mine">See them</a></div></div>
        <div><div class="n">${toNext == null ? '—' : toNext} <small>${toNext === 1 ? 'day' : 'days'}</small></div><div class="l">To the next holiday<br><span class="sub">${next ? esc(next.name) : 'None listed yet'}</span></div></div></div></section>
      ${ann.length ? `<section class="panel ann"><header><h2>Announcements</h2><a class="viewall" href="#/people/company/announcements">All →</a></header><ul class="list">${ann.slice(0, 3).map(a => `<li class="clickrow" data-ann="${a.id}"><div style="min-width:0">${a.pinned ? '<div class="pin">📌 Pinned</div>' : ''}<div class="name">${esc(a.title)}</div><div class="sub">${esc(a.by || 'HR')} · ${fd(a.publish_at)}${a.require_confirm ? ' · ' + (a.confirmed_at ? chip('ok', 'Confirmed') : chip('pending', 'Please confirm')) : ''}</div></div></li>`).join('')}</ul></section>` : ''}
      ${c.birthdays.length || c.anniversaries.length || c.joiners.length ? `<section class="panel"><header><h2>Celebrations</h2><span class="meta">This week</span></header><ul class="list">
        ${c.birthdays.length ? `<li class="cel"><div class="avs">${c.birthdays.slice(0, 3).map(b => hrAv(b)).join('')}</div><div style="flex:1;min-width:0"><div class="name">🎂 ${c.birthdays.length === 1 ? 'Birthday' : plural(c.birthdays.length, 'birthday')} this week</div><div class="sub">${c.birthdays.map(b => `${esc(b.name)} · ${b.today ? '<b>today</b>' : esc(b.day)}`).join(' &nbsp;·&nbsp; ')}</div></div>
          ${c.birthdays.filter(b => b.profile_id && b.profile_id !== S.profile.id).length ? `<div class="end">${c.birthdays.filter(b => b.profile_id && b.profile_id !== S.profile.id).slice(0, 2).map(b => `<button class="btn small" data-hbd="${b.id}">Say happy birthday${c.birthdays.length > 1 ? ' to ' + esc(b.name.split(' ')[0]) : ''}</button>`).join(' ')}</div>` : ''}</li>` : ''}
        ${c.anniversaries.map(a => `<li class="cel">${hrAv(a)}<div><div class="name">🎉 ${esc(a.name)}: ${plural(a.years, 'year')} at ${esc(CFG.ORG_SHORT || 'GANKCO')}</div><div class="sub">${esc(a.day)}</div></div></li>`).join('')}
        ${c.joiners.map(j => `<li class="cel">${hrAv(j)}<div><div class="name">👋 Welcome, ${esc(j.name)}</div><div class="sub">${esc(j.title || '')} · joined ${fd(j.start_date)}</div></div></li>`).join('')}</ul></section>` : ''}
      <section class="panel out"><header><h2>Who’s out today</h2><span class="meta">${outT.length}</span>${hrHasTeam() ? '<a class="viewall" href="#/people/team">Team calendar →</a>' : ''}</header>
        ${outT.length ? `<ul class="list">${outT.map(o => `<li>${hrAv(hrCard(o.employee_id) || { name: o.name })}<div style="flex:1;min-width:0"><div class="name">${esc(o.name)}</div><div class="sub">${o.kind === 'job' ? esc(o.label || 'On a job') + ' · ' : ''}${o.to ? 'until ' + fdd(o.to) : ''}</div></div>
          <span class="chip ${OUT_CHIP[o.kind]}">${o.kind === 'job' ? 'On a job' : esc(o.label)}</span></li>`).join('')}</ul>` : '<div class="empty">Everyone’s in today.</div>'}</section>
      <section class="panel"><header><h2>Upcoming holidays</h2><a class="viewall" href="#/people/company/holidays">All →</a></header>
        ${dz.holidays.length ? `<ul class="list">${dz.holidays.map(h => `<li class="hol"><span class="cal"><b>${new Date(h.day + 'T00:00:00').toLocaleDateString('en-GB', { month: 'short' }).toUpperCase()}</b><span>${+h.day.slice(8)}</span></span><div><div class="name">${esc(h.name)}</div><div class="sub">${new Date(h.day + 'T00:00:00').toLocaleDateString('en-GB', { weekday: 'long' })}</div></div></li>`).join('')}</ul>` : '<div class="empty">HR hasn’t listed the next holidays yet.</div>'}</section>
    </div>`;
  },
  bind(main) {
    $$('[data-mood]', main).forEach(b => b.onclick = async () => {
      try { await q(sb.rpc('hr_mood_set', { p_mood: +b.dataset.mood })); $('#mood', main).innerHTML = `<span class="q">Thanks for checking in today. See you tomorrow.</span><span class="anon">${ico('lock')}Anonymous: HR only sees team trends</span>`; }
      catch (e) { toast(niceError(e), true); }
    });
    $$('[data-hbd]', main).forEach(b => b.onclick = async () => { try { await q(sb.rpc('hr_say_birthday', { p_emp: +b.dataset.hbd })); b.disabled = true; b.textContent = 'Sent 🎂'; toast('Your birthday wish was sent'); } catch (e) { toast(niceError(e), true); } });
    $$('[data-ann]', main).forEach(r => r.onclick = () => hrOpenAnn(+r.dataset.ann));
  }
};

// ================================================================ WORK → LEAVE
const hrLeavePage = {
  async load(parts, params) {
    const me = hrMe();
    if (!me) return topbar('Leave') + '<div class="notice">HR hasn’t added your PeopleCore record yet. Ask HR.</div>';
    const tab = this.tab = params.get('tab') || 'apply'; const yr = this.year = +(params.get('y') || thisYear());
    const [bal, mine, relief, plans, allow] = await Promise.all([q(sb.rpc('hr_leave_balances', { p_emp: me.id, p_year: yr })),
      q(sb.from('hr_leave').select('*, hr_requests(status,current_step,steps,title)').eq('employee_id', me.id).order('start_date', { ascending: false })),
      q(sb.from('hr_leave').select('*, hr_requests(id,status,current_step,steps,title)').eq('relief_id', me.id).order('start_date', { ascending: false }).limit(40)),
      q(sb.from('hr_leave_plans').select('*').eq('employee_id', me.id).gte('end_date', `${yr}-01-01`).order('start_date')),
      q(sb.from('hr_leave_allowance').select('*').eq('employee_id', me.id).order('year', { ascending: false })), hrHolidays()]);
    Object.assign(this, { bal, mine, relief, plans, allow });
    const reliefWaiting = relief.filter(l => l.hr_requests?.status === 'pending' && l.hr_requests.steps?.[l.hr_requests.current_step]?.who === 'relief');
    const tabs = [['apply', 'Apply'], ['history', 'History'], ['relief', `Relief requests${reliefWaiting.length ? ` <span class="count">${reliefWaiting.length}</span>` : ''}`], ['plan', 'Leave plan'], ['allowance', 'Leave allowance']];
    const card = b => { const tot = +b.entitled + +b.carried - +b.lapsed + +b.adjusted;
      return `<div class="lv ${b.why_not ? 'off' : ''}"><div class="t">${esc(b.name)}${b.shows_as === 'training' ? ' ' + chip('reserved', 'Training') : ''}${!b.paid ? ' ' + chip('muted', 'Unpaid') : ''}</div>
        ${b.unlimited ? '<div class="n">— <small>no set limit</small></div>' : `<div class="n">${+b.left % 1 ? (+b.left).toFixed(1) : +b.left} <small>of ${+tot % 1 ? tot.toFixed(1) : tot} days left</small></div><div class="bar"><i style="width:${tot ? Math.max(0, Math.min(100, b.left / tot * 100)) : 0}%"></i></div>`}
        <div class="sub">${[+b.taken ? nDays(b.taken) + ' taken' : '', +b.pending ? nDays(b.pending) + ' waiting' : '', +b.carried ? nDays(b.carried) + ' carried over' : '', +b.adjusted ? (b.adjusted > 0 ? '+' : '') + nDays(b.adjusted) + ' adjusted by HR' : ''].filter(Boolean).join(' · ') || '&nbsp;'}</div>
        ${b.why_not ? `<div class="sub">${esc(b.why_not)}</div>` : `<button class="btn small" data-apply="${b.type_id}">Apply →</button>`}</div>`; };
    const stCell = l => { const r = l.hr_requests || {}; const st = LEAVE_ST[r.status] || ['muted', r.status]; const step = r.status === 'pending' ? r.steps?.[r.current_step] : null;
      return `${chip(st[0], st[1])}${step ? `<div class="sub">with ${esc(step.label)}${step.names?.length ? ' · ' + esc(step.names.join(', ')) : ''}</div>` : ''}`; };
    const typeName = id => this.bal.find(b => b.type_id === id)?.name || 'Leave';
    const body = {
      apply: () => `<section class="panel"><header><h2>Your leave in ${yr}</h2><span class="meta">The leave year runs January to December</span>
          <div class="right"><a class="btn small" href="#/people/work/leave?tab=apply&y=${yr - 1}">← ${yr - 1}</a>${yr < thisYear() + 1 ? `<a class="btn small" href="#/people/work/leave?tab=apply&y=${yr + 1}">${yr + 1} →</a>` : ''}</div></header>
        <div class="leaves">${bal.map(card).join('') || '<div class="empty">HR hasn’t set up any leave types yet.</div>'}</div></section>`,
      history: () => `<section class="panel">${mine.length ? `<div class="tablewrap"><table class="t stack"><thead><tr><th>Leave</th><th>Dates</th><th class="num">Days</th><th>Relief officer</th><th>Status</th><th></th></tr></thead><tbody>
          ${mine.map(l => `<tr><td class="name">${esc(typeName(l.type_id))}${l.reason ? `<div class="sub">${esc(l.reason)}</div>` : ''}</td><td>${hrRange(l.start_date, l.end_date)}</td><td class="num">${+l.days}</td>
            <td>${l.relief_id ? esc(hrNameOf(l.relief_id)) : '—'}</td><td>${stCell(l)}</td><td class="num">${l.hr_requests?.status === 'pending' ? `<button class="btn small" data-lcancel="${l.id}">Cancel</button>` : ''}</td></tr>`).join('')}</tbody></table></div>`
          : '<div class="empty">No leave yet.</div>'}</section>`,
      relief: () => `<section class="panel"><div class="body muted">When a colleague names you as their relief officer, you accept or decline first. Then it goes to their manager.</div>
        ${relief.length ? `<ul class="list">${relief.map(l => { const r = l.hr_requests || {}; const mineNow = reliefWaiting.includes(l);
          return `<li>${hrAv(hrCard(l.employee_id) || { name: hrNameOf(l.employee_id) })}<div style="flex:1;min-width:0"><div class="name">${esc(hrNameOf(l.employee_id))} · ${esc(typeName(l.type_id))}</div><div class="sub">${hrRange(l.start_date, l.end_date)} · ${nDays(l.days)}</div></div>
            <div class="end">${mineNow ? `<button class="btn small" data-rno="${r.id}">Decline</button> <button class="btn small primary" data-rok="${r.id}">Accept</button>` : chip(...(LEAVE_ST[r.status] || ['muted', r.status]))}</div></li>`; }).join('')}</ul>` : '<div class="empty">Nobody has named you as their relief officer.</div>'}</section>`,
      plan: () => `<section class="panel"><header><h2>Your leave plan for ${yr}</h2><span class="meta">Dates you plan to take. It isn’t a request: your manager sees it on the team calendar.</span><div class="right"><button class="btn small primary" id="planadd">${ico('plus')}Add dates</button></div></header>
        ${plans.length ? `<ul class="list">${plans.map(p => `<li><span class="ni2">${ico('plan')}</span><div style="flex:1"><div class="name">${hrRange(p.start_date, p.end_date)}</div><div class="sub">${nDays(hrCountDays(p.start_date, p.end_date, true))} working${p.note ? ' · ' + esc(p.note) : ''}</div></div><div class="end"><button class="btn small" data-papply="${p.id}">Apply for it</button> <button class="btn small link danger" data-pdel="${p.id}">Remove</button></div></li>`).join('')}</ul>` : '<div class="empty">No dates planned yet.</div>'}</section>`,
      allowance: () => `<section class="panel"><div class="body muted">Leave allowance isn’t requested: HR pays it when funds are available, ideally when you take your leave.</div>
        <ul class="list">${[thisYear(), ...allow.map(a => a.year).filter(y => y !== thisYear())].map(y => { const a = allow.find(x => x.year === y);
          return `<li><div style="flex:1"><div class="name">Leave allowance ${y}</div><div class="sub">${a ? `Paid ${fd(a.paid_on)}${a.note ? ' · ' + esc(a.note) : ''}` : 'Not paid yet'}</div></div><div class="end">${a ? (a.amount != null ? `<span class="amt" data-amt="${a.amount}">₦ ●●●●●● <button class="eye" title="Show amount">${ico('eye')}</button></span> ` : '') + chip('ok', 'Paid') : chip('pending', 'Not paid yet')}</div></li>`; }).join('')}</ul></section>`
    };
    return topbar('Leave', 'Apply, see your balances and history, and plan your year.', `<button class="btn primary" id="lapply">${ico('plan')}Apply for leave</button>`) +
      `<div class="tabs" id="ltabs">${tabs.map(([k, l]) => `<button data-t="${k}" class="${tab === k ? 'on' : ''}">${l}</button>`).join('')}</div>${(body[tab] || body.apply)()}`;
  },
  bind(main, parts, params) {
    $$('#ltabs button', main).forEach(b => b.onclick = () => go('#/people/work/leave?tab=' + b.dataset.t));
    $('#lapply', main).onclick = () => hrApplyLeave(this.bal);
    $$('[data-apply]', main).forEach(b => b.onclick = () => hrApplyLeave(this.bal, +b.dataset.apply));
    $$('[data-lcancel]', main).forEach(b => b.onclick = async () => { if (!confirm('Cancel this leave request?')) return; try { await q(sb.rpc('hr_leave_cancel', { p_id: +b.dataset.lcancel, p_note: null })); toast('Cancelled'); hrRefresh(); } catch (e) { toast(niceError(e), true); } });
    $$('[data-rok]', main).forEach(b => b.onclick = async () => { b.disabled = true; try { await q(sb.rpc('hr_request_decide', { p_id: +b.dataset.rok, p_approve: true, p_note: null })); toast('Accepted. It goes to their manager now.'); hrRefresh(); } catch (e) { toast(niceError(e), true); b.disabled = false; } });
    $$('[data-rno]', main).forEach(b => b.onclick = () => modal({ title: 'Decline relief', submit: 'Decline', danger: true, sub: 'They’ll see your reason and can choose someone else.', body: '<label class="f">Reason<textarea name="note" rows="3" required></textarea></label>',
      onSubmit: async x => { if (!x.note.trim()) throw new Error('Give a reason.'); await q(sb.rpc('hr_request_decide', { p_id: +b.dataset.rno, p_approve: false, p_note: x.note })); toast('Declined'); hrRefresh(); } }));
    const pa = $('#planadd', main); if (pa) pa.onclick = () => modal({ title: 'Plan leave dates', submit: 'Add', body: `<div class="row2"><label class="f">From<input type="date" name="s" required></label><label class="f">To<input type="date" name="e" required></label></div><label class="f">Note <span class="hint">Optional</span><input name="note" placeholder="e.g. Christmas at home"></label>`,
      onSubmit: async x => { if (!x.s || !x.e) throw new Error('Choose the dates.'); if (x.e < x.s) throw new Error('The last day is before the first.'); await q(sb.rpc('hr_leave_plan_save', { p: { start_date: x.s, end_date: x.e, note: x.note } })); toast('Added to your plan'); hrRefresh(); } });
    $$('[data-pdel]', main).forEach(b => b.onclick = async () => { try { await q(sb.rpc('hr_leave_plan_delete', { p_id: +b.dataset.pdel })); hrRefresh(); } catch (e) { toast(niceError(e), true); } });
    $$('[data-papply]', main).forEach(b => b.onclick = () => { const p = this.plans.find(x => x.id === +b.dataset.papply); hrApplyLeave(this.bal, null, p); });
    hrBindEyes(main);
    if (params.get('apply')) { history.replaceState(null, '', '#/people/work/leave'); hrApplyLeave(this.bal); }
  }
};
function hrBindEyes(root) {
  $$('.amt[data-amt] .eye', root).forEach(b => b.onclick = e => { e.stopPropagation(); const s = b.closest('.amt'); s.innerHTML = '₦ ' + (+s.dataset.amt).toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); });
}

function hrApplyLeave(bal, typeId, plan) {
  const me = hrMe(); const ok = bal.filter(b => !b.why_not);
  if (!ok.length) return toast('No leave types are open to you. Ask HR.', true);
  const relievers = S.hr.dir.filter(c => c.id !== me.id && c.profile_id);
  let doc = null;
  return modal({ title: 'Apply for leave', submit: 'Send request', wide: true,
    body: `<div class="row2"><label class="f">Type of leave<select name="type_id" id="lt">${ok.map(b => opt(b.type_id, b.name, typeId || ok[0].type_id)).join('')}</select></label><div class="f" id="lbal"></div></div>
      <div class="row3"><label class="f">First day<input type="date" name="start_date" id="ls" value="${plan?.start_date || ''}" required></label><label class="f">Last day<input type="date" name="end_date" id="le" value="${plan?.end_date || ''}" required></label><div class="f lcount" id="lcount"></div></div>
      <label class="f" id="lrel">Relief officer <span class="hint" id="lrelh"></span><select name="relief_id"><option value="">Choose…</option>${relievers.map(c => opt(c.id, c.name + (c.title ? ' · ' + c.title : ''), '')).join('')}</select></label>
      <label class="f">Reason <span class="hint">Optional</span><input name="reason" maxlength="200" value="${esc(plan?.note || '')}"></label>
      <label class="f" id="ldoc" hidden>Supporting document <span class="hint" id="ldoch"></span><input type="file" id="ldocf"></label>
      <div class="notice small" id="lwarn" hidden></div>`,
    onOpen: d => {
      const upd = () => { const b = bal.find(x => x.type_id === +$('#lt', d).value); const s = $('#ls', d).value, e = $('#le', d).value; const n = hrCountDays(s, e, b.working_days);
        $('#lbal', d).innerHTML = b.unlimited ? '<span class="sub">No set limit</span>' : `<span class="lbal-n">${+b.left - +b.pending}</span> <span class="sub">days left to use${+b.pending ? ` (${+b.pending} already waiting)` : ''}</span>`;
        $('#lcount', d).innerHTML = s && e ? (e < s ? '<span class="bad">The last day is before the first</span>' : `<b>${nDays(n)}</b><span class="sub">${b.working_days ? 'working days (no weekends or public holidays)' : 'calendar days'}</span>`) : '';
        $('#lrelh', d).textContent = b.relief_required ? 'Needed for this leave. They accept first.' : 'Optional';
        const needDoc = b.doc_after_days != null && n > b.doc_after_days; $('#ldoc', d).hidden = !needDoc; $('#ldoch', d).textContent = needDoc ? `Needed: ${b.name.toLowerCase()} longer than ${nDays(b.doc_after_days)}` : '';
        const w = []; const today = localISO(0);
        if (s && s < today && !b.allow_past) w.push(`${b.name} can’t start in the past.`);
        if (s && s >= today && b.min_notice_days && hrCountDays(today, s, false) - 1 < b.min_notice_days) w.push(`${b.name} needs ${nDays(b.min_notice_days)}’ notice.`);
        if (!b.unlimited && n > +b.left - +b.pending) w.push(`That’s more than you have left (${+b.left - +b.pending} days).`);
        if (b.max_days && n > b.max_days) w.push(`At most ${nDays(b.max_days)} in one request.`);
        $('#lwarn', d).hidden = !w.length; $('#lwarn', d).textContent = w.join(' '); };
      ['#lt', '#ls', '#le'].forEach(id => $(id, d).addEventListener('input', upd)); upd();
      $('#ldocf', d).onchange = async e => { try { doc = await hrReadFile(e.target.files[0]); } catch (x) { toast(niceError(x), true); } };
    },
    onSubmit: async x => {
      const p = { type_id: +x.type_id, start_date: x.start_date, end_date: x.end_date, relief_id: x.relief_id || null, reason: x.reason };
      if (doc) p.document = doc;
      await q(sb.rpc('hr_leave_apply', { p }));
      toast('Sent. You’ll get a bell message at each step.'); hrInvalidate(); go('#/people/work/leave?tab=history');
    } });
}

// ================================================================ COMPANY → ANNOUNCEMENTS, POLICIES, HOLIDAYS
async function hrOpenAnn(id) {
  const feed = await q(sb.rpc('hr_feed')); const a = feed.announcements.find(x => x.id === id); if (!a) return;
  if (!a.read_at) q(sb.rpc('hr_ann_read', { p_id: id, p_confirm: false })).catch(() => {});
  return modal({ title: a.title, wide: true, submit: a.require_confirm && !a.confirmed_at && hrMe() ? 'I’ve read it' : '', cancel: 'Close',
    sub: `${esc(a.by || 'HR')} · ${fdt(a.publish_at)}${a.pinned ? ' · 📌 Pinned' : ''}`,
    body: `<div class="ann-body">${hrText(a.body) || '<span class="sub">No text.</span>'}</div>
      ${a.files.length ? `<div class="ann-files">${a.files.map(f => `<button type="button" class="apfile" data-af="${f.id}">${ico('pdf')}${esc(f.file_name)}</button>`).join('')}</div>` : ''}
      ${a.require_confirm ? `<p class="sub mt">${a.confirmed_at ? `${ico('check')}You confirmed you read this on ${fdt(a.confirmed_at)}.` : 'HR asks everyone to confirm they have read this.'}</p>` : ''}`,
    onOpen: d => $$('[data-af]', d).forEach(b => b.onclick = async () => { try { hrOpenFile(await q(sb.rpc('hr_ann_file', { p_id: +b.dataset.af }))); } catch (e) { toast(niceError(e), true); } }),
    onSubmit: async () => { await q(sb.rpc('hr_ann_read', { p_id: id, p_confirm: true })); toast('Thanks. HR can see you’ve read it.'); render({ quiet: true }); } });
}
const hrCompanyAnn = {
  async load(parts) {
    const k = parts[2]; this.k = k; const feed = this.feed = await q(sb.rpc('hr_feed')); await hrHolidays();
    let body = '';
    if (k === 'announcements') {
      body = feed.announcements.length ? `<section class="panel ann"><ul class="list">${feed.announcements.map(a => `<li class="clickrow" data-ann="${a.id}"><div style="flex:1;min-width:0">${a.pinned ? '<div class="pin">📌 Pinned</div>' : ''}<div class="name">${esc(a.title)}${a.read_at ? '' : ' <span class="newdot" title="New"></span>'}</div>
          <div class="sub">${esc((a.body || '').slice(0, 140))}${(a.body || '').length > 140 ? '…' : ''}</div><div class="sub">${esc(a.by || 'HR')} · ${fd(a.publish_at)}${a.files.length ? ' · ' + plural(a.files.length, 'attachment') : ''}</div></div>
          <div class="end">${a.require_confirm ? (a.confirmed_at ? chip('ok', 'Confirmed') : chip('pending', 'Please confirm')) : ''}</div></li>`).join('')}</ul></section>` : '<section class="panel"><div class="empty">No announcements yet.</div></section>';
    } else if (k === 'policies') {
      const cats = [...new Set(feed.policies.map(p => p.category || 'General'))];
      body = feed.policies.length ? cats.map(c => `<section class="panel"><header><h2>${esc(c)}</h2></header><ul class="list">${feed.policies.filter(p => (p.category || 'General') === c).map(p => `<li><span class="hr-docico">${ico('audit')}</span><div style="flex:1;min-width:0"><div class="name">${esc(p.title)}</div><div class="sub">Version ${p.version} · ${fd(p.published_at)}${p.size ? ' · ' + Math.max(1, Math.round(p.size / 1024)) + ' KB' : ''}</div></div>
          <div class="end">${p.require_confirm ? (p.confirmed_at ? chip('ok', 'Read and confirmed') : `<button class="btn small" data-pconf="${p.id}">I’ve read it</button>`) + ' ' : ''}<button class="btn small" data-popen="${p.id}">${ico('down')}Open</button></div></li>`).join('')}</ul></section>`).join('') : '<section class="panel"><div class="empty">HR hasn’t published any policies yet.</div></section>';
    } else {
      const yrs = [...new Set(HR_HOL.list.map(h => h.day.slice(0, 4)))].filter(y => +y >= thisYear());
      body = yrs.length ? yrs.map(y => `<section class="panel"><header><h2>Public holidays ${y}</h2></header><ul class="list">${HR_HOL.list.filter(h => h.day.startsWith(y)).map(h => `<li class="hol ${h.day < localISO(0) ? 'off' : ''}"><span class="cal"><b>${new Date(h.day + 'T00:00:00').toLocaleDateString('en-GB', { month: 'short' }).toUpperCase()}</b><span>${+h.day.slice(8)}</span></span><div><div class="name">${esc(h.name)}</div><div class="sub">${new Date(h.day + 'T00:00:00').toLocaleDateString('en-GB', { weekday: 'long' })}</div></div></li>`).join('')}</ul></section>`).join('')
        : '<section class="panel"><div class="empty">HR hasn’t listed the public holidays yet.</div></section>';
    }
    return topbar('Company') + hrCompanyTabs(k) + body;
  },
  bind(main) {
    $$('[data-ann]', main).forEach(r => r.onclick = () => hrOpenAnn(+r.dataset.ann));
    $$('[data-popen]', main).forEach(b => b.onclick = async () => { try { hrOpenFile(await q(sb.rpc('hr_policy_file', { p_id: +b.dataset.popen }))); } catch (e) { toast(niceError(e), true); } });
    $$('[data-pconf]', main).forEach(b => b.onclick = async () => { try { await q(sb.rpc('hr_policy_confirm', { p_id: +b.dataset.pconf })); toast('Thanks. HR can see you’ve read it.'); render({ quiet: true }); } catch (e) { toast(niceError(e), true); } });
  }
};

// ================================================================ TEAM CALENDAR (My team, and HR's calendar)
function hrMonday(d = new Date()) { const x = new Date(d); x.setHours(0, 0, 0, 0); const wd = (x.getDay() + 6) % 7; x.setDate(x.getDate() - wd); return x; }
function hrTimeline(people, outs, plans, from, days) {
  const ds = Array.from({ length: days }, (_, i) => { const d = new Date(from); d.setDate(d.getDate() + i); return localDay(d); });
  const today = localISO(0);
  const cell = (p, d) => { const o = outs.find(x => x.employee_id === p.id && x.from <= d && x.to >= d); const wk = [0, 6].includes(new Date(d + 'T00:00:00').getDay()); const hol = HR_HOL.days.has(d);
    if (o) return `<div class="tl-c c-${o.kind === 'job' ? 'job' : o.kind === 'training' ? 'trn' : 'lv'}${o.status === 'pending' ? ' pend' : ''}" title="${esc(o.name + ': ' + (o.kind === 'job' ? 'On a job · ' + (o.label || '') : o.label) + (o.status === 'pending' ? ' (waiting for approval)' : ''))}">${o.kind === 'job' ? 'Job' : o.kind === 'training' ? 'Training' : 'Leave'}</div>`;
    if (hol) return `<div class="tl-c hol">Holiday</div>`;
    if (plans.some(x => x.employee_id === p.id && x.start_date <= d && x.end_date >= d)) return `<div class="tl-c plan" title="Planned leave (not requested yet)">Plan</div>`;
    return `<div class="tl-c ${wk ? 'wk' : ''} ${d === today ? 'today' : ''}"></div>`; };
  return `<div class="tl"><div class="tl-row tl-head" style="--n:${days}"><div class="tl-who"></div>${ds.map(d => { const x = new Date(d + 'T00:00:00'); return `<div class="tl-c ${HR_HOL.days.has(d) ? 'hol' : ''} ${d === today ? 'today' : ''}">${x.toLocaleDateString('en-GB', { weekday: 'short' })} ${x.getDate()}</div>`; }).join('')}</div>
    ${people.map(p => `<div class="tl-row" style="--n:${days}"><div class="tl-who">${hrAv(p, 'sm')}<div><b>${esc(p.name)}</b><span>${esc(p.title || '')}</span></div></div>${ds.map(d => cell(p, d)).join('')}</div>`).join('')}</div>
    <div class="tl-legend"><span><i class="g-lv"></i>Leave</span><span><i class="g-pend"></i>Waiting for approval</span><span><i class="g-job"></i>On a job</span><span><i class="g-trn"></i>Training</span><span><i class="g-plan"></i>Planned</span><span><i class="g-hol"></i>Public holiday</span></div>`;
}
async function hrTeamCalendar(team, weeks = 2) {
  await hrHolidays();
  const from = hrMonday(); const to = new Date(from); to.setDate(to.getDate() + weeks * 7 - 1);
  const ids = team.map(t => t.id);
  const [outs, plans] = await Promise.all([q(sb.rpc('hr_out', { p_from: localDay(from), p_to: localDay(to) })), ids.length ? q(sb.from('hr_leave_plans').select('*').in('employee_id', ids).lte('start_date', localDay(to)).gte('end_date', localDay(from))) : []]);
  const mine = outs.filter(o => ids.includes(o.employee_id));
  const clash = [];
  for (let d = new Date(from); d <= to; d.setDate(d.getDate() + 1)) { const iso = localDay(d); const n = new Set(mine.filter(o => o.from <= iso && o.to >= iso).map(o => o.employee_id)).size; if (n >= Math.max(2, Math.ceil(ids.length / 2))) clash.push(iso); }
  return `<section class="panel"><header><h2>Who’s out</h2><span class="meta">${fd(localDay(from))} – ${fd(localDay(to))}</span></header>${hrTimeline(team, mine, plans, from, weeks * 7)}
    ${clash.length ? `<div class="body" style="padding-top:0"><div class="notice small">${ico('plan')}<span>${clash.length === 1 ? fdd(clash[0]) : `${fdd(clash[0])} – ${fdd(clash[clash.length - 1])}`}: half or more of your team is out.</span></div></div>` : ''}</section>`;
}

// ================================================================ HR · TIME & PAY (leave calendar, balances, allowance)
const hrTimePage = {
  async load(parts, params) {
    if (!isHR()) return topbar('Time & pay') + '<div class="notice">Only HR can see this.</div>';
    const tab = this.tab = params.get('tab') || 'calendar'; const yr = this.year = +(params.get('y') || thisYear());
    await hrHolidays();
    let body = '';
    if (tab === 'calendar') {
      const base = params.get('m') ? new Date(params.get('m') + '-01T00:00:00') : new Date(localISO(0).slice(0, 7) + '-01T00:00:00');
      const days = new Date(base.getFullYear(), base.getMonth() + 1, 0).getDate(); const to = new Date(base.getFullYear(), base.getMonth(), days);
      const outs = await q(sb.rpc('hr_out', { p_from: localDay(base), p_to: localDay(to) }));
      const plans = await q(sb.from('hr_leave_plans').select('*').lte('start_date', localDay(to)).gte('end_date', localDay(base)));
      const people = S.hr.dir.filter(c => outs.some(o => o.employee_id === c.id) || plans.some(p => p.employee_id === c.id));
      const prev = new Date(base.getFullYear(), base.getMonth() - 1, 1), next = new Date(base.getFullYear(), base.getMonth() + 1, 1);
      body = `<section class="panel"><header><h2>${MONTHS[base.getMonth()]} ${base.getFullYear()}</h2><span class="meta">${plural(people.length, 'person', 'people')} out at some point</span>
          <div class="right"><a class="btn small" href="#/people/time?tab=calendar&m=${localDay(prev).slice(0, 7)}">←</a><a class="btn small" href="#/people/time?tab=calendar">This month</a><a class="btn small" href="#/people/time?tab=calendar&m=${localDay(next).slice(0, 7)}">→</a></div></header>
        ${people.length ? hrTimeline(people, outs, plans, base, days).replace(/class="tl"/, 'class="tl month"') : '<div class="empty">Nobody is out this month.</div>'}</section>`;
    } else if (tab === 'balances') {
      const rep = this.rep = await q(sb.rpc('hr_leave_report', { p_year: yr }));
      const types = rep[0]?.balances.filter(b => !b.unlimited) || [];
      body = `<section class="panel"><header><h2>Balances ${yr}</h2><span class="meta">Days left of each type. Press a name to adjust (for example opening balances from SeamlessHR).</span>
          <div class="right"><a class="btn small" href="#/people/time?tab=balances&y=${yr - 1}">← ${yr - 1}</a><a class="btn small" href="#/people/time?tab=balances&y=${yr + 1}">${yr + 1} →</a></div></header>
        <div class="tablewrap"><table class="t stack"><thead><tr><th>Name</th>${types.map(t => `<th class="num">${esc(t.name)}</th>`).join('')}</tr></thead><tbody>
        ${rep.map(r => `<tr class="clickrow" data-adj="${r.id}"><td class="name">${esc(r.name)}<div class="sub">${esc(r.emp_no || '')}</div></td>${types.map(t => { const b = r.balances.find(x => x.type_id === t.type_id); return `<td class="num">${b.why_not ? '<span class="sub">—</span>' : `<b>${+b.left}</b><div class="sub">${+b.taken ? +b.taken + ' taken' : ''}${+b.pending ? ' · ' + +b.pending + ' waiting' : ''}</div>`}</td>`; }).join('')}</tr>`).join('')}
        </tbody></table></div></section>`;
    } else {
      const rep = this.rep = await q(sb.rpc('hr_leave_report', { p_year: yr }));
      const paid = rep.filter(r => r.allowance).length;
      body = `<section class="panel"><header><h2>Leave allowance ${yr}</h2><span class="meta">${paid} of ${rep.length} paid</span>
          <div class="right"><a class="btn small" href="#/people/time?tab=allowance&y=${yr - 1}">← ${yr - 1}</a><a class="btn small" href="#/people/time?tab=allowance&y=${yr + 1}">${yr + 1} →</a></div></header>
        <div class="body muted">Not requested by staff. Mark each person paid when it’s paid, ideally when they take their leave. They see “Paid” and the date on their Leave page.</div>
        <ul class="list">${rep.map(r => `<li>${hrAv(hrCard(r.id) || { name: r.name })}<div style="flex:1"><div class="name">${esc(r.name)}</div><div class="sub">${r.allowance ? `Paid ${fd(r.allowance.paid_on)}${r.allowance.note ? ' · ' + esc(r.allowance.note) : ''} · by ${esc(r.allowance.by_name || '')}` : 'Not paid yet'}</div></div>
          <div class="end">${r.allowance ? chip('ok', 'Paid') + ' ' : ''}<button class="btn small" data-allow="${r.id}">${r.allowance ? 'Change' : 'Mark paid'}</button></div></li>`).join('')}</ul></section>`;
    }
    return topbar('Time & pay', 'Leave across GANKCO: the calendar, everyone’s balances, and leave allowance.') +
      `<div class="tabs" id="ttabs">${[['calendar', 'Leave calendar'], ['balances', 'Balances'], ['allowance', 'Leave allowance']].map(([k, l]) => `<button data-t="${k}" class="${tab === k ? 'on' : ''}">${l}</button>`).join('')}</div>${body}`;
  },
  bind(main) {
    if (!isHR()) return;
    $$('#ttabs button', main).forEach(b => b.onclick = () => go('#/people/time?tab=' + b.dataset.t));
    $$('[data-adj]', main).forEach(r => r.onclick = () => { const e = this.rep.find(x => x.id === +r.dataset.adj);
      modal({ title: `Adjust leave: ${e.name}`, submit: 'Save',
        sub: 'Add days (or take them away with a minus). Use it for opening balances from SeamlessHR and corrections. It’s logged with your reason.',
        body: `<div class="row3"><label class="f">Type<select name="type_id">${e.balances.filter(b => !b.unlimited).map(b => opt(b.type_id, `${b.name} (${+b.left} left)`, '')).join('')}</select></label>
          <label class="f">Year<input type="number" name="year" value="${this.year}"></label><label class="f">Days<input type="number" step="0.5" name="days" placeholder="e.g. 5 or -2"></label></div>
          <label class="f">Reason<input name="reason" placeholder="e.g. Opening balance from SeamlessHR" required></label>`,
        onSubmit: async x => { await q(sb.rpc('hr_leave_adjust_save', { p: { employee_id: e.id, type_id: +x.type_id, year: +x.year, days: x.days, reason: x.reason } })); toast('Saved'); render({ quiet: true }); } }); });
    $$('[data-allow]', main).forEach(b => b.onclick = () => { const e = this.rep.find(x => x.id === +b.dataset.allow); const a = e.allowance || {};
      modal({ title: `Leave allowance ${this.year}: ${e.name}`, submit: 'Save',
        body: `<div class="row2"><label class="f">Paid on<input type="date" name="paid_on" value="${a.paid_on || localISO(0)}"></label><label class="f">Amount <span class="hint">Optional · the person sees it behind the eye</span><input type="number" step="0.01" name="amount" value="${a.amount ?? ''}"></label></div>
          <label class="f">Note <span class="hint">Optional</span><input name="note" value="${esc(a.note || '')}"></label>${e.allowance ? '<label class="check"><input type="checkbox" name="clear"> Not paid after all (remove it)</label>' : ''}`,
        onSubmit: async x => { await q(sb.rpc('hr_leave_allowance_save', { p: { employee_id: e.id, year: this.year, paid_on: x.clear ? '' : x.paid_on, amount: x.amount, note: x.note } })); toast('Saved'); render({ quiet: true }); } }); });
  }
};

// ================================================================ HR · ENGAGE (announcements, policies, mood)
const hrEngagePage = {
  async load(parts, params) {
    if (!isHR()) return topbar('Engage') + '<div class="notice">Only HR can see this.</div>';
    const tab = this.tab = params.get('tab') || 'announcements';
    let body = '';
    if (tab === 'announcements') {
      const rows = this.anns = await q(sb.from('hr_ann').select('id,title,body,audience,pinned,publish_at,expires_at,require_confirm,email,sent_at,active,created_by_name,created_at, hr_ann_files(id,file_name)').order('publish_at', { ascending: false }));
      const st = a => !a.active ? chip('muted', 'Off') : a.expires_at && new Date(a.expires_at) < new Date() ? chip('muted', 'Expired') : a.sent_at ? chip('ok', 'Published') : chip('pending', 'Scheduled ' + fdt(a.publish_at));
      const aud = a => a.audience?.all ? 'Everyone' : [...(a.audience?.units || []).map(u => hrUnit(u)?.name), ...(a.audience?.locations || []).map(l => hrListName(l))].filter(Boolean).join(', ') || 'Nobody';
      body = `<section class="panel"><header><h2>Announcements</h2><span class="meta">${rows.length}</span><div class="right"><button class="btn small primary" id="annnew">${ico('plus')}New announcement</button></div></header>
        <div class="body muted">Only HR posts announcements. They go to the bell and by email (to people who can open PeopleCore), and show on Discover and Company → Announcements.</div>
        ${rows.length ? `<ul class="list">${rows.map(a => `<li><div style="flex:1;min-width:0"><div class="name">${a.pinned ? '📌 ' : ''}${esc(a.title)}</div><div class="sub">${esc(aud(a))} · ${fdt(a.publish_at)} · by ${esc(a.created_by_name || '')}${a.require_confirm ? ' · read and confirm' : ''}${a.email ? ' · email' : ''}${a.hr_ann_files.length ? ' · ' + plural(a.hr_ann_files.length, 'file') : ''}</div></div>
          <div class="end">${st(a)} <button class="btn small" data-arep="${a.id}">Who read it</button> <button class="btn small" data-aed="${a.id}">Edit</button></div></li>`).join('')}</ul>` : '<div class="empty">Nothing posted yet.</div>'}</section>`;
    } else if (tab === 'policies') {
      const rows = this.pols = await q(sb.from('hr_policies').select('id,title,category,version,file_name,size_bytes,require_confirm,published_at,active,updated_by_name').order('category').order('title'));
      body = `<section class="panel"><header><h2>Policies &amp; handbook</h2><span class="meta">${rows.length}</span><div class="right"><button class="btn small primary" id="polnew">${ico('plus')}Add a policy</button></div></header>
        <div class="body muted">Staff see these in Company → Policies. Upload a new version when a policy changes: anyone asked to confirm is asked again.</div>
        ${rows.length ? `<ul class="list">${rows.map(p => `<li class="${p.active ? '' : 'off'}"><span class="hr-docico">${ico('audit')}</span><div style="flex:1;min-width:0"><div class="name">${esc(p.title)}</div><div class="sub">${esc(p.category || 'General')} · version ${p.version} · ${fd(p.published_at)}${p.require_confirm ? ' · read and confirm' : ''}${p.active ? '' : ' · off'}</div></div>
          <div class="end">${p.require_confirm ? `<button class="btn small" data-prep="${p.id}">Who confirmed</button> ` : ''}<button class="btn small" data-ped="${p.id}">Edit</button></div></li>`).join('')}</ul>` : '<div class="empty">No policies yet. Start with the staff handbook.</div>'}</section>`;
    } else {
      const days = +(params.get('d') || 30); const t = await q(sb.rpc('hr_mood_trends', { p_days: days }));
      const bar = m => { const tot = Object.values(m || {}).reduce((a, b) => a + b, 0); return tot ? `<div class="moodbar">${MOODS.map(([k, e, l]) => m[k] ? `<span style="flex:${m[k]}" class="mb${k}" title="${l}: ${m[k]}">${e}</span>` : '').join('')}</div>` : ''; };
      body = `<section class="panel"><header><h2>Mood check-in</h2><span class="meta">Last ${days} days · ${t.total} answers</span><div class="right"><div class="seg">${[7, 30, 90].map(n => `<a class="btn small ${n === days ? 'primary' : ''}" href="#/people/engage?tab=mood&d=${n}">${n} days</a>`).join('')}</div></div></header>
        <div class="body muted">Answers are anonymous: Nest keeps only the day, the department and the mood, never who answered. A group with fewer than 5 answers isn’t shown, so nobody can be picked out.</div>
        <div class="body"><h3>Whole company</h3>${t.company ? bar(t.company) + `<div class="moodkey">${MOODS.map(([k, e, l]) => `<span>${e} ${l}: <b>${t.company[k] || 0}</b></span>`).join('')}</div>` : '<span class="sub">Not enough answers yet (fewer than 5).</span>'}</div>
        <ul class="list">${t.units.map(u => `<li><div style="flex:1;min-width:0"><div class="name">${esc(u.unit)}</div><div class="sub">${plural(u.answers, 'answer')}</div>${u.moods ? bar(u.moods) : '<div class="sub">Too few answers to show.</div>'}</div></li>`).join('')}</ul></section>`;
    }
    return topbar('Engage', 'Announcements, policies and how people are feeling.') +
      `<div class="tabs" id="etabs2">${[['announcements', 'Announcements'], ['policies', 'Policies'], ['mood', 'Mood check-in']].map(([k, l]) => `<button data-t="${k}" class="${tab === k ? 'on' : ''}">${l}</button>`).join('')}</div>${body}`;
  },
  bind(main) {
    if (!isHR()) return;
    $$('#etabs2 button', main).forEach(b => b.onclick = () => go('#/people/engage?tab=' + b.dataset.t));
    const an = $('#annnew', main); if (an) an.onclick = () => hrAnnForm(null);
    $$('[data-aed]', main).forEach(b => b.onclick = () => hrAnnForm(this.anns.find(a => a.id === +b.dataset.aed)));
    $$('[data-arep]', main).forEach(b => b.onclick = async () => { const r = await q(sb.rpc('hr_ann_report', { p_id: +b.dataset.arep })); hrReadReport('Who has read it', r); });
    const pn = $('#polnew', main); if (pn) pn.onclick = () => hrPolForm(null);
    $$('[data-ped]', main).forEach(b => b.onclick = () => hrPolForm(this.pols.find(p => p.id === +b.dataset.ped)));
    $$('[data-prep]', main).forEach(b => b.onclick = async () => { const r = await q(sb.rpc('hr_policy_report', { p_id: +b.dataset.prep })); hrReadReport('Who has confirmed it', r); });
  }
};
function hrReadReport(title, rows) {
  const done = rows.filter(r => r.confirmed_at || (title.includes('read') && r.read_at)).length;
  return modal({ title, submit: '', cancel: 'Close', sub: `${done} of ${rows.length}`,
    body: `<ul class="list">${rows.map(r => `<li><div style="flex:1"><div class="name">${esc(r.name)}</div>${r.can_open === false ? '<div class="sub">Can’t open PeopleCore yet</div>' : ''}</div><div class="end">${r.confirmed_at ? chip('ok', 'Confirmed ' + fdt(r.confirmed_at)) : r.read_at ? chip('reserved', 'Read ' + fdt(r.read_at)) : chip('muted', 'Not yet')}</div></li>`).join('')}</ul>` });
}
function hrAnnForm(a) {
  const aud = a?.audience || { all: true }; const files = [];
  const iso = d => d ? new Date(new Date(d).getTime() - new Date(d).getTimezoneOffset() * 6e4).toISOString().slice(0, 16) : '';
  return modal({ title: a ? 'Edit announcement' : 'New announcement', wide: true, submit: a ? 'Save' : 'Post',
    body: `<label class="f">Title<input name="title" value="${esc(a?.title || '')}" required></label>
      <label class="f">Message<textarea name="body" rows="7">${esc(a?.body || '')}</textarea></label>
      <div class="f">Who it’s for<div class="segi"><label><input type="radio" name="aud" value="all" ${aud.all ? 'checked' : ''}><span>Everyone</span></label><label><input type="radio" name="aud" value="some" ${aud.all ? '' : 'checked'}><span>Some departments or locations</span></label></div></div>
      <div id="audsome" ${aud.all ? 'hidden' : ''} class="grid2 even"><div class="f">Departments and units${hrUnitsOrdered().filter(u => u.active).map(u => `<label class="check" style="padding-left:${u.depth * 14}px"><input type="checkbox" name="u_${u.id}" ${(aud.units || []).includes(u.id) ? 'checked' : ''}> ${esc(u.name)}</label>`).join('')}</div>
        <div class="f">Work locations${S.hr.lists.filter(l => l.kind === 'location' && l.active).map(l => `<label class="check"><input type="checkbox" name="l_${l.id}" ${(aud.locations || []).includes(l.id) ? 'checked' : ''}> ${esc(l.name)}</label>`).join('')}</div></div>
      <div class="row2"><label class="f">Publish <span class="hint">Leave blank to post now</span><input type="datetime-local" name="publish_at" value="${a && !a.sent_at ? iso(a.publish_at) : ''}" ${a?.sent_at ? 'disabled' : ''}></label>
        <label class="f">Take it down on <span class="hint">Optional</span><input type="datetime-local" name="expires_at" value="${iso(a?.expires_at)}"></label></div>
      <label class="check"><input type="checkbox" name="pinned" ${a?.pinned ? 'checked' : ''}> Pin it to the top</label>
      <label class="check"><input type="checkbox" name="require_confirm" ${a?.require_confirm ? 'checked' : ''}> Ask everyone to confirm they have read it</label>
      <label class="check"><input type="checkbox" name="email" ${a ? (a.email ? 'checked' : '') : 'checked'} ${a?.sent_at ? 'disabled' : ''}> Also send it by email</label>
      ${a ? `<label class="check"><input type="checkbox" name="active" ${a.active ? 'checked' : ''}> Showing (untick to hide it)</label>` : ''}
      <label class="f mt">Attachments <span class="hint">PDF, Word, Excel or photos, up to 8 MB each</span><input type="file" id="annf" multiple></label>
      ${a?.hr_ann_files?.length ? `<div class="f">${a.hr_ann_files.map(f => `<label class="check"><input type="checkbox" name="rm_${f.id}"> Remove ${esc(f.file_name)}</label>`).join('')}</div>` : ''}
      ${a ? '<div class="mt"><button type="button" class="btn small danger" id="anndel">Delete this announcement</button></div>' : ''}`,
    onOpen: (d, close) => { $$('[name=aud]', d).forEach(r => r.onchange = () => { $('#audsome', d).hidden = $('[name=aud]:checked', d).value === 'all'; });
      const del = $('#anndel', d); if (del) del.onclick = hrTry(async () => { if (!confirm('Delete it for everyone?')) return; await q(sb.rpc('hr_ann_delete', { p_id: a.id })); close(null); toast('Deleted'); render({ quiet: true }); }); },
    onSubmit: async (x, d) => {
      for (const f of $('#annf', d).files) files.push(await hrReadFile(f));
      const audience = x.aud === 'all' ? { all: true } : { units: hrUnitsOrdered().filter(u => x['u_' + u.id]).map(u => u.id), locations: S.hr.lists.filter(l => l.kind === 'location' && x['l_' + l.id]).map(l => l.id) };
      if (x.aud !== 'all' && !audience.units.length && !audience.locations.length) throw new Error('Tick at least one department or location.');
      await q(sb.rpc('hr_ann_save', { p: { id: a?.id, title: x.title, body: x.body, audience, pinned: !!x.pinned, require_confirm: !!x.require_confirm, email: a?.sent_at ? a.email : !!x.email,
        active: a ? !!x.active : true, publish_at: x.publish_at ? new Date(x.publish_at).toISOString() : '', expires_at: x.expires_at ? new Date(x.expires_at).toISOString() : '', files,
        remove_files: (a?.hr_ann_files || []).filter(f => x['rm_' + f.id]).map(f => f.id) } }));
      toast(a ? 'Saved' : x.publish_at && new Date(x.publish_at) > new Date() ? 'Scheduled' : 'Posted'); render({ quiet: true });
    } });
}
function hrPolForm(p) {
  return modal({ title: p ? 'Edit policy' : 'Add a policy', submit: 'Save',
    body: `<label class="f">Title<input name="title" value="${esc(p?.title || '')}" required></label>
      <label class="f">Category <span class="hint">e.g. General, HSE, HR, Finance</span><input name="category" value="${esc(p?.category || '')}" list="polcats"><datalist id="polcats">${['General', 'HR', 'HSE', 'Finance', 'Operations'].map(c => `<option value="${c}">`).join('')}</datalist></label>
      <label class="f">${p ? 'Upload a new version <span class="hint">Optional. Staff asked to confirm are asked again.</span>' : 'File <span class="hint">PDF or Word, up to 8 MB</span>'}<input type="file" id="polf" ${p ? '' : 'required'}></label>
      <label class="check"><input type="checkbox" name="require_confirm" ${p?.require_confirm ? 'checked' : ''}> Ask staff to confirm they have read it</label>
      ${p ? `<label class="check"><input type="checkbox" name="active" ${p.active ? 'checked' : ''}> Showing to staff</label><div class="mt"><button type="button" class="btn small danger" id="poldel">Delete</button></div>` : ''}`,
    onOpen: (d, close) => { const del = $('#poldel', d); if (del) del.onclick = hrTry(async () => { if (!confirm('Delete this policy?')) return; await q(sb.rpc('hr_policy_delete', { p_id: p.id })); close(null); toast('Deleted'); render({ quiet: true }); }); },
    onSubmit: async (x, d) => { const f = await hrReadFile($('#polf', d).files[0]); if (!p && !f) throw new Error('Choose the file.');
      await q(sb.rpc('hr_policy_save', { p: { id: p?.id, title: x.title, category: x.category, require_confirm: !!x.require_confirm, active: p ? !!x.active : true, ...(f || {}) } })); toast('Saved'); render({ quiet: true }); } });
}

// ================================================================ SETTINGS · LEAVE TYPES, HOLIDAYS
async function hrSetLeave() {
  const [types, days] = await Promise.all([q(sb.from('hr_leave_types').select('*').order('sort')), q(sb.from('hr_leave_days').select('*'))]);
  hrSetLeave.types = types; hrSetLeave.days = days;
  const grades = S.hr.lists.filter(l => l.kind === 'grade' && l.active);
  const dayCell = (t, g) => { const r = days.find(x => x.type_id === t.id && (x.grade_id || null) === (g ? g.id : null)); return r ? +r.days : ''; };
  return `<section class="panel"><header><h2>Leave types</h2><span class="meta">${types.length}</span><div class="right"><button class="btn small primary" id="ltnew">${ico('plus')}Add a leave type</button></div></header>
    <div class="body muted">Days a year can differ by grade. A grade left blank gets the “Everyone” number. The leave year is January to December; new joiners get a share for the months left${grades.length ? '' : '. Add your grades in Lists to set days per grade'}.</div>
    <div class="tablewrap"><table class="t stack"><thead><tr><th>Leave type</th><th class="num">Everyone</th>${grades.map(g => `<th class="num">${esc(g.name)}</th>`).join('')}<th>Rules</th><th></th></tr></thead><tbody>
    ${types.map(t => `<tr class="${t.active ? '' : 'off'}"><td class="name">${esc(t.name)}${t.shows_as === 'training' ? ' ' + chip('reserved', 'Training') : ''}${!t.paid ? ' ' + chip('muted', 'Unpaid') : ''}${t.active ? '' : ' ' + chip('muted', 'Off')}</td>
      <td class="num">${t.unlimited ? '—' : dayCell(t, null)}</td>${grades.map(g => `<td class="num">${t.unlimited ? '—' : dayCell(t, g)}</td>`).join('')}
      <td class="sub">${[t.gender !== 'any' ? (t.gender === 'female' ? 'Women' : 'Men') + ' only' : '', t.after_confirmation ? 'After confirmation' : '', t.relief_required ? 'Relief officer' : '', t.doc_after_days != null ? `Document after ${t.doc_after_days} days` : '',
        t.min_notice_days ? `${t.min_notice_days} days’ notice` : '', t.allow_past ? 'Can be back-dated' : '', t.max_days ? `Max ${t.max_days} at a time` : '', +t.carry_max ? `Carry over ${+t.carry_max}${t.carry_until_month ? ' until end of ' + MONTHS[t.carry_until_month - 1] : ''}` : '', t.working_days ? '' : 'Calendar days'].filter(Boolean).join(' · ')}</td>
      <td class="num"><button class="btn small" data-lt="${t.id}">Edit</button></td></tr>`).join('')}</tbody></table></div></section>`;
}
function hrBindLeave(main) {
  const form = t => { const grades = S.hr.lists.filter(l => l.kind === 'grade' && l.active); const dv = g => { const r = (hrSetLeave.days || []).find(x => x.type_id === t?.id && (x.grade_id || null) === g); return r ? +r.days : ''; };
    const types = S.hr.lists.filter(l => l.kind === 'emp_type' && l.active);
    return modal({ title: t ? 'Edit leave type' : 'Add a leave type', wide: true, submit: 'Save',
      body: `<div class="row2"><label class="f">Name<input name="name" value="${esc(t?.name || '')}" required></label>
          <label class="f">Shows in “Who’s out” as<select name="shows_as">${opt('leave', 'Leave', t?.shows_as)}${opt('training', 'Training', t?.shows_as)}</select></label></div>
        <div class="pjf-sec">Days a year</div>
        <label class="check"><input type="checkbox" name="unlimited" id="ltun" ${t?.unlimited ? 'checked' : ''}> No set limit (e.g. unpaid leave)</label>
        <div class="row4" id="ltdays"><label class="f">Everyone<input type="number" step="0.5" min="0" name="d_" value="${dv(null)}"></label>${grades.map(g => `<label class="f">${esc(g.name)}<input type="number" step="0.5" min="0" name="d_${g.id}" value="${dv(g.id)}" placeholder="as everyone"></label>`).join('')}</div>
        <label class="check"><input type="checkbox" name="prorate" ${t ? (t.prorate ? 'checked' : '') : 'checked'}> New joiners get a share for the months left in the year</label>
        <div class="pjf-sec">Who can take it</div>
        <div class="row3"><label class="f">Gender<select name="gender">${opt('any', 'Anyone', t?.gender)}${opt('female', 'Women only', t?.gender)}${opt('male', 'Men only', t?.gender)}</select></label>
          <label class="check" style="align-self:end"><input type="checkbox" name="after_confirmation" ${t?.after_confirmation ? 'checked' : ''}> Only after confirmation</label>
          <label class="check" style="align-self:end"><input type="checkbox" name="paid" ${t ? (t.paid ? 'checked' : '') : 'checked'}> Paid leave</label></div>
        ${types.length ? `<div class="f">Employment types <span class="hint">None ticked = everyone</span>${types.map(e => `<label class="check"><input type="checkbox" name="et_${e.id}" ${(t?.emp_types || []).includes(e.id) ? 'checked' : ''}> ${esc(e.name)}</label>`).join('')}</div>` : ''}
        <div class="pjf-sec">Rules</div>
        <div class="row4"><label class="f">Notice (days)<input type="number" min="0" name="min_notice_days" value="${t?.min_notice_days ?? 0}"></label><label class="f">Most days at a time<input type="number" min="1" name="max_days" value="${t?.max_days ?? ''}" placeholder="no limit"></label>
          <label class="f">Document after (days)<input type="number" min="0" name="doc_after_days" value="${t?.doc_after_days ?? ''}" placeholder="never"></label><label class="f">Carry over (days)<input type="number" step="0.5" min="0" name="carry_max" value="${t ? +t.carry_max : 0}"></label></div>
        <div class="row3"><label class="f">Carried days used by the end of<select name="carry_until_month"><option value="">Any time next year</option>${MONTHS.map((m, i) => opt(i + 1, m, t?.carry_until_month)).join('')}</select></label>
          <label class="check" style="align-self:end"><input type="checkbox" name="relief_required" ${t?.relief_required ? 'checked' : ''}> Needs a relief officer</label>
          <label class="check" style="align-self:end"><input type="checkbox" name="allow_past" ${t?.allow_past ? 'checked' : ''}> Can be applied for afterwards</label></div>
        <label class="check"><input type="checkbox" name="working_days" ${t ? (t.working_days ? 'checked' : '') : 'checked'}> Count working days only (no weekends or public holidays)</label>
        <label class="f">Note for staff <span class="hint">Optional</span><input name="notes" value="${esc(t?.notes || '')}"></label>
        ${t ? `<label class="check"><input type="checkbox" name="active" ${t.active ? 'checked' : ''}> In use</label><div class="mt"><button type="button" class="btn small danger" id="ltdel">Delete</button></div>` : ''}`,
      onOpen: (d, close) => { const un = $('#ltun', d); const s = () => { $('#ltdays', d).hidden = un.checked; }; un.onchange = s; s();
        const del = $('#ltdel', d); if (del) del.onclick = hrTry(async () => { if (!confirm('Delete this leave type?')) return; await q(sb.rpc('hr_leave_type_delete', { p_id: t.id })); close(null); toast('Deleted'); render({ quiet: true }); }); },
      onSubmit: x => hrSave('hr_leave_type_save', { p: { id: t?.id, name: x.name, shows_as: x.shows_as, unlimited: !!x.unlimited, prorate: !!x.prorate, gender: x.gender, after_confirmation: !!x.after_confirmation, paid: !!x.paid,
        emp_types: types.filter(e => x['et_' + e.id]).map(e => e.id), min_notice_days: x.min_notice_days, max_days: x.max_days, doc_after_days: x.doc_after_days, carry_max: x.carry_max, carry_until_month: x.carry_until_month,
        relief_required: !!x.relief_required, allow_past: !!x.allow_past, working_days: !!x.working_days, notes: x.notes, active: t ? !!x.active : true,
        days: [{ grade_id: null, days: x.d_ }, ...grades.map(g => ({ grade_id: g.id, days: x['d_' + g.id] }))] } }) }); };
  $('#ltnew', main).onclick = () => form(null);
  $$('[data-lt]', main).forEach(b => b.onclick = () => form(hrSetLeave.types.find(t => t.id === +b.dataset.lt)));
}
async function hrSetHolidays() {
  HR_HOL.at = 0; await hrHolidays();
  return `<section class="panel"><header><h2>Public holidays</h2><span class="meta">${HR_HOL.list.length}</span><div class="right"><button class="btn small primary" id="hnew">${ico('plus')}Add a holiday</button></div></header>
    <div class="body muted">Add each year’s public holidays as the government announces them (including days moved to a Monday). Leave counts working days around them, and staff see them in Company → Holidays and on Discover.</div>
    ${HR_HOL.list.length ? `<ul class="list">${HR_HOL.list.slice().reverse().map(h => `<li class="hol"><span class="cal"><b>${new Date(h.day + 'T00:00:00').toLocaleDateString('en-GB', { month: 'short' }).toUpperCase()}</b><span>${+h.day.slice(8)}</span></span><div style="flex:1"><div class="name">${esc(h.name)}</div><div class="sub">${new Date(h.day + 'T00:00:00').toLocaleDateString('en-GB', { weekday: 'long', year: 'numeric' })}</div></div>
      <div class="end"><button class="btn small" data-hed="${h.id}">Edit</button> <button class="btn small link danger" data-hdel="${h.id}">Delete</button></div></li>`).join('')}</ul>` : '<div class="empty">No holidays yet.</div>'}</section>`;
}
function hrBindHolidays(main) {
  const form = h => modal({ title: h ? 'Edit holiday' : 'Add a public holiday', submit: 'Save', body: `<div class="row2"><label class="f">Date<input type="date" name="day" value="${h?.day || ''}" required></label><label class="f">Name<input name="name" value="${esc(h?.name || '')}" placeholder="e.g. Democracy Day" required></label></div>`,
    onSubmit: x => hrSave('hr_holiday_save', { p: { id: h?.id, day: x.day, name: x.name } }) });
  $('#hnew', main).onclick = () => form(null);
  $$('[data-hed]', main).forEach(b => b.onclick = () => form(HR_HOL.list.find(h => h.id === +b.dataset.hed)));
  $$('[data-hdel]', main).forEach(b => b.onclick = hrTry(() => confirm('Delete this holiday?') && hrSave('hr_holiday_delete', { p_id: +b.dataset.hdel }, 'Deleted')));
}
