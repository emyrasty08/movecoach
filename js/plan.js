// Assessment result -> training plan, and their storage on the phone.
//
// Logic (inspired by the FMS hierarchy, simplified):
//   1. a test with pain (score 0) is not trained: the advice is to see a professional;
//   2. mobility first (shoulder mobility, ASLR), then core stability (rotary,
//      push-up), then the movement patterns (deep squat, lunge, hurdle step);
//   3. within the same level, the lowest score first, and a left/right
//      difference (asymmetry) before a symmetric score;
//   4. at most 3 focus areas; 3 sessions per week for 4 weeks, then a new assessment.
// User-facing texts are in Italian, like the rest of the app.

import { EXERCISES, ASSESSMENT_ORDER } from "./exercises.js";

const KEY = "movecoach.assessments.v1";
const LEVEL = { shoulder_mobility: 1, aslr: 1, rotary_stability: 2, trunk_pushup: 2,
                deep_squat: 3, inline_lunge: 3, hurdle_step: 3 };

// Corrective drills per test. coach = exercise id that the app can follow with
// the camera (an id of exercises.js), null = no camera feedback.
const DRILLS = {
  deep_squat: [
    { name: "Squat al box", dose: "3 × 8", coach: null, why: "profondità e busto, scendendo fino a sfiorare una panca" },
    { name: "Mobilità della caviglia al muro", dose: "2 × 10 per lato", coach: null, why: "ginocchio oltre la punta senza alzare il tallone" },
    { name: "Deep squat con bastone", dose: "3 × 5", coach: "deep_squat", why: "lo schema completo del test" },
  ],
  hurdle_step: [
    { name: "Equilibrio su una gamba", dose: "3 × 30 s per lato", coach: null, why: "stabilità della gamba d'appoggio" },
    { name: "Hurdle step lento con bastone", dose: "3 × 5 per lato", coach: "hurdle_step", why: "bastone orizzontale e busto fermo" },
  ],
  inline_lunge: [
    { name: "Affondo in linea con bastone", dose: "3 × 6 per lato", coach: "inline_lunge", why: "busto verticale" },
    { name: "Allungamento dei flessori dell'anca", dose: "2 × 30 s per lato", coach: null, why: "più spazio alla gamba dietro" },
  ],
  shoulder_mobility: [
    { name: "Open book (rotazione toracica)", dose: "2 × 10 per lato", coach: null, why: "mobilità della colonna toracica" },
    { name: "Allungamento di pettorali e dorsali", dose: "2 × 30 s", coach: null, why: "spalle più libere" },
    { name: "Shoulder mobility", dose: "3 × 3 per lato", coach: "shoulder_mobility", why: "misura dei progressi" },
  ],
  aslr: [
    { name: "Abbassamento attivo della gamba", dose: "2 × 10 per lato", coach: "aslr", why: "controllo della gamba tesa" },
    { name: "Allungamento dei femorali", dose: "2 × 30 s per lato", coach: null, why: "più ampiezza" },
  ],
  trunk_pushup: [
    { name: "Plank", dose: "3 × 30 s", coach: null, why: "tronco rigido" },
    { name: "Push-up dal tronco", dose: "3 × 5", coach: "trunk_pushup", why: "salire tutto in un blocco" },
  ],
  rotary_stability: [
    { name: "Bird dog", dose: "3 × 8 per lato", coach: "rotary_stability", why: "braccio e gamba allungati, tronco fermo" },
    { name: "Dead bug", dose: "3 × 8 per lato", coach: null, why: "controllo del tronco" },
  ],
};

// results: { testId: { score, l, r, pain } } -> ordered list of focus areas and the plan
export function buildPlan(results) {
  const items = ASSESSMENT_ORDER.filter((id) => results[id] && !results[id].skipped).map((id) => {
    const r = results[id];
    const asym = r.l !== undefined && r.r !== undefined && r.l !== r.r;
    return { id, name: EXERCISES[id].name, score: r.score, asym, pain: !!r.pain, level: LEVEL[id] };
  });
  const pain = items.filter((i) => i.pain);
  const focus = items.filter((i) => !i.pain && (i.score <= 2 || i.asym))
    .sort((a, b) => a.level - b.level || a.score - b.score || Number(b.asym) - Number(a.asym))
    .slice(0, 3);
  // each session: the drills of the focus areas; if nothing to fix, maintenance on the patterns
  const blocks = (focus.length ? focus : items.filter((i) => i.level === 3).slice(0, 2))
    .map((f) => ({ test: f.id, title: f.name, reason: reasonText(f), drills: DRILLS[f.id] }));
  return {
    created: new Date().toISOString(),
    pain: pain.map((p) => p.name),
    focus: focus.map((f) => f.id),
    weeks: 4, perWeek: 3, blocks,
    note: focus.length ? "Ripeti la valutazione dopo 4 settimane per vedere i progressi."
                       : "Nessuna area critica: mantieni gli schemi di movimento e ripeti la valutazione tra 4 settimane.",
  };
}

function reasonText(f) {
  if (f.asym) return `differenza tra destra e sinistra (punteggio ${f.score})`;
  return f.score === 1 ? "movimento non completato (punteggio 1)" : "completato con compensi (punteggio 2)";
}

export function totalScore(results) {
  return ASSESSMENT_ORDER.reduce((a, id) => a + (results[id] && !results[id].skipped ? results[id].score : 0), 0);
}

// ---------------------------------------------------------------- storage
export function loadAssessments() {
  try { return JSON.parse(localStorage.getItem(KEY)) || []; } catch { return []; }
}
export function saveAssessment(a) {
  const all = loadAssessments();
  all.push(a);
  try { localStorage.setItem(KEY, JSON.stringify(all.slice(-50))); } catch {}
}
export function lastAssessment() {
  const all = loadAssessments();
  return all[all.length - 1] || null;
}
