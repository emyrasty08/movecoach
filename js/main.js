import { drawSkeleton, drawMannequin, drawDashed, FRONT_EDGES, COL } from "./draw.js";
import * as SES from "./session.js";
import { setTraceChart, ruleChart, phasesChart } from "./charts.js";
import { byId } from "./catalog.js";
import { MovementCoach } from "./movement.js";
import { EXERCISES } from "./exercises.js";
import { correctFrame, limitText } from "./correct.js";
import { initFlow, isFirstLaunch, loadProfile, onAssessmentStep, goTab, SIDE_NAME } from "./flow.js";

const MP = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14";
const MODEL = "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_full/float16/1/pose_landmarker_full.task";
// MediaPipe pose landmark index -> our names
const LM = { 0: "nose", 7: "ear_l", 8: "ear_r", 11: "shoulder_l", 12: "shoulder_r", 13: "elbow_l", 14: "elbow_r",
  15: "wrist_l", 16: "wrist_r", 23: "hip_l", 24: "hip_r", 25: "knee_l", 26: "knee_r", 27: "ankle_l", 28: "ankle_r",
  29: "heel_l", 30: "heel_r", 31: "toe_l", 32: "toe_r" };
const MAX_PEOPLE = 3;         // people detected per frame: the one training is then picked (pickPerson)
const SNAP_W = 360;           // width of the frames kept for the replay
const TAB_SCREENS = new Set(["home", "train", "history", "profile"]);
const $ = (id) => document.getElementById(id);

const S = {
  landmarker: null, coach: null, mode: "camera", facing: "user", stream: null, running: false,
  voice: loadPref("voice", true), lastTs: -1, reps: [], worst: null, last: null,
  wakeLock: null, toastTimer: 0, snapScale: 1,
  exId: null, side: null,
  purpose: "train",           // "train" (free set), "test" (one FMS test), "assess" (step of the initial assessment)
  fatigueSaid: false,
  mpTs: 0,                    // timestamp given to MediaPipe (see tick)
  trace: [],                  // {t, s, m} of every active frame, for the set charts
  target: null,               // {x, y, h} of the person being followed, normalized image coords
  others: [],                 // other people in the frame (drawn faint, can be tapped)
  crowdSaid: false,
  rec: null,                  // set record of the last set (session.js)
};

// ---------------------------------------------------------------- utilities
function loadPref(k, def) {
  try { const v = localStorage.getItem(`squatcoach.${k}`); return v === null ? def : JSON.parse(v); }
  catch { return def; }
}
function savePref(k, v) { try { localStorage.setItem(`squatcoach.${k}`, JSON.stringify(v)); } catch {} }

function show(id) {
  for (const s of document.querySelectorAll(".screen")) s.classList.toggle("active", s.id === id);
  const tab = TAB_SCREENS.has(id);
  $("tabbar").hidden = !tab;
  if (tab) for (const b of $("tabbar").querySelectorAll("button")) b.classList.toggle("on", b.dataset.tab === id);
  window.scrollTo(0, 0);
  document.getElementById(id)?.scrollTo?.(0, 0);
}

// Android Chrome drops an utterance queued right after cancel(): cancel only if
// something is playing, then speak on the next tick. Chrome also stalls the queue
// after a while without resume(), so call it every time.
let itVoice = null;
function pickVoice() {
  const vs = speechSynthesis.getVoices();
  itVoice = vs.find((v) => /^it[-_]/i.test(v.lang)) || null;
}
if ("speechSynthesis" in window) { pickVoice(); speechSynthesis.onvoiceschanged = pickVoice; }
function speak(text) {
  if (!S.voice || !("speechSynthesis" in window)) return;
  const busy = speechSynthesis.speaking || speechSynthesis.pending;
  if (busy) speechSynthesis.cancel();
  setTimeout(() => {
    const u = new SpeechSynthesisUtterance(text);
    u.lang = "it-IT";
    if (itVoice) u.voice = itVoice;
    u.rate = 1.05;
    speechSynthesis.resume();
    speechSynthesis.speak(u);
  }, busy ? 120 : 0);
}

