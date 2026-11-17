// Screens and flow of the initial assessment, the results, the training plan and
// the exercise list. The camera session itself lives in main.js, which passes its
// functions here through initFlow().
//
// Assessment: the 7 tests in FMS order, bilateral tests once per side. For each
// step: instructions -> camera -> score of the best repetition -> pain question.
// Test score = worse side; pain = 0 (as in the FMS). At the end: total, plan.

import { EXERCISES, ASSESSMENT_ORDER } from "./exercises.js";
import { buildPlan, totalScore, saveAssessment, lastAssessment } from "./plan.js";

const $ = (id) => document.getElementById(id);
const SIDE_NAME = { l: "sinistra", r: "destra" };
let api = null;               // { show, startExercise, speak }
let A = null;                 // assessment in progress

// ---------------------------------------------------------------- profile
export function loadProfile() {
  try { return JSON.parse(localStorage.getItem("movecoach.profile")) || {}; } catch { return {}; }
}
function saveProfile(p) { try { localStorage.setItem("movecoach.profile", JSON.stringify(p)); } catch {} }
export const isFirstLaunch = () => !loadProfile().seenWelcome;

// ---------------------------------------------------------------- setup
export function initFlow(mainApi) {
  api = mainApi;
  const p = loadProfile();
  if (p.heightCm) $("inHeight").value = p.heightCm;
  $("btnAssess").onclick = () => { storeWelcome(); startAssessment(); };
  $("btnSkipAssess").onclick = () => { storeWelcome(); renderHome(); api.show("home"); };
  $("btnNewAssess").onclick = () => api.show("welcome");
  $("btnTestGo").onclick = () => runStep();
  $("btnTestManual").onclick = () => { $("tiManual").hidden = false; };
  $("btnTestSkip").onclick = () => { record({ skipped: true }); nextStep(); };
  $("btnTestQuit").onclick = () => { A = null; renderHome(); api.show("home"); };
  $("btnPainNo").onclick = () => nextStep();
  $("btnPainYes").onclick = () => { record({ pain: true }); nextStep(); };
  $("btnTestRedo").onclick = () => runStep();
  $("btnSeePlan").onclick = () => { renderPlan(); api.show("plan"); };
  $("btnPlan").onclick = () => { renderPlan(); api.show("plan"); };
  $("btnTrain").onclick = () => { renderExerciseList(); api.show("exercises"); };
  for (const id of ["btnHome3", "btnHome4", "btnHome5"]) $(id).onclick = () => { renderHome(); api.show("home"); };
  renderHome();
}

function storeWelcome() {
  const h = Number($("inHeight").value);
  saveProfile({ ...loadProfile(), seenWelcome: true, heightCm: h >= 120 && h <= 220 ? h : undefined });
}

export function renderHome() {
  const last = lastAssessment();
  $("btnPlan").hidden = !last;
  $("homeScore").hidden = !last;
  if (last) {
    const d = new Date(last.date);
    $("homeScore").innerHTML = `Ultima valutazione: <b>${last.total}</b> su ${last.max} ` +
      `<span class="small">(${d.getDate()}/${d.getMonth() + 1})</span>`;
  }
}

// ---------------------------------------------------------------- assessment
function startAssessment() {
  const steps = [];
  for (const id of ASSESSMENT_ORDER) {
    if (EXERCISES[id].bilateral) steps.push({ id, side: "l" }, { id, side: "r" });
    else steps.push({ id, side: null });
  }
  A = { steps, i: 0, raw: {} };            // raw[id][side|"c"] = { score, faults, pain, skipped }
  showIntro();
}

function stepLabel() {
  const s = A.steps[A.i];
  const n = ASSESSMENT_ORDER.indexOf(s.id) + 1;
  return `Test ${n} di ${ASSESSMENT_ORDER.length}` + (s.side ? ` · lato ${SIDE_NAME[s.side]}` : "");
}

