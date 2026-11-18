// Screens and navigation: the four tabs (Oggi, Allenati, Progressi, Profilo),
// the initial assessment, the exercise picker and the exercise intro. The camera
// session and the set summary live in main.js, which passes its functions here
// through initFlow().
//
// Assessment: the 7 tests in FMS order, bilateral tests once per side. For each
// step: instructions -> camera -> score of the best repetition -> pain question.
// Test score = worse side; pain = 0 (as in the FMS). At the end: total, plan.

import { EXERCISES, ASSESSMENT_ORDER } from "./exercises.js";
import { buildPlan, totalScore, saveAssessment, lastAssessment } from "./plan.js";
import { CATALOG, GUIDES, TRAIN, byId, setupSteps } from "./catalog.js";
import { openSession, startSession, endSession, loadSessions } from "./session.js";
import { renderHistory, sessionCard } from "./history.js";

const $ = (id) => document.getElementById(id);
export const SIDE_NAME = { l: "sinistra", r: "destra" };
const TABS = ["home", "train", "history", "profile"];
let api = null;               // { show, speak, startExercise, startTrain }
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
  // tabs
  for (const b of $("tabbar").querySelectorAll("button")) b.onclick = () => goTab(b.dataset.tab);
  // welcome and assessment
  $("btnAssess").onclick = () => { storeWelcome(); startAssessment(); };
  $("btnSkipAssess").onclick = () => { storeWelcome(); goTab("home"); };
  $("btnNewAssess").onclick = () => api.show("welcome");
  $("btnAssess2").onclick = () => api.show("welcome");
  $("btnTestGo").onclick = () => runStep();
  $("btnTestManual").onclick = () => { $("tiManual").hidden = false; };
  $("btnTestSkip").onclick = () => { record({ skipped: true }); nextStep(); };
  $("btnTestQuit").onclick = () => { A = null; goTab("home"); };
  $("btnPainNo").onclick = () => nextStep();
  $("btnPainYes").onclick = () => { record({ pain: true }); nextStep(); };
  $("btnTestRedo").onclick = () => runStep();
  // home
  $("btnSession").onclick = () => { startSession(); goTab("train"); };
  $("btnAddEx").onclick = () => goTab("train");
  $("btnEndSession").onclick = () => {
    const s = endSession();
    if (!s) { goTab("home"); return; }
    api.speak("Allenamento salvato");
    goTab("history");
  };
  $("homeProfile").onclick = () => goTab("profile");
  // picker and exercise intro
  $("segTrain").onclick = () => { PK.mode = "train"; renderExerciseList(); };
  $("segTest").onclick = () => { PK.mode = "test"; renderExerciseList(); };
  $("btnExBack").onclick = () => (TABS.includes(EI.back) ? goTab(EI.back) : api.show(EI.back));
  $("btnExGo").onclick = () => api.startTrain(EI.id, EI.side, EI.mode, "camera");
  $("btnExFile").onclick = () => $("fileInput").click();
  $("fileInput").onchange = (e) => {
    const f = e.target.files[0]; e.target.value = "";
    if (f) api.startTrain(EI.id, EI.side, EI.mode, "file", f);
  };
  for (const b of $("eiSide").querySelectorAll("button")) b.onclick = () => pickSide(b.dataset.side);
  renderHome();
}

// Show one of the four tabs, rendered fresh.
export function goTab(id) {
  if (id === "home") renderHome();
  if (id === "train") renderExerciseList();
  if (id === "history") renderHistory(loadSessions());
  if (id === "profile") renderProfile();
  api.show(id);
}
export const showHistory = () => goTab("history");

function storeWelcome() {
  const h = Number($("inHeight").value);
  saveProfile({ ...loadProfile(), seenWelcome: true, heightCm: h >= 120 && h <= 220 ? h : undefined });
}

// ---------------------------------------------------------------- tab: Oggi
export function renderHome() {
  const open = openSession();
  const h = new Date().getHours();
  $("homeTitle").textContent = open?.sets.length ? "Bel lavoro, continua così"
    : h < 12 ? "Buongiorno, si parte?" : h < 18 ? "Pronto ad allenarti?" : "Allenamento serale?";
  // training in progress
  $("homeOpen").hidden = !open;
  $("btnSession").hidden = !!open;
  if (open) {
    const d = new Date(open.start), reps = open.sets.reduce((a, x) => a + x.reps, 0);
    $("sessSub").textContent = `dalle ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}` +
      (open.sets.length ? ` · ${open.sets.length} serie · ${reps} rip.` : "");
    $("sessSets").innerHTML = open.sets.length ? "" : `<p class="small">Scegli il primo esercizio: dopo ogni serie torni qui.</p>`;
    if (open.sets.length) $("sessSets").appendChild(sessionCard(open, true));
    $("btnEndSession").hidden = !open.sets.length;
  }
  // movement profile
  const last = lastAssessment();
  $("homeProfile").innerHTML = last
    ? `<div class="score-row"><div class="ring sm"><span>${last.total}</span><small>/${last.max}</small></div>` +
      `<div><h2>Profilo di movimento</h2><p class="meta">${last.plan.focus.length ? `Da migliorare: ${last.plan.focus.map((id) => EXERCISES[id].name).join(", ")}` : "Nessuna area critica"}</p></div>` +
      `<span class="go">›</span></div>`
    : `<div class="score-row"><div class="ring sm empty"><span>?</span></div><div><h2>Valutazione iniziale</h2>` +
      `<p class="meta">7 test, 15 minuti: scopri cosa migliorare</p></div><span class="go">›</span></div>`;
  // today's plan: the drills that the camera can follow
  const drills = last ? last.plan.blocks.flatMap((b) => b.drills).filter((d) => d.coach && byId(d.coach)) : [];
  $("homePlan").hidden = !drills.length;
  if (drills.length) {
    $("homePlan").innerHTML = `<h2>Dal tuo piano</h2>`;
    for (const d of drills.slice(0, 3)) $("homePlan").appendChild(drillRow(d));
  }
  // last finished session
  const all = loadSessions(), ls = all[all.length - 1];
  $("homeLast").hidden = !ls || !!open;
  if (ls && !open) {
    $("homeLast").innerHTML = `<h2>Ultimo allenamento</h2>`;
    $("homeLast").appendChild(sessionCard(ls, true));
  }
}