function toast(text, good) {
  const t = $("toast");
  t.textContent = text;
  t.className = "toast" + (good ? "" : " bad");
  t.hidden = false;
  clearTimeout(S.toastTimer);
  S.toastTimer = setTimeout(() => (t.hidden = true), 3200);
}

async function loadModel() {
  if (S.landmarker) return;
  $("modelStatus").textContent = "Carico il modello di posa… (solo la prima volta serve la rete)";
  const { FilesetResolver, PoseLandmarker } = await import(`${MP}/vision_bundle.mjs`);
  const fileset = await FilesetResolver.forVisionTasks(`${MP}/wasm`);
  const opts = (delegate) => ({ baseOptions: { modelAssetPath: MODEL, delegate }, runningMode: "VIDEO",
                                numPoses: MAX_PEOPLE, minPoseDetectionConfidence: 0.5, minTrackingConfidence: 0.5 });
  try { S.landmarker = await PoseLandmarker.createFromOptions(fileset, opts("GPU")); }
  catch { S.landmarker = await PoseLandmarker.createFromOptions(fileset, opts("CPU")); }
  $("modelStatus").textContent = "";
}

// ---------------------------------------------------------------- session
// opts: { exId, side, purpose }
async function startSession(mode, file, opts) {
  if (mode === "camera" && !(window.isSecureContext && navigator.mediaDevices?.getUserMedia)) {
    alert("Per usare la fotocamera la pagina deve essere aperta in HTTPS.");
    return;
  }
  speak(" ");                              // iOS: speech must start from a tap
  S.mode = mode;
  S.reps = []; S.worst = null; S.last = null; S.lastTs = -1; S.fatigueSaid = false; S.trace = [];
  S.target = null; S.others = []; S.crowdSaid = false;
  S.exId = opts.exId;
  S.side = opts.side || null;
  S.purpose = opts.purpose || "train";
  S.coach = new MovementCoach(EXERCISES[S.exId], S.side, loadProfile());
  $("btnStop").textContent = S.purpose === "train" ? "Fine serie" : "Fine test";
  $("repCount").textContent = "0";
  $("okCount").textContent = "0";
  $("viewBadge").hidden = true;
  $("toast").hidden = true;
  $("btnFlip").hidden = mode !== "camera";
  setGuide("Caricamento…", 0);
  show("live");
  try {
    await loadModel();
    const v = $("video");
    if (mode === "camera") await openCamera();
    else {
      v.srcObject = null;
      v.src = URL.createObjectURL(file);
      v.loop = false;
      v.onended = null;
      await new Promise((ok, ko) => { v.onloadeddata = ok; v.onerror = () => ko(new Error("video non leggibile")); });
      v.pause();
    }
  } catch (e) {
    console.error(e);
    alert("Non riesco ad avviare: " + (e.message || e));
    goTab("home");
    return;
  }
  try { S.wakeLock = await navigator.wakeLock?.request("screen"); } catch {}
  S.running = true;
  schedule();
}

async function openCamera() {
  S.stream?.getTracks().forEach((t) => t.stop());
  S.stream = await navigator.mediaDevices.getUserMedia({
    audio: false, video: { facingMode: S.facing, width: { ideal: 1280 }, height: { ideal: 720 } } });
  const v = $("video");
  v.src = "";
  v.srcObject = S.stream;
  await v.play();
}

function stopSession() {
  if (!S.running) return;
  S.running = false;
  S.stream?.getTracks().forEach((t) => t.stop());
  S.stream = null;
  $("video").pause();
  S.wakeLock?.release?.().catch(() => {});
  speechSynthesis?.cancel?.();
  const last = S.coach.finish?.();          // a repetition still in progress
  if (last) addRep(last, false);
  if (S.purpose === "assess") { onAssessmentStep(S.reps); return; }
  const ex = EXERCISES[S.exId];
  S.rec = SES.setRecord({ exId: S.exId, name: byId(S.exId).name, mode: S.purpose, side: S.side, view: ex.view, reps: S.reps });
  if (S.reps.length || S.purpose === "test") SES.addSet(S.rec);
  renderSummary();
}

