// Squat analysis on 2D keypoints, streaming (one frame at a time).
// Same rules as python/squat_side.py (side view) and the frontal checks of
// python/squat_coach.py, adapted to 2D: no Kinect, only the phone camera.
//
// Keypoints: { name: {x, y, v} } in pixels, image y pointing down, v = visibility 0..1.
// Names: nose, ear_l/r, shoulder_l/r, elbow_l/r, wrist_l/r, hip_l/r, knee_l/r,
//        ankle_l/r, heel_l/r, toe_l/r  (heel/toe optional: fall back to the ankle).

export const RULES_SIDE = {
  // knee angle at the bottom (hip-knee-ankle, 180 = straight): target 90
  depth:    { max: 100,  target: 90, label: "Squat poco profondo" },
  // 60 -> 40 on 17/11/2026: trained lifters (video_sample, step5_expert_reps.csv) close the
  // knee to 44-65 deg at the bottom in side view, and 60 flagged their correct reps
  too_deep: { min: 40,   target: 90, label: "Squat troppo profondo" },
  trunk:    { max: 20,   target: 5,  label: "Busto troppo inclinato" },
  knee_fwd: { max: 40,   target: 33, label: "Ginocchia troppo avanti" },
  heel:     { max: 0.08, target: 0,  label: "Talloni sollevati" },   // heel rise / shin length
};
export const RULES_FRONT = {
  valgus: { min: 0.8,  target: 1.0, label: "Ginocchia verso l'interno" },  // knee / ankle distance
  shift:  { max: 0.15, target: 0,   label: "Peso spostato di lato" },      // pelvis shift / shoulder width
  // trunk forward lean estimated from how much the trunk looks shorter than standing
  trunk:  { max: 55,   target: 35,  label: "Busto troppo inclinato" },
};
export const CUES = {
  depth: "Scendi di più, ginocchia a novanta gradi",
  too_deep: "Non scendere così tanto, fermati a novanta gradi",
  trunk: "Busto più dritto, petto in fuori",
  knee_fwd: "Porta indietro il bacino, ginocchia meno avanti",
  heel: "Talloni a terra",
  valgus: "Spingi le ginocchia in fuori",
  shift: "Resta centrato sui due piedi",
};
// error kind -> skeleton part drawn in red
export const ERR_TAG = { depth: "thigh", too_deep: "thigh", trunk: "trunk", knee_fwd: "shin",
                         heel: "foot", valgus: "legs", shift: "pelvis" };

