import { Coach, correctedFrame, sessionSummary, CUES, ERR_TAG, RULES_SIDE, RULES_FRONT } from "./coach.js";
import { drawSkeleton, drawMannequin, angleLabels, SIDE_EDGES, FRONT_EDGES, COL } from "./draw.js";
import { loadSessions, saveSession, clearSessions, renderHistory } from "./history.js";
import { MovementCoach } from "./movement.js";
import { EXERCISES } from "./exercises.js";
import { initFlow, isFirstLaunch, loadProfile, onAssessmentStep, renderHome, renderMovementSummary } from "./flow.js";

const MP = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14";
const MODEL = "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_full/float16/1/pose_landmarker_full.task";
// MediaPipe pose landmark index -> our names
const LM = { 0: "nose", 7: "ear_l", 8: "ear_r", 11: "shoulder_l", 12: "shoulder_r", 13: "elbow_l", 14: "elbow_r",
  15: "wrist_l", 16: "wrist_r", 23: "hip_l", 24: "hip_r", 25: "knee_l", 26: "knee_r", 27: "ankle_l", 28: "ankle_r",
  29: "heel_l", 30: "heel_r", 31: "toe_l", 32: "toe_r" };
const SNAP_W = 360;           // width of the frames kept for the replay
const $ = (id) => document.getElementById(id);

const S = {
  landmarker: null, coach: null, mode: "camera", facing: "user", stream: null, running: false,
  voice: loadPref("voice", true), lastTs: -1, reps: [], view: null, worst: null, last: null,
  wakeLock: null, toastTimer: 0, snapScale: 1,
  // kind: "squat" (side-view squat coach with mannequin) or "movement" (exercises.js);
  // purpose: "train" or "assess" (one step of the initial assessment)
  kind: "squat", exId: null, side: null, purpose: "train", fatigueSaid: false,
};

// ---------------------------------------------------------------- utilities
function loadPref(k, def) {
  try { const v = localStorage.getItem(`squatcoach.${k}`); return v === null ? def : JSON.parse(v); }
  catch { return def; }
}
function savePref(k, v) { try { localStorage.setItem(`squatcoach.${k}`, JSON.stringify(v)); } catch {} }

function show(id) {
  for (const s of document.querySelectorAll(".screen")) s.classList.toggle("active", s.id === id);
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
                                numPoses: 1, minPoseDetectionConfidence: 0.5, minTrackingConfidence: 0.5 });
  try { S.landmarker = await PoseLandmarker.createFromOptions(fileset, opts("GPU")); }
  catch { S.landmarker = await PoseLandmarker.createFromOptions(fileset, opts("CPU")); }
  $("modelStatus").textContent = "";
}

// ---------------------------------------------------------------- session
// opts: { kind: "squat" } or { kind: "movement", exId, side, purpose }
async function startSession(mode, file, opts = { kind: "squat" }) {
  if (mode === "camera" && !(window.isSecureContext && navigator.mediaDevices?.getUserMedia)) {
    alert("Per usare la fotocamera la pagina deve essere aperta in HTTPS.");
    return;
  }
  speak(" ");                              // iOS: speech must start from a tap
  S.mode = mode;
  S.reps = []; S.worst = null; S.last = null; S.view = null; S.lastTs = -1; S.fatigueSaid = false;
  S.kind = opts.kind;
  S.exId = opts.exId || null;
  S.side = opts.side || null;
  S.purpose = opts.purpose || "train";
  S.coach = S.kind === "squat" ? new Coach() : new MovementCoach(EXERCISES[S.exId], S.side, loadProfile());
  $("btnStop").textContent = S.purpose === "assess" ? "Fine test" : "Fine serie";
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
    show("home");
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
  if (S.kind === "movement") {
    const last = S.coach.finish?.();        // a repetition still in progress
    if (last) S.reps.push(last);
    if (S.purpose === "assess") { onAssessmentStep(S.reps); return; }
    renderMovementSummary(S.reps, S.exId);
    show("summary");
    return;
  }
  const view = S.view || "side";
  const sum = sessionSummary(S.reps, view);
  if (S.reps.length) saveSession(sum);
  renderSummary(sum);
  show("summary");
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
  S.lastTs = ts;
  const res = S.landmarker.detectForVideo(v, ts);
  const lm = res.landmarks?.[0];
  const kp = {};
  if (lm) for (const [i, n] of Object.entries(LM)) {
    const p = lm[i];
    kp[n] = { x: (mirror ? 1 - p.x : p.x) * W, y: p.y * H, v: p.visibility ?? 1 };
  }
  const coach = S.coach;
  if (coach.phase === "active" && !lm) { setGuide("Non ti vedo: torna nell'inquadratura", 0); return; }
  if (S.kind === "movement") { tickMovement(ctx, kp, lm, ts, W, H); return; }

  let img = null;
  if (coach.phase === "active") {
    img = document.createElement("canvas");
    img.width = SNAP_W;
    img.height = Math.round((H * SNAP_W) / W);
    img.getContext("2d").drawImage(cv, 0, 0, img.width, img.height);
    S.snapScale = SNAP_W / W;
  }
  const ev = coach.push(kp, ts, W, H, img);
  const lw = Math.max(3, W / 220), fs = Math.max(16, W / 42);

  if (ev.type === "guide") {
    setGuide(ev.msg, ev.progress);
    if (lm) drawSkeleton(ctx, kp, FRONT_EDGES, () => COL.neutral, lw * 0.7);
    return;
  }
  if (ev.type === "calibrated") {
    S.view = S.view || ev.view;
    setGuide("", 0);
    $("viewBadge").textContent = ev.view === "side" ? "Vista laterale" : "Vista frontale";
    $("viewBadge").hidden = false;
    speak("Pronto. Inizia quando vuoi");
    toast(ev.view === "side" ? "Pronto! Ti vedo di lato" : "Pronto! Ti vedo di fronte", true);
    return;
  }
  setGuide("", 0);
  const view = coach.cal.view;
  const live = ev.live || new Set();
  const edges = view === "side" ? SIDE_EDGES : FRONT_EDGES;
  drawSkeleton(ctx, ev.frame.kp, edges, (t) => (live.has(t) ? COL.bad : COL.ok), lw);
  angleLabels(ctx, ev.frame.kp, view, coach.cal.f || 1, "#fff", live, fs);
  if (ev.type === "repEnd") onRep(ev.rep);
}