// Video file: step through EVERY frame (seek + analyse), slower than real time on
// a weak device but no frame (and no rep bottom) is skipped.
async function stepFile() {
  const v = $("video"), dt = 1 / 30;
  for (let t = 0; S.running && t < v.duration; t += dt) {
    v.currentTime = t;
    await new Promise((r) => (v.onseeked = r));
    tick();
    $("guideBar").parentElement.dataset.p = String(t / v.duration);
  }
  stopSession();
}

function schedule() {
  const v = $("video");
  if (!S.running) return;
  if (S.mode === "file") { stepFile(); return; }
  if (v.requestVideoFrameCallback) v.requestVideoFrameCallback(() => { tick(); schedule(); });
  else requestAnimationFrame(() => { tick(); schedule(); });
}

function setGuide(text, prog) {
  $("guide").hidden = !text;
  $("guideText").textContent = text || "";
  $("guideBar").style.width = `${Math.round((prog || 0) * 100)}%`;
  $("guideBar").parentElement.style.visibility = prog ? "visible" : "hidden";
}

// ---------------------------------------------------------------- which person
// MediaPipe returns up to MAX_PEOPLE poses in no fixed order. With a second person
// in the frame (a spotter, someone walking by) the app must keep following the one
// training: once chosen, the person nearest to where they were in the last frame
// (same size too) is kept. The first choice is the biggest and most central one,
// and a tap on the screen chooses another.
function personBox(lm, mirror) {
  const xs = lm.map((p) => (mirror ? 1 - p.x : p.x)), ys = lm.map((p) => p.y);
  const hip = { x: (xs[23] + xs[24]) / 2, y: (ys[23] + ys[24]) / 2 };
  const sh = { x: (xs[11] + xs[12]) / 2, y: (ys[11] + ys[12]) / 2 };
  return { x: (hip.x + sh.x) / 2, y: (hip.y + sh.y) / 2, h: Math.max(...ys) - Math.min(...ys) };
}

function pickPerson(all, mirror) {
  if (!all?.length) return null;
  const boxes = all.map((lm) => personBox(lm, mirror));
  let best = 0;
  if (S.target) {
    const cost = (b) => Math.hypot(b.x - S.target.x, b.y - S.target.y) + 0.5 * Math.abs(b.h - S.target.h);
    boxes.forEach((b, i) => { if (cost(b) < cost(boxes[best])) best = i; });
    // lost (the person left, or MediaPipe swapped): keep the target until they come back
    if (cost(boxes[best]) > 0.35) { S.others = all; return null; }
  } else {
    const score = (b) => b.h * (1 - Math.abs(b.x - 0.5));
    boxes.forEach((b, i) => { if (score(b) > score(boxes[best])) best = i; });
  }
  S.target = boxes[best];
  S.others = all.filter((_, i) => i !== best);
  if (S.others.length && !S.crowdSaid && S.mode === "camera") {
    S.crowdSaid = true;
    toast("Vedo più persone: tocca sullo schermo chi si allena", false);
  }
  return all[best];
}

// Tap on the live image: follow the person nearest to the tap.
function onStageTap(ev) {
  const cv = $("stage"), r = cv.getBoundingClientRect();
  const tap = { x: (ev.clientX - r.left) / r.width, y: (ev.clientY - r.top) / r.height };
  const mirror = S.mode === "camera" && S.facing === "user";
  const cands = S.others.map((lm) => personBox(lm, mirror));
  if (!cands.length) return;
  let b = 0;
  cands.forEach((c, i) => { if (Math.hypot(c.x - tap.x, c.y - tap.y) < Math.hypot(cands[b].x - tap.x, cands[b].y - tap.y)) b = i; });
  S.target = cands[b];
  // a new person: calibrate again on them, keep the reps done
  const reps = S.reps;
  S.coach = new MovementCoach(EXERCISES[S.exId], S.side, loadProfile());
  S.reps = reps;
  toast("Ok, seguo questa persona", true);
}