function drillRow(d) {
  const row = document.createElement("div");
  row.className = "drill";
  row.innerHTML = `<div class="info"><div>${d.name}</div><div class="dose">${d.dose}</div><div class="desc">${d.why}</div></div>`;
  if (d.coach && byId(d.coach)) {
    const b = document.createElement("button");
    b.className = "btn small";
    b.textContent = "Con coach";
    b.onclick = () => openExIntro(d.coach, "train", "home");
    row.appendChild(b);
  }
  return row;
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
  goTab("profile");
  api.speak(`Valutazione finita. Punteggio ${a.total} su ${a.max}.`);
}

// ---------------------------------------------------------------- tab: Profilo
function renderProfile() {
  const a = lastAssessment();
  $("pfNone").hidden = !!a;
  $("pfDone").hidden = !a;
  if (!a) return;
  const d = new Date(a.date);
  $("rsTotal").textContent = String(a.total);
  $("rsMax").textContent = `su ${a.max}`;
  $("rsRing").style.setProperty("--p", a.max ? a.total / a.max : 0);
  $("rsDate").textContent = `Valutazione del ${d.getDate()}/${d.getMonth() + 1}/${d.getFullYear()}`;
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
  $("plSub").textContent = `${p.perWeek} sedute a settimana per ${p.weeks} settimane. In ogni seduta fai i blocchi qui sotto, in ordine.`;
  $("plBlocks").innerHTML = "";
  for (const b of p.blocks) {
    const div = document.createElement("div");
    div.className = "card block";
    div.innerHTML = `<h2>${b.title}</h2><p class="why">${b.reason || "mantenimento"}</p>`;
    for (const dr of b.drills) div.appendChild(drillRow(dr));
    $("plBlocks").appendChild(div);
  }
  $("plNote").textContent = p.note;
}

// ---------------------------------------------------------------- tab: Allenati
const PK = { mode: "train" };

// last set of each exercise in this mode, for the badge on the right
function lastOf(id, mode) {
  const sets = loadSessions().flatMap((s) => s.sets).concat(openSession()?.sets || [])
    .filter((x) => x.exId === id && (x.mode || "train") === mode);
  return sets[sets.length - 1] || null;
}

function renderExerciseList() {
  const test = PK.mode === "test";
  $("segTrain").classList.toggle("on", !test);
  $("segTest").classList.toggle("on", test);
  $("exHint").textContent = test
    ? "Un test alla volta, con il voto da 0 a 3 come nella valutazione. Il voto va nei Progressi."
    : "Serie libere: la voce ti corregge, poi vedi le analisi di ogni ripetizione e la posizione corretta.";
  const list = $("exList");
  list.innerHTML = "";
  CATALOG.forEach((it, i) => {
    const last = lastOf(it.id, PK.mode);
    const badge = !last ? "" : test ? `<span class="pill s${last.best}">voto ${last.best}</span>`
      : `<span class="pill">${last.pct}%</span>`;
    const row = document.createElement("button");
    row.className = "ex-item";
    row.innerHTML = `<span class="num">${i + 1}</span><div class="info"><div class="name">${it.name}</div>` +
      `<div class="meta">${it.viewName}${it.bilateral ? " · per lato" : ""} · ${it.tool}</div></div>${badge}<span class="go">›</span>`;
    row.onclick = () => openExIntro(it.id, PK.mode, "train");
    list.appendChild(row);
  });
}

// ---------------------------------------------------------------- exercise intro
const EI = { id: null, side: null, mode: "train", back: "train" };

export function openExIntro(id, mode = "train", back = "train") {
  const it = byId(id), test = mode === "test", g = test ? GUIDES[id] : TRAIN[id];
  EI.id = id; EI.mode = mode; EI.back = back;
  $("eiMode").textContent = test ? "Test FMS · voto 0–3" : `Esercizio · consigliato ${TRAIN[id].dose}`;
  $("eiTitle").textContent = it.name;
  $("eiMeta").textContent = `Ti serve: ${it.tool}.`;
  $("eiGuideTitle").textContent = test ? "Come si assegna il voto" : "Come si esegue";
  $("eiGuide").innerHTML = g.points.map((t) => `<li>${t}</li>`).join("");
  $("eiSource").textContent = `Fonte: ${g.source}.`;
  $("eiSetup").innerHTML = setupSteps(id).map((t) => `<li>${t}</li>`).join("");
  $("eiChecks").textContent = `Ogni ripetizione: ${it.checks.join(", ")}. Poi i tempi di discesa e risalita, ` +
    "i grafici della serie e la posizione corretta al rallentatore.";
  $("eiSide").hidden = !it.bilateral;
  pickSide(it.bilateral ? EI.side || "l" : null);
  $("btnExGo").textContent = test ? "Inizia il test" : "Inizia la serie";
  api.show("exIntro");
}

function pickSide(side) {
  EI.side = side;
  for (const b of $("eiSide").querySelectorAll("button")) b.classList.toggle("on", b.dataset.side === side);
}