function showIntro() {
  const s = A.steps[A.i], ex = EXERCISES[s.id];
  $("tiStep").textContent = stepLabel();
  $("tiTitle").textContent = ex.name + (s.side ? ` (${SIDE_NAME[s.side]})` : "");
  $("tiTool").textContent = `Ti serve: ${ex.tool}.`;
  $("tiSteps").innerHTML = ex.intro.map((t) => `<li>${t}</li>`).join("") +
    (s.side ? `<li>Lavora il lato <b>${SIDE_NAME[s.side]}</b>.</li>` : "") +
    "<li>Quando hai fatto le 3 prove premi <b>Fine test</b>.</li>";
  // manual alternative (shoulder mobility: a helper measures the fist distance)
  $("btnTestManual").hidden = !ex.manual;
  $("tiManual").hidden = true;
  if (ex.manual) {
    $("tiManual").innerHTML = `<p>${ex.manual.question}</p>` +
      ex.manual.choices.map(([label, score]) => `<button class="btn" data-score="${score}">${label}</button>`).join("");
    for (const b of $("tiManual").querySelectorAll("button"))
      b.onclick = () => showResult(Number(b.dataset.score), [`Misura a mano: ${b.textContent}`], "");
  }
  api.show("testIntro");
  api.speak(`${ex.name}. ${ex.intro.join(" ")}`);
}

function runStep() {
  const s = A.steps[A.i];
  api.startExercise(s.id, s.side, "assess");
}

// Called by main.js when the person stops the camera during an assessment step.
export function onAssessmentStep(reps) {
  const best = reps.length ? reps.reduce((a, r) => (r.score > a.score ? r : a)) : null;
  const score = best ? best.score : 1;      // no valid repetition = movement not completed
  const faults = best ? best.errors.map((e) => e.text) : ["Nessuna ripetizione riconosciuta: movimento non completato o non visibile"];
  showResult(score, faults, best && best.errors.length ? best.errors[0].cue : "");
}

// Store the score of the current step and show it (camera or manual measure).
function showResult(score, faults, cue) {
  const s = A.steps[A.i], ex = EXERCISES[s.id];
  record({ score, faults });
  $("trStep").textContent = stepLabel();
  $("trTitle").textContent = ex.name + (s.side ? ` (${SIDE_NAME[s.side]})` : "");
  $("trScore").textContent = String(score);
  $("trFaults").innerHTML = faults.length ? faults.map((f) => `<li>${f}</li>`).join("") : "<li>Esecuzione corretta</li>";
  api.show("testResult");
  api.speak(`Punteggio ${score}. ${cue}`);
}

function record(fields) {
  const s = A.steps[A.i];
  A.raw[s.id] = A.raw[s.id] || {};
  A.raw[s.id][s.side || "c"] = { ...(A.raw[s.id][s.side || "c"] || {}), ...fields };
}

function nextStep() {
  A.i += 1;
  if (A.i < A.steps.length) { showIntro(); return; }
  finishAssessment();
}

function finishAssessment() {
  // per test: worse side, pain -> 0, all sides skipped -> skipped
  const results = {};
  for (const id of ASSESSMENT_ORDER) {
    const r = A.raw[id] || {};
    const parts = Object.values(r);
    if (!parts.length || parts.every((p) => p.skipped)) { results[id] = { skipped: true }; continue; }
    const val = (p) => (p.pain ? 0 : p.skipped ? undefined : p.score);
    const out = { score: Math.min(...parts.map(val).filter((v) => v !== undefined)), pain: parts.some((p) => p.pain),
                  faults: parts.flatMap((p) => p.faults || []) };
    if (r.l) out.l = val(r.l);
    if (r.r) out.r = val(r.r);
    results[id] = out;
  }
  const done = ASSESSMENT_ORDER.filter((id) => !results[id].skipped).length;
  const a = { date: new Date().toISOString(), results, total: totalScore(results), max: 3 * done };
  a.plan = buildPlan(results);
  saveAssessment(a);
  A = null;
  renderResults(a);
  api.show("results");
  api.speak(`Valutazione finita. Punteggio ${a.total} su ${a.max}.`);
}

// ---------------------------------------------------------------- results and plan
function renderResults(a) {
  $("rsTotal").textContent = String(a.total);
  $("rsMax").textContent = `su ${a.max}`;
  $("rsBars").innerHTML = ASSESSMENT_ORDER.map((id) => {
    const r = a.results[id], ex = EXERCISES[id];
    if (r.skipped) return `<div class="bar-row"><div class="name">${ex.name}<small>saltato</small></div><div class="track"></div><div class="val">–</div></div>`;
    const sides = r.l !== undefined ? `sinistra ${r.l ?? "–"} · destra ${r.r ?? "–"}` : "";
    const note = r.pain ? "dolore" : r.l !== undefined && r.l !== r.r ? `asimmetria: ${sides}` : sides;
    return `<div class="bar-row"><div class="name">${ex.name}<small>${note}</small></div>` +
      `<div class="track"><div class="s${r.score}" style="width:${Math.max(r.score, 0.15) / 3 * 100}%"></div></div>` +
      `<div class="val">${r.score}</div></div>`;
  }).join("");
  const p = a.plan;
  $("rsNote").textContent = (p.pain.length ? `Dolore in: ${p.pain.join(", ")}: fatti vedere da un professionista prima di allenare quei movimenti. ` : "") +
    (p.focus.length ? `Da migliorare per primo: ${p.focus.map((id) => EXERCISES[id].name).join(", ")}.` : "Nessuna area critica.");
}