// ---------------------------------------------------------------- per frame
function tick() {
  const v = $("video");
  if (v.readyState < 2 || !S.landmarker) return;
  const W = v.videoWidth, H = v.videoHeight;
  const cv = $("stage"), ctx = cv.getContext("2d");
  if (cv.width !== W || cv.height !== H) { cv.width = W; cv.height = H; }
  const mirror = S.mode === "camera" && S.facing === "user";
  ctx.save();
  if (mirror) { ctx.translate(W, 0); ctx.scale(-1, 1); }
  ctx.drawImage(v, 0, 0, W, H);
  ctx.restore();

  let ts = S.mode === "file" ? v.currentTime * 1000 : performance.now();
  if (ts <= S.lastTs) ts = S.lastTs + 1;
  // MediaPipe needs increasing timestamps over its whole life, also across sets
  // (a video file restarts from 0): it gets its own clock, advanced by the frame time
  S.mpTs += S.lastTs < 0 ? 33 : ts - S.lastTs;
  S.lastTs = ts;
  const res = S.landmarker.detectForVideo(v, S.mpTs);
  const lm = pickPerson(res.landmarks, mirror);
  const toKp = (l) => {
    const kp = {};
    for (const [i, n] of Object.entries(LM)) {
      const p = l[i];
      kp[n] = { x: (mirror ? 1 - p.x : p.x) * W, y: p.y * H, v: p.visibility ?? 1 };
    }
    return kp;
  };
  const lw = Math.max(3, W / 220);
  for (const o of S.others) drawSkeleton(ctx, toKp(o), FRONT_EDGES, () => "rgba(255,255,255,0.35)", lw * 0.5);
  const kp = lm ? toKp(lm) : {};
  const coach = S.coach;
  if (coach.phase === "active" && !lm) { setGuide("Non ti vedo: torna nell'inquadratura", 0); return; }

  const ev = coach.push(kp, ts, W, H);
  const ex = EXERCISES[S.exId];
  if (ev.frame) {
    S.trace.push({ t: ts, s: ev.frame.s, m: ev.frame.m });
    // small copy of the frame for the replay (kept only for the worst and the last rep)
    const img = document.createElement("canvas");
    img.width = SNAP_W;
    img.height = Math.round((H * SNAP_W) / W);
    img.getContext("2d").drawImage(cv, 0, 0, img.width, img.height);
    ev.frame.img = img;
    S.snapScale = SNAP_W / W;
  }
  if (ev.type === "lost") { setGuide("Non ti distinguo bene: c'è qualcuno vicino o davanti a te?", 0); return; }
  if (ev.type === "guide") {
    setGuide(ev.msg, ev.progress);
    if (lm) drawSkeleton(ctx, kp, FRONT_EDGES, () => COL.neutral, lw * 0.7);
    return;
  }
  if (ev.type === "calibrated") {
    setGuide("", 0);
    $("viewBadge").textContent = ex.name + (S.side ? ` · ${SIDE_NAME[S.side]}` : "");
    $("viewBadge").hidden = false;
    speak("Pronto. Inizia quando vuoi");
    toast("Pronto!", true);
    return;
  }
  setGuide("", 0);
  const live = ev.live || new Set();
  if (ex.refLine) drawDashed(ctx, ...ex.refLine(ev.frame.kp), "rgba(255,255,255,0.7)", lw * 0.6);
  drawSkeleton(ctx, ev.frame.kp, FRONT_EDGES, (t) => (live.has(t) ? COL.bad : COL.ok), lw);
  if (ev.type === "repEnd") addRep(ev.rep, true);
}