// Frame of a "movement" exercise: guidance, skeleton with the faulty parts in red,
// spoken feedback at the end of each repetition.
function tickMovement(ctx, kp, lm, ts, W, H) {
  const ev = S.coach.push(kp, ts, W, H);
  const lw = Math.max(3, W / 220);
  if (ev.type === "guide") {
    setGuide(ev.msg, ev.progress);
    if (lm) drawSkeleton(ctx, kp, FRONT_EDGES, () => COL.neutral, lw * 0.7);
    return;
  }
  if (ev.type === "calibrated") {
    setGuide("", 0);
    $("viewBadge").textContent = EXERCISES[S.exId].name + (S.side ? (S.side === "l" ? " · sinistra" : " · destra") : "");
    $("viewBadge").hidden = false;
    speak("Pronto. Inizia quando vuoi");
    toast("Pronto!", true);
    return;
  }
  setGuide("", 0);
  const live = ev.live || new Set();
  drawSkeleton(ctx, ev.frame.kp, FRONT_EDGES, (t) => (live.has(t) ? COL.bad : COL.ok), lw);
  if (ev.type !== "repEnd") return;
  const rep = ev.rep;
  S.reps.push(rep);
  $("repCount").textContent = String(S.reps.length);
  $("okCount").textContent = String(S.reps.filter((r) => r.ok).length);
  const n = S.reps.length;
  if (rep.ok) { toast(`Rip. ${n}: bene!`, true); speak(`${n}. Bene`); }
  else { toast(`Rip. ${n}: ${rep.errors[0].text}`, false); speak(`${n}. ${rep.errors[0].cue}`); }
  checkFatigue(S.reps.map((r) => r.frames[r.frames.length - 1].t - r.frames[r.peak].t));
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

function onRep(rep) {
  rep.thumb = rep.frames[rep.b].img;
  S.reps.push(rep);
  rep.index = S.reps.length;
  $("repCount").textContent = String(S.reps.length);
  $("okCount").textContent = String(S.reps.filter((r) => r.ok).length);
  if (rep.ok) {
    toast(`Rep ${rep.index}: bene!`, true);
    speak(`${rep.index}. Bene`);
  } else {
    toast(`Rep ${rep.index}: ${rep.errors[0].text}`, false);
    speak(`${rep.index}. ${CUES[rep.errors[0].kind]}`);
  }
  checkFatigue(S.reps.map((r) => r.frames[r.frames.length - 1].t - r.frames[r.b].t));
  // keep the frames (images) only of the worst and of the last rep: memory
  const prevLast = S.last;
  if (rep.score > 0 && (!S.worst || rep.score > S.worst.score)) {
    if (S.worst && S.worst !== prevLast) dropImages(S.worst);
    S.worst = rep;
  }
  if (prevLast && prevLast !== S.worst) dropImages(prevLast);
  S.last = rep;
}

function dropImages(rep) {
  for (const f of rep.frames) if (f.img !== rep.thumb) f.img = null;
}
const hasReplay = (rep) => rep.frames.filter((f) => f.img).length > 0.7 * rep.frames.length;

// ---------------------------------------------------------------- summary
function renderSummary(sum) {
  $("sReps").textContent = sum.reps;
  $("sOk").textContent = sum.correct;
  $("sPct").textContent = `${sum.pct}%`;
  const top = Object.entries(sum.errors).sort((a, b) => b[1] - a[1])[0];
  const R = { ...RULES_SIDE, ...RULES_FRONT };
  $("sMain").textContent = !sum.reps ? "Nessuna ripetizione registrata."
    : top ? `Errore più frequente: ${R[top[0]].label.toLowerCase()} (${top[1]} su ${sum.reps}). ${CUES[top[0]]}.`
    : "Tutte le ripetizioni corrette, ottimo!";
  $("btnWorst").hidden = !(S.worst && hasReplay(S.worst));
  const list = $("repList");
  list.innerHTML = "";
  for (const rep of S.reps) {
    const card = document.createElement("div");
    card.className = "rep-card";
    const cv = document.createElement("canvas");
    drawRepFrame(cv, rep, rep.b, "both");
    const info = document.createElement("div");
    info.className = "info";
    info.innerHTML = `<h3>Rep ${rep.index}</h3>` + (rep.ok ? `<div class="okline">✓ Corretta</div>`
      : `<ul>${rep.errors.map((e) => `<li>${e.text}</li>`).join("")}</ul>`);
    if (hasReplay(rep)) {
      const b = document.createElement("button");
      b.className = "btn small";
      b.textContent = "Rivedi al rallentatore";
      b.onclick = () => openReplay(rep);
      info.appendChild(b);
    }
    card.append(cv, info);
    list.appendChild(card);
  }
}

// mode: "real" (real skeleton, errors red), "fix" (ghost + corrected), "both" (thumbnail)
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
  const edges = rep.view === "side" ? SIDE_EDGES : FRONT_EDGES;
  const { pts, p } = correctedFrame(rep, i);
  const bad = new Set(p > 0.3 ? rep.errors.map((e) => ERR_TAG[e.kind]) : []);
  const lw = 3 / sc, fs = 13 / sc, f = rep.cal.f || 1;
  if (mode === "real") {
    drawSkeleton(ctx, fr.kp, edges, (t) => (bad.has(t) ? COL.bad : COL.ok), lw);
    angleLabels(ctx, fr.kp, rep.view, f, "#fff", bad, fs);
  } else if (mode === "fix") {
    if (!rep.ok && p > 0.02) {
      drawSkeleton(ctx, fr.kp, edges, () => COL.ghost, lw * 0.7);   // you, thin and dark
      drawMannequin(ctx, pts, rep.view, COL.fix, 0.6);               // the coach, correct movement
      angleLabels(ctx, pts, rep.view, f, COL.fix, new Set(), fs);
    } else {
      drawSkeleton(ctx, fr.kp, edges, () => COL.ok, lw);
    }
  } else {
    drawSkeleton(ctx, fr.kp, edges, (t) => (bad.has(t) ? COL.bad : COL.ok), lw * 1.2);
    if (!rep.ok) drawMannequin(ctx, pts, rep.view, COL.fix, 0.55);
  }
}

