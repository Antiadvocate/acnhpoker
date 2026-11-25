// OpenRouter: model list, streaming chat, and the coach's view of your data.
import { MUSCLES, MUSCLE_NAME, EQUIPMENT, guessMuscle, guessLoad } from './data.js';
import { S, DAY, dayKey, fmt, allExercises, isAvailable, exById, findExercise, addCustomExercise, doneSets, lifts, workoutStats, muscleVolume, targets, exerciseSeries, trainedExercises, latestWeight } from './store.js';
import { makeExercise, estMinutes, needMap } from './engine.js';

const API = 'https://openrouter.ai/api/v1';
const headers = () => ({ 'Content-Type': 'application/json', Authorization: `Bearer ${S.ai.key}`, 'X-Title': 'Hyper' });

let modelCache = null;
export async function listModels() {
  if (modelCache) return modelCache;
  const r = await fetch(`${API}/models`);
  if (!r.ok) throw new Error(`Couldn't load models (${r.status})`);
  const data = (await r.json()).data || [];
  modelCache = data
    .filter(m => (m.architecture?.output_modalities || ['text']).includes('text') && !/:batch$/.test(m.id))
    .map(m => ({ id: m.id, name: m.name || m.id, ctx: m.context_length || 0, created: m.created || 0, pin: +m.pricing?.prompt * 1e6 || 0, pout: +m.pricing?.completion * 1e6 || 0 }));
  return modelCache;
}

export async function chat(messages, { onToken, json = false, signal } = {}) {
  if (!S.ai.key) throw new Error('Add your OpenRouter API key in You → Coach.');
  const body = { model: S.ai.model, messages, stream: !!onToken };
  if (json) body.response_format = { type: 'json_object' };
  let r = await fetch(`${API}/chat/completions`, { method: 'POST', headers: headers(), body: JSON.stringify(body), signal });
  if (!r.ok && json && r.status === 400) { // model without JSON mode: retry plain
    delete body.response_format;
    r = await fetch(`${API}/chat/completions`, { method: 'POST', headers: headers(), body: JSON.stringify(body), signal });
  }
  if (!r.ok) {
    let msg = `OpenRouter error ${r.status}`;
    try { msg = (await r.json()).error?.message || msg; } catch { /* keep default */ }
    if (r.status === 401) msg = 'OpenRouter rejected the API key.';
    if (r.status === 402) msg = 'OpenRouter: out of credits for this model.';
    throw new Error(msg);
  }
  if (!onToken) {
    const j = await r.json();
    if (j.error) throw new Error(j.error.message || 'OpenRouter error');
    return j.choices?.[0]?.message?.content || '';
  }
  const reader = r.body.getReader(), dec = new TextDecoder();
  let buf = '', full = '';
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    const lines = buf.split('\n'); buf = lines.pop();
    for (const line of lines) {
      if (!line.startsWith('data:')) continue;
      const d = line.slice(5).trim();
      if (!d || d === '[DONE]') continue;
      try {
        const j = JSON.parse(d);
        if (j.error) throw new Error(j.error.message || 'OpenRouter error');
        const t = j.choices?.[0]?.delta?.content;
        if (t) { full += t; onToken(full); }
      } catch (e) { if (!(e instanceof SyntaxError)) throw e; }
    }
  }
  return full;
}

// ---------- context ----------
const setsTxt = ex => doneSets(ex).map(s => `${fmt(s.w) || 'BW'}x${s.r}${s.rir != null ? `@${s.rir}` : ''}`).join(',');

