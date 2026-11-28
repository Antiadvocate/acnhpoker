import { MUSCLES, MUSCLE_NAME, EQUIPMENT, SESSION_TYPES } from './data.js';
import { S, save, saveSoon, replaceState, exportState, DAY, uid, dayKey, fmt, allExercises, exById, isAvailable, addCustomExercise, doneSets, lifts, e1rm, workoutStats, workoutMuscles, muscleVolume, targets, lastPerf, exerciseSeries, bestE1rm, trainedExercises, addWorkout, latestWeight, setBodyWeight, setSleep } from './store.js';
import { recommend, generateLocal, makeExercise, estMinutes, plateCalc, warmups, progression } from './engine.js';
import { listModels, chat, systemPrompt, splitWorkoutBlocks, planToWorkout, generateAI } from './ai.js';
import { importStrong, importWithings } from './importers.js';
import { lineChart, initCharts } from './charts.js';

const $ = (s, r = document) => r.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const ui = { tab: 'today', view: S.active ? 'workout' : null, busy: false, building: false, stream: null, msg: '', trendEx: null, tpl: null, pick: null, models: null, modelSort: 'name', plan: null };
const U = () => S.profile.units;
const clock = s => { s = Math.max(0, Math.round(s)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
const dateLabel = t => new Date(t).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
const ICON = {
  today: '<path d="M13 2 4 14h7l-1 8 9-12h-7z"/>', history: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  progress: '<path d="M4 19V10M10 19V5M16 19v-7M21 19H3"/>', coach: '<path d="M4 5h16v11H9l-5 4z"/>', you: '<circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 4-6 8-6s8 2 8 6"/>',
};
const icon = n => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${ICON[n]}</svg>`;

function toast(msg, ms = 2600) {
  const t = $('#toast'); t.textContent = msg; t.classList.add('on');
  clearTimeout(toast.t); toast.t = setTimeout(() => t.classList.remove('on'), ms);
}
function getRoot(path) { return path.startsWith('ui.') ? [ui, path.slice(3)] : [S, path]; }
function setPath(path, val) { let [o, p] = getRoot(path); const ks = p.split('.'); for (const k of ks.slice(0, -1)) o = o[k]; o[ks[ks.length - 1]] = val; }
function getPath(path) { let [o, p] = getRoot(path); for (const k of p.split('.')) o = o?.[k]; return o; }
const chips = (path, opts, cur) => `<div class="chips">${opts.map(([v, l]) => `<button class="chip ${String(cur) === String(v) ? 'on' : ''}" data-a="set" data-path="${path}" data-val="${esc(v)}">${esc(l)}</button>`).join('')}</div>`;

function checkin() {
  const k = dayKey();
  if (!S.today || S.today.date !== k) {
    const sl = S.sleepLog.find(x => x.date === k);
    S.today = { date: k, energy: 3, sleep: sl ? sl.hours : 7, time: +S.profile.sessionMin || 60, focus: 'auto', sore: [] };
  }
  return S.today;
}

// ---------- barbell loading picture ----------
const barOf = e => { const k = e.bar || S.barPref[e.exId] || (/\bez\b/i.test(e.name) ? 'ez' : 'oly'); return { k, w: k === 'ez' ? (+S.gear.ezWeight || 0) : (+S.gear.barWeight || 45) }; };
const plateTarget = e => +(e.sets.find(s => !s.done && +s.w > 0) || [...e.sets].reverse().find(s => +s.w > 0) || {}).w || 0;
function plateVis(e, w = plateTarget(e)) {
  w = +w || 0; const bar = barOf(e);
  if (!w) return `<div class="pinfo"><span class="muted small">Enter a weight and the plates show up here.</span></div>`;
  const pc = plateCalc(w, bar.w);
  if (w < bar.w) return `<div class="pinfo"><b>${fmt(w)} ${U()}</b><span class="muted small">Lighter than the ${fmt(bar.w)} ${U()} bar</span></div>`;
  const plate = p => `<i class="pl ${p >= 45 ? 'p45' : ''}" style="height:${Math.round(24 + Math.sqrt(p / 45) * 44)}px;width:${p >= 25 ? 22 : p >= 10 ? 17 : 13}px"><span>${fmt(p)}</span></i>`;
  return `<div class="pinfo"><b>${fmt(w)} ${U()}</b><span class="${pc.left ? 'danger' : 'muted'} small">${pc.left ? `Can't load ${fmt(pc.left)} ${U()} with your plates` : pc.out.length ? `Each side: ${pc.out.map(fmt).join(' + ')}` : 'Empty bar'}</span></div>
  <div class="pbar" role="img" aria-label="${fmt(bar.w)} ${U()} bar, each side: ${pc.out.map(fmt).join(', ') || 'no plates'}"><span class="grip">${fmt(bar.w)} ${U()}</span><span class="collar"></span>${pc.out.map(plate).join('')}<span class="sleeve"></span></div>`;
}
function plateBox(e, ei) {
  const bar = barOf(e);
  return `<div class="plates" id="pl${ei}"><div class="pvis">${plateVis(e)}</div>
  <div class="pctl"><button class="chip sm ${bar.k === 'oly' ? 'on' : ''}" data-a="barSet" data-ei="${ei}" data-v="oly">Olympic ${fmt(S.gear.barWeight)}</button><button class="chip sm ${bar.k === 'ez' ? 'on' : ''}" data-a="barSet" data-ei="${ei}" data-v="ez">EZ bar</button>${bar.k === 'ez' ? `<input class="ezw" inputmode="decimal" data-num="1" data-bind="gear.ezWeight" data-ei="${ei}" value="${esc(S.gear.ezWeight)}" aria-label="EZ bar weight"><span class="muted small">${U()}</span>` : ''}</div></div>`;
}

// ================= views =================
function vOnboard() {
  const p = S.profile;
  return `<div class="onboard">
  <div class="brand">Hyper</div>
  <h1>Let's set up your gym.</h1>
  <p class="muted">Everything stays on this device. Change any of it later.</p>
  <section class="card"><h2>You</h2>
    <label class="field"><span>Bodyweight</span><div class="inline"><input inputmode="decimal" data-bind="profile.bodyweight" value="${esc(p.bodyweight)}" placeholder="e.g. 180">${chips('profile.units', [['lb', 'lb'], ['kg', 'kg']], p.units)}</div></label>
    <label class="field"><span>Training experience</span>${chips('profile.experience', [['beginner', '< 1 yr'], ['intermediate', '1–4 yrs'], ['advanced', '5+ yrs']], p.experience)}</label>
    <label class="field"><span>Lifting days per week</span>${chips('profile.daysPerWeek', [[3, '3'], [4, '4'], [5, '5']], p.daysPerWeek)}</label>
    <label class="field"><span>Usual session length</span>${chips('profile.sessionMin', [[30, '30m'], [45, '45m'], [60, '60m'], [75, '75m'], [90, '90m']], p.sessionMin)}</label>
    <label class="field"><span>Anything the coach must work around?</span><textarea data-bind="profile.notes" rows="2" placeholder="Injuries, asymmetries, movements that don't agree with you…">${esc(p.notes)}</textarea></label>
  </section>
  <section class="card"><h2>Equipment</h2><p class="muted small">Pre-checked from your garage photos. Fix anything I got wrong — the white multi-gym especially.</p>${equipList()}</section>
  <section class="card"><h2>Coach <span class="muted small">optional</span></h2>
    <p class="muted small">Paste an OpenRouter key to get AI-built sessions and a coach that reads your log. Without it the app still builds workouts offline.</p>
    <label class="field"><span>OpenRouter API key</span><input type="password" autocomplete="off" data-bind="ai.key" value="${esc(S.ai.key)}" placeholder="sk-or-…"></label>
  </section>
  <button class="btn primary big" data-a="onboardDone">Start training</button></div>`;
}
const equipList = () => `<div class="checks">${EQUIPMENT.map(e => `<button class="check ${S.equipment[e.id] ? 'on' : ''}" data-a="toggle" data-path="equipment.${e.id}"><i></i>${esc(e.name)}</button>`).join('')}</div>`;

function weekStrip() {
  const days = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(Date.now() - i * DAY), k = dayKey(d);
    const ws = S.workouts.filter(w => dayKey(w.start) === k);
    const kind = ws.some(w => w.exercises?.length) ? 'lift' : ws.some(w => w.cardio) ? 'walk' : '';
    days.push(`<div class="day ${kind} ${i === 0 ? 'now' : ''}"><span>${d.toLocaleDateString('en-US', { weekday: 'narrow' })}</span><i></i></div>`);
  }
  const n = lifts().filter(w => w.start > Date.now() - 7 * DAY).length;
  return `<div class="week"><div class="days">${days.join('')}</div><div class="muted small">${n}/${S.profile.daysPerWeek} lifts · last 7 days</div></div>`;
}

function planRows(exs) {
  return `<ol class="plan">${exs.map(e => `<li><div><b>${esc(e.name)}</b><span class="muted small">${e.sets.length} × ${e.repRange[0]}–${e.repRange[1]} · RIR ${e.rir} · rest ${clock(e.restSec)}${e.sets[0]?.w ? ` · ${e.sets[0].w} ${U()}` : ''}</span>${e.note ? `<span class="note">${esc(e.note)}</span>` : ''}</div><span class="tag">${MUSCLE_NAME[exById(e.exId).primary]}</span></li>`).join('')}</ol>`;
}

function vToday() {
  const c = checkin(), rec = recommend(c), h = new Date().getHours();
  const hello = h < 5 ? 'Night shift' : h < 12 ? 'Morning' : h < 17 ? 'Afternoon' : h < 22 ? 'Evening' : 'Late one';
  const d = S.draft;
  return `<header class="top"><div><div class="eyebrow">${new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}</div><h1>${hello}${S.profile.name ? ', ' + esc(S.profile.name) : ''}.</h1></div></header>
  ${weekStrip()}
  ${S.active ? `<button class="card resume" data-a="resume"><div><b>${esc(S.active.title)}</b><span class="muted small">In progress · <span id="elapsed2">${clock((Date.now() - S.active.start) / 1000)}</span></span></div><span class="btn primary">Resume</span></button>` : ''}
  <section class="card"><h2>How are you showing up?</h2>
    <div class="field"><span>Energy</span>${chips('today.energy', [[1, 'Wrecked'], [2, 'Low'], [3, 'OK'], [4, 'Good'], [5, 'Charged']], c.energy)}</div>
    <div class="field two"><div><span>Sleep</span><div class="stepper"><button data-a="step" data-path="today.sleep" data-d="-0.5">−</button><b>${fmt(c.sleep)} h</b><button data-a="step" data-path="today.sleep" data-d="0.5">+</button></div></div>
      <div><span>Time</span><div class="stepper"><button data-a="step" data-path="today.time" data-d="-5">−</button><b>${c.time} min</b><button data-a="step" data-path="today.time" data-d="5">+</button></div></div></div>
    <div class="field"><span>Focus</span>${chips('today.focus', [['auto', 'Auto'], ...Object.entries(SESSION_TYPES).map(([k, v]) => [k, v.name])], c.focus)}</div>
    <div class="field"><span>Sore</span><div class="chips">${MUSCLES.map(m => `<button class="chip sm ${c.sore.includes(m.id) ? 'on' : ''}" data-a="sore" data-m="${m.id}">${m.name}</button>`).join('')}</div></div>
  </section>
  <section class="card rec"><div class="eyebrow">Today's call</div><h2>${esc(rec.head)}</h2><p class="muted">${esc(rec.detail)}</p>
    <div class="row"><button class="btn primary" data-a="buildAI" ${ui.building ? 'disabled' : ''}>${ui.building ? '<span class="spin"></span> Coach is thinking…' : 'Build with coach'}</button><button class="btn" data-a="buildQuick">Quick build</button></div>
    ${rec.kind !== 'lift' ? `<button class="btn ghost wide" data-a="walkSheet">Log an incline walk instead</button>` : ''}
  </section>
  ${d ? `<section class="card draft" id="draft"><div class="eyebrow">${d.source === 'coach' ? `Coach · ${esc(S.ai.model.split('/').pop())}` : 'Quick build'} · ~${estMinutes(d.exercises)} min · ${d.exercises.reduce((a, e) => a + e.sets.length, 0)} sets</div><h2>${esc(d.title)}</h2>${d.rationale ? `<p class="muted">${esc(d.rationale)}</p>` : ''}${planRows(d.exercises)}
    <button class="btn primary big" data-a="startDraft">Start workout</button><div class="row"><button class="btn ghost" data-a="draftTpl">Save as template</button><button class="btn ghost" data-a="draftDrop">Discard</button></div></section>` : ''}
  <section class="card"><div class="head"><h2>Templates</h2><button class="link" data-a="tplNew">+ New</button></div>
    ${S.templates.length ? `<div class="list">${S.templates.map(t => `<button class="item" data-a="tplOpen" data-id="${t.id}"><div><b>${esc(t.name)}</b><span class="muted small">${t.exercises.map(e => esc(exById(e.exId).name)).join(', ')}</span></div><span class="chev">›</span></button>`).join('')}</div>` : '<p class="muted small">No templates. Build one, or ask the coach to.</p>'}
    <button class="btn ghost wide" data-a="ask" data-q="Look at my saved templates and my log. Tell me what's wrong with the current split, then design a better week for hypertrophy with my equipment and give me the first session.">Have the coach rebuild my split</button>
  </section>
  ${rec.kind === 'lift' ? `<button class="btn ghost wide" data-a="walkSheet">Log an incline walk</button>` : ''}
  <button class="btn ghost wide" data-a="emptyStart">Start an empty workout</button>`;
}

function vWorkout() {
  const w = S.active;
  const total = w.exercises.reduce((a, e) => a + e.sets.length, 0), done = w.exercises.reduce((a, e) => a + e.sets.filter(s => s.done).length, 0);
  return `<header class="wtop"><button class="link" data-a="minimize">‹ Back</button><div class="wmeta"><b id="elapsed">${clock((Date.now() - w.start) / 1000)}</b><span class="muted small">${done}/${total} sets</span></div><button class="btn primary sm" data-a="finish">Finish</button></header>
  <div class="progress"><i style="width:${total ? done / total * 100 : 0}%"></i></div>
  <input class="title" data-bind="active.title" value="${esc(w.title)}" aria-label="Workout name">
  ${w.rationale ? `<p class="muted small pad">${esc(w.rationale)}</p>` : ''}
  ${w.exercises.map((e, ei) => {
    const ex = exById(e.exId), lp = lastPerf(e.exId);
    return `<section class="card ex"><div class="head"><div><h3>${esc(e.name)}</h3><span class="muted small">${e.sets.length} × ${e.repRange[0]}–${e.repRange[1]} · RIR ${e.rir} · rest ${clock(e.restSec)}</span></div><button class="more" data-a="exMenu" data-ei="${ei}" aria-label="Exercise options">⋯</button></div>
    ${e.note ? `<p class="note">${esc(e.note)}</p>` : ''}${e.hint ? `<p class="hint">${esc(e.hint)}</p>` : ''}${ex.load === 'bb' ? plateBox(e, ei) : ''}
    <div class="sets"><div class="set hd"><span>Set</span><span>Last</span><span>${ex.load === 'bw' ? '+' + U() : U()}</span><span>Reps</span><span>RIR</span><span></span></div>
    ${e.sets.map((s, si) => {
      const pv = lp?.sets[si];
      return `<div class="set ${s.done ? 'done' : ''}"><span class="n">${si + 1}</span><span class="prev">${pv ? `${fmt(pv.w) || 'BW'}×${pv.r}` : '—'}</span>
      <input inputmode="decimal" data-bind="active.exercises.${ei}.sets.${si}.w" value="${esc(s.w)}" placeholder="${ex.load === 'bw' ? 'BW' : (pv ? fmt(pv.w) : '')}" aria-label="Weight">
      <input inputmode="numeric" data-bind="active.exercises.${ei}.sets.${si}.r" value="${esc(s.r)}" placeholder="${s.t || (pv ? pv.r : e.repRange[0] + '–' + e.repRange[1])}" aria-label="Reps">
      <button class="rir" data-a="rir" data-ei="${ei}" data-si="${si}">${s.rir == null ? '–' : s.rir}</button>
      <button class="tick" data-a="done" data-ei="${ei}" data-si="${si}" aria-label="Complete set">✓</button></div>`;
    }).join('')}</div>
    <div class="row"><button class="btn ghost sm" data-a="addSet" data-ei="${ei}">+ Set</button>${e.sets.length > 1 ? `<button class="btn ghost sm" data-a="delSet" data-ei="${ei}">− Set</button>` : ''}</div></section>`;
  }).join('')}
  <button class="btn wide" data-a="pickOpen" data-mode="add">+ Add exercise</button>
  <button class="btn ghost wide danger" data-a="cancelWorkout">Discard workout</button>
  <div class="dock" id="dock" hidden><div class="dbar"><i id="dockbar"></i></div><div class="drow"><button data-a="timerAdj" data-d="-15">−15</button><div><span class="muted small">Rest</span><b id="docktime">0:00</b></div><button data-a="timerAdj" data-d="15">+15</button><button class="skip" data-a="timerSkip">Skip</button></div></div>`;
}

function vHistory() {
  const ws = [...S.workouts].reverse();
  if (!ws.length) return `<header class="top"><h1>History</h1></header><div class="empty"><p>Nothing logged yet.</p><p class="muted small">Years of Strong data? Import the CSV under You → Data and the coach gets smarter immediately.</p></div>`;
  let month = '';
  return `<header class="top"><h1>History</h1><span class="muted small">${ws.length} sessions</span></header>` + ws.slice(0, 150).map(w => {
    const m = new Date(w.start).toLocaleDateString('en-US', { month: 'long', year: 'numeric' }), st = workoutStats(w);
    const head = m !== month ? `<div class="month">${month = m}</div>` : '';
    return head + `<button class="card item hist" data-a="histOpen" data-id="${w.id}"><div><b>${esc(w.title)}</b><span class="muted small">${dateLabel(w.start)} · ${w.cardio ? `${w.cardio.min} min${w.cardio.incline ? ` @ ${w.cardio.incline}%` : ''}` : `${st.minutes} min · ${st.sets} sets · ${Math.round(st.volume).toLocaleString()} ${U()}`}</span>${w.cardio ? '' : `<span class="muted small clip">${w.exercises.map(e => esc(e.name)).join(', ')}</span>`}</div><span class="chev">›</span></button>`;
  }).join('');
}

function vProgress() {
  const now = Date.now(), vol = muscleVolume(now - 7 * DAY), T = targets();
  const l7 = lifts().filter(w => w.start > now - 7 * DAY), l28 = lifts().filter(w => w.start > now - 28 * DAY).length;
  const sets7 = l7.reduce((a, w) => a + workoutStats(w).sets, 0);
  const sl = S.sleepLog.filter(x => x.date >= dayKey(now - 7 * DAY)), slAvg = sl.length ? sl.reduce((a, x) => a + x.hours, 0) / sl.length : null;
  const tr = trainedExercises();
  if (!ui.trendEx || !tr.some(t => t.ex.id === ui.trendEx)) ui.trendEx = tr[0]?.ex.id || null;
  const series = ui.trendEx ? exerciseSeries(ui.trendEx) : [];
  const max = Math.max(...MUSCLES.map(m => Math.max(vol[m.id] || 0, T[m.id])), 1) * 1.1;
  const bw = S.body.slice(-90).map(b => ({ t: new Date(b.date + 'T12:00').getTime(), v: b.weight }));
  return `<header class="top"><h1>Progress</h1></header>
  <div class="tiles"><div class="tile"><span>Lifts · 7d</span><b>${l7.length}<small>/${S.profile.daysPerWeek}</small></b></div><div class="tile"><span>Hard sets · 7d</span><b>${sets7}</b></div><div class="tile"><span>Lifts · 28d</span><b>${l28}</b></div><div class="tile"><span>Sleep · 7d avg</span><b>${slAvg ? fmt(Math.round(slAvg * 10) / 10) + '<small> h</small>' : '—'}</b></div></div>
  <section class="card"><h2>Weekly sets per muscle</h2><p class="muted small">Last 7 days against your target. Secondary work counts half. The tick is the target.</p>
    <div class="bars">${MUSCLES.map(m => { const v = vol[m.id] || 0, t = T[m.id]; return `<div class="bar ${v >= t ? 'hit' : ''}" title="${m.name}: ${fmt(v)} of ${t} sets"><span class="bl">${m.name}</span><div class="bt"><i style="width:${Math.min(100, v / max * 100)}%"></i><u style="left:${t / max * 100}%"></u></div><span class="bv">${fmt(v)}<small>/${t}</small></span></div>`; }).join('')}</div></section>
  <section class="card"><h2>Strength trend</h2>${tr.length ? `<select data-bind="ui.trendEx" data-render="1">${tr.map(t => `<option value="${t.ex.id}" ${t.ex.id === ui.trendEx ? 'selected' : ''}>${esc(t.ex.name)} (${t.n})</option>`).join('')}</select><p class="muted small">Estimated 1-rep max per session, ${U()}. For hypertrophy the line just needs to drift up.</p>${lineChart(series, { unit: U(), label: 'Estimated 1RM' })}` : '<div class="empty small">Log a few sessions and your lifts chart here.</div>'}</section>
  <section class="card"><h2>Bodyweight</h2><div class="inline"><input inputmode="decimal" id="bwIn" placeholder="${latestWeight() ?? 'Today'} ${U()}"><button class="btn" data-a="logWeight">Log</button></div>${lineChart(bw, { unit: U(), label: 'Bodyweight' })}
    <div class="inline" style="margin-top:12px"><input inputmode="decimal" id="slIn" placeholder="Last night's sleep (h)"><button class="btn" data-a="logSleep">Log</button></div></section>
  <button class="btn primary wide" data-a="ask" data-q="Review my last two weeks: volume per muscle vs target, strength trends, adherence, sleep and bodyweight. Tell me the two or three things I should change, with numbers.">Ask the coach what to change</button>`;
}

function md(t) {
  return esc(t).split('\n').map(l => l.replace(/^#{1,4}\s+(.*)$/, '<b>$1</b>').replace(/^\s*[-*]\s+/, '• ')).join('<br>')
    .replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>').replace(/`([^`]+)`/g, '<code>$1</code>');
}
function renderParts(text, mi) {
  return splitWorkoutBlocks(text).map((p, pi) => {
    if (p.pending) return `<div class="wcard muted small"><span class="spin"></span> Writing the session…</div>`;
    if (p.plan) return `<div class="wcard"><b>${esc(p.plan.title || 'Session')}</b><ol>${p.plan.exercises.map(e => `<li>${esc(e.name)} <span class="muted">${esc(e.sets)} × ${esc(Array.isArray(e.reps) ? e.reps.join('–') : e.reps)}</span></li>`).join('')}</ol>${mi >= 0 ? `<button class="btn primary sm" data-a="coachPlan" data-mi="${mi}" data-pi="${pi}">Open this workout</button>` : ''}</div>`;
    const t = p.text.trim(); return t ? `<div>${md(t)}</div>` : '';
  }).join('');
}
function vCoach() {
  const quick = ["What should I train today and why?", "What's wrong with my current split?", 'Build me a 5-day hypertrophy split for my gym', 'Debrief my last session', 'Where am I stalling?'];
  return `<header class="top"><h1>Coach</h1><button class="chip model" data-a="modelSheet">${esc(S.ai.model.split('/').pop())} ▾</button></header>
  <div class="chat" id="chat">${!S.chat.length ? `<div class="empty"><p>${S.ai.key ? 'The coach sees your log, check-ins, equipment and metrics.' : 'Add an OpenRouter key and the coach can read your log and build sessions.'}</p>${S.ai.key ? '' : '<button class="btn primary" data-a="keySheet">Add API key</button>'}<p class="muted small">The more you log, the less generic it gets.</p></div>` : ''}
    ${S.chat.map((m, i) => `<div class="msg ${m.role} ${m.err ? 'err' : ''}">${m.role === 'user' ? esc(m.content) : renderParts(m.content, i)}</div>`).join('')}
    ${ui.busy ? `<div class="msg assistant" id="stream">${ui.stream ? renderParts(ui.stream, -1) : '<span class="spin"></span>'}</div>` : ''}
  </div>
  <div class="quick">${quick.map(q => `<button class="chip sm" data-a="ask" data-q="${esc(q)}">${esc(q)}</button>`).join('')}${S.chat.length ? '<button class="chip sm" data-a="chatClear">Clear chat</button>' : ''}</div>
  <div class="composer"><textarea id="msg" rows="1" data-bind="ui.msg" placeholder="Ask your coach…">${esc(ui.msg)}</textarea><button class="btn primary" data-a="send" ${ui.busy ? 'disabled' : ''}>Send</button></div>`;
}

function vYou() {
  const p = S.profile;
  return `<header class="top"><h1>You</h1></header>
  <section class="card"><h2>Profile</h2>
    <label class="field"><span>Name</span><input data-bind="profile.name" value="${esc(p.name)}" placeholder="Optional"></label>
    <div class="field two"><label><span>Bodyweight (${U()})</span><input inputmode="decimal" data-bind="profile.bodyweight" value="${esc(p.bodyweight)}"></label><label><span>Age</span><input inputmode="numeric" data-bind="profile.age" value="${esc(p.age)}"></label></div>
    <div class="field"><span>Units</span>${chips('profile.units', [['lb', 'lb'], ['kg', 'kg']], p.units)}</div>
    <div class="field"><span>Experience</span>${chips('profile.experience', [['beginner', '< 1 yr'], ['intermediate', '1–4 yrs'], ['advanced', '5+ yrs']], p.experience)}</div>
    <div class="field"><span>Lifting days per week</span>${chips('profile.daysPerWeek', [[2, '2'], [3, '3'], [4, '4'], [5, '5'], [6, '6']], p.daysPerWeek)}</div>
    <label class="field"><span>Body notes the coach must respect</span><textarea data-bind="profile.notes" rows="3" placeholder="Injuries, asymmetries, movements to avoid…">${esc(p.notes)}</textarea></label>
  </section>
  <section class="card"><h2>Coach</h2>
    <label class="field"><span>OpenRouter API key</span><input type="password" autocomplete="off" data-bind="ai.key" value="${esc(S.ai.key)}" placeholder="sk-or-…"></label>
    <p class="muted small">Stored only in this browser and sent only to openrouter.ai. Get one at openrouter.ai/keys.</p>
    <div class="field"><span>Model</span><button class="item boxed" data-a="modelSheet"><div><b>${esc(S.ai.model)}</b><span class="muted small">Tap to browse every model on OpenRouter</span></div><span class="chev">›</span></button></div>
    <div class="field"><span>Tone</span>${chips('ai.tone', [['blunt', 'Blunt'], ['balanced', 'Balanced'], ['gentle', 'Gentle']], S.ai.tone)}</div>
  </section>
  <section class="card"><h2>Equipment</h2>${equipList()}
    <div class="three"><label><span>Olympic bar</span><input inputmode="decimal" data-bind="gear.barWeight" data-num="1" value="${esc(S.gear.barWeight)}"></label><label><span>EZ bar</span><input inputmode="decimal" data-bind="gear.ezWeight" data-num="1" value="${esc(S.gear.ezWeight)}"></label><label><span>Dumbbell jump</span><input inputmode="decimal" data-bind="gear.dbStep" data-num="1" value="${esc(S.gear.dbStep)}"></label></div>
    <label class="field"><span>Plates you own (one of each pair)</span><input data-bind="gear.plates" value="${esc(S.gear.plates)}"></label>
  </section>
  <section class="card"><h2>Data</h2>
    <div class="list">
      <label class="item"><div><b>Import Strong history</b><span class="muted small">Strong → Settings → Export Data, then pick the CSV</span></div><span class="chev">›</span><input type="file" accept=".csv,text/csv" data-file="strong" hidden></label>
      <label class="item"><div><b>Import Withings weight or sleep</b><span class="muted small">Withings app → Settings → Download my data → weight.csv / sleep.csv</span></div><span class="chev">›</span><input type="file" accept=".csv,text/csv" data-file="withings" hidden></label>
      <button class="item" data-a="exportData"><div><b>Export backup</b><span class="muted small">Everything except your API key, as JSON</span></div><span class="chev">›</span></button>
      <label class="item"><div><b>Restore backup</b><span class="muted small">Replaces what's on this device</span></div><span class="chev">›</span><input type="file" accept=".json,application/json" data-file="backup" hidden></label>
      <button class="item danger" data-a="resetAll"><div><b>Erase everything</b></div><span class="chev">›</span></button>
    </div>
    <p class="muted small">${S.workouts.length} sessions · ${S.body.length} weigh-ins · ${S.sleepLog.length} nights of sleep on this device. Live Withings sync needs a server to hold their OAuth secret, which a static Pages site can't do — hence the file import.</p>
  </section>`;
}

// ================= render =================
function render() {
  const app = $('#app'), y = window.scrollY, key = ui.view === 'workout' && S.active ? 'workout' : !S.profile.onboarded ? 'onboard' : ui.tab;
  const same = app.dataset.view === key;
  app.dataset.view = key;
  app.innerHTML = key === 'onboard' ? vOnboard() : key === 'workout' ? vWorkout() : { today: vToday, history: vHistory, progress: vProgress, coach: vCoach, you: vYou }[key]();
  const tabs = $('#tabs');
  tabs.hidden = key === 'onboard' || key === 'workout';
  tabs.innerHTML = ['today', 'history', 'progress', 'coach', 'you'].map(t => `<button class="${ui.tab === t ? 'on' : ''}" data-a="tab" data-t="${t}">${icon(t)}<span>${t[0].toUpperCase() + t.slice(1)}</span></button>`).join('');
  if (key === 'coach') { const c = $('#chat'); window.scrollTo(0, document.body.scrollHeight); c && (c.scrollTop = c.scrollHeight); }
  else window.scrollTo(0, same ? y : 0);
  tick();
}

function openSheet(html) { const s = $('#sheet'); s.innerHTML = `<div class="backdrop" data-a="closeSheet"></div><div class="panel"><div class="grab"></div>${html}</div>`; s.classList.add('on'); document.body.classList.add('lock'); }
function closeSheet() { $('#sheet').classList.remove('on'); $('#sheet').innerHTML = ''; document.body.classList.remove('lock'); }

// ================= timer / audio =================
let actx;
function ensureAudio() { try { actx = actx || new (window.AudioContext || window.webkitAudioContext)(); if (actx.state === 'suspended') actx.resume(); } catch { /* no audio */ } }
function beep() {
  navigator.vibrate?.([200, 100, 200]);
  if (!actx) return;
  [0, 0.22, 0.44].forEach(t => { const o = actx.createOscillator(), g = actx.createGain(); o.frequency.value = 880; o.connect(g); g.connect(actx.destination); g.gain.setValueAtTime(0.25, actx.currentTime + t); g.gain.exponentialRampToValueAtTime(0.001, actx.currentTime + t + 0.18); o.start(actx.currentTime + t); o.stop(actx.currentTime + t + 0.2); });
}
function tick() {
  const w = S.active; if (!w) return;
  const el = $('#elapsed') || $('#elapsed2'); if (el) el.textContent = clock((Date.now() - w.start) / 1000);
  const dock = $('#dock'), t = w.timer;
  if (t && Date.now() >= t.end) { w.timer = null; save(); beep(); toast('Rest over. Go.'); }
  if (!dock) return;
  if (!w.timer) { dock.hidden = true; return; }
  dock.hidden = false;
  const left = (w.timer.end - Date.now()) / 1000;
  $('#docktime').textContent = clock(left);
  $('#dockbar').style.width = Math.max(0, Math.min(100, left / w.timer.total * 100)) + '%';
}
let wake;
async function keepAwake() { try { if (S.active && ui.view === 'workout' && document.visibilityState === 'visible') wake = await navigator.wakeLock?.request('screen'); } catch { /* unsupported */ } }

// ================= workout helpers =================
function startWorkout(plan) {
  if (S.active && !confirm('A workout is already in progress. Replace it?')) return;
  S.active = { id: uid(), title: plan.title, source: plan.source || 'custom', rationale: plan.rationale || '', start: Date.now(), checkin: { ...checkin() }, exercises: JSON.parse(JSON.stringify(plan.exercises)), timer: null, planned: plan.exercises.length ? { sets: plan.exercises.reduce((a, e) => a + e.sets.length, 0), est: estMinutes(plan.exercises) } : null };
  ui.view = 'workout'; closeSheet(); save(); render(); keepAwake(); window.scrollTo(0, 0);
}
const tplToPlan = t => ({ title: t.name, source: 'template', rationale: '', exercises: t.exercises.map(e => makeExercise(e.exId, +e.sets || 3, e.repRange || [8, 12], 2, e.restSec || 120)) });
const planToTpl = p => ({ id: uid(), name: p.title, exercises: p.exercises.map(e => ({ exId: e.exId, sets: e.sets.length, repRange: e.repRange, restSec: e.restSec })) });

function summarySheet(w, prs) {
  const st = workoutStats(w), mm = Object.entries(workoutMuscles(w)).sort((a, b) => b[1] - a[1]);
  openSheet(`<div class="eyebrow">Logged</div><h2>${esc(w.title)}</h2>
  <div class="tiles"><div class="tile"><span>Time</span><b>${st.minutes}<small> min</small></b></div><div class="tile"><span>Hard sets</span><b>${st.sets}</b></div><div class="tile"><span>Volume</span><b>${Math.round(st.volume).toLocaleString()}<small> ${U()}</small></b></div><div class="tile"><span>PRs</span><b>${prs.length}</b></div></div>
  ${prs.length ? `<div class="list">${prs.map(p => `<div class="item"><div><b>${esc(p.name)}</b><span class="muted small">Estimated 1RM ${fmt(p.from)} → ${fmt(p.to)} ${U()}</span></div><span class="tag on">PR</span></div>`).join('')}</div>` : ''}
  ${w.planned ? `<div class="trow"><b>Asked vs done · ${Math.min(st.sets, w.planned.sets)}/${w.planned.sets} sets · ${st.minutes} of ~${w.planned.est} min</b>${w.exercises.filter(e => e.plan).map(e => { const v = verdict(e); return `<div class="vs"><span>${esc(e.name)}<small> ${e.plan.n} × ${e.plan.lo}–${e.plan.hi} → ${e.sets.map(s => s.r).join(', ')}</small></span><span class="tag ${v === 'Beat it' ? 'on' : ''}">${v}</span></div>`; }).join('')}<span class="muted small">Next time's targets are built from this, not from the plan.</span></div>` : ''}
  <div class="chips">${mm.map(([m, n]) => `<span class="chip sm static">${MUSCLE_NAME[m]} ${fmt(n)}</span>`).join('')}</div>
  <button class="btn primary big" data-a="closeSheet">Done</button>
  <button class="btn ghost wide" data-a="ask" data-q="Debrief the session I just finished. What went well, what the numbers say, and exactly what to do next time for each lift.">Get a coach debrief</button>`);
}

function verdict(e) {
  const p = e.plan, reps = e.sets.map(s => +s.r), top = Math.max(...e.sets.map(s => +s.w || 0));
  if (e.sets.length < p.n || reps.some(r => r < p.lo)) return 'Short';
  if (reps.every(r => r >= p.hi) || (p.w && top > p.w)) return 'Beat it';
  return 'On plan';
}

function historySheet(id) {
  const w = S.workouts.find(x => x.id === id); if (!w) return;
  const st = workoutStats(w);
  openSheet(`<div class="eyebrow">${dateLabel(w.start)} · ${new Date(w.start).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}</div><h2>${esc(w.title)}</h2>
  ${w.cardio ? `<p>${w.cardio.min} min${w.cardio.incline ? ` · incline ${w.cardio.incline}%` : ''}${w.cardio.speed ? ` · ${w.cardio.speed} mph` : ''}</p>` : `<p class="muted small">${st.minutes} min · ${st.sets} sets · ${Math.round(st.volume).toLocaleString()} ${U()}${w.checkin?.energy ? ` · energy ${w.checkin.energy}/5` : ''}</p>
  ${w.exercises.map(e => `<div class="hx"><b>${esc(e.name)}</b>${e.plan ? `<span class="muted small">Asked for ${e.plan.n} × ${e.plan.w ? fmt(e.plan.w) + ' × ' : ''}${e.plan.lo}–${e.plan.hi} · ${verdict(e)}</span>` : ''}${e.sets.map((s, i) => `<div class="hs"><span class="muted">${i + 1}</span><span>${fmt(s.w) || 'BW'} × ${s.r}${s.rir != null ? ` <small class="muted">RIR ${s.rir}</small>` : ''}</span><span class="muted small">${+s.w ? 'e1RM ' + Math.round(e1rm(s.w, s.r)) : ''}</span></div>`).join('')}</div>`).join('')}
  <div class="row"><button class="btn" data-a="histRepeat" data-id="${w.id}">Do it again</button><button class="btn" data-a="histTpl" data-id="${w.id}">Save as template</button></div>`}
  <button class="btn ghost wide danger" data-a="histDel" data-id="${w.id}">Delete session</button>`);
}

function planSheet() {
  const p = ui.plan;
  openSheet(`<div class="eyebrow">~${estMinutes(p.exercises)} min · ${p.exercises.reduce((a, e) => a + e.sets.length, 0)} sets</div><h2>${esc(p.title)}</h2>${p.rationale ? `<p class="muted">${esc(p.rationale)}</p>` : ''}${planRows(p.exercises)}
  <button class="btn primary big" data-a="planStart">Start workout</button><div class="row"><button class="btn ghost" data-a="planTpl">Save as template</button>${p.tplId ? `<button class="btn ghost" data-a="tplEdit" data-id="${p.tplId}">Edit</button><button class="btn ghost danger" data-a="tplDel" data-id="${p.tplId}">Delete</button>` : ''}</div>`);
}

function tplSheet() {
  const t = ui.tpl;
  openSheet(`<h2>${t.isNew ? 'New template' : 'Edit template'}</h2>
  <label class="field"><span>Name</span><input data-bind="ui.tpl.name" value="${esc(t.name)}" placeholder="e.g. Upper A"></label>
  ${t.exercises.map((e, i) => `<div class="trow"><div class="head"><b>${esc(exById(e.exId).name)}</b><button class="more" data-a="tplRm" data-i="${i}" aria-label="Remove">✕</button></div>
    <div class="three"><label><span>Sets</span><input inputmode="numeric" data-num="1" data-bind="ui.tpl.exercises.${i}.sets" value="${e.sets}"></label><label><span>Reps from</span><input inputmode="numeric" data-num="1" data-bind="ui.tpl.exercises.${i}.repRange.0" value="${e.repRange[0]}"></label><label><span>to</span><input inputmode="numeric" data-num="1" data-bind="ui.tpl.exercises.${i}.repRange.1" value="${e.repRange[1]}"></label></div></div>`).join('')}
  <button class="btn wide" data-a="pickOpen" data-mode="tpl">+ Add exercise</button>
  <button class="btn primary big" data-a="tplSave">Save template</button>`);
}

function pickSheet() {
  const all = ui.pick.all, list = allExercises().filter(e => all || isAvailable(e));
  openSheet(`<h2>${ui.pick.mode === 'swap' ? 'Swap exercise' : 'Add exercise'}</h2>
  <input id="pickQ" data-filter=".pk" placeholder="Search ${list.length} exercises" autocomplete="off">
  <div class="chips">${[['', 'My equipment'], ['1', 'Everything']].map(([v, l]) => `<button class="chip sm ${!!all === !!v ? 'on' : ''}" data-a="pickAll" data-v="${v}">${l}</button>`).join('')}</div>
  <div class="list scroll">${MUSCLES.map(m => { const xs = list.filter(e => e.primary === m.id); return xs.length ? `<div class="month pk-h">${m.name}</div>` + xs.map(e => `<button class="item pk" data-a="pick" data-id="${e.id}" data-s="${esc((e.name + ' ' + m.name).toLowerCase())}"><div><b>${esc(e.name)}</b><span class="muted small">${e.kind === 'c' ? 'Compound' : 'Isolation'}${lastPerf(e.id) ? ' · logged before' : ''}</span></div></button>`).join('') : ''; }).join('')}</div>
  <div class="trow"><b>Not listed? Create it</b><div class="inline"><input id="cxName" placeholder="Exercise name"><select id="cxMuscle">${MUSCLES.map(m => `<option value="${m.id}">${m.name}</option>`).join('')}</select></div><button class="btn wide" data-a="pickCreate">Create & add</button></div>`);
}

function exMenuSheet(ei) {
  const e = S.active.exercises[ei], ex = exById(e.exId);
  const work = +(e.sets.find(s => +s.w > 0)?.w) || 0, bb = ex.load === 'bb';
  const barW = barOf(e).w, wu = work ? warmups(work, bb) : [];
  const ser = exerciseSeries(e.exId);
  openSheet(`<div class="eyebrow">${MUSCLE_NAME[ex.primary]}${ex.secondary.length ? ' · ' + ex.secondary.map(m => MUSCLE_NAME[m]).join(', ') : ''}</div><h2>${esc(e.name)}</h2>
    ${wu.length ? `<div class="trow"><b>Warm-up ramp</b>${wu.map(s => `<span class="muted">${fmt(s.w)} × ${s.r}${bb ? ` — ${esc(plateCalc(s.w, barW).text)}` : ''}</span>`).join('')}</div>` : ''}
  <div class="field"><span>Rest between sets</span>${chips(`active.exercises.${ei}.restSec`, [[45, '0:45'], [60, '1:00'], [90, '1:30'], [120, '2:00'], [150, '2:30'], [180, '3:00']], e.restSec)}</div>
  ${ser.length > 1 ? `<div class="field"><span>Estimated 1RM, ${U()}</span>${lineChart(ser, { unit: U(), label: 'Estimated 1RM' })}</div>` : ''}
  <div class="row"><button class="btn" data-a="pickOpen" data-mode="swap" data-ei="${ei}">Swap</button><button class="btn" data-a="exMove" data-ei="${ei}" data-d="-1">Move up</button><button class="btn" data-a="exMove" data-ei="${ei}" data-d="1">Move down</button></div>
  <button class="btn ghost wide danger" data-a="exRemove" data-ei="${ei}">Remove from workout</button>`);
}

async function modelSheet() {
  openSheet(`<h2>Pick a model</h2><div class="empty small"><span class="spin"></span> Loading OpenRouter's list…</div>`);
  try { ui.models = await listModels(); } catch (e) { openSheet(`<h2>Pick a model</h2><p class="muted">${esc(e.message)}</p><label class="field"><span>Or type a model id</span><input data-bind="ai.model" value="${esc(S.ai.model)}"></label>`); return; }
  const sorts = { name: (a, b) => a.name.localeCompare(b.name), cheap: (a, b) => (a.pin + a.pout) - (b.pin + b.pout), pricey: (a, b) => (b.pin + b.pout) - (a.pin + a.pout), new: (a, b) => b.created - a.created };
  const ms = [...ui.models].sort(sorts[ui.modelSort]);
  const price = m => m.pin + m.pout === 0 ? 'free' : `$${fmt(m.pin)} in · $${fmt(m.pout)} out /M`;
  openSheet(`<h2>Pick a model</h2><input data-filter=".pk" placeholder="Search ${ms.length} models" autocomplete="off">
  <div class="chips">${[['name', 'A–Z'], ['new', 'Newest'], ['cheap', 'Cheapest'], ['pricey', 'Priciest']].map(([v, l]) => `<button class="chip sm ${ui.modelSort === v ? 'on' : ''}" data-a="modelSort" data-v="${v}">${l}</button>`).join('')}</div>
  <div class="list scroll tall">${ms.map(m => `<button class="item pk ${m.id === S.ai.model ? 'sel' : ''}" data-a="modelPick" data-id="${esc(m.id)}" data-s="${esc((m.name + ' ' + m.id).toLowerCase())}"><div><b>${esc(m.name)}</b><span class="muted small">${esc(m.id)}</span><span class="muted small">${price(m)} · ${Math.round(m.ctx / 1000)}k context</span></div>${m.id === S.ai.model ? '<span class="tag on">Current</span>' : ''}</button>`).join('')}</div>`);
}

function keySheet() {
  openSheet(`<h2>Connect your coach</h2><p class="muted">Paste an OpenRouter API key. It's kept in this browser and sent only to openrouter.ai.</p>
  <label class="field"><span>API key</span><input type="password" autocomplete="off" data-bind="ai.key" value="${esc(S.ai.key)}" placeholder="sk-or-…"></label>
  <p class="muted small">Create one at openrouter.ai/keys. You choose the model afterwards.</p><button class="btn primary big" data-a="keySave">Save</button>`);
}

async function sendChat(text) {
  text = (text || '').trim(); if (!text || ui.busy) return;
  closeSheet(); ui.tab = 'coach'; ui.view = null;
  if (!S.ai.key) { render(); keySheet(); return; }
  S.chat.push({ role: 'user', content: text }); ui.msg = ''; ui.busy = true; ui.stream = ''; render();
  try {
    const msgs = [{ role: 'system', content: systemPrompt(S.today) }, ...S.chat.filter(m => !m.err).slice(-16).map(({ role, content }) => ({ role, content }))];
    const full = await chat(msgs, { onToken: t => { ui.stream = t; const el = $('#stream'); if (el) { el.innerHTML = renderParts(t, -1); window.scrollTo(0, document.body.scrollHeight); } } });
    S.chat.push({ role: 'assistant', content: full || '(The model sent back nothing. Try again or switch models.)', err: !full });
  } catch (e) { S.chat.push({ role: 'assistant', content: e.message, err: true }); }
  ui.busy = false; ui.stream = null; S.chat = S.chat.slice(-80); save(); render();
}

// ================= actions =================
const A = {
  tab(el) { ui.tab = el.dataset.t; ui.view = null; render(); },
  set(el) { const cur = getPath(el.dataset.path), v = el.dataset.val; setPath(el.dataset.path, typeof cur === 'number' ? +v : v); save(); if ($('#sheet').classList.contains('on') && el.closest('#sheet')) { el.parentNode.querySelectorAll('.chip').forEach(c => c.classList.toggle('on', c === el)); } else render(); },
  toggle(el) { setPath(el.dataset.path, !getPath(el.dataset.path)); save(); render(); },
  step(el) { const p = el.dataset.path, lim = p.endsWith('sleep') ? [0, 14] : [15, 180]; setPath(p, Math.max(lim[0], Math.min(lim[1], (+getPath(p) || 0) + +el.dataset.d))); if (p.endsWith('sleep')) setSleep(dayKey(), S.today.sleep); save(); render(); },
  sore(el) { const c = checkin(), m = el.dataset.m; c.sore = c.sore.includes(m) ? c.sore.filter(x => x !== m) : [...c.sore, m]; save(); render(); },
  onboardDone() { if (+S.profile.bodyweight > 0) setBodyWeight(dayKey(), +S.profile.bodyweight); S.profile.onboarded = true; save(); render(); },
  closeSheet,
  resume() { ui.view = 'workout'; render(); keepAwake(); },
  minimize() { ui.view = null; render(); },
  buildQuick() { S.draft = generateLocal(checkin()); save(); render(); $('#draft')?.scrollIntoView({ behavior: 'smooth', block: 'start' }); },
  async buildAI() {
    if (!S.ai.key) return keySheet();
    ui.building = true; render();
    try { S.draft = await generateAI(checkin()); }
    catch (e) { toast(e.message + ' Used the quick builder instead.', 5000); S.draft = generateLocal(checkin()); }
    ui.building = false; save(); render(); $('#draft')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  },
  startDraft() { const d = S.draft; S.draft = null; startWorkout(d); },
  draftTpl() { S.templates.push(planToTpl(S.draft)); save(); render(); toast('Saved to templates'); },
  draftDrop() { S.draft = null; save(); render(); },
  emptyStart() { startWorkout({ title: 'Workout', exercises: [] }); },
  // templates
  tplOpen(el) { const t = S.templates.find(x => x.id === el.dataset.id); ui.plan = { ...tplToPlan(t), tplId: t.id }; planSheet(); },
  tplNew() { ui.tpl = { isNew: true, id: uid(), name: '', exercises: [] }; tplSheet(); },
  tplEdit(el) { ui.tpl = JSON.parse(JSON.stringify(S.templates.find(x => x.id === el.dataset.id))); tplSheet(); },
  tplRm(el) { ui.tpl.exercises.splice(+el.dataset.i, 1); tplSheet(); },
  tplSave() {
    const t = ui.tpl; if (!t.exercises.length) return toast('Add at least one exercise');
    t.name = t.name.trim() || 'Template'; delete t.isNew;
    for (const e of t.exercises) { e.sets = Math.max(1, Math.min(10, +e.sets || 3)); e.repRange = [Math.max(1, +e.repRange[0] || 8), Math.max(+e.repRange[0] || 8, +e.repRange[1] || 12)]; }
    const i = S.templates.findIndex(x => x.id === t.id); if (i >= 0) S.templates[i] = t; else S.templates.push(t);
    ui.tpl = null; save(); closeSheet(); render(); toast('Template saved');
  },
  tplDel(el) { if (!confirm('Delete this template?')) return; S.templates = S.templates.filter(x => x.id !== el.dataset.id); save(); closeSheet(); render(); },
  planStart() { startWorkout(ui.plan); },
  planTpl() { S.templates.push(planToTpl(ui.plan)); save(); closeSheet(); render(); toast('Saved to templates'); },
  coachPlan(el) { try { ui.plan = planToWorkout(splitWorkoutBlocks(S.chat[+el.dataset.mi].content)[+el.dataset.pi].plan); save(); planSheet(); } catch (e) { toast(e.message); } },
  // picker
  pickOpen(el) { ui.pick = { mode: el.dataset.mode, ei: +el.dataset.ei, all: false }; pickSheet(); },
  pickAll(el) { ui.pick.all = !!el.dataset.v; pickSheet(); },
  pick(el) { applyPick(el.dataset.id); },
  pickCreate() { const name = $('#cxName').value.trim(); if (!name) return toast('Give it a name'); const ex = addCustomExercise({ name, primary: $('#cxMuscle').value }); applyPick(ex.id); },
  // active workout
  rir(el) { const s = S.active.exercises[el.dataset.ei].sets[el.dataset.si], cyc = [null, 3, 2, 1, 0, 4]; s.rir = cyc[(cyc.indexOf(s.rir) + 1) % cyc.length]; el.textContent = s.rir == null ? '–' : s.rir; saveSoon(); },
  done(el) {
    ensureAudio();
    const w = S.active, ex = w.exercises[el.dataset.ei], si = +el.dataset.si, s = ex.sets[si];
    if (s.done) { s.done = false; save(); return render(); }
    const lp = lastPerf(ex.exId), pv = lp?.sets[si];
    if (!(+s.r > 0)) { if (+s.t > 0) s.r = String(s.t); else if (pv) s.r = String(pv.r); else { toast('Enter your reps first'); el.parentNode.querySelectorAll('input')[1]?.focus(); return; } }
    if (s.w === '' && pv && +pv.w > 0) s.w = fmt(pv.w);
    const best = bestE1rm(ex.exId), mine = e1rm(s.w, s.r), sess = Math.max(0, ...ex.sets.filter(x => x.done).map(x => e1rm(x.w, x.r)));
    s.done = true;
    const nx = ex.sets[si + 1]; if (nx && !nx.done && nx.w === '') nx.w = s.w;
    if (best > 0 && mine > best + 0.01 && mine > sess) toast(`PR. Estimated 1RM ${Math.round(mine)} ${U()} on ${ex.name}.`, 3500);
    const remaining = w.exercises.some(e => e.sets.some(x => !x.done));
    w.timer = remaining ? { end: Date.now() + ex.restSec * 1000, total: ex.restSec } : null;
    save(); render();
  },
  barSet(el) { const e = S.active.exercises[el.dataset.ei]; e.bar = el.dataset.v; S.barPref[e.exId] = e.bar; save(); render(); },
  addSet(el) { const ex = S.active.exercises[el.dataset.ei], l = ex.sets[ex.sets.length - 1]; ex.sets.push({ w: l ? l.w : '', r: '', rir: null, done: false }); save(); render(); },
  delSet(el) { S.active.exercises[el.dataset.ei].sets.pop(); save(); render(); },
  exMenu(el) { exMenuSheet(+el.dataset.ei); },
  exMove(el) { const a = S.active.exercises, i = +el.dataset.ei, j = i + +el.dataset.d; if (j < 0 || j >= a.length) return; [a[i], a[j]] = [a[j], a[i]]; save(); closeSheet(); render(); },
  exRemove(el) { S.active.exercises.splice(+el.dataset.ei, 1); save(); closeSheet(); render(); },
  timerAdj(el) { const t = S.active?.timer; if (!t) return; t.end += +el.dataset.d * 1000; t.total = Math.max(t.total, (t.end - Date.now()) / 1000); save(); tick(); },
  timerSkip() { if (S.active) { S.active.timer = null; save(); tick(); } },
  cancelWorkout() { if (!confirm('Discard this workout? Nothing from it will be saved.')) return; S.active = null; ui.view = null; save(); render(); },
  finish() {
    const w = S.active, undone = w.exercises.reduce((a, e) => a + e.sets.filter(s => !s.done).length, 0);
    const exs = w.exercises.map(e => ({ exId: e.exId, name: e.name, repRange: e.repRange, rir: e.rir, restSec: e.restSec, note: e.note, plan: e.plan, sets: e.sets.filter(s => s.done && +s.r > 0).map(({ w, r, rir }) => ({ w, r, rir, done: true })) })).filter(e => e.sets.length);
    if (!exs.length) { if (confirm('Nothing logged. Discard this workout?')) { S.active = null; ui.view = null; save(); render(); } return; }
    if (undone && !confirm(`${undone} set${undone > 1 ? 's' : ''} not checked off. Finish anyway?`)) return;
    const prs = exs.map(e => { const from = bestE1rm(e.exId), to = Math.max(...e.sets.map(s => e1rm(s.w, s.r))); return from > 0 && to > from + 0.01 ? { name: e.name, from: Math.round(from), to: Math.round(to) } : null; }).filter(Boolean);
    const fin = { id: w.id, title: (w.title || 'Workout').trim(), source: w.source, rationale: w.rationale, start: w.start, end: Date.now(), checkin: w.checkin, planned: w.planned, exercises: exs };
    addWorkout(fin); S.active = null; ui.view = null; ui.tab = 'today'; wake?.release?.(); save(); render(); summarySheet(fin, prs);
  },
  // walks
  walkSheet() {
    openSheet(`<h2>Incline walk</h2><div class="three"><label><span>Minutes</span><input id="wkMin" inputmode="numeric" value="30"></label><label><span>Incline %</span><input id="wkInc" inputmode="decimal" value="10"></label><label><span>Speed mph</span><input id="wkSpd" inputmode="decimal" value="3"></label></div><button class="btn primary big" data-a="walkSave">Log walk</button>`);
  },
  walkSave() { const min = +$('#wkMin').value; if (!(min > 0)) return toast('How many minutes?'); addWorkout({ id: uid(), title: 'Incline walk', source: 'walk', start: Date.now() - min * 6e4, end: Date.now(), exercises: [], cardio: { min, incline: +$('#wkInc').value || 0, speed: +$('#wkSpd').value || 0 } }); save(); closeSheet(); render(); toast('Walk logged'); },
  // history
  histOpen(el) { historySheet(el.dataset.id); },
  histDel(el) { if (!confirm('Delete this session?')) return; S.workouts = S.workouts.filter(w => w.id !== el.dataset.id); save(); closeSheet(); render(); },
  histRepeat(el) { const w = S.workouts.find(x => x.id === el.dataset.id); startWorkout({ title: w.title, source: 'repeat', exercises: w.exercises.map(e => makeExercise(e.exId, e.sets.length, e.repRange || [8, 12], e.rir ?? 2, e.restSec || 120)) }); },
  histTpl(el) { const w = S.workouts.find(x => x.id === el.dataset.id); S.templates.push({ id: uid(), name: w.title, exercises: w.exercises.map(e => ({ exId: e.exId, sets: e.sets.length, repRange: e.repRange || [8, 12], restSec: e.restSec || 120 })) }); save(); closeSheet(); toast('Saved to templates'); },
  // progress
  logWeight() { const v = +$('#bwIn').value; if (!(v > 0)) return toast('Enter a weight'); setBodyWeight(dayKey(), v); save(); render(); toast('Weight logged'); },
  logSleep() { const v = +$('#slIn').value; if (!(v > 0 && v < 20)) return toast('Enter hours slept'); setSleep(dayKey(), v); checkin().sleep = v; save(); render(); toast('Sleep logged'); },
  // coach
  ask(el) { sendChat(el.dataset.q); },
  send() { sendChat(ui.msg); },
  chatClear() { if (confirm('Clear the conversation?')) { S.chat = []; save(); render(); } },
  modelSheet, keySheet,
  keySave() { S.ai.key = S.ai.key.trim(); save(); closeSheet(); render(); toast(S.ai.key ? 'Coach connected' : 'No key saved'); },
  modelSort(el) { ui.modelSort = el.dataset.v; modelSheet(); },
  modelPick(el) { S.ai.model = el.dataset.id; save(); closeSheet(); render(); toast('Coach is now ' + S.ai.model.split('/').pop()); },
  // data
  exportData() { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([JSON.stringify(exportState())], { type: 'application/json' })); a.download = `hyper-backup-${dayKey()}.json`; a.click(); },
  resetAll() { if (confirm('Erase every workout, metric and setting on this device?') && confirm('Really? This cannot be undone.')) { replaceState(null); ui.tab = 'today'; ui.view = null; render(); } },
};

function applyPick(id) {
  const k = ui.pick, ex = exById(id);
  const range = ex.kind === 'c' ? [6, 10] : [10, 15], rest = ex.kind === 'c' ? 150 : 75;
  if (k.mode === 'tpl') { ui.tpl.exercises.push({ exId: id, sets: 3, repRange: range, restSec: rest }); return tplSheet(); }
  if (k.mode === 'swap') { const old = S.active.exercises[k.ei]; S.active.exercises[k.ei] = makeExercise(id, old.sets.length, old.repRange, old.rir, old.restSec); }
  else S.active.exercises.push(makeExercise(id, 3, range, 2, rest));
  save(); closeSheet(); render();
}

function showPlates(el) {
  const m = /^active\.exercises\.(\d+)\.sets\.\d+\.w$/.exec(el.dataset.bind || ''), ei = m ? m[1] : el.classList.contains('ezw') ? el.dataset.ei : null;
  const box = ei != null && $(`#pl${ei} .pvis`); if (!box) return;
  box.innerHTML = plateVis(S.active.exercises[ei], m ? el.value : undefined);
}

async function readFile(el) {
  const f = el.files[0]; if (!f) return; const text = await f.text(); el.value = '';
  try {
    if (el.dataset.file === 'strong') { const n = importStrong(text); toast(n ? `Imported ${n} sessions from Strong` : 'Nothing new in that file'); }
    else if (el.dataset.file === 'withings') { const r = importWithings(text); toast(`Imported ${r.n} ${r.kind === 'weight' ? 'weigh-ins' : 'nights of sleep'}`); }
    else { const j = JSON.parse(text); if (!j.profile || !Array.isArray(j.workouts)) throw new Error('Not a Hyper backup.'); if (!confirm('Replace everything on this device with this backup?')) return; const key = S.ai.key; replaceState(j); S.ai.key = key; }
    save(); render();
  } catch (e) { toast(e.message, 5000); }
}

// ================= events =================
document.addEventListener('click', e => {
  const el = e.target.closest('[data-a]'); if (!el || el.disabled) return;
  const fn = A[el.dataset.a]; if (fn) { e.preventDefault(); fn(el); }
});
document.addEventListener('input', e => {
  const el = e.target;
  if (el.dataset.filter) { const q = el.value.toLowerCase().trim(); el.closest('.panel').querySelectorAll(el.dataset.filter).forEach(r => { r.hidden = !!q && !r.dataset.s.includes(q); }); el.closest('.panel').querySelectorAll('.pk-h').forEach(h => { h.hidden = !!q; }); return; }
  if (!el.dataset.bind) return;
  setPath(el.dataset.bind, el.dataset.num ? (el.value === '' ? '' : +el.value) : el.value);
  saveSoon();
  showPlates(el);
  if (el.dataset.render) render();
  if (el.id === 'msg') { el.style.height = 'auto'; el.style.height = Math.min(140, el.scrollHeight) + 'px'; }
});
document.addEventListener('change', e => { if (e.target.dataset.file) readFile(e.target); });
document.addEventListener('keydown', e => {
  if (e.target.id === 'msg' && e.key === 'Enter' && !e.shiftKey && matchMedia('(pointer:fine)').matches) { e.preventDefault(); sendChat(ui.msg); }
  if (e.key === 'Enter' && e.target.matches?.('.set input')) e.target.blur();
});
document.addEventListener('focusin', e => { if (e.target.matches?.('.set input')) { e.target.select(); showPlates(e.target); } });
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') { keepAwake(); tick(); } else save(); });
window.addEventListener('pagehide', save);

initCharts();
setInterval(tick, 500);
render();
if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('./sw.js').catch(() => {});
