// App state (localStorage) + the analytics everything else reads from.
import { MUSCLES, EQUIPMENT, EXERCISES, SEED_TEMPLATES, slug } from './data.js';

const KEY = 'hyper.v1';
export const DAY = 864e5;

export const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
export const dayKey = (d = new Date()) => {
  d = new Date(d);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
export const fmt = n => (n == null || n === '' || isNaN(n)) ? '' : String(Math.round(+n * 100) / 100);

function defaults() {
  return {
    v: 1,
    profile: { onboarded: false, name: '', units: 'lb', bodyweight: '', age: '', experience: 'intermediate', daysPerWeek: 3, sessionMin: 60, notes: '' },
    equipment: Object.fromEntries(EQUIPMENT.map(e => [e.id, e.on])),
    gear: { barWeight: 45, plates: '45,35,25,10,5,2.5', dbStep: 5 },
    ai: { key: '', model: 'anthropic/claude-sonnet-5.5', tone: 'blunt' },
    today: null,          // today's check-in
    draft: null,          // generated-but-not-started workout
    active: null,         // workout in progress
    workouts: [],         // finished, ascending by start
    templates: SEED_TEMPLATES.map(t => ({
      id: uid(), name: t.name,
      exercises: t.ex.map(([name, sets]) => ({ exId: slug(name), sets, repRange: [8, 12], restSec: 120 })),
    })),
    customExercises: [],
    body: [],             // {date, weight}
    sleepLog: [],         // {date, hours}
    chat: [],
  };
}

function load() {
  const d = defaults();
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (raw) for (const k of Object.keys(d)) {
      if (raw[k] === undefined) continue;
      d[k] = (d[k] && typeof d[k] === 'object' && !Array.isArray(d[k]) && raw[k]) ? { ...d[k], ...raw[k] } : raw[k];
    }
  } catch { /* corrupted storage: start clean */ }
  return d;
}

export const S = load();
let saveT;
export function save() { clearTimeout(saveT); try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) { console.error(e); } }
export function saveSoon() { clearTimeout(saveT); saveT = setTimeout(save, 400); }
export function replaceState(obj) {
  localStorage.setItem(KEY, JSON.stringify(obj || {}));
  const d = load();
  for (const k of Object.keys(S)) delete S[k];
  Object.assign(S, d);
}
export function exportState() { const c = JSON.parse(JSON.stringify(S)); c.ai.key = ''; return c; }

// ---------- exercises ----------
export const allExercises = () => [...EXERCISES, ...S.customExercises];
let idx = null, idxN = -1;
export function exById(id) {
  if (!idx || idxN !== S.customExercises.length) { idx = new Map(allExercises().map(e => [e.id, e])); idxN = S.customExercises.length; }
  return idx.get(id) || { id, name: id, primary: 'back', secondary: [], equip: [], kind: 'i', pattern: id, load: 'machine' };
}
export const isAvailable = ex => ex.equip.every(t => S.equipment[t]);
const norm = s => String(s).toLowerCase().replace(/[^a-z0-9]/g, '');
export function findExercise(name) {
  const n = norm(name);
  return allExercises().find(e => norm(e.name) === n) || null;
}
export function addCustomExercise(ex) {
  const found = findExercise(ex.name);
  if (found) return found;
  const e = { id: 'c-' + slug(ex.name), name: ex.name.trim(), primary: ex.primary, secondary: ex.secondary || [], equip: ex.equip || [], kind: ex.kind || 'i', pattern: 'c-' + slug(ex.name), load: ex.load || 'machine', custom: true };
  S.customExercises.push(e);
  return e;
}

// ---------- workout analytics ----------
export const doneSets = wex => wex.sets.filter(s => s.done && +s.r > 0);
export const lifts = () => S.workouts.filter(w => w.exercises && w.exercises.length);
export const e1rm = (w, r) => (+w > 0 && +r > 0) ? +w * (1 + Math.min(+r, 15) / 30) : 0;