export function buildContext(checkin) {
  const p = S.profile, now = Date.now(), u = p.units;
  const vol = muscleVolume(now - 7 * DAY), prev = muscleVolume(now - 14 * DAY, now - 7 * DAY), T = targets(), nm = needMap(checkin || {});
  const ws = S.workouts.slice(-10);
  const d = new Date();
  const L = [];
  L.push(`NOW: ${d.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'short', day: 'numeric' })}, ${d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}`);
  L.push(`ATHLETE: goal hypertrophy; experience ${p.experience}; lifts ${p.daysPerWeek} days/week (can push to 5; other days incline treadmill walk); usual session ${p.sessionMin} min; bodyweight ${latestWeight() ?? 'unknown'} ${u}${p.age ? `; age ${p.age}` : ''}; units ${u}.`);
  if (p.notes) L.push(`BODY NOTES / CONSTRAINTS (respect these): ${p.notes}`);
  L.push(`EQUIPMENT (home garage gym, nothing else exists): ${EQUIPMENT.filter(e => S.equipment[e.id]).map(e => e.name).join('; ')}. Bar ${S.gear.barWeight} ${u}; plates ${S.gear.plates}; dumbbell step ${S.gear.dbStep} ${u}.`);
  if (checkin) L.push(`TODAY'S CHECK-IN: energy ${checkin.energy}/5; sleep ${checkin.sleep ?? '?'} h; time available ${checkin.time} min; requested focus ${checkin.focus || 'auto'}${checkin.sore?.length ? `; sore: ${checkin.sore.map(m => MUSCLE_NAME[m]).join(', ')}` : ''}.`);
  L.push('WEEKLY SETS PER MUSCLE (last 7d / prior 7d / target; hours since last trained):');
  L.push(MUSCLES.map(m => `${m.name} ${fmt(vol[m.id] || 0)}/${fmt(prev[m.id] || 0)}/${T[m.id]} (${nm[m.id].hrs > 900 ? 'never' : Math.round(nm[m.id].hrs) + 'h'})`).join('; '));
  if (ws.length) {
    L.push(`RECENT SESSIONS (oldest first, weight x reps @RIR, ${u}):`);
    for (const w of ws) {
      const st = workoutStats(w), day = new Date(w.start).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
      if (w.cardio) { L.push(`- ${day}: ${w.title} — ${w.cardio.min} min${w.cardio.incline ? `, incline ${w.cardio.incline}%` : ''}${w.cardio.speed ? `, ${w.cardio.speed} mph` : ''}`); continue; }
      L.push(`- ${day}: ${w.title} (${st.minutes}m${w.checkin?.energy ? `, energy ${w.checkin.energy}` : ''}): ${w.exercises.filter(e => doneSets(e).length).map(e => `${e.name} ${setsTxt(e)}`).join('; ')}`);
    }
  } else L.push('RECENT SESSIONS: none logged yet.');
  const top = trainedExercises().slice(0, 8).map(({ ex }) => {
    const s = exerciseSeries(ex.id); if (s.length < 2) return null;
    const recent = s.slice(-6);
    return `${ex.name} e1RM ${recent[0].v}→${recent[recent.length - 1].v} over ${recent.length} sessions`;
  }).filter(Boolean);
  if (top.length) L.push(`STRENGTH TRENDS: ${top.join('; ')}`);
  const body = S.body.slice(-30);
  if (body.length > 1) L.push(`BODYWEIGHT: ${body[0].weight}→${body[body.length - 1].weight} ${u} (${body[0].date} to ${body[body.length - 1].date})`);
  const sl = S.sleepLog.filter(x => x.date >= dayKey(now - 7 * DAY));
  if (sl.length) L.push(`SLEEP 7d avg: ${fmt(sl.reduce((a, x) => a + x.hours, 0) / sl.length)} h (${sl.length} nights)`);
  const lifts28 = lifts().filter(w => w.start > now - 28 * DAY).length;
  L.push(`ADHERENCE: ${lifts28} lifting sessions in the last 28 days; ${lifts().length} logged all-time.`);
  if (S.templates.length) L.push(`SAVED TEMPLATES: ${S.templates.map(t => `${t.name} [${t.exercises.map(e => `${e.sets}x ${exById(e.exId).name}`).join(', ')}]`).join(' | ')}`);
  L.push(`EXERCISE MENU (available with this equipment; use these exact names when one fits): ${allExercises().filter(isAvailable).map(e => e.name).join('; ')}`);
  return L.join('\n');
}

const TONE = {
  blunt: 'Tone: a friend who lifts and does not flatter. Direct, dry, a little merciless about weak programming or skipped work, never cruel about the person. No cheerleading, no disclaimers, no lectures about rest or bedtime.',
  balanced: 'Tone: direct and warm. Say what is wrong plainly, then what to do.',
  gentle: 'Tone: calm and encouraging, still specific and honest.',
};
const SCHEMA = '{"title": string, "rationale": string (2 sentences max, why this session today), "exercises": [{"name": string, "sets": int, "reps": [low, high], "rir": int 0-4, "rest_sec": int, "weight": number|null (working load from their history, null if unknown), "note": string (one short cue or empty), "muscle": one of chest|back|shoulders|biceps|triceps|quads|hamstrings|glutes|calves|abs}]}';

