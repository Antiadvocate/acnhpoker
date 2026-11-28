// Offline training logic: what to train today, how much, and what load to chase.
import { MUSCLES, MUSCLE_NAME, SESSION_TYPES } from './data.js';
import { S, DAY, dayKey, fmt, allExercises, exById, isAvailable, muscleVolume, lastHit, targets, lastPerf, lifts, doneSets, capacity } from './store.js';

const BIG = new Set(MUSCLES.filter(m => m.big).map(m => m.id));

export function needMap(checkin = {}) {
  const now = Date.now(), vol = muscleVolume(now - 7 * DAY), T = targets(), out = {};
  for (const m of MUSCLES) {
    const done = vol[m.id] || 0, need = Math.max(0, T[m.id] - done) / T[m.id];
    const lh = lastHit(m.id), hrs = lh ? (now - lh) / 36e5 : 999;
    let rec = hrs < 30 ? 0.1 : hrs < 48 ? 0.55 : hrs < 72 ? 0.9 : 1;
    if ((checkin.sore || []).includes(m.id)) rec *= 0.25;
    out[m.id] = { need, rec, pri: (0.25 + need) * rec, done, target: T[m.id], hrs };
  }
  return out;
}

export function pickFocus(checkin, nm = needMap(checkin)) {
  if (checkin.focus && checkin.focus !== 'auto') return checkin.focus;
  const d = +S.profile.daysPerWeek;
  const cands = d <= 3 ? ['full', 'upper', 'lower'] : d == 4 ? ['upper', 'lower', 'full'] : ['push', 'pull', 'legs', 'upper', 'lower'];
  let best = cands[0], bs = -1;
  for (const c of cands) {
    const ms = SESSION_TYPES[c].m;
    const score = ms.reduce((a, m) => a + nm[m].pri, 0) / ms.length + (c === 'full' && d <= 3 ? 0.12 : 0);
    if (score > bs) { bs = score; best = c; }
  }
  return best;
}

export function recommend(checkin) {
  const now = Date.now(), ws = lifts();
  const today = dayKey(), lifts7 = ws.filter(w => w.start > now - 7 * DAY).length;
  const liftedToday = ws.some(w => dayKey(w.start) === today);
  const liftedYesterday = ws.some(w => dayKey(w.start) === dayKey(now - DAY));
  const nm = needMap(checkin), focus = pickFocus(checkin, nm);
  const behind = SESSION_TYPES[focus].m.map(m => ({ m, ...nm[m] })).filter(x => x.need > 0.05).sort((a, b) => b.pri - a.pri).slice(0, 3);
  const behindTxt = behind.map(x => `${MUSCLE_NAME[x.m]} ${fmt(x.done)}/${x.target}`).join(' · ');
  const goal = +S.profile.daysPerWeek;
  if (liftedToday) return { kind: 'walk', focus, head: 'You already lifted today', detail: 'Growth happens between sessions. Incline walk if you want to move; otherwise eat and be done.' };
  if (lifts7 >= goal && goal >= 5) return { kind: 'walk', focus, head: 'Walk day', detail: `${lifts7} lifts in the last 7 days. More isn't more. Incline walk.` };
  if (lifts7 >= goal) return { kind: 'either', focus, head: `Bonus ${SESSION_TYPES[focus].name.toLowerCase()} session, or walk`, detail: `You've hit ${lifts7}/${goal} lifts this week. A short extra session is fine if recovery is good${behindTxt ? ` — still short on ${behindTxt}` : ''}.` };
  if (checkin.energy === 1 && liftedYesterday) return { kind: 'walk', focus, head: 'Walk today', detail: 'Lifted yesterday and running on fumes. Incline walk, come back tomorrow.' };
  return { kind: 'lift', focus, head: `${SESSION_TYPES[focus].name} day`, detail: behindTxt ? `Furthest behind this week: ${behindTxt} sets.` : 'Weekly volume is on target — maintain and add reps.' };
}