// A finished repetition: counters, voice, fatigue, and which frames to keep.
function addRep(rep, say) {
  S.reps.push(rep);
  rep.index = S.reps.length;
  rep.thumb = rep.frames[rep.peak].img;
  $("repCount").textContent = String(S.reps.length);
  $("okCount").textContent = String(S.reps.filter((r) => r.ok).length);
  const n = S.reps.length;
  if (say) {
    if (rep.ok) { toast(`Rip. ${n}: bene!`, true); speak(`${n}. Bene`); }
    else { toast(`Rip. ${n}: ${rep.errors[0].text}`, false); speak(`${n}. ${rep.errors[0].cue}`); }
    checkFatigue(S.reps.map((r) => r.phases.up));
  }
  // keep the images only of the worst and of the last rep: memory
  const bad = (r) => r.errors.length * 10 + (3 - r.score);
  const prevLast = S.last;
  if (!rep.ok && (!S.worst || bad(rep) > bad(S.worst))) {
    if (S.worst && S.worst !== prevLast) dropImages(S.worst);
    S.worst = rep;
  }
  if (prevLast && prevLast !== S.worst) dropImages(prevLast);
  S.last = rep;
}

// Fatigue (velocity-based training idea): when the way up of a repetition is 30%
// slower than in the first two, say it once. Expert lifters in video_sample slow
// down steadily along a set (expert_04: 1.10 s -> 1.67 s over 7 reps).
function checkFatigue(ascents) {
  if (S.purpose !== "train" || S.fatigueSaid || ascents.length < 4) return;
  const base = (ascents[0] + ascents[1]) / 2;
  const last = ascents[ascents.length - 1];
  if (base > 0 && last > 1.3 * base) {
    S.fatigueSaid = true;
    setTimeout(() => speak("Stai rallentando: fai ancora una ripetizione e poi riposa"), 1500);
    toast("Stai rallentando: è il momento di chiudere la serie", false);
  }
}

function dropImages(rep) {
  for (const f of rep.frames) if (f.img !== rep.thumb) f.img = null;
}
const hasReplay = (rep) => rep.frames.filter((f) => f.img).length > 0.7 * rep.frames.length;

