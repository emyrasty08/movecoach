// Training sessions, kept in this phone's localStorage (no account, no server).
//
// A session is opened with "Inizia allenamento" and holds the sets done in it,
// of any exercise; it is closed with "Termina allenamento". The open session is
// saved after every set, so closing the app does not lose it.
//
//   session = { id, start, end, sets: [set] }
//   set     = { exId, name, side, view, date, reps, correct, pct, errors: {kind: {n, label}},
//               up: [s], down: [s], ipf: n | null, best: 0-3 | null }

import { RULES_SIDE, RULES_FRONT } from "./coach.js";

const KEY = "movecoach.sessions.v2";
const OPEN = "movecoach.session.open";
const OLD = "squatcoach.sessions.v1";          // squat-only history of the first version

const read = (k, def) => { try { return JSON.parse(localStorage.getItem(k)) ?? def; } catch { return def; } };
const write = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} };

// ---------------------------------------------------------------- stored sessions
export function loadSessions() {
  migrate();
  return read(KEY, []);
}
export function clearSessions() {
  try { localStorage.removeItem(KEY); localStorage.removeItem(OPEN); } catch {}
}

// Old squat sessions become one-set sessions, once.
function migrate() {
  const old = read(OLD, null);
  if (!old) return;
  const R = { ...RULES_SIDE, ...RULES_FRONT };
  const conv = old.map((s) => ({
    id: s.date, start: s.date, end: s.date,
    sets: [{ exId: "squat", name: "Squat", side: null, view: s.view, date: s.date, reps: s.reps, correct: s.correct,
             pct: s.pct, errors: Object.fromEntries(Object.entries(s.errors || {}).map(([k, n]) => [k, { n, label: R[k]?.label || k }])),
             up: [], down: [], ipf: null, best: null }],
  }));
  write(KEY, conv.concat(read(KEY, [])).slice(-300));
  try { localStorage.removeItem(OLD); } catch {}
}

// ---------------------------------------------------------------- open session
export const openSession = () => read(OPEN, null);

export function startSession() {
  const s = openSession() || { id: new Date().toISOString(), start: new Date().toISOString(), sets: [] };
  write(OPEN, s);
  return s;
}

export function addSet(set) {
  const s = openSession() || startSession();
  s.sets.push(set);
  write(OPEN, s);
  return s;
}

// Close the open session: stored in the history if it has at least one set.
export function endSession() {
  const s = openSession();
  try { localStorage.removeItem(OPEN); } catch {}
  if (!s || !s.sets.length) return null;
  s.end = new Date().toISOString();
  const all = loadSessions();
  all.push(s);
  write(KEY, all.slice(-300));
  return s;
}

// ---------------------------------------------------------------- one set
// reps: repetitions of movement.js (peak) or coach.js (b). Tempo as in the
// rep-timing demos of J. Park: down = start -> deepest point, up = deepest point
// -> end (the concentric phase, the one that slows down with fatigue).
export function setRecord({ exId, name, side, view, reps }) {
  const n = reps.length, ok = reps.filter((r) => r.ok).length;
  const errors = {};
  for (const r of reps) for (const e of r.errors) {
    const label = e.label || shortLabel(e);
    errors[e.kind] = { n: (errors[e.kind]?.n || 0) + 1, label };
  }
  const bottom = (r) => r.frames[r.peak ?? r.b].t;
  const sec = (x) => Math.round(x / 10) / 100;
  return {
    exId, name, side: side || null, view: view || null, date: new Date().toISOString(),
    reps: n, correct: ok, pct: n ? Math.round((100 * ok) / n) : 0, errors,
    down: reps.map((r) => sec(bottom(r) - r.frames[0].t)),
    up: reps.map((r) => sec(r.frames[r.frames.length - 1].t - bottom(r))),
    // squat seen from the side: reps below parallel by the IPF rule (coach.js, values.ipf)
    ipf: reps.some((r) => Number.isFinite(r.values?.ipf)) ? reps.filter((r) => r.values.ipf >= 0).length : null,
    // FMS-style score of the best repetition (movement.js)
    best: reps.some((r) => Number.isInteger(r.score) && r.exercise) ? Math.max(...reps.map((r) => r.score)) : null,
  };
}

// "Busto inclinato in avanti (32°)" -> "Busto inclinato in avanti"
const shortLabel = (e) => (e.text || e.kind).replace(/\s*\(.*?\)\s*/g, "").replace(/:.*$/, "").trim();

// Most frequent fault of a set (or of several sets).
export function topError(sets) {
  const tot = {};
  for (const s of [].concat(sets)) for (const [k, e] of Object.entries(s.errors || {}))
    tot[k] = { n: (tot[k]?.n || 0) + e.n, label: e.label };
  return Object.values(tot).sort((a, b) => b.n - a.n)[0] || null;
}