function renderPlan() {
  const a = lastAssessment();
  if (!a) return;
  const p = a.plan;
  $("plSub").textContent = `${p.perWeek} sedute a settimana per ${p.weeks} settimane. In ogni seduta fai i blocchi qui sotto, in ordine.`;
  $("plBlocks").innerHTML = "";
  for (const b of p.blocks) {
    const div = document.createElement("div");
    div.className = "block";
    div.innerHTML = `<h2>${b.title}</h2><p class="why">${b.reason || "mantenimento"}</p>`;
    for (const d of b.drills) {
      const row = document.createElement("div");
      row.className = "drill";
      row.innerHTML = `<div class="info"><div>${d.name}</div><div class="dose">${d.dose}</div><div class="desc">${d.why}</div></div>`;
      if (d.coach) row.appendChild(coachButton(d.coach));
      div.appendChild(row);
    }
    $("plBlocks").appendChild(div);
  }
  $("plNote").textContent = p.note;
}

function coachButton(id) {
  const b = document.createElement("button");
  b.className = "btn small";
  b.textContent = "Con coach";
  b.onclick = () => (id === "squat" ? api.startSquat() : askSide(id));
  return b;
}

// bilateral exercise: ask which side (simple confirm, no extra screen)
function askSide(id) {
  if (!EXERCISES[id].bilateral) { api.startExercise(id, null, "train"); return; }
  const right = confirm(`${EXERCISES[id].name}: OK = lato destro, Annulla = lato sinistro`);
  api.startExercise(id, right ? "r" : "l", "train");
}

function renderExerciseList() {
  const list = $("exList");
  list.innerHTML = "";
  const items = [{ id: "squat", name: "Squat (di lato)", meta: "profondità, busto, ginocchia, talloni · con manichino" }]
    .concat(ASSESSMENT_ORDER.map((id) => ({ id, name: EXERCISES[id].name,
      meta: `telefono ${{ front: "di fronte", side: "di lato", back: "dietro di te" }[EXERCISES[id].view]} · ${EXERCISES[id].tool}` })));
  for (const it of items) {
    const row = document.createElement("div");
    row.className = "ex-item";
    row.innerHTML = `<div class="info"><div>${it.name}</div><div class="meta">${it.meta}</div></div>`;
    row.appendChild(coachButton(it.id));
    list.appendChild(row);
  }
}

// ---------------------------------------------------------------- summary of a training set
export function renderMovementSummary(reps, exId) {
  const ex = EXERCISES[exId];
  const n = reps.length, ok = reps.filter((r) => r.ok).length;
  $("sReps").textContent = n;
  $("sOk").textContent = ok;
  $("sPct").textContent = `${n ? Math.round((100 * ok) / n) : 0}%`;
  const count = {};
  for (const r of reps) for (const e of r.errors) count[e.kind] = (count[e.kind] || 0) + 1;
  const top = Object.entries(count).sort((a, b) => b[1] - a[1])[0];
  const rule = top && ex.rules.find((r) => r.key === top[0]);
  $("sMain").textContent = !n ? "Nessuna ripetizione registrata."
    : rule ? `${ex.name}: errore più frequente in ${top[1]} ripetizioni su ${n}. ${rule.cue}.` : `${ex.name}: tutte corrette, ottimo!`;
  $("btnWorst").hidden = true;
  $("repList").innerHTML = reps.map((r, i) =>
    `<div class="rep-card"><div class="info"><h3>Rip. ${i + 1}${r.side ? ` · ${SIDE_NAME[r.side]}` : ""}</h3>` +
    (r.ok ? `<div class="okline">✓ Corretta</div>` : `<ul>${r.errors.map((e) => `<li>${e.text}</li>`).join("")}</ul>`) +
    "</div></div>").join("");
}