// ---------------------------------------------------------------- summary
// Tiles, per-rule tally, Park-style charts (movement, one per rule, phases),
// one card per rep with the frame at the bottom and the corrected mannequin.
function renderSummary() {
  const ex = EXERCISES[S.exId], reps = S.reps, rec = S.rec, test = S.purpose === "test";
  // only the rules measured in this set (deep squat: front or side ones)
  const rules = ex.rules.filter((r) => !reps.length || reps.some((rp) => Number.isFinite(rp.values[r.key])));
  const n = reps.length, ok = reps.filter((r) => r.ok).length;
  $("sEyebrow").textContent = (test ? "Test FMS · " : "Serie · ") + ex.name + (S.side ? ` · ${SIDE_NAME[S.side]}` : "");
  $("sTitle").textContent = test ? "Risultato del test" : "Riepilogo serie";
  $("sReps").textContent = n;
  $("sOk").textContent = ok;
  $("sPct").textContent = test ? `${rec.best}/3` : `${n ? Math.round((100 * ok) / n) : 0}%`;
  $("sPctLabel").textContent = test ? "voto FMS" : "precisione";
  const count = {};
  for (const r of reps) for (const e of r.errors) count[e.kind] = (count[e.kind] || 0) + 1;
  const top = Object.entries(count).sort((a, b) => b[1] - a[1])[0];
  const rule = top && rules.find((r) => r.key === top[0]);
  $("sMain").textContent = !n ? (test ? "Nessuna ripetizione riconosciuta: movimento non completato o non visibile (voto 1)."
                                      : "Nessuna ripetizione registrata.")
    : rule ? `Errore più frequente (${top[1]} su ${n}): ${rule.name.replace(/\s*\(.*\)$/, "").toLowerCase()}. ${rule.cue}.`
    : "Tutte le ripetizioni corrette, ottimo!";
  $("btnPain").hidden = !test;
  $("btnPain").disabled = false;
  $("btnPain").textContent = "Ho sentito dolore (voto 0)";
  $("btnAgain").textContent = test ? "Ripeti il test" : "Altra serie";
  // tally per rule, as "23 of 23 full range, 22 of 23 straight back" in Park's push-ups
  $("sTally").innerHTML = !n ? "" : rules.map((r) => {
    const good = reps.filter((rp) => !rp.errors.some((e) => e.kind === r.key)).length;
    return `<div class="tally-row${good === n ? " ok" : ""}"><span class="tick">${good === n ? "✓" : "!"}</span>` +
      `<span class="name">${r.name.replace(/\s*\(.*\)$/, "")}</span><b>${good}/${n}</b></div>`;
  }).join("");
  $("btnWorst").hidden = !(S.worst && hasReplay(S.worst));
  $("sCharts").hidden = !n;
  show("summary");
  if (n) {
    const span = (r) => ({ t0: r.frames[0].t, t1: r.frames[r.frames.length - 1].t });
    setTraceChart($("sTrace"), S.trace, reps.map((r) => ({ ...span(r), ok: r.ok })));
    $("sRules").innerHTML = "";
    for (const r of rules) {
      const card = document.createElement("div");
      card.className = "chart-card";
      const spec = { key: r.key, name: r.name, min: r.min, max: r.max, fmt: r.fmt, ...(r.chart || {}) };
      card.innerHTML = `<h2>${r.name}</h2><p class="sub">${limitText(r)} · zona rossa = fuori limite</p><div class="chart"></div><ul class="verdict"></ul>`;
      $("sRules").appendChild(card);
      ruleChart(card.querySelector(".chart"), S.trace,
                reps.map((rp) => ({ ...span(rp), bad: rp.errors.some((e) => e.kind === r.key) })), spec);
      card.querySelector(".verdict").innerHTML = `<li>${ruleVerdict(r, reps)}</li>`;
    }
    const notes = phasesChart($("sPhases"), reps.map((r) => r.phases), reps.map((r) => r.ok));
    $("sTempoNote").innerHTML = notes.map((t) => `<li>${t}</li>`).join("");
  }
  renderRepList();
}

// How far from the limit: the worst rep beyond it, or the closest one to it.
function ruleVerdict(rule, reps) {
  const over = (v) => (rule.max !== undefined ? v - rule.max : rule.min - v);   // > 0 = beyond the limit
  const vals = reps.map((r) => r.values[rule.key]).filter(Number.isFinite);
  if (!vals.length) return "non misurato";
  let w = 0;
  reps.forEach((r, i) => { if (over(r.values[rule.key]) > over(reps[w].values[rule.key])) w = i; });
  const bad = reps.filter((r) => r.errors.some((e) => e.kind === rule.key)).length;
  const v = reps[w].values[rule.key];
  return bad ? `Fuori limite in ${bad} rip. su ${reps.length}: la peggiore è la ${w + 1} con ${rule.fmt(v)} (${limitText(rule)}).`
    : `Sempre nel limite: il valore più vicino al limite è ${rule.fmt(v)} nella rip. ${w + 1} (${limitText(rule)}).`;
}

function renderRepList() {
  const list = $("repList");
  list.innerHTML = "";
  if (!S.reps.length) list.innerHTML = `<p class="small">Nessuna ripetizione.</p>`;
  for (const rep of S.reps) {
    const card = document.createElement("div");
    card.className = "rep-card";
    const cv = document.createElement("canvas");
    drawRepFrame(cv, rep, rep.peak, "both");
    const info = document.createElement("div");
    info.className = "info";
    const p = rep.phases;
    info.innerHTML = `<h3>Rip. ${rep.index}${S.purpose === "test" ? ` · voto ${rep.score}` : ""}</h3>` +
      (rep.ok ? `<div class="okline">✓ Corretta</div>`
              : `<ul>${rep.errors.map((e) => `<li>${e.text} <span class="lim">→ ${limitText(e.rule)}</span></li>`).join("")}</ul>`) +
      `<div class="meta">giù ${fmtS(p.down)} · fermo ${fmtS(p.hold)} · su ${fmtS(p.up)}</div>`;
    if (hasReplay(rep)) {
      const b = document.createElement("button");
      b.className = "btn small";
      b.textContent = rep.ok ? "Rivedi al rallentatore" : "Rivedi con la posizione corretta";
      b.onclick = () => openReplay(rep);
      info.appendChild(b);
    }
    card.append(cv, info);
    list.appendChild(card);
  }
}
const fmtS = (v) => `${v.toFixed(1).replace(".", ",")} s`;

