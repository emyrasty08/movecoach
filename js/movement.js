// Generic movement analyser, streaming (one frame at a time), for every exercise
// in exercises.js except the side-view squat, which keeps its own coach.js.
//
// Flow of one set:
//   1. "setup": the person gets into the start position (standing, or on the
//      floor for the floor tests) with the needed joints visible, and stays
//      still for 1.2 s -> calibration (reference lengths and start values).
//   2. "active": the exercise signal (0 at rest, >= 1 = a clear repetition) is
//      followed with hysteresis: a rep starts above 0.5, ends below 0.3, and
//      counts only if it reached 1.
//   3. At the end of each rep the exercise metrics are aggregated over the rep
//      (value at the peak, max or min), checked against the rules and turned
//      into a 0-3 score with the exercise's own score() function.
//
// Keypoints: { name: {x, y, v} } in pixels, y down, v = visibility 0..1.
// Names: nose, ear_l/r, shoulder_l/r, elbow_l/r, wrist_l/r, hip_l/r, knee_l/r,
//        ankle_l/r, heel_l/r, toe_l/r.

import { G } from "./geometry.js";

const STILL_MS = 1000;          // time to stay still for the calibration
const VIS = 0.5;                // a keypoint is usable above this visibility

export class MovementCoach {
  // exercise: one entry of EXERCISES; side: "l" | "r" | null; profile: { heightCm }
  constructor(exercise, side, profile) {
    this.ex = exercise;
    this.side = side;
    this.profile = profile || {};
    this.phase = "setup";
    this.sm = {};               // smoothed keypoints
    this.still = [];            // frames collected while still
    this.cal = null;
    this.cur = null;            // repetition in progress
    this.reps = [];
  }

  // Exponential smoothing; a low-visibility point keeps its last position.
  smooth(kp) {
    const out = {};
    for (const [n, p] of Object.entries(kp)) {
      const prev = this.sm[n];
      if (p && p.v >= VIS) this.sm[n] = prev ? { x: prev.x + 0.5 * (p.x - prev.x), y: prev.y + 0.5 * (p.y - prev.y), v: p.v } : { ...p };
      else if (prev) this.sm[n] = { ...prev, v: p ? p.v : 0 };
      else if (p) this.sm[n] = { ...p };
      if (this.sm[n]) out[n] = this.sm[n];
    }
    return out;
  }

  // Message telling the person what to do, or null when the needed joints are visible.
  guidance(kp, W, H) {
    const need = this.ex.needs(this.side);
    const seen = need.filter((n) => (kp[n]?.v ?? 0) >= VIS);
    if (seen.length < need.length * 0.6) return this.ex.texts.getReady;
    // floor tests: wait until the trunk is closer to horizontal than to vertical
    if (this.ex.start === "floor") {
      const sh = G.mid(kp.shoulder_l, kp.shoulder_r), hp = G.mid(kp.hip_l, kp.hip_r);
      if (!(G.ok(sh) && G.ok(hp)) || G.tilt(hp, sh) < 55) return this.ex.texts.getReady;
    }
    // standing tests: calibrate only standing upright (trunk vertical, legs straight)
    if (this.ex.start === "standing") {
      const sh = G.mid(kp.shoulder_l, kp.shoulder_r), hp = G.mid(kp.hip_l, kp.hip_r);
      const knee = Math.min(G.angle3(kp.hip_l, kp.knee_l, kp.ankle_l), G.angle3(kp.hip_r, kp.knee_r, kp.ankle_r));
      if (G.tilt(hp, sh) > 20 || knee < 155) return "Mettiti in piedi dritto";
    }
    const inside = (p) => p.x > 0.02 * W && p.x < 0.98 * W && p.y > 0.01 * H && p.y < 0.99 * H;
    if (!need.every((n) => kp[n] && inside(kp[n]))) return "Allontanati: devo vederti tutto";
    if (seen.length < need.length) return "Non ti vedo bene: più luce o sfondo più libero";
    return null;
  }

  // One frame. Returns an event: guide | calibrated | frame | repEnd.
  push(raw, t, W, H) {
    const kp = this.smooth(raw);
    if (this.phase === "setup") return this.setupStep(kp, t, W, H);
    const m = this.ex.measures(kp, this.cal, this.side);
    const s = this.ex.signal(kp, this.cal, this.side);
    const frame = { t, kp: { ...kp }, m, s };
    if (!this.cur) {
      if (s > 0.5) this.cur = { frames: [frame], peak: 0 };
      return { type: "frame", frame, live: new Set() };
    }
    const cur = this.cur;
    cur.frames.push(frame);
    if (s > cur.frames[cur.peak].s) cur.peak = cur.frames.length - 1;
    // held poses (shoulder mobility): evaluate once the pose has been held long enough
    if (this.ex.holdMs && !cur.done && s >= 1) {
      cur.holdStart = cur.holdStart ?? t;
      if (t - cur.holdStart >= this.ex.holdMs) return this.closeRep(cur, frame, true);
    } else if (s < 1) cur.holdStart = null;
    if (t - cur.frames[0].t > 20000 && !cur.done) { this.cur = null; return { type: "frame", frame, live: new Set() }; }
    if (s < 0.3) {
      this.cur = null;
      if (!cur.done && cur.frames[cur.peak].s >= 1) return this.closeRep(cur, frame, false);
    }
    return { type: "frame", frame, live: cur.done ? new Set() : this.liveBad(m) };
  }