// ---------------------------------------------------------------- replay
const RP = { rep: null, playing: true, speed: 0.3, t: 0, last: 0, raf: 0 };

function openReplay(rep) {
  RP.rep = rep; RP.t = 0; RP.playing = true; RP.last = performance.now();
  $("replayTitle").textContent = `Rep ${rep.index}` + (rep.ok ? " · corretta" : "");
  $("replayErr").textContent = rep.ok ? "" : rep.errors.map((e) => e.text).join(" · ");
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
$("btnStart").onclick = () => startSession("camera");
$("btnFile").onclick = () => $("fileInput").click();
$("fileInput").onchange = (e) => { const f = e.target.files[0]; e.target.value = ""; if (f) startSession("file", f); };
$("btnStop").onclick = () => stopSession();
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
  S.coach = S.kind === "squat" ? new Coach() : new MovementCoach(EXERCISES[S.exId], S.side, loadProfile());
  S.reps = reps;
  try { await openCamera(); } catch (e) { alert(e.message || e); }
};
$("btnWorst").onclick = () => S.worst && openReplay(S.worst);
$("btnAgain").onclick = () => startSession("camera", null, { kind: S.kind, exId: S.exId, side: S.side, purpose: "train" });
$("btnHome1").onclick = () => { renderHome(); show("home"); };
$("btnHome2").onclick = () => show("home");
$("btnHistory").onclick = () => { show("history"); renderHistory($("chart"), $("histList"), loadSessions()); };
$("btnClear").onclick = () => {
  if (confirm("Cancellare tutto lo storico su questo telefono?")) {
    clearSessions(); renderHistory($("chart"), $("histList"), []);
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
// assessment, plan and exercise list (flow.js); first launch opens the welcome screen
initFlow({
  show,
  speak,
  startSquat: () => startSession("camera", null, { kind: "squat" }),
  startExercise: (exId, side, purpose) => startSession("camera", null, { kind: "movement", exId, side, purpose }),
  // used by the automated tests: same as startExercise but on a video file
  startExerciseFile: (file, exId, side, purpose) => startSession("file", file, { kind: "movement", exId, side, purpose }),
});
if (isFirstLaunch()) show("welcome");

window.__squat = S;   // for the automated tests (app/test)
// warm up the model while the user reads the home page
loadModel().catch(() => ($("modelStatus").textContent = "Modello non caricato: controlla la connessione."));