export function systemPrompt(checkin) {
  return `You are the coach inside Hyper, a personal hypertrophy training app. One athlete, their data is below.
Principles: muscle growth first. Roughly 10–20 hard sets per muscle per week, each muscle about twice a week, most sets 0–3 reps from failure, 5–30 reps with compounds mostly 6–12 and isolations 10–20, progressive overload via double progression, favour movements loaded in the stretched position, cut junk volume. Adjust volume to recovery signals (sleep, energy, soreness, stalled or falling numbers). Prescribe ONLY with the equipment listed. Treat body notes as hard constraints; you are not a clinician.
${TONE[S.ai.tone] || TONE.blunt}
Be specific: exercises, sets, reps, loads, numbers from their log. Keep answers short unless asked for depth. Plain text with light markdown.
When you prescribe a session or the athlete asks you to build/save a workout or template, include exactly one fenced code block tagged workout containing JSON of this shape (the app turns it into a startable workout):
\`\`\`workout
${SCHEMA}
\`\`\`
For multi-day splits, describe the split in text and put only the next session in the block unless asked for a specific day.

--- ATHLETE DATA ---
${buildContext(checkin)}`;
}

export function extractJSON(text) {
  const fenced = text.match(/```(?:workout|json)?\s*([\s\S]*?)```/);
  const src = fenced ? fenced[1] : text;
  const a = src.indexOf('{'), b = src.lastIndexOf('}');
  if (a < 0 || b <= a) return null;
  try { return JSON.parse(src.slice(a, b + 1)); } catch { return null; }
}
export function splitWorkoutBlocks(text) {
  // → [{text}|{plan}] ; unfinished blocks (while streaming) are hidden.
  const parts = [], re = /```workout\s*([\s\S]*?)(```|$)/g;
  let last = 0, m;
  while ((m = re.exec(text))) {
    if (m.index > last) parts.push({ text: text.slice(last, m.index) });
    if (m[2]) { const j = extractJSON(m[1]); parts.push(j && Array.isArray(j.exercises) ? { plan: j } : { text: m[1] }); } else parts.push({ pending: true });
    last = re.lastIndex;
  }
  if (last < text.length) parts.push({ text: text.slice(last) });
  return parts;
}

const clamp = (x, lo, hi, d) => { x = Math.round(+x); return isNaN(x) ? d : Math.max(lo, Math.min(hi, x)); };
export function planToWorkout(j, source = 'coach') {
  const exercises = [];
  for (const e of (j.exercises || []).slice(0, 12)) {
    if (!e || !e.name) continue;
    let ex = findExercise(e.name);
    if (!ex) {
      const primary = MUSCLES.some(m => m.id === e.muscle) ? e.muscle : guessMuscle(e.name);
      ex = addCustomExercise({ name: String(e.name).slice(0, 60), primary, load: guessLoad(e.name), kind: 'i' });
    }
    const reps = Array.isArray(e.reps) ? e.reps : [e.reps || 8, e.reps || 12];
    const lo = clamp(reps[0], 1, 50, 8), hi = Math.max(lo, clamp(reps[1] ?? reps[0], 1, 60, 12));
    exercises.push(makeExercise(ex.id, clamp(e.sets, 1, 8, 3), [lo, hi], clamp(e.rir, 0, 5, 2), clamp(e.rest_sec, 20, 360, ex.kind === 'c' ? 150 : 75), String(e.note || '').slice(0, 160), +e.weight > 0 ? +e.weight : null));
  }
  if (!exercises.length) throw new Error('The model returned no usable exercises. Try again or pick another model.');
  return { title: String(j.title || 'Coach session').slice(0, 60), source, rationale: String(j.rationale || '').slice(0, 400), exercises, est: estMinutes(exercises) };
}

export async function generateAI(checkin) {
  const text = await chat([
    { role: 'system', content: systemPrompt(checkin) },
    { role: 'user', content: `Build today's session for the check-in above. Fit the time available including rests. Choose the focus from what is recovered and furthest behind on weekly sets unless a focus was requested. Use loads from my log where they exist. Reply with ONLY the JSON object: ${SCHEMA}` },
  ], { json: true });
  const j = extractJSON(text);
  if (!j) throw new Error('The model did not return a workout. Try again or pick another model.');
  return planToWorkout(j);
}