  // Evaluate a repetition. keepOpen: the pose is still held, wait for the return before the next rep.
  closeRep(cur, frame, keepOpen) {
    const rep = this.evaluate(cur);
    this.reps.push(rep);
    if (keepOpen) cur.done = true;
    return { type: "repEnd", frame, rep };
  }

  // End of the set: a repetition still in progress counts if it went deep enough.
  finish() {
    const cur = this.cur;
    this.cur = null;
    if (cur && !cur.done && cur.frames[cur.peak].s >= 1) {
      const rep = this.evaluate(cur);
      this.reps.push(rep);
      return rep;
    }
    return null;
  }

  setupStep(kp, t, W, H) {
    const msg = this.guidance(kp, W, H);
    if (msg) { this.still = []; return { type: "guide", msg, kp }; }
    this.still.push({ t, kp: JSON.parse(JSON.stringify(kp)) });
    // moving? (any needed joint moved more than 4% of the frame height) -> start again
    const first = this.still[0].kp;
    const moved = this.ex.needs(this.side).some((n) => G.dist(first[n], kp[n]) > 0.05 * H);
    if (moved) this.still = this.still.slice(-3);
    const dt = t - this.still[0].t;
    if (dt < STILL_MS) return { type: "guide", msg: this.ex.texts.holdStill, progress: dt / STILL_MS, kp };
    this.cal = calibrate(this.still.map((f) => f.kp), this.profile);
    this.cal.start = this.ex.calibrate ? this.ex.calibrate(this.cal, this.side) : {};
    this.phase = "active";
    return { type: "calibrated", kp };
  }

  // Parts to draw red right now: rules that can be checked frame by frame.
  liveBad(m) {
    const bad = new Set();
    for (const r of this.ex.rules) if (r.live && Number.isFinite(m[r.key]) && fails(r, m[r.key])) bad.add(r.part);
    return bad;
  }

  evaluate(cur) {
    const { frames, peak } = cur;
    // aggregate every metric over the repetition, as the rule asks
    const values = {};
    for (const key of Object.keys(frames[peak].m)) {
      const xs = frames.map((f) => f.m[key]);
      const agg = this.ex.aggregate[key] || "peak";
      values[key] = agg === "max" ? G.max(xs) : agg === "min" ? G.min(xs)
        : G.median(xs.slice(Math.max(peak - 2, 0), peak + 3));
    }
    const errors = [];
    for (const r of this.ex.rules) {
      const v = values[r.key];
      if (Number.isFinite(v) && fails(r, v)) errors.push({ kind: r.key, value: v, rule: r, text: r.text(v), cue: r.cue });
    }
    const score = this.ex.score(values, errors, this.cal, this.side);
    return { index: this.reps.length + 1, frames, peak, values, errors, ok: !errors.length, score,
             side: this.side, exercise: this.ex.id };
  }
}

function fails(rule, v) {
  return (rule.max !== undefined && v > rule.max) || (rule.min !== undefined && v < rule.min);
}

// Reference values from the still frames (medians).
function calibrate(frames, profile) {
  const med = (n, c) => G.median(frames.map((f) => f[n]?.[c]));
  const P = (n) => ({ x: med(n, "x"), y: med(n, "y") });
  const names = Object.keys(frames[frames.length - 1]);
  const kp = Object.fromEntries(names.map((n) => [n, P(n)]));
  const cal = { kp };
  const both = (a, b) => (G.dist(kp[`${a}_l`], kp[`${b}_l`]) + G.dist(kp[`${a}_r`], kp[`${b}_r`])) / 2;
  cal.thigh = both("hip", "knee");
  cal.shin = both("knee", "ankle");
  cal.leg = cal.thigh + cal.shin;
  cal.upperArm = both("shoulder", "elbow");
  cal.forearm = both("elbow", "wrist");
  cal.shoulderW = Math.abs(kp.shoulder_l.x - kp.shoulder_r.x);
  cal.torso = G.dist(G.mid(kp.shoulder_l, kp.shoulder_r), G.mid(kp.hip_l, kp.hip_r));
  // standing: nose-to-ankle is about 0.87 of the stature -> pixels per cm
  const ankY = (kp.ankle_l.y + kp.ankle_r.y) / 2;
  cal.pxPerCm = profile.heightCm ? Math.abs(ankY - kp.nose.y) / (0.87 * profile.heightCm) : NaN;
  return cal;
}
