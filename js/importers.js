// CSV importers: Strong workout history, Withings weight/sleep exports.
import { guessMuscle, guessLoad } from './data.js';
import { S, uid, dayKey, findExercise, addCustomExercise, addWorkout, setBodyWeight, setSleep } from './store.js';

export function parseCSV(text) {
  text = text.replace(/^﻿/, '');
  const first = text.slice(0, text.indexOf('\n') < 0 ? text.length : text.indexOf('\n'));
  const delim = (first.match(/;/g) || []).length > (first.match(/,/g) || []).length ? ';' : ',';
  const rows = []; let row = [], cur = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) { if (c === '"') { if (text[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += c; }
    else if (c === '"') q = true;
    else if (c === delim) { row.push(cur); cur = ''; }
    else if (c === '\n' || c === '\r') { if (c === '\r' && text[i + 1] === '\n') i++; row.push(cur); cur = ''; if (row.some(x => x !== '')) rows.push(row); row = []; }
    else cur += c;
  }
  row.push(cur); if (row.some(x => x !== '')) rows.push(row);
  return rows;
}
const col = (head, re) => head.findIndex(h => re.test(h.trim()));
const parseDur = s => {
  s = String(s || '').trim(); if (!s) return 0;
  if (/^\d+(\.\d+)?$/.test(s)) return +s * 1000;
  const h = +(s.match(/(\d+)\s*h/) || [])[1] || 0, m = +(s.match(/(\d+)\s*m/) || [])[1] || 0, sec = +(s.match(/(\d+)\s*s/) || [])[1] || 0;
  return (h * 3600 + m * 60 + sec) * 1000;
};

export function importStrong(text) {
  const rows = parseCSV(text); if (rows.length < 2) throw new Error('Empty file.');
  const h = rows[0];
  const c = { date: col(h, /^date$/i), name: col(h, /^workout name$/i), dur: col(h, /^duration/i), ex: col(h, /^exercise name$/i), w: col(h, /^weight/i), r: col(h, /^reps$/i), rpe: col(h, /^rpe$/i), order: col(h, /^set order$/i) };
  if (c.date < 0 || c.ex < 0 || c.r < 0) throw new Error('This does not look like a Strong export (need Date, Exercise Name, Reps columns).');
  const have = new Set(S.workouts.map(w => w.importKey).filter(Boolean));
  const groups = new Map();
  for (const r of rows.slice(1)) {
    const key = `${r[c.date]}|${c.name >= 0 ? r[c.name] : ''}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(r);
  }
  let added = 0;
  for (const [key, rs] of groups) {
    if (have.has(key)) continue;
    const start = new Date(rs[0][c.date].replace(' ', 'T')).getTime(); if (isNaN(start)) continue;
    const exs = [];
    for (const r of rs) {
      const name = r[c.ex]; if (!name) continue;
      if (c.order >= 0 && /rest|note/i.test(r[c.order])) continue;
      const reps = +r[c.r]; if (!(reps > 0)) continue;
      const ex = findExercise(name) || addCustomExercise({ name, primary: guessMuscle(name), load: guessLoad(name) });
      let item = exs[exs.length - 1];
      if (!item || item.exId !== ex.id) { item = { exId: ex.id, name: ex.name, repRange: [8, 12], rir: 2, restSec: 120, note: '', sets: [] }; exs.push(item); }
      const rpe = c.rpe >= 0 ? +r[c.rpe] : 0;
      item.sets.push({ w: +r[c.w] > 0 ? String(+r[c.w]) : '', r: String(reps), rir: rpe > 0 ? Math.max(0, Math.round(10 - rpe)) : null, done: true });
    }
    if (!exs.length) continue;
    const dur = c.dur >= 0 ? parseDur(rs[0][c.dur]) : 0;
    addWorkout({ id: uid(), importKey: key, title: (c.name >= 0 && rs[0][c.name]) || 'Workout', source: 'strong', start, end: start + (dur || 45 * 6e4), exercises: exs });
    added++;
  }
  return added;
}

export function importWithings(text) {
  const rows = parseCSV(text); if (rows.length < 2) throw new Error('Empty file.');
  const h = rows[0].map(x => x.trim());
  const iw = col(h, /^weight/i), id = col(h, /^date$/i);
  if (iw >= 0 && id >= 0) {
    const kgFile = /kg/i.test(h[iw]), wantKg = S.profile.units === 'kg';
    let n = 0;
    for (const r of rows.slice(1)) {
      let w = +r[iw]; const d = new Date(r[id].replace(' ', 'T'));
      if (!(w > 0) || isNaN(d)) continue;
      if (kgFile && !wantKg) w *= 2.20462; if (!kgFile && wantKg && /lb/i.test(h[iw])) w /= 2.20462;
      setBodyWeight(dayKey(d), Math.round(w * 10) / 10); n++;
    }
    return { kind: 'weight', n };
  }
  const ifrom = col(h, /^from$/i), ito = col(h, /^to$/i);
  if (ifrom >= 0 && ito >= 0) {
    const stages = h.map((x, i) => /^(light|deep|rem)\b/i.test(x) ? i : -1).filter(i => i >= 0);
    const byDay = {};
    for (const r of rows.slice(1)) {
      const a = new Date(r[ifrom]), b = new Date(r[ito]); if (isNaN(a) || isNaN(b)) continue;
      const secs = stages.length ? stages.reduce((s, i) => s + (+r[i] || 0), 0) : (b - a) / 1000;
      if (secs < 1800) continue;
      const k = dayKey(b); byDay[k] = (byDay[k] || 0) + secs / 3600;
    }
    for (const k in byDay) setSleep(k, byDay[k]);
    return { kind: 'sleep', n: Object.keys(byDay).length };
  }
  throw new Error('Not a Withings weight.csv or sleep.csv (no Weight or from/to columns found).');
}