function increment(ex) {
  const kg = S.profile.units === 'kg';
  if (ex.load === 'bb') return kg ? 2.5 : 5;
  if (ex.load === 'db') return +S.gear.dbStep || (kg ? 2 : 5);
  if (ex.load === 'machine') return kg ? 2.5 : 5;
  return 0;
}

// Progression from evidence: compare what was prescribed with what was actually done,
// then ask for slightly more than demonstrated capacity.
export function progression(exId, repRange, n = 3) {
  const ex = exById(exId), lp = lastPerf(exId), [lo, hi] = repRange, u = S.profile.units;
  if (!lp) return { w: '', reps: [], verdict: 'new', rx: '', hint: ex.load === 'bw' ? 'First time logged. Stop 1–2 reps short of failure — today sets your baseline.' : `First time logged. Pick a load you could do ${hi + 2} times, stop at ${hi}. Today sets your baseline.` };
  const sets = lp.sets, top = Math.max(...sets.map(s => +s.w || 0));
  const atTop = sets.filter(s => (+s.w || 0) === top), reps = atTop.map(s => +s.r);
  const rirs = sets.map(s => s.rir).filter(x => x != null), avgRir = rirs.length ? rirs.reduce((x, y) => x + y, 0) / rirs.length : null;
  const plan = lp.plan, inc = increment(ex), tRir = lp.rir ?? 2;
  const load = w => +w > 0 ? `${fmt(w)} ${u}` : 'bodyweight';
  const did = sets.map(s => `${fmt(s.w) || 'BW'}×${s.r}`).join(', ');
  const rx = plan ? `Asked for ${plan.n} × ${plan.w ? fmt(plan.w) + ' × ' : ''}${plan.lo}–${plan.hi}, you did ${did}${avgRir != null ? ` (~${fmt(Math.round(avgRir * 2) / 2)} in the tank)` : ''}` : `Last time: ${did}`;
  const easy = avgRir != null && avgRir >= tRir + 1.5;
  const short = !!plan && sets.length < plan.n;
  const under = reps.some(r => r < lo);
  const topped = atTop.length >= Math.min(2, plan?.n || 2) && reps.every(r => r >= hi);
  if (!short && (topped || (easy && reps.every(r => r >= hi - 1)))) {
    if (inc && top > 0) {
      const w = top + (easy && topped ? inc * 2 : inc);
      return { w, reps: Array(n).fill(Math.min(hi, lo + 1)), verdict: 'beat', rx, hint: `${rx}. That was under your capacity. Today: ${load(w)} × ${Math.min(hi, lo + 1)}+.` };
    }
    const t = Array.from({ length: n }, (_, i) => (reps[i] ?? reps[reps.length - 1]) + 1);
    return { w: top || '', reps: t, verdict: 'beat', rx, hint: `${rx}. Today: ${t.join(', ')} reps, or add load.` };
  }
  if (under || short) {
    const drop = inc && top > inc && reps.filter(r => r < lo - 1).length >= 2 && (avgRir == null || avgRir <= 1);
    const w = drop ? top - inc : top;
    const t = Array.from({ length: n }, (_, i) => drop ? lo : Math.max(lo, reps[i] ?? lo));
    const why = short ? `You stopped ${plan.n - sets.length} set${plan.n - sets.length > 1 ? 's' : ''} short, so the load holds: finish all ${n} at ${load(w)} first.`
      : drop ? `That load is past your capacity for this range. Today: ${load(w)}, ${lo}+ on every set.` : `Hold ${load(w)} and get every set to ${lo}+.`;
    return { w: w || '', reps: t, verdict: 'short', rx, hint: `${rx}. ${why}` };
  }
  const grinding = avgRir != null && avgRir < 1;
  let left = grinding ? 1 : n;
  const t = Array.from({ length: n }, (_, i) => { const last = reps[i] ?? reps[reps.length - 1]; if (last < hi && left > 0) { left--; return last + 1; } return Math.min(last, hi); });
  return { w: top || '', reps: t, verdict: 'met', rx, hint: `${rx}. Today: ${load(top)} × ${t.join(', ')} — ${grinding ? 'one more rep than you showed; you were at failure' : 'a rep more per set than you showed'}.` };
}

