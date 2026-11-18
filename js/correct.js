// Corrected pose ("avatar coach") for the exercises of exercises.js, the same
// idea as correctedFrame() of the side squat in coach.js: the person's own
// keypoints, with the faulty parts moved to where the rule wants them, more
// and more towards the deepest point of the repetition.
//
// FIX[exercise][rule key](out, k, c, s, w): out = keypoints to correct (copy of k),
// k = keypoints of the frame, c = calibration, s = side, w = 0..1 how much of the
// correction to apply (progress of the rep). Rules with no visible correction
// (rotary "touch") have no entry.

import { G } from "./geometry.js";
import { T, handLength } from "./exercises.js";

const L = (s) => (s === "r" ? "r" : "l");
const O = (s) => (s === "r" ? "l" : "r");
const UPPER = ["nose", "ear_l", "ear_r", "shoulder_l", "shoulder_r", "elbow_l", "elbow_r", "wrist_l", "wrist_r"];
const HIPS = ["hip_l", "hip_r"];
const FOOT = (s) => [`ankle_${s}`, `heel_${s}`, `toe_${s}`];
const hipMid = (k) => G.mid(k.hip_l, k.hip_r);
const shMid = (k) => G.mid(k.shoulder_l, k.shoulder_r);
const lerp = (a, b, t) => ({ ...a, x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });

function move(out, names, dx, dy) {
  for (const n of names) if (out[n]) { out[n].x += dx; out[n].y += dy; }
}

// Rotate points about o by a radians (image coordinates, y down).
function rotate(out, names, o, a) {
  const c = Math.cos(a), s = Math.sin(a);
  for (const n of names) {
    const p = out[n];
    if (!p) continue;
    const x = p.x - o.x, y = p.y - o.y;
    out[n] = { ...p, x: o.x + c * x - s * y, y: o.y + s * x + c * y };
  }
}

// Seen from the front a forward lean shortens the shoulder-hip segment: grow it
// back to the length it has at `deg` of lean, moving the whole upper body.
function trunkUp(out, c, deg, w) {
  const hp = hipMid(out), sh = shMid(out), len = G.dist(sh, hp) || 1;
  const grow = w * Math.max(c.torso * Math.cos((deg * Math.PI) / 180) - len, 0);
  move(out, UPPER, ((sh.x - hp.x) / len) * grow, ((sh.y - hp.y) / len) * grow);
}

// Straight limb from `root` along its current direction (or `dir`), segment lengths a and b.
function straight(out, root, mid, end, a, b, w, dir) {
  const r = out[root], e = out[end];
  const d = dir || { x: e.x - r.x, y: e.y - r.y };
  const n = Math.hypot(d.x, d.y) || 1;
  const m = { x: r.x + (d.x / n) * a, y: r.y + (d.y / n) * a };
  const f = { x: r.x + (d.x / n) * (a + b), y: r.y + (d.y / n) * (a + b) };
  out[mid] = lerp(out[mid], m, w);
  out[end] = lerp(out[end], f, w);
}

