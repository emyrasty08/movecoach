// Offline test of js/coach.js: feeds a MoveNet CSV (python/run_movenet.py output)
// frame by frame, as the phone would, and prints the reps found.
//   node app/test/replay_csv.mjs <take_folder> [...]
import fs from "node:fs";
import path from "node:path";
import { Coach, correctedFrame } from "../js/coach.js";

const NAME = { nose: "nose", left_ear: "ear_l", right_ear: "ear_r", left_shoulder: "shoulder_l",
  right_shoulder: "shoulder_r", left_elbow: "elbow_l", right_elbow: "elbow_r", left_wrist: "wrist_l",
  right_wrist: "wrist_r", left_hip: "hip_l", right_hip: "hip_r", left_knee: "knee_l", right_knee: "knee_r",
  left_ankle: "ankle_l", right_ankle: "ankle_r" };

for (const take of process.argv.slice(2)) {
  const rows = fs.readFileSync(path.join(take, "movenet_joints.csv"), "utf8").trim().split(/\r?\n/);
  const head = rows.shift().split(",");
  const col = Object.fromEntries(head.map((h, i) => [h, i]));
  const frames = new Map();
  for (const r of rows) {
    const c = r.split(",");
    const f = +c[col.frame];
    if (!frames.has(f)) frames.set(f, { t: +c[col.t] * 1000, kp: {} });
    const n = NAME[c[col.joint]];
    // MoveNet scores are lower than MediaPipe visibilities: rescale for the 0.5 thresholds
    if (n) frames.get(f).kp[n] = { x: +c[col.u], y: +c[col.v], v: Math.min(1, 1.6 * +c[col.score]) };
  }
  const coach = new Coach();
  console.log(`\n=== ${path.basename(take)}`);
  let lastGuide = "";
  for (const [, fr] of [...frames].sort((a, b) => a[0] - b[0])) {
    const ev = coach.push(fr.kp, fr.t, 1920, 1080);
    if (ev.type === "guide" && ev.msg !== lastGuide) { lastGuide = ev.msg; }
    if (ev.type === "calibrated")
      console.log(`  calibrated at ${(fr.t / 1000).toFixed(1)} s, view ${ev.view}, ratio ${coach.cal.ratio.toFixed(2)}`);
    if (ev.type === "repEnd") {
      const r = ev.rep, v = r.values;
      const vals = r.view === "side"
        ? `knee ${v.knee.toFixed(0)} thigh ${v.thigh.toFixed(0)} shin ${v.shin.toFixed(0)} trunk ${v.trunk.toFixed(0)} heel ${v.heel.toFixed(3)}`
        : `ratio ${v.ratio.toFixed(2)} shift ${v.shift.toFixed(2)}`;
      console.log(`  rep ${r.index} bottom ${(r.frames[r.b].t / 1000).toFixed(1)} s  ${vals}`);
      console.log("     " + (r.ok ? "OK" : r.errors.map((e) => e.text).join(" | ")));
      const c = correctedFrame(r, r.b);
      const bad = Object.values(c.pts).some((q) => q && !(Number.isFinite(q.x) && Number.isFinite(q.y)));
      if (bad) console.log("     !! corrected skeleton has NaN");
    }
  }
  if (coach.phase === "setup") console.log("  never calibrated, last guidance:", lastGuide);
}