export function makeExercise(exId, n, repRange, rir, restSec, note = '', weight = null) {
  const ex = exById(exId), p = progression(exId, repRange, n);
  const override = weight != null && weight !== '' && +weight !== +p.w;
  const w = override ? weight : p.w;
  return {
    exId, name: ex.name, repRange, rir, restSec, note,
    hint: override && p.rx ? `${p.rx}. Coach set ${fmt(w)} ${S.profile.units} today.` : p.hint,
    plan: { n, w: +w || 0, lo: repRange[0], hi: repRange[1], rir },
    sets: Array.from({ length: n }, (_, i) => ({ w: w === '' ? '' : fmt(w), r: '', t: override ? '' : (p.reps[i] ?? ''), rir: null, done: false })),
  };
}

export function estMinutes(exs) {
  return Math.round((exs.reduce((a, e) => a + e.sets.length * (45 + e.restSec), 0)) / 60 + 4);
}

export function generateLocal(checkin) {
  const nm = needMap(checkin), focus = pickFocus(checkin, nm), type = SESSION_TYPES[focus];
  const time = +checkin.time || +S.profile.sessionMin || 60, energy = +checkin.energy || 3, sleep = +checkin.sleep || 7;
  const eF = [0, 0.6, 0.8, 1, 1.05, 1.1][energy], sF = sleep < 5 ? 0.8 : sleep < 6 ? 0.9 : 1;
  const tight = time <= 35;
  const cap0 = capacity(), capOK = cap0 && cap0.n >= 2;
  // Calibrate to the athlete: their real minutes per set, and how much of a prescription they finish.
  const perSet = capOK && cap0.minPerSet ? Math.max(2, Math.min(4.5, cap0.minPerSet)) * (tight ? 0.85 : 1) : (tight ? 2.4 : 2.9);
  const cF = !capOK ? 1 : cap0.completion < 0.88 ? Math.max(0.75, cap0.completion) : 1;
  let left = Math.max(5, Math.min(28, Math.round((time - 5) / perSet * eF * sF * cF) + (capOK && cap0.completion >= 0.98 && energy >= 3 ? 1 : 0)));
  const budget = left;
  const cap = focus === 'full' ? 5 : ['upper', 'lower'].includes(focus) ? 7 : 9;
  const pool = allExercises().filter(isAvailable);
  const used = {}; // staples: lifts you actually do keep getting picked, so progress is measurable
  for (const w of lifts().filter(w => w.start > Date.now() - 120 * DAY)) for (const e of w.exercises) if (doneSets(e).length) used[e.exId] = (used[e.exId] || 0) + 1;
  const alloc = {}, usedPat = new Set(), usedId = new Set(), dead = new Set(), plan = [];
  const rir = energy <= 2 ? 3 : energy >= 5 ? 1 : 2;

  while (left >= 2 && plan.length < 8) {
    let m = null, best = -1;
    for (const id of type.m) {
      if (dead.has(id) || (alloc[id] || 0) >= cap) continue;
      const s = nm[id].pri / (1 + (alloc[id] || 0) / 2.5);
      if (s > best) { best = s; m = id; }
    }
    if (!m) break;
    const want = BIG.has(m) && (alloc[m] || 0) < (m === 'shoulders' ? 0.1 : 2) ? 'c' : 'i';
    const cands = pool.filter(e => e.primary === m && !usedId.has(e.id) && !usedPat.has(e.pattern));
    if (!cands.length) { dead.add(m); continue; }
    const ex = cands.map((e, i) => ({ e, s: (e.kind === want ? 3.5 : 0) + (used[e.id] ? 1 + Math.min(2, used[e.id] * 0.5) : 0) - i * 0.05 })).sort((a, b) => b.s - a.s)[0].e;
    const n = Math.min(left, ex.kind === 'c' && energy >= 4 && budget >= 16 ? 4 : 3);
    const comp = ex.kind === 'c';
    const range = comp ? [6, 10] : (m === 'calves' || m === 'abs' ? [10, 20] : [10, 15]);
    plan.push({ ex, item: makeExercise(ex.id, n, range, rir, comp ? (tight ? 120 : 150) : (tight ? 60 : 75)) });
    usedId.add(ex.id); usedPat.add(ex.pattern);
    alloc[m] = (alloc[m] || 0) + n;
    for (const s of ex.secondary) alloc[s] = (alloc[s] || 0) + n * 0.5;
    left -= n;
  }
  const bigOrder = ['quads', 'hamstrings', 'chest', 'back', 'shoulders', 'glutes'];
  plan.sort((a, b) => (a.ex.kind === b.ex.kind ? 0 : a.ex.kind === 'c' ? -1 : 1) || (bigOrder.indexOf(a.ex.primary) + 9) % 9 - (bigOrder.indexOf(b.ex.primary) + 9) % 9);
  const exercises = plan.map(p => p.item);
  const short = type.m.map(m => ({ m, ...nm[m] })).filter(x => x.need > 0.3).sort((a, b) => b.need - a.need).slice(0, 2);
  const why = [];
  if (short.length) why.push(`${short.map(x => `${MUSCLE_NAME[x.m]} (${fmt(x.done)}/${x.target} sets)`).join(' and ')} ${short.length > 1 ? 'are' : 'is'} furthest behind this week, so they lead.`);
  if (capOK && cF < 1) why.push(`You've finished ${Math.round(cap0.completion * 100)}% of prescribed sets lately, so this is sized to what you actually do.`);
  else if (capOK && cap0.completion >= 0.98) why.push(`You've completed everything prescribed in your last ${cap0.n} sessions, so there's one more set than your usual.`);
  if (energy <= 2) why.push(`Energy ${energy}/5: volume trimmed, leave ~3 reps in the tank.`);
  if (energy >= 4) why.push(`Energy ${energy}/5: push the first compounds, 1–2 reps from failure.`);
  if (sleep < 6) why.push(`${sleep}h sleep: fewer sets, same quality.`);
  if (tight) why.push('Short on time: rests tightened.');
  if ((checkin.sore || []).length) why.push(`Working around sore ${checkin.sore.map(m => MUSCLE_NAME[m].toLowerCase()).join(', ')}.`);
  return { title: `${type.name} · ${estMinutes(exercises)} min`, source: 'quick', rationale: why.join(' ') || 'Balanced session against your weekly volume targets.', exercises };
}

// ---------- plates & warm-ups ----------
export function plateCalc(total, bar = +S.gear.barWeight || 45) {
  const plates = String(S.gear.plates).split(',').map(Number).filter(x => x > 0).sort((a, b) => b - a);
  let side = (total - bar) / 2; const out = [];
  if (side < 0) return { ok: false, out: [], left: 0, text: `Lighter than the ${bar} bar` };
  for (const p of plates) while (side >= p - 1e-9) { out.push(p); side -= p; }
  return { ok: side < 0.01, out, left: side < 0.01 ? 0 : side * 2, text: out.length ? out.join(' · ') + ' per side' + (side >= 0.01 ? ` (+${fmt(side)} unloadable)` : '') : 'Empty bar' };
}
export function warmups(work, isBarbell) {
  work = +work; if (!work) return [];
  const bar = +S.gear.barWeight || 45, r5 = x => Math.max(isBarbell ? bar : 5, Math.round(x / 5) * 5);
  const steps = [[0.4, 8], [0.6, 5], [0.8, 3]].map(([p, r]) => ({ w: r5(work * p), r }));
  return steps.filter((s, i) => s.w < work && (i === 0 || s.w > steps[i - 1].w));
}
