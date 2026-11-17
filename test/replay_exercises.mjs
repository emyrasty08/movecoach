// Offline test of js/movement.js + js/exercises.js on the Kinect session clips.
// Feeds the MoveNet keypoints of each clip frame by frame, as the phone would,
// and compares the app score with the clip label (ok = correct, comp = compensated).
//
//   node app/test/replay_exercises.mjs <KinectCapture folder> [regex on the clip name]
//
// Output: one line per clip and, at the end, a table of the scores of ok vs comp
// clips per test. Also written to <KinectCapture>/_analysis/app_replay.csv.
import fs from "node:fs";
import path from "node:path";
import { MovementCoach } from "../js/movement.js";
import { EXERCISES } from "../js/exercises.js";

// clip test name -> app exercise id
const TEST = { squat: "deep_squat", hurdle: "hurdle_step", lunge: "inline_lunge", shoulder: "shoulder_mobility",
               aslr: "aslr", pushup: "trunk_pushup", rotary: "rotary_stability" };
// MoveNet runs on the mirrored Kinect image: its left/right labels are swapped back here
const NAME = { nose: "nose", left_ear: "ear_r", right_ear: "ear_l", left_shoulder: "shoulder_r",
  right_shoulder: "shoulder_l", left_elbow: "elbow_r", right_elbow: "elbow_l", left_wrist: "wrist_r",
  right_wrist: "wrist_l", left_hip: "hip_r", right_hip: "hip_l", left_knee: "knee_r", right_knee: "knee_l",
  left_ankle: "ankle_r", right_ankle: "ankle_l" };
const CSV_NAME = (j) => j.replace("_movenet", "").replace(/([a-z])([A-Z])/g, "$1_$2").toLowerCase();

const [root, filter] = process.argv.slice(2);
const out = ["clip,exercise,side,label,reps,best_score,scores,faults,values"];
for (const clip of fs.readdirSync(root).sort()) {
  // FMS clips, plus the frontal IPF squats (high / limit / deep) to calibrate the squat depth
  const m = clip.match(/^([eml])_fms_([a-z]+)_?([LR])?_?(.*)$/);
  const ipf = clip.match(/^([eml])_ipf_front_(high|limit|deep)$/);
  if ((!m && !ipf) || (filter && !new RegExp(filter).test(clip))) continue;
  const csv = path.join(root, clip, "movenet_joints.csv");
  if (!fs.existsSync(csv)) continue;
  const [, , test, side, rest] = m || [null, null, "squat", undefined, `ipf_${ipf[2]}`];
  const ex = EXERCISES[TEST[test]];
  const label = rest || "";
  // read the frames
  const rows = fs.readFileSync(csv, "utf8").trim().split(/\r?\n/);
  const head = rows.shift().split(",");
  const col = Object.fromEntries(head.map((h, i) => [h, i]));
  const frames = new Map();
  for (const r of rows) {
    const c = r.split(",");
    const f = +c[col.frame];
    if (!frames.has(f)) frames.set(f, { t: +c[col.t] * 1000, kp: {} });
    const n = NAME[CSV_NAME(c[col.joint])];
    // MoveNet scores are lower than MediaPipe visibilities: rescale for the 0.5 thresholds
    if (n) frames.get(f).kp[n] = { x: +c[col.u], y: +c[col.v], v: Math.min(1, 1.6 * +c[col.score]) };
  }
  const coach = new MovementCoach(ex, side ? side.toLowerCase() : null, {});
  for (const [, fr] of [...frames].sort((a, b) => a[0] - b[0])) coach.push(fr.kp, fr.t, 1920, 1080);
  coach.finish();                                   // end of the set, as the "stop" button does
  const reps = coach.reps;
  const best = reps.length ? Math.max(...reps.map((r) => r.score)) : "";
  const faults = [...new Set(reps.flatMap((r) => r.errors.map((e) => e.kind)))].join(" ");
  const vals = reps.map((r) => Object.entries(r.values).map(([k, v]) => `${k}=${v.toFixed(2)}`).join(" ")).join(" | ");
  console.log(`${clip.padEnd(28)} ${coach.phase.padEnd(7)} reps ${reps.length}  scores [${reps.map((r) => r.score).join(",")}]  ${faults}`);
  console.log(`    ${vals}`);
  out.push([clip, ex.id, side || "", label, reps.length, best, reps.map((r) => r.score).join(" "), faults, `"${vals}"`].join(","));
}
const dst = path.join(root, "_analysis", "app_replay.csv");
fs.mkdirSync(path.dirname(dst), { recursive: true });
fs.writeFileSync(dst, out.join("\n") + "\n");
console.log(`-> ${dst}`);