const FIX = {
  deep_squat: {
    // pelvis (and everything above it) lower, down to a little past the threshold
    depth: (out, k, c, s, w, v) => move(out, UPPER.concat(HIPS), 0, w * Math.max(T.squat_depth_min + 0.05 - v.depth, 0) * c.leg),
    trunk: (out, k, c, s, w) => trunkUp(out, c, T.squat_trunk_fs_max - 15, w),
    // knees pushed out over the feet: knee distance = ankle distance
    valgus: (out, k, c, s, w) => {
      const mx = (out.knee_l.x + out.knee_r.x) / 2, half = Math.abs(out.knee_l.x - out.knee_r.x) / 2;
      const want = Math.max(Math.abs(out.ankle_l.x - out.ankle_r.x) / 2, half);
      const sgn = Math.sign(out.knee_l.x - out.knee_r.x) || 1, h = half + w * (want - half);
      out.knee_l.x = mx + sgn * h;
      out.knee_r.x = mx - sgn * h;
    },
    // side view: pelvis lower, to just below parallel
    ipf: (out, k, c, s, w, v) => move(out, UPPER.concat(HIPS), 0, w * Math.max(0.05 - v.ipf, 0) * c.thigh),
    // side view: upper body rotated about the hip, back to the tibia's lean
    tms: (out, k, c, s, w, v) => {
      const hp = hipMid(out), u = { x: shMid(out).x - hp.x };
      rotate(out, UPPER, hp, -Math.sign(u.x || 1) * w * Math.max(v.tms - 5, 0) * (Math.PI / 180));
    },
    // dowel overhead: arms straight up from the shoulders
    arms: (out, k, c, s, w) => {
      for (const sd of ["l", "r"]) straight(out, `shoulder_${sd}`, `elbow_${sd}`, `wrist_${sd}`, c.upperArm, c.forearm, w, { x: 0, y: -1 });
    },
  },
  hurdle_step: {
    // moving foot (and knee) higher, over the hurdle
    raise: (out, k, c, s, w, v) => {
      const d = w * Math.max(T.hurdle_raise_min + 0.1 - v.raise, 0) * c.shin;
      move(out, FOOT(L(s)).concat(`knee_${L(s)}`), 0, -d);
    },
    // dowel level: both hands at the same height
    dowel: (out, k, c, s, w) => {
      for (const n of ["wrist", "elbow"]) {
        const y = (out[`${n}_l`].y + out[`${n}_r`].y) / 2;
        out[`${n}_l`].y += w * (y - out[`${n}_l`].y);
        out[`${n}_r`].y += w * (y - out[`${n}_r`].y);
      }
    },
    // trunk back over the pelvis, as in the start position
    sway: (out, k, c, s, w) => {
      const off = (shMid(out).x - hipMid(out).x) - (shMid(c.kp).x - hipMid(c.kp).x);
      move(out, UPPER, -w * off, 0);
    },
    // stance knee back over the hip-ankle line, as in the start position
    knee: (out, k, c, s, w) => {
      const o = O(s), at = (q) => q[`knee_${o}`].x - G.mid(q[`hip_${o}`], q[`ankle_${o}`]).x;
      out[`knee_${o}`].x -= w * (at(out) - at(c.kp));
    },
  },
  inline_lunge: {
    trunk: (out, k, c, s, w) => trunkUp(out, c, T.lunge_trunk_max - 10, w),
    // pelvis straight down: back over the start position
    sway: (out, k, c, s, w) => {
      const dx = w * (hipMid(c.kp).x - hipMid(out).x);
      move(out, UPPER.concat(HIPS), dx, 0);
      move(out, ["knee_l", "knee_r"], dx / 2, 0);
    },
  },
  shoulder_mobility: {
    // fists closer, to within one hand length
    hands: (out, k, c, s, w) => {
      const hand = handLength(c), m = G.mid(out.wrist_l, out.wrist_r), d = G.dist(out.wrist_l, out.wrist_r) || 1;
      const want = Math.min((T.shoulder_3 * 0.8 + T.wrist_to_fist) * hand, d), t = w * (1 - want / d) / 2;
      out.wrist_l = lerp(out.wrist_l, m, 2 * t);
      out.wrist_r = lerp(out.wrist_r, m, 2 * t);
    },
  },
  aslr: {
    // leg straight, and raised up to 80 deg above the floor leg
    lift: (out, k, c, s, w, v) => {
      const l = L(s), hip = out[`hip_${l}`], u = { x: out[`ankle_${l}`].x - hip.x, y: out[`ankle_${l}`].y - hip.y };
      const th = Math.atan2(u.y, u.x) - Math.sign(u.x || 1) * w * Math.max(80 - v.lift, 0) * (Math.PI / 180);
      straight(out, `hip_${l}`, `knee_${l}`, `ankle_${l}`, c.thigh, c.shin, 1, { x: Math.cos(th), y: Math.sin(th) });
    },
    knee: (out, k, c, s, w) => straight(out, `hip_${L(s)}`, `knee_${L(s)}`, `ankle_${L(s)}`, c.thigh, c.shin, w),
  },
  trunk_pushup: {
    // hips and knees on the straight shoulder-ankle line (the dashed line)
    bend: (out, k, c, s, w) => {
      for (const sd of ["l", "r"]) {
        const a = out[`shoulder_${sd}`], b = out[`ankle_${sd}`];
        const dx = b.x - a.x, dy = b.y - a.y, n2 = dx * dx + dy * dy || 1;
        for (const n of [`hip_${sd}`, `knee_${sd}`]) {
          const p = out[n], t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / n2;
          out[n] = lerp(p, { x: a.x + t * dx, y: a.y + t * dy }, w);
        }
      }
    },
  },
  rotary_stability: {
    // same-side leg stretched back, in the direction it points
    leg: (out, k, c, s, w) => straight(out, `hip_${L(s)}`, `knee_${L(s)}`, `ankle_${L(s)}`, c.thigh, c.shin, w),
    reach: (out, k, c, s, w) => {
      straight(out, `shoulder_${L(s)}`, `elbow_${L(s)}`, `wrist_${L(s)}`, c.upperArm, c.forearm, w);
      straight(out, `hip_${L(s)}`, `knee_${L(s)}`, `ankle_${L(s)}`, c.thigh, c.shin, w);
    },
  },
};

// Progress into the rep: 0 at the start position, 1 at the deepest point.
export function repProgress(rep, i) {
  const s = rep.frames[rep.peak].s;
  return G.clamp(rep.frames[i].s / (s || 1), 0, 1);
}

// Corrected keypoints of frame i of a movement.js repetition, and the progress p.
export function correctFrame(rep, i) {
  const fr = rep.frames[i], p = repProgress(rep, i);
  if (rep.ok) return { pts: fr.kp, p };
  const out = {};
  for (const [n, q] of Object.entries(fr.kp)) out[n] = { ...q };
  const fix = FIX[rep.exercise] || {};
  for (const e of rep.errors) fix[e.kind]?.(out, fr.kp, rep.cal, rep.side, p, rep.values);
  return { pts: out, p };
}

// Text of the limit of a rule: "max 25°", "min 30%".
export function limitText(rule) {
  return rule.max !== undefined ? `max ${rule.fmt(rule.max)}` : `min ${rule.fmt(rule.min)}`;
}