// mode: "real" (real skeleton, errors red), "fix" (ghost + corrected mannequin), "both" (thumbnail)
function drawRepFrame(cv, rep, i, mode) {
  const fr = rep.frames[i];
  let img = fr.img;
  for (let j = i; !img && j >= 0; j--) img = rep.frames[j].img;
  for (let j = i; !img && j < rep.frames.length; j++) img = rep.frames[j].img;
  const w = img ? img.width : SNAP_W, h = img ? img.height : Math.round(SNAP_W * 0.5625);
  if (cv.width !== w || cv.height !== h) { cv.width = w; cv.height = h; }
  const ctx = cv.getContext("2d");
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  if (img) ctx.drawImage(img, 0, 0); else { ctx.fillStyle = "#000"; ctx.fillRect(0, 0, w, h); }
  const sc = S.snapScale;
  ctx.setTransform(sc, 0, 0, sc, 0, 0);
  const ex = EXERCISES[rep.exercise];
  const { pts, p } = correctFrame(rep, i);
  const bad = new Set(p > 0.3 ? rep.errors.map((e) => e.rule.part) : []);
  const lw = 3 / sc;
  if (mode === "real") {
    if (ex.refLine) drawDashed(ctx, ...ex.refLine(fr.kp), "rgba(255,255,255,0.7)", lw * 0.6);
    drawSkeleton(ctx, fr.kp, FRONT_EDGES, (t) => (bad.has(t) ? COL.bad : COL.ok), lw);
  } else if (mode === "fix") {
    if (!rep.ok && p > 0.02) {
      drawSkeleton(ctx, fr.kp, FRONT_EDGES, () => COL.ghost, lw * 0.7);   // you, thin and dark
      drawMannequin(ctx, pts, "front", COL.fix, 0.6);                     // the coach, correct position
      if (ex.refLine) drawDashed(ctx, ...ex.refLine(pts), COL.fix, lw * 0.6);
    } else {
      drawSkeleton(ctx, fr.kp, FRONT_EDGES, () => COL.ok, lw);
    }
  } else {
    drawSkeleton(ctx, fr.kp, FRONT_EDGES, (t) => (bad.has(t) ? COL.bad : COL.ok), lw * 1.2);
    if (!rep.ok) drawMannequin(ctx, pts, "front", COL.fix, 0.55);
  }
}

// ---------------------------------------------------------------- replay
const RP = { rep: null, playing: true, speed: 0.3, t: 0, last: 0, raf: 0 };

function openReplay(rep) {
  RP.rep = rep; RP.t = 0; RP.playing = true; RP.last = performance.now();
  $("replayTitle").textContent = `Rip. ${rep.index}` + (rep.ok ? " · corretta" : "");
  $("replayErr").textContent = rep.ok ? "" : rep.errors.map((e) => `${e.text} → ${limitText(e.rule)}`).join(" · ");
  $("btnPlay").textContent = "⏸";
  show("replay");
  cancelAnimationFrame(RP.raf);
  RP.raf = requestAnimationFrame(replayLoop);
}

function replayLoop(now) {
  if (!$("replay").classList.contains("active")) return;
  const rep = RP.rep, fr = rep.frames;
  const dur = fr[fr.length - 1].t - fr[0].t;
  if (RP.playing) {
    RP.t += (now - RP.last) * RP.speed;
    if (RP.t > dur + 600) RP.t = 0;            // short pause, then loop
  }
  RP.last = now;
  const t = Math.min(RP.t, dur) + fr[0].t;
  let i = 0;
  while (i < fr.length - 1 && fr[i + 1].t <= t) i++;
  drawRepFrame($("cvReal"), rep, i, "real");
  drawRepFrame($("cvFix"), rep, i, "fix");
  $("scrub").value = String(Math.round((1000 * Math.min(RP.t, dur)) / Math.max(dur, 1)));
  RP.raf = requestAnimationFrame(replayLoop);
}