export function workoutStats(w) {
  let sets = 0, volume = 0;
  for (const ex of w.exercises || []) for (const s of doneSets(ex)) { sets++; volume += (+s.w || 0) * +s.r; }
  return { sets, volume, minutes: w.end ? Math.max(1, Math.round((w.end - w.start) / 6e4)) : 0 };
}

export function workoutMuscles(w) {
  const out = {};
  for (const ex of w.exercises || []) {
    const n = doneSets(ex).length; if (!n) continue;
    const e = exById(ex.exId);
    out[e.primary] = (out[e.primary] || 0) + n;
    for (const m of e.secondary) out[m] = (out[m] || 0) + n * 0.5;
  }
  return out;
}

export function muscleVolume(since, until = Infinity) {
  const out = {};
  for (const w of lifts()) {
    if (w.start < since || w.start >= until) continue;
    const m = workoutMuscles(w);
    for (const k in m) out[k] = (out[k] || 0) + m[k];
  }
  return out;
}

export function lastHit(muscle) {
  const ws = lifts();
  for (let i = ws.length - 1; i >= 0; i--) {
    let n = 0;
    for (const ex of ws[i].exercises) if (exById(ex.exId).primary === muscle) n += doneSets(ex).length;
    if (n >= 2) return ws[i].start;
  }
  return 0;
}

export function targets() {
  const p = S.profile;
  const f = (p.daysPerWeek <= 3 ? 0.8 : p.daysPerWeek == 4 ? 1 : 1.15) * ({ beginner: 0.75, intermediate: 1, advanced: 1.15 }[p.experience] || 1);
  return Object.fromEntries(MUSCLES.map(m => [m.id, Math.max(4, Math.round(m.target * f))]));
}

export function lastPerf(exId) {
  const ws = lifts();
  for (let i = ws.length - 1; i >= 0; i--) {
    const ex = ws[i].exercises.find(e => e.exId === exId);
    if (ex && doneSets(ex).length) return { date: ws[i].start, sets: doneSets(ex), repRange: ex.repRange };
  }
  return null;
}

export function exerciseSeries(exId) {
  const out = [];
  for (const w of lifts()) {
    const ex = w.exercises.find(e => e.exId === exId); if (!ex) continue;
    const ds = doneSets(ex); if (!ds.length) continue;
    const best = Math.max(...ds.map(s => e1rm(s.w, s.r)));
    out.push({ t: w.start, v: Math.round(best * 10) / 10, top: Math.max(...ds.map(s => +s.w || 0)), reps: Math.max(...ds.map(s => +s.r)) });
  }
  return out;
}
export function bestE1rm(exId) { return Math.max(0, ...exerciseSeries(exId).map(p => p.v)); }

export function trainedExercises() {
  const count = {};
  for (const w of lifts()) for (const ex of w.exercises) if (doneSets(ex).length) count[ex.exId] = (count[ex.exId] || 0) + 1;
  return Object.entries(count).sort((a, b) => b[1] - a[1]).map(([id, n]) => ({ ex: exById(id), n }));
}

export function addWorkout(w) {
  S.workouts.push(w);
  S.workouts.sort((a, b) => a.start - b.start);
}

export function latestWeight() {
  const b = [...S.body].sort((a, b) => a.date < b.date ? -1 : 1);
  return b.length ? b[b.length - 1].weight : (+S.profile.bodyweight || null);
}
export function setBodyWeight(date, weight) {
  S.body = S.body.filter(b => b.date !== date);
  S.body.push({ date, weight: +weight });
  S.body.sort((a, b) => a.date < b.date ? -1 : 1);
  S.profile.bodyweight = S.body[S.body.length - 1].weight;
}
export function setSleep(date, hours) {
  S.sleepLog = S.sleepLog.filter(b => b.date !== date);
  S.sleepLog.push({ date, hours: Math.round(+hours * 10) / 10 });
  S.sleepLog.sort((a, b) => a.date < b.date ? -1 : 1);
}