export const IPF_OFFSET = 0.055;
const SIDE_PTS = ["ear", "shoulder", "elbow", "wrist", "hip", "knee", "ankle", "heel", "toe"];
const deg = (r) => (r * 180) / Math.PI;
const rad = (d) => (d * Math.PI) / 180;
const sub = (a, b) => ({ x: a.x - b.x, y: a.y - b.y });
const add = (a, b) => ({ x: a.x + b.x, y: a.y + b.y });
const mul = (a, k) => ({ x: a.x * k, y: a.y * k });
const norm = (a) => Math.hypot(a.x, a.y);
const mid = (a, b) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const median = (xs) => {
  const s = xs.filter((x) => Number.isFinite(x)).sort((a, b) => a - b);
  if (!s.length) return NaN;
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

export function angle3(a, b, c) {
  const u = sub(a, b), v = sub(c, b);
  const cos = (u.x * v.x + u.y * v.y) / (norm(u) * norm(v));
  return deg(Math.acos(clamp(cos, -1, 1)));
}
// forward lean from vertical of vector v; f = +1 if the subject faces +x
const lean = (v, f) => deg(Math.atan2(f * v.x, -v.y));
// thigh angle above horizontal (0 = parallel, + = hip above knee)
const thighAngle = (hip, knee) => { const t = sub(hip, knee); return deg(Math.atan2(-t.y, Math.abs(t.x))); };

export class Coach {
  constructor() { this.reset(); }

  reset() {
    this.phase = "setup";      // setup -> active
    this.sm = {};              // smoothed keypoints
    this.still = [];           // frames collected while standing still (calibration)
    this.cal = null;
    this.reps = [];
    this.ring = [];            // last frames, to start a rep a bit before it is detected
    this.cur = null;           // rep in progress
  }

  // Exponential smoothing; a low-visibility point keeps its last position.
  smooth(kp) {
    const out = {};
    for (const [n, p] of Object.entries(kp)) {
      const prev = this.sm[n];
      if (p && p.v >= 0.5) {
        this.sm[n] = prev ? { x: prev.x + 0.5 * (p.x - prev.x), y: prev.y + 0.5 * (p.y - prev.y), v: p.v }
                          : { ...p };
      } else if (prev) {
        this.sm[n] = { ...prev, v: p ? p.v : 0 };
      } else if (p) {
        this.sm[n] = { ...p };
      }
      if (this.sm[n]) out[n] = this.sm[n];
    }
    return out;
  }

  bestSide(kp) {
    const vis = (s) => ["hip", "knee", "ankle", "shoulder"].reduce((a, n) => a + (kp[`${n}_${s}`]?.v ?? 0), 0);
    return vis("l") >= vis("r") ? "l" : "r";
  }

  // Message telling the user how to stand, or null if the whole body is in the frame.
  guidance(kp, W, H) {
    const s = this.bestSide(kp);
    const need = ["nose", `shoulder_${s}`, `hip_${s}`, `knee_${s}`, `ankle_${s}`];
    if (!kp.nose || need.filter((n) => (kp[n]?.v ?? 0) >= 0.5).length < 3)
      return "Mettiti davanti al telefono, a figura intera";
    const inside = (p) => p && p.x > 0.02 * W && p.x < 0.98 * W && p.y > 0.01 * H && p.y < 0.99 * H;
    const ank = kp[`ankle_${s}`];
    if (!ank || ank.v < 0.5 || !inside(ank)) return "Allontanati: devo vedere anche i piedi";
    if (!inside(kp.nose)) return "Allontanati: devo vedere anche la testa";
    const frac = (ank.y - kp.nose.y) / H;
    if (frac > 0.9) return "Allontanati un po'";
    if (frac < 0.35) return "Avvicinati un po'";
    for (const n of need) if ((kp[n]?.v ?? 0) < 0.5) return "Non ti vedo bene: più luce o sfondo più libero";
    return null;
  }

  // One frame. img (optional) is stored with the frame for the replay.
  push(raw, t, W, H, img = null) {
    const kp = this.smooth(raw);
    if (this.phase === "setup") return this.setupStep(kp, t, W, H);

    const m = this.measures(kp);
    const pts = this.cal.view === "side" ? this.sidePts(kp) : kp;
    const frame = { t, kp: pts, m, h: m.h, img, a: this.activity(m) };
    this.ring.push(frame);
    if (this.ring.length > 45) this.ring.shift();
    const cal = this.cal;
    const a = frame.a, drop = a;

    if (!this.cur) {
      if (a < 0.4) cal.top = 0.95 * cal.top + 0.05 * m.h;         // follow small posture changes
      if (a > 0.66) {
        for (const f of this.ring) f.a = this.activity(f.m);
        this.cur = { frames: [...this.ring], top: cal.top, maxDrop: a, b: this.ring.length - 1, t0: t };
        return { type: "repStart", frame, drop };
      }
      return { type: "frame", frame, drop, live: new Set() };
    }
    const cur = this.cur;
    cur.frames.push(frame);
    if (a > cur.maxDrop) { cur.maxDrop = a; cur.b = cur.frames.length - 1; }
    if (t - cur.t0 > 15000) { this.cur = null; return { type: "frame", frame, drop, live: new Set() }; }
    if (a < 0.53) {
      this.cur = null;
      if (cur.maxDrop >= 1) {
        const rep = this.evaluate(cur);
        this.reps.push(rep);
        return { type: "repEnd", frame, rep };
      }
    }
    return { type: "frame", frame, drop, live: this.liveBad(m) };
  }

  setupStep(kp, t, W, H) {
    const msg = this.guidance(kp, W, H);
    if (msg) { this.still = []; return { type: "guide", msg, kp }; }
    this.still.push({ t, kp: JSON.parse(JSON.stringify(kp)) });
    const s = this.bestSide(kp);
    const ys = this.still.map((f) => f.kp[`hip_${s}`].y);
    const leg = Math.abs(kp[`ankle_${s}`].y - kp[`hip_${s}`].y);
    if (Math.max(...ys) - Math.min(...ys) > 0.05 * leg) this.still = this.still.slice(-5);   // moving: restart
    const dt = t - this.still[0].t;
    if (dt < 1200) return { type: "guide", msg: "Stai fermo in piedi...", progress: dt / 1200, kp };
    this.calibrate(this.still);
    this.phase = "active";
    return { type: "calibrated", view: this.cal.view, kp };
  }

  calibrate(frames) {
    const med = (name, c) => median(frames.map((f) => f.kp[name]?.[c]));
    const P = (n) => ({ x: med(n, "x"), y: med(n, "y"), v: med(n, "v") });
    const sh = mid(P("shoulder_l"), P("shoulder_r")), hp = mid(P("hip_l"), P("hip_r"));
    const width = (Math.abs(P("shoulder_l").x - P("shoulder_r").x) + Math.abs(P("hip_l").x - P("hip_r").x)) / 2;
    const ratio = width / Math.abs(hp.y - sh.y);
    const view = ratio < 0.35 ? "side" : "front";
    const s = this.bestSide(Object.fromEntries(["hip", "knee", "ankle", "shoulder"].flatMap((n) =>
      ["l", "r"].map((q) => [`${n}_${q}`, P(`${n}_${q}`)]))));
    const g = (n) => P(`${n}_${s}`);
    const heelOf = (q) => (frames[0].kp[`heel_${q}`] ? P(`heel_${q}`) : P(`ankle_${q}`));
    const cal = { view, side: s, ratio };
    if (view === "side") {
      cal.f = Math.sign(P("nose").x - g("hip").x) || 1;
      cal.shin = norm(sub(g("knee"), g("ankle")));
      cal.thigh = norm(sub(g("hip"), g("knee")));
      cal.trunk = norm(sub(g("shoulder"), g("hip")));
      cal.heelY = heelOf(s).y;
      cal.trunk0 = lean(sub(g("shoulder"), g("hip")), cal.f);
      cal.top = -g("hip").y;
      cal.leg = cal.shin + cal.thigh;
    } else {
      const legL = norm(sub(P("hip_l"), P("knee_l"))) + norm(sub(P("knee_l"), P("ankle_l")));
      const legR = norm(sub(P("hip_r"), P("knee_r"))) + norm(sub(P("knee_r"), P("ankle_r")));
      cal.leg = (legL + legR) / 2;
      cal.top = -hp.y;
      cal.hipMidX = hp.x;
      cal.shoulderW = Math.abs(P("shoulder_l").x - P("shoulder_r").x);
      cal.torso0 = norm(sub(sh, hp));
    }
    this.cal = cal;
  }

  sidePts(kp) {
    const s = this.cal.side, out = {};
    for (const n of SIDE_PTS) {
      const p = kp[`${n}_${s}`];
      if (p) out[n] = { x: p.x, y: p.y, v: p.v };
    }
    if (!out.heel) out.heel = out.ankle;
    if (!out.ear) out.ear = kp.nose;
    return out;
  }

  measures(kp) {
    const cal = this.cal;
    if (cal.view === "side") {
      const p = this.sidePts(kp), f = cal.f;
      const shin = lean(sub(p.knee, p.ankle), f), trunk = lean(sub(p.shoulder, p.hip), f);
      return {
        h: -p.hip.y,
        knee: angle3(p.hip, p.knee, p.ankle),
        thigh: thighAngle(p.hip, p.knee),
        shin, trunk, tms: trunk - shin,
        heel: (cal.heelY - p.heel.y) / cal.shin,
        // IPF depth rule (hip crease below the top of the knee) on joint centres, in thigh
        // lengths: >= 0 = below parallel. +0.055 is the joint-centre vs anatomical offset
        // calibrated on 11 referee-annotated reps by I. Necerini (Streetlifting-RefereeAI, docs/05)
        ipf: (p.hip.y - p.knee.y) / cal.thigh + IPF_OFFSET,
      };
    }
    const hp = mid(kp.hip_l, kp.hip_r), sh = mid(kp.shoulder_l, kp.shoulder_r);
    return {
      h: -hp.y,
      lean: deg(Math.acos(clamp(norm(sub(sh, hp)) / cal.torso0, 0, 1))),
      kneeL: angle3(kp.hip_l, kp.knee_l, kp.ankle_l),
      kneeR: angle3(kp.hip_r, kp.knee_r, kp.ankle_r),
      ratio: Math.abs(kp.knee_l.x - kp.knee_r.x) / Math.max(Math.abs(kp.ankle_l.x - kp.ankle_r.x), 1),
      shift: (hp.x - cal.hipMidX) / cal.shoulderW,
    };
  }

  // 0 standing, 1 = enough to count a rep: pelvis down by 15% of the leg length,
  // or trunk 30 deg more inclined than standing (hip hinge, "good morning").
  activity(m) {
    const cal = this.cal;
    const drop = (cal.top - m.h) / cal.leg / 0.15;
    return cal.view === "side" ? Math.max(drop, (m.trunk - cal.trunk0) / 30) : Math.max(drop, m.lean / 30);
  }

  // Parts to draw red right now (only the checks that make sense mid-rep).
  liveBad(m) {
    const bad = new Set();
    if (this.cal.view === "side") {
      if (m.tms > RULES_SIDE.trunk.max) bad.add("trunk");
      if (m.shin > RULES_SIDE.knee_fwd.max) bad.add("shin");
      if (m.heel > RULES_SIDE.heel.max) bad.add("foot");
      if (m.knee < RULES_SIDE.too_deep.min) bad.add("thigh");
    } else {
      if (m.ratio < RULES_FRONT.valgus.min) bad.add("legs");
      if (Math.abs(m.shift) > RULES_FRONT.shift.max) bad.add("pelvis");
      if (m.lean > RULES_FRONT.trunk.max) bad.add("trunk");
    }
    return bad;
  }

  evaluate(cur) {
    const { frames, b } = cur;
    const win = frames.slice(Math.max(b - 2, 0), b + 3);
    const keys = Object.keys(frames[b].m);
    const v = Object.fromEntries(keys.map((k) => [k, median(win.map((f) => f.m[k]))]));
    // IPF: the deepest moment of the rep counts, not only the frame of maximum drop
    if (this.cal.view === "side") v.ipf = Math.max(...frames.map((f) => f.m.ipf).filter(Number.isFinite));
    const err = [];
    let delta = null;
    if (this.cal.view === "side") {
      const R = RULES_SIDE;
      if (v.knee > R.depth.max) err.push({ kind: "depth", value: v.knee, target: R.depth.target });
      if (v.knee < R.too_deep.min) err.push({ kind: "too_deep", value: v.knee, target: R.too_deep.target });
      if (v.tms > R.trunk.max) err.push({ kind: "trunk", value: v.tms, target: R.trunk.target });
      if (v.shin > R.knee_fwd.max) err.push({ kind: "knee_fwd", value: v.shin, target: R.knee_fwd.target });
      if (v.heel > R.heel.max) err.push({ kind: "heel", value: v.heel, target: 0 });
      // angle changes at the bottom, blended in along the rep by correctedFrame()
      const k = new Set(err.map((e) => e.kind));
      delta = { shin: 0, thigh: 0, trunk: 0, heel: k.has("heel") ? v.heel : 0 };
      if (k.has("knee_fwd")) delta.shin = R.knee_fwd.target - v.shin;
      // knee angle K = 90 - shin + thigh  ->  thigh needed for a 90 deg knee with the corrected shin
      if (k.has("depth") || k.has("too_deep")) delta.thigh = (R.depth.target - 90 + v.shin + delta.shin) - v.thigh;
      if (k.has("trunk") || k.has("knee_fwd")) {
        const tgt = v.shin + delta.shin + R.trunk.target;
        if (v.trunk > tgt) delta.trunk = tgt - v.trunk;
      }
    } else {
      const R = RULES_FRONT;
      if (v.ratio < R.valgus.min) err.push({ kind: "valgus", value: v.ratio, target: R.valgus.target });
      if (Math.abs(v.shift) > R.shift.max) err.push({ kind: "shift", value: v.shift, target: 0 });
      if (v.lean > R.trunk.max) err.push({ kind: "trunk", value: v.lean, target: R.trunk.target });
    }
    for (const e of err) e.text = describe(e, this.cal.view);
    const score = err.reduce((a, e) => a + 1 + excess(e), 0);
    return { index: this.reps.length + 1, frames, b, top: cur.top, values: v, errors: err, ok: !err.length,
             score, delta, view: this.cal.view, cal: { ...this.cal } };
  }
}

function excess(e) {
  const R = { ...RULES_SIDE, ...RULES_FRONT }[e.kind];
  const lim = R.max ?? R.min;
  return Math.min(Math.abs(Math.abs(e.value) - Math.abs(lim)) / (Math.abs(lim) || 1), 3);
}

export function describe(e, view) {
  const R = (view === "side" ? RULES_SIDE : RULES_FRONT)[e.kind];
  const r = (x) => Math.round(x);
  switch (e.kind) {
    case "depth":
    case "too_deep": return `${R.label}: ginocchio ${r(e.value)}° → ${r(e.target)}°`;
    case "trunk": return view === "side" ? `${R.label}: ${r(e.value)}° più della tibia → max ${R.max}°`
                                     : `${R.label}: circa ${r(e.value)}° → max ${R.max}°`;
    case "knee_fwd": return `${R.label}: tibia ${r(e.value)}° → ${r(e.target)}°`;
    case "heel": return `${R.label}`;
    case "valgus": return `${R.label}: ginocchia/caviglie ${e.value.toFixed(2)} → ${e.target.toFixed(2)}`;
    case "shift": return `${R.label} (${e.value > 0 ? "destra" : "sinistra"})`;
  }
  return R.label;
}

// Progress into the rep: 0 standing, 1 at the bottom.
function progress(rep, i) {
  return clamp(rep.frames[i].a / rep.frames[rep.b].a, 0, 1);
}

// Corrected skeleton for frame i of a rep: same feet and segment lengths,
// wrong angles moved to the target, more and more towards the bottom.
export function correctedFrame(rep, i) {
  const fr = rep.frames[i], p = progress(rep, i);
  if (rep.ok) return { pts: fr.kp, p };
  const cal = rep.cal;
  if (rep.view === "side") {
    const k = fr.kp, f = cal.f, d = rep.delta, m = fr.m;
    const up = { x: 0, y: -1 }, fw = { x: f, y: 0 };
    const dir = (l) => add(mul(fw, Math.sin(rad(l))), mul(up, Math.cos(rad(l))));
    const shinA = m.shin + p * d.shin, thighA = m.thigh + p * d.thigh, trunkA = m.trunk + p * d.trunk;
    const drop = { x: 0, y: p * d.heel * cal.shin };          // heels back on the floor
    const ankle = add(k.ankle, drop);
    const knee = add(ankle, mul(dir(shinA), cal.shin));
    const el = rad(thighA);
    const hip = add(knee, mul(add(mul(fw, -Math.cos(el)), mul(up, Math.sin(el))), cal.thigh));
    const shoulder = add(hip, mul(dir(trunkA), cal.trunk));
    const a = rad(f * (trunkA - m.trunk)), c = Math.cos(a), s = Math.sin(a);
    const rot = (q) => { if (!q) return q; const r = sub(q, k.shoulder);
      return add(shoulder, { x: c * r.x - s * r.y, y: s * r.x + c * r.y }); };
    return { p, pts: { ankle, knee, hip, shoulder, ear: rot(k.ear), elbow: rot(k.elbow), wrist: rot(k.wrist),
                       heel: k.heel && add(k.heel, drop), toe: k.toe } };
  }
  // front
  const k = fr.kp, out = {};
  for (const [n, q] of Object.entries(k)) out[n] = { ...q };
  const kinds = new Set(rep.errors.map((e) => e.kind));
  if (kinds.has("shift")) {
    const dx = -p * rep.values.shift * cal.shoulderW;
    for (const n of Object.keys(out)) {
      if (/^(ankle|heel|toe)_/.test(n)) continue;
      out[n].x += /^knee_/.test(n) ? dx / 2 : dx;
    }
  }
  if (kinds.has("trunk")) {
    const hp = mid(out.hip_l, out.hip_r), sh = mid(out.shoulder_l, out.shoulder_r);
    const L = norm(sub(sh, hp)), want = cal.torso0 * Math.cos(rad(RULES_FRONT.trunk.target));
    const grow = p * Math.max(want - L, 0), dir = mul(sub(sh, hp), 1 / (L || 1));
    for (const n of ["nose", "ear_l", "ear_r", "shoulder_l", "shoulder_r", "elbow_l", "elbow_r", "wrist_l", "wrist_r"])
      if (out[n]) { out[n].x += dir.x * grow; out[n].y += dir.y * grow; }
  }
  if (kinds.has("valgus")) {
    const ankSep = Math.abs(k.ankle_l.x - k.ankle_r.x), kneeSep = Math.abs(out.knee_l.x - out.knee_r.x);
    const push = (p * Math.max(RULES_FRONT.valgus.target * ankSep - kneeSep, 0)) / 2;
    const c = (out.knee_l.x + out.knee_r.x) / 2;
    for (const n of ["knee_l", "knee_r"]) out[n].x += Math.sign(out[n].x - c || 1) * push;
  }
  return { p, pts: out };
}

export function sessionSummary(reps, view) {
  const errors = {};
  for (const r of reps) for (const e of r.errors) errors[e.kind] = (errors[e.kind] || 0) + 1;
  const n = reps.length, ok = reps.filter((r) => r.ok).length;
  return {
    date: new Date().toISOString(), view, reps: n, correct: ok,
    pct: n ? Math.round((100 * ok) / n) : 0, errors,
    knee: view === "side" ? median(reps.map((r) => r.values.knee)) : null,
    thigh: view === "side" ? median(reps.map((r) => r.values.thigh)) : null,
  };
}