// ---------------------------------------------------------------- wiring
$("btnStop").onclick = () => stopSession();
$("stage").addEventListener("pointerdown", onStageTap);
$("btnVoice").textContent = S.voice ? "🔊" : "🔇";
$("btnVoice").onclick = () => {
  S.voice = !S.voice; savePref("voice", S.voice);
  $("btnVoice").textContent = S.voice ? "🔊" : "🔇";
  if (!S.voice) speechSynthesis?.cancel?.();
};
$("btnFlip").onclick = async () => {
  S.facing = S.facing === "user" ? "environment" : "user";
  const reps = S.reps;
  // new framing: calibrate again, keep the reps
  S.coach = new MovementCoach(EXERCISES[S.exId], S.side, loadProfile());
  S.reps = reps;
  S.target = null;
  try { await openCamera(); } catch (e) { alert(e.message || e); }
};
$("btnWorst").onclick = () => S.worst && openReplay(S.worst);
$("btnAgain").onclick = () => startSession("camera", null, { exId: S.exId, side: S.side, purpose: S.purpose });
$("btnDone").onclick = () => goTab("home");
$("btnPain").onclick = () => {
  SES.updateLastSet({ best: 0, pain: true });
  S.rec.best = 0;
  $("sPct").textContent = "0/3";
  $("btnPain").disabled = true;
  $("btnPain").textContent = "Dolore registrato: voto 0. Fatti vedere da un professionista prima di allenare questo movimento.";
};
$("btnClear").onclick = () => {
  if (confirm("Cancellare tutto lo storico degli allenamenti su questo telefono?")) {
    SES.clearSessions(); goTab("history");
  }
};
$("btnCloseReplay").onclick = () => { cancelAnimationFrame(RP.raf); show("summary"); };
$("btnPlay").onclick = () => { RP.playing = !RP.playing; $("btnPlay").textContent = RP.playing ? "⏸" : "▶"; };
$("btnSpeed").onclick = () => {
  RP.speed = RP.speed === 0.3 ? 0.6 : RP.speed === 0.6 ? 1 : 0.3;
  $("btnSpeed").textContent = `${RP.speed}×`;
};
$("scrub").oninput = (e) => {
  const fr = RP.rep.frames;
  RP.playing = false; $("btnPlay").textContent = "▶";
  RP.t = (+e.target.value / 1000) * (fr[fr.length - 1].t - fr[0].t);
};
document.addEventListener("visibilitychange", async () => {
  if (document.visibilityState === "visible" && S.running) {
    try { S.wakeLock = await navigator.wakeLock?.request("screen"); } catch {}
  }
});

if ("serviceWorker" in navigator && window.isSecureContext) {
  navigator.serviceWorker.register("sw.js").catch(() => {});
}
// tabs, assessment, picker (flow.js); first launch opens the welcome screen
initFlow({
  show,
  speak,
  // set of any exercise: purpose "train" or "test", from the camera or from a video file
  startTrain: (exId, side, purpose, mode, file) => startSession(mode, file, { exId, side, purpose }),
  startExercise: (exId, side, purpose) => startSession("camera", null, { exId, side, purpose }),
  // used by the automated tests: same as startExercise but on a video file
  startExerciseFile: (file, exId, side, purpose) => startSession("file", file, { exId, side, purpose }),
});
show(isFirstLaunch() ? "welcome" : "home");

window.__squat = S;   // for the automated tests (app/test)
// warm up the model while the user reads the home page
loadModel().catch(() => ($("modelStatus").textContent = "Modello non caricato: controlla la connessione."));
