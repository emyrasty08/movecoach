// Exercise catalogue: the 7 FMS-style tests recorded with the Kinect on 14/11/2026.
// Used both for the initial assessment and as training exercises with feedback.
//
// Each exercise defines:
//   view       where to put the phone: "front", "side" or "back"
//   start      "standing" or "floor" (start position used for the calibration)
//   bilateral  true if it is done once per side (score = worse side, as in the FMS)
//   needs()    keypoints that must be visible
//   signal()   0 at rest, >= 1 = a clear repetition (drives the rep counter)
//   measures() metrics of one frame; aggregate{} says how each one is summarised
//              over the repetition: "peak" (value at the deepest point), "max", "min"
//   rules[]    a metric outside [min, max] is a fault; part = skeleton part drawn red;
//              name and fmt() label the metric in the set analysis charts, chart{}
//              optionally plots a signed metric instead (push-up body line)
//   score()    0-3 score of one repetition (best repetition counts, as in the FMS)
//
// Thresholds: values marked "data" come from the Kinect/MoveNet session analysis
// (python/capture/step6_thresholds.py -> _analysis/step6_thresholds.csv): they
// separate the correct ("ok") from the compensated ("comp") recordings of the
// three subjects. Values marked "FMS" come from the official scoring criteria.
// User-facing texts are in Italian, like the rest of the app.

import { G } from "./geometry.js";

const L = (s) => (s === "r" ? "r" : "l");            // moving / tested side
const O = (s) => (s === "r" ? "l" : "r");            // the other side
const hipMid = (k) => G.mid(k.hip_l, k.hip_r);
const shMid = (k) => G.mid(k.shoulder_l, k.shoulder_r);
const ALL = ["nose", "shoulder_l", "shoulder_r", "hip_l", "hip_r", "knee_l", "knee_r", "ankle_l", "ankle_r"];
const ARMS = ["elbow_l", "elbow_r", "wrist_l", "wrist_r"];
// value formats of the set analysis
const DEG = (v) => `${Math.round(v)}°`;
const X2 = (v) => v.toFixed(2).replace(".", ",");
const PCT = (v) => `${Math.round(v * 100)}%`;

// Score shared by the standing patterns: movement not completed -> 1,
// otherwise 3 with no fault, 2 with one fault, 1 with two or more.
function patternScore(completed, errors) {
  if (!completed) return 1;
  return errors.length === 0 ? 3 : errors.length === 1 ? 2 : 1;
}

export const T = {
  // ---------------------------------------------------------------- deep squat
  // Values set on 17/11/2026 from _analysis/step6_thresholds.csv (3 subjects, ok vs comp reps):
  squat_trunk_fs_max: 52,        // data: ok 42, comp 56 deg, AUC 0.96, best cut 52.6 (90%)
  squat_valgus_min: 0.9,         // data: ok 1.27, comp 0.55, AUC 0.93 (best cut 1.18 rejected: on the edge of ok reps)
  squat_depth_min: 0.30,         // data: frontal IPF squats: high 0.15-0.24, limit 0.36-0.45, deep 0.49-0.81
                                 // -> 0.30 flags the high ones and accepts from "thigh about horizontal"
  squat_arms_min: 0.15,          // FMS: wrists above the nose by at least 0.15 torso (dowel overhead)
  squat_ipf_offset: 0.055,       // side view: joint centre vs anatomical hip crease / knee top, in thigh
                                 // lengths (I. Necerini, Streetlifting-RefereeAI docs/05, 11 annotated reps)
  squat_tms_max: 20,             // side view: trunk lean minus shin lean (FMS: trunk parallel to the tibia),
                                 // same limit as the side squat coach (coach.js RULES_SIDE.trunk)

  // ---------------------------------------------------------------- hurdle step
  hurdle_dowel_max: 10,          // data: ok 3.8, comp 19.2 deg, AUC 0.99, best cut 8.5 (98%)
  hurdle_sway_max: 0.2,          // data: ok 0.09, comp 0.39, AUC 0.98, best cut 0.18 (97%)
  hurdle_knee_max: 0.07,         // data: ok 0.04, comp 0.08, AUC 0.87, best cut 0.05 (83%)
  hurdle_raise_min: 0.8,         // FMS: foot clears the hurdle (tibia height): ankle rise / shin length
  // ---------------------------------------------------------------- in-line lunge
  lunge_trunk_max: 25,           // data: ok 0, comp 44 deg, AUC 0.86, best cut 23 (88%)
  lunge_sway_max: 0.25,          // data: AUC only 0.73: kept loose to avoid false alarms
  // ---------------------------------------------------------------- shoulder mobility (FMS)
  shoulder_3: 1.0,               // fists within 1 hand length
  shoulder_2: 1.5,               // within 1.5 hand lengths
  wrist_to_fist: 1.0,            // data: wrist distance - fist distance, in hand lengths
  // ---------------------------------------------------------------- push-up and rotary
  pushup_bend_max: 20,           // data: ok 13, comp 45 deg, AUC 0.94, best cut 19.8 (96%)
  aslr_knee_min: 130,            // data: knee angle at the top, ok 157, comp 116 deg, AUC 0.79, best cut 131 (85%)
  rotary_touch_max: 0.75,        // data: AUC 0.43, no information from the side: only flags a clear miss
  rotary_reach_min: 2.4,         // data: wrist-ankle distance / torso, arm and leg extended
  rotary_leg_min: 0.92,        // data: hip-ankle distance / leg length on the camera side (leg stretched)
};

export const EXERCISES = {
  deep_squat: {
    id: "deep_squat", name: "Deep squat", view: "front", viewText: "di fronte o di lato", start: "standing", bilateral: false,
    tool: "un bastone (manico di scopa)",
    intro: ["Telefono di fronte a te (o di lato), all'altezza del bacino, a 2–3 m: l'app riconosce la vista.",
            "Piedi alla larghezza delle spalle, bastone sopra la testa a braccia tese (per allenarti va bene anche il bilanciere sulle spalle).",
            "Scendi più in basso che puoi, talloni a terra, e risali. Fai 3 ripetizioni."],
    texts: { getReady: "Mettiti davanti o di lato al telefono, a figura intera", holdStill: "Stai fermo in piedi..." },
    // the arms are not needed: with a barbell on the back the wrists are hidden
    needs: () => ALL,
    // view (front / side) recognised at the calibration: seen from the side the shoulders
    // overlap. Side view: the near leg (the most visible one) and the facing direction.
    // The dowel check only if the person started with the hands above the head.
    calibrate: (c) => {
      const vis = (s) => ["shoulder", "hip", "knee", "ankle"].reduce((a, n) => a + (c.kp[`${n}_${s}`].v || 0), 0);
      const near = vis("l") >= vis("r") ? "l" : "r";
      const toe = c.kp[`toe_${near}`], heel = c.kp[`heel_${near}`];
      const f = G.ok(toe) && G.ok(heel) && Math.abs(toe.x - heel.x) > 2 ? Math.sign(toe.x - heel.x)
        : Math.sign(c.kp.nose.x - c.kp[`shoulder_${near}`].x) || 1;
      const overhead = (c.kp.nose.y - Math.max(c.kp.wrist_l?.y ?? -Infinity, c.kp.wrist_r?.y ?? -Infinity)) / c.torso > T.squat_arms_min;
      return { view: c.shoulderW < 0.35 * c.torso ? "side" : "front", near, f, overhead };
    },
    // a rep counts from 15% of the leg length, so that too-shallow squats are counted and flagged
    signal: (k, c) => (hipMid(k).y - hipMid(c.kp).y) / c.leg / 0.15,
    // Front: depth = pelvis descent / leg length (from the front the hip never looks lower
    // than the knee, the thigh points at the camera), trunk lean from foreshortening, knees.
    // Side: the FMS criteria seen directly, femur below horizontal (IPF rule, I. Necerini)
    // and trunk parallel to the tibia. Metrics of the other view are NaN (not checked).
    measures: (k, c) => {
      const st = c.start, side = st.view === "side", n = st.near;
      const arms = st.overhead ? (k.nose.y - Math.max(k.wrist_l?.y ?? NaN, k.wrist_r?.y ?? NaN)) / c.torso : NaN;
      if (!side) return {
        depth: (hipMid(k).y - hipMid(c.kp).y) / c.leg,
        trunk: G.foreshortening(G.dist(shMid(k), hipMid(k)), c.torso),
        valgus: Math.abs(k.knee_l.x - k.knee_r.x) / Math.max(Math.abs(k.ankle_l.x - k.ankle_r.x), 1),
        arms, ipf: NaN, tms: NaN,
      };
      const P = (j) => k[`${j}_${n}`];
      const lean = (a, b) => G.deg(Math.atan2(st.f * (a.x - b.x), b.y - a.y));   // forward lean from vertical
      return {
        depth: NaN, trunk: NaN, valgus: NaN, arms,
        // hip crease below the top of the knee, in thigh lengths (>= 0 = below parallel);
        // +0.055 = joint centre vs anatomy, from 11 referee-annotated reps (Streetlifting-RefereeAI, docs/05)
        ipf: (P("hip").y - P("knee").y) / c.thigh + T.squat_ipf_offset,
        tms: lean(P("shoulder"), P("hip")) - lean(P("knee"), P("ankle")),
      };
    },
    aggregate: { depth: "peak", trunk: "peak", valgus: "peak", arms: "min", ipf: "max", tms: "peak" },
    rules: [
      { key: "depth", min: T.squat_depth_min, part: "legs", name: "Profondità di fronte (discesa del bacino, % della gamba)", fmt: PCT,
        text: () => "Non sei sceso abbastanza", cue: "Scendi di più, cosce sotto le ginocchia" },
      { key: "ipf", min: 0, part: "legs", name: "Profondità di lato (anca sotto il ginocchio, regola IPF)", fmt: (v) => `${v >= 0 ? "+" : ""}${X2(v)} femori`,
        text: () => "Anca sopra il ginocchio: non sei sotto il parallelo", cue: "Scendi finché l'anca va sotto il ginocchio" },
      { key: "trunk", max: T.squat_trunk_fs_max, part: "trunk", live: true, name: "Inclinazione del busto", fmt: DEG,
        text: (v) => `Busto troppo inclinato (${Math.round(v)}°)`, cue: "Petto in alto, busto più dritto" },
      { key: "tms", max: T.squat_tms_max, part: "trunk", live: true, name: "Busto rispetto alla tibia", fmt: DEG,
        text: (v) => `Busto più inclinato della tibia (${Math.round(v)}°)`, cue: "Petto in alto, busto parallelo alla tibia" },
      { key: "valgus", min: T.squat_valgus_min, part: "legs", live: true, name: "Distanza ginocchia / distanza caviglie", fmt: X2,
        text: (v) => `Ginocchia verso l'interno (${v.toFixed(2)})`, cue: "Spingi le ginocchia in fuori, sopra i piedi" },
      { key: "arms", min: T.squat_arms_min, part: "arm", live: true, name: "Polsi sopra il naso (in busti)", fmt: X2,
        text: () => "Il bastone è sceso in avanti", cue: "Tieni il bastone sopra la testa, braccia tese" },
    ],
    score: (v, errors, c) => patternScore(c.start.view === "side" ? v.ipf >= 0 : v.depth >= T.squat_depth_min,
                                          errors.filter((e) => e.kind !== "depth" && e.kind !== "ipf")),
  },

  hurdle_step: {
    id: "hurdle_step", name: "Hurdle step", view: "front", start: "standing", bilateral: true,
    tool: "un bastone e un elastico teso all'altezza della tibia (sotto il ginocchio)",
    intro: ["Telefono di fronte, a 2–3 m. Ostacolo davanti ai piedi, alto quanto la tua tibia.",
            "Bastone appoggiato sulle spalle, dietro il collo.",
            "Scavalca l'ostacolo con una gamba, tocca terra col tallone e torna indietro. 3 volte."],
    texts: { getReady: "Mettiti di fronte al telefono, bastone sulle spalle", holdStill: "Stai fermo..." },
    needs: () => ALL.concat(["wrist_l", "wrist_r"]),
    signal: (k, c, s) => (c.kp[`ankle_${L(s)}`].y - k[`ankle_${L(s)}`].y) / c.shin / 0.6,
    measures: (k, c, s) => ({
      raise: (c.kp[`ankle_${L(s)}`].y - k[`ankle_${L(s)}`].y) / c.shin,
      dowel: G.slope(k.wrist_l, k.wrist_r),
      sway: Math.abs((shMid(k).x - hipMid(k).x) - (shMid(c.kp).x - hipMid(c.kp).x)) / c.shoulderW,
      knee: Math.abs((k[`knee_${O(s)}`].x - G.mid(k[`hip_${O(s)}`], k[`ankle_${O(s)}`]).x)
                     - (c.kp[`knee_${O(s)}`].x - G.mid(c.kp[`hip_${O(s)}`], c.kp[`ankle_${O(s)}`]).x)) / c.shoulderW,
    }),
    aggregate: { raise: "max", dowel: "max", sway: "max", knee: "max" },
    rules: [
      { key: "raise", min: T.hurdle_raise_min, part: "legs", name: "Altezza del piede (in tibie)", fmt: X2,
        text: () => "Piede troppo basso: rischi di toccare l'ostacolo", cue: "Alza di più il ginocchio" },
      { key: "dowel", max: T.hurdle_dowel_max, part: "arm", live: true, name: "Inclinazione del bastone", fmt: DEG,
        text: (v) => `Bastone inclinato (${Math.round(v)}°)`, cue: "Tieni il bastone orizzontale" },
      { key: "sway", max: T.hurdle_sway_max, part: "trunk", live: true, name: "Spostamento laterale del busto (in spalle)", fmt: X2,
        text: () => "Busto che si sposta di lato", cue: "Busto fermo e dritto" },
      { key: "knee", max: T.hurdle_knee_max, part: "legs", live: true, name: "Spostamento del ginocchio d'appoggio (in spalle)", fmt: X2,
        text: () => "Ginocchio d'appoggio che si sposta", cue: "Ginocchio d'appoggio fermo sopra il piede" },
    ],
    score: (v, errors) => patternScore(v.raise >= T.hurdle_raise_min, errors.filter((e) => e.kind !== "raise")),
  },

  inline_lunge: {
    id: "inline_lunge", name: "In-line lunge", view: "front", start: "standing", bilateral: true,
    tool: "un bastone",
    intro: ["Telefono di fronte, a 2–3 m.",
            "Piedi sulla stessa linea, distanti quanto la tua tibia; bastone verticale dietro la schiena (testa, schiena, osso sacro).",
            "Scendi finché il ginocchio dietro sfiora terra dietro il tallone davanti, e risali. 3 volte."],
    texts: { getReady: "Mettiti di fronte al telefono, in posizione di affondo", holdStill: "Stai fermo..." },
    needs: () => ALL,
    signal: (k, c) => (hipMid(k).y - hipMid(c.kp).y) / c.leg / 0.12,
    measures: (k, c) => ({
      trunk: G.foreshortening(G.dist(shMid(k), hipMid(k)), c.torso),
      sway: Math.abs(hipMid(k).x - hipMid(c.kp).x) / c.shoulderW,
    }),
    aggregate: { trunk: "peak", sway: "max" },
    rules: [
      { key: "trunk", max: T.lunge_trunk_max, part: "trunk", live: true, name: "Inclinazione del busto", fmt: DEG,
        text: (v) => `Busto inclinato in avanti (${Math.round(v)}°)`, cue: "Busto verticale, bastone attaccato alla schiena" },
      { key: "sway", max: T.lunge_sway_max, part: "pelvis", live: true, name: "Spostamento laterale del bacino (in spalle)", fmt: X2,
        text: () => "Bacino che si sposta di lato", cue: "Scendi dritto, senza spostarti di lato" },
    ],
    score: (v, errors) => patternScore(true, errors),
  },

  shoulder_mobility: {
    id: "shoulder_mobility", name: "Shoulder mobility", view: "back", start: "standing", bilateral: true,
    tool: "niente (meglio se c'è qualcuno che ti aiuta)",
    // From the back the hands are hidden behind the head and the back: the camera measure
    // worked for 1 subject out of 3 (step 6 / report). The FMS way (a helper measures the
    // fist distance in hand lengths) is offered as an alternative in the assessment.
    manual: { question: "Distanza tra i pugni, misurata da chi ti aiuta con il palmo della tua mano:",
              choices: [["entro 1 mano", 3], ["tra 1 e 1,5 mani", 2], ["più di 1,5 mani", 1]] },
    intro: ["Telefono dietro di te, a 2–3 m: dai le spalle al telefono.",
            "Chiudi i pugni coi pollici dentro. In un solo movimento porta un pugno dietro il collo e l'altro dietro la schiena, dal basso.",
            "Avvicinali più che puoi senza spostarli dopo, poi torna giù. 3 volte."],
    texts: { getReady: "Dai le spalle al telefono, a figura intera", holdStill: "Stai fermo, braccia lungo i fianchi..." },
    needs: () => ALL.filter((n) => n !== "nose").concat(ARMS),
    // rep signal: one hand goes up behind the neck and the other down behind the back,
    // so the height difference of the wrists grows (their distance does NOT shrink)
    signal: (k, c) => Math.abs(k.wrist_l.y - k.wrist_r.y) / c.torso / 0.5,
    holdMs: 2500,                // FMS: one movement, then hold; evaluated after 2.5 s held
    measures: (k, c) => ({ hands: Math.max(G.dist(k.wrist_l, k.wrist_r) / handLength(c) - T.wrist_to_fist, 0) }),
    aggregate: { hands: "min" },
    rules: [
      { key: "hands", max: T.shoulder_3, part: "arm", name: "Distanza tra i pugni (in mani)", fmt: (v) => v.toFixed(1).replace(".", ","),
        text: (v) => `Pugni a ${v.toFixed(1)} mani di distanza`, cue: "Avvicina di più i pugni dietro la schiena" },
    ],
    score: (v) => (v.hands <= T.shoulder_3 ? 3 : v.hands <= T.shoulder_2 ? 2 : 1),
  },

  aslr: {
    id: "aslr", name: "Active straight-leg raise", view: "side", start: "floor", bilateral: true,
    tool: "un tappetino",
    intro: ["Telefono a terra o basso, di lato, a 2–3 m: devi vederti tutto da sdraiato.",
            "Sdraiati supino, braccia lungo i fianchi, gambe tese.",
            "Alza una gamba tesa più che puoi, l'altra resta a terra. Torna giù. 3 volte."],
    texts: { getReady: "Sdraiati di lato rispetto al telefono, a figura intera", holdStill: "Stai fermo sdraiato..." },
    needs: () => ["shoulder_l", "shoulder_r", "hip_l", "hip_r", "knee_l", "knee_r", "ankle_l", "ankle_r"],
    signal: (k, c, s) => legLift(k, c, s) / 45,
    measures: (k, c, s) => ({ lift: legLift(k, c, s), knee: G.angle3(k[`hip_${L(s)}`], k[`knee_${L(s)}`], k[`ankle_${L(s)}`]) }),
    aggregate: { lift: "max", knee: "peak" },
    // FMS: the ankle must project between mid-thigh and hip (3) or mid-thigh and knee (2);
    // the projection is at leg*cos(lift) from the hip -> angle thresholds from the subject's proportions
    rules: [
      { key: "lift", min: 70, part: "legs", name: "Angolo della gamba alzata", fmt: DEG,
        text: (v) => `Gamba alzata a ${Math.round(v)}°`, cue: "Alza di più la gamba, tienila tesa" },
      { key: "knee", min: T.aslr_knee_min, part: "legs", live: true, name: "Angolo del ginocchio (180° = teso)", fmt: DEG,
        text: () => "Ginocchio piegato", cue: "Tieni il ginocchio teso" },
    ],
    score: (v, errors, c) => {
      const thr3 = G.deg(Math.acos(c.thigh / (2 * c.leg))), thr2 = G.deg(Math.acos(c.thigh / c.leg));
      const byAngle = v.lift >= thr3 ? 3 : v.lift >= thr2 ? 2 : 1;
      // FMS: the leg must stay straight; a bent knee makes the leg look higher -> one point less
      return errors.some((e) => e.kind === "knee") ? Math.max(byAngle - 1, 1) : byAngle;
    },
  },

  trunk_pushup: {
    id: "trunk_pushup", name: "Trunk stability push-up", view: "side", start: "floor", bilateral: false,
    tool: "un tappetino",
    intro: ["Telefono di lato, basso, a 2–3 m.",
            "Prono, mani all'altezza della fronte (uomini) o del mento (donne), punte dei piedi a terra.",
            "Spingi e sali tutto in un blocco, senza che il bacino resti indietro. 3 volte."],
    texts: { getReady: "Sdraiati a pancia in giù di lato rispetto al telefono", holdStill: "Stai fermo..." },
    needs: () => ["shoulder_l", "shoulder_r", "hip_l", "hip_r", "knee_l", "knee_r", "ankle_l", "ankle_r"],
    calibrate: (c) => ({ body: G.dist(shMid(c.kp), G.mid(c.kp.ankle_l, c.kp.ankle_r)), floorY: shMid(c.kp).y }),
    // shoulder height above the lowest position seen so far (the person may start already up)
    signal: (k, c) => {
      c.start.floorY = Math.max(c.start.floorY, shMid(k).y);
      return (c.start.floorY - shMid(k).y) / c.start.body / 0.15;
    },
    // body line as in J. Park's push_ups demo: the hip's angle off the shoulder-ankle
    // line, signed (+ hips raised, - hips dropped); the rule uses its size
    measures: (k) => {
      const line = bodyLine(shMid(k), hipMid(k), G.mid(k.ankle_l, k.ankle_r));
      return { bend: Math.abs(line), line };
    },
    aggregate: { bend: "max", line: "peak" },
    refLine: (k) => [shMid(k), G.mid(k.ankle_l, k.ankle_r)],     // dashed straight line drawn under the body
    rules: [
      { key: "bend", max: T.pushup_bend_max, part: "trunk", live: true, name: "Linea del corpo (scarto dalla retta spalla–caviglia)", fmt: DEG,
        chart: { key: "line", min: -T.pushup_bend_max, max: T.pushup_bend_max, high: "anca alta", low: "anca bassa", zero: "retta" },
        text: (v) => `Corpo non in linea (${Math.round(v)}°)`, cue: "Sali tutto in un blocco, addominali stretti" },
    ],
    score: (v, errors) => (errors.length ? 2 : 3),
  },

  rotary_stability: {
    id: "rotary_stability", name: "Rotary stability", view: "side", start: "floor", bilateral: true,
    tool: "un tappetino",
    intro: ["Telefono di lato, basso, a 2–3 m; il lato che lavora è verso il telefono.",
            "A quattro zampe: mani sotto le spalle, ginocchia sotto le anche.",
            "Allunga braccio e gamba dello stesso lato, poi porta gomito e ginocchio a toccarsi. 3 volte."],
    texts: { getReady: "Mettiti a quattro zampe di lato rispetto al telefono", holdStill: "Stai fermo..." },
    needs: (s) => [`shoulder_${L(s)}`, `elbow_${L(s)}`, `wrist_${L(s)}`, `hip_${L(s)}`, `knee_${L(s)}`, `ankle_${L(s)}`],
    calibrate: (c, s) => ({ reach: G.dist(c.kp[`wrist_${L(s)}`], c.kp[`ankle_${L(s)}`]) / c.torso }),
    // reach above the smallest reach seen so far (= the four-point position)
    signal: (k, c, s) => {
      const reach = G.dist(k[`wrist_${L(s)}`], k[`ankle_${L(s)}`]) / c.torso;
      c.start.reach = Math.min(c.start.reach, reach);
      return (reach - c.start.reach) / 0.6;
    },
    measures: (k, c, s) => ({
      reach: G.dist(k[`wrist_${L(s)}`], k[`ankle_${L(s)}`]) / c.torso,
      touch: G.dist(k[`elbow_${L(s)}`], k[`knee_${L(s)}`]) / c.torso,
      // leg on the camera side stretched? (hip-ankle distance / leg length). In the
      // diagonal pattern (FMS score 2) the arm on this side moves with the OTHER leg,
      // so this leg stays bent on the floor.
      leg: G.dist(k[`hip_${L(s)}`], k[`ankle_${L(s)}`]) / c.leg,
    }),
    aggregate: { reach: "max", touch: "min", leg: "max" },
    rules: [
      { key: "leg", min: T.rotary_leg_min, part: "legs", name: "Gamba allungata (anca–caviglia / gamba)", fmt: X2,
        text: () => "Hai usato braccio e gamba opposti (schema diagonale)", cue: "Allunga braccio e gamba dello stesso lato" },
      { key: "reach", min: T.rotary_reach_min, part: "arm", name: "Allungo polso–caviglia (in busti)", fmt: X2,
        text: () => "Braccio e gamba non del tutto allungati", cue: "Allunga di più braccio e gamba" },
      { key: "touch", max: T.rotary_touch_max, part: "legs", name: "Distanza gomito–ginocchio (in busti)", fmt: X2,
        text: () => "Gomito e ginocchio non si toccano", cue: "Porta gomito e ginocchio a toccarsi" },
    ],
    score: (v, errors) => (errors.length === 0 ? 3 : errors.length === 1 ? 2 : 1),
  },
};

// Angle of the tested leg above the other (floor) leg, degrees, in the image.
function legLift(k, c, s) {
  const up = Math.atan2(-(k[`ankle_${L(s)}`].y - k[`hip_${L(s)}`].y), Math.abs(k[`ankle_${L(s)}`].x - k[`hip_${L(s)}`].x));
  const down = Math.atan2(-(k[`ankle_${O(s)}`].y - k[`hip_${O(s)}`].y), Math.abs(k[`ankle_${O(s)}`].x - k[`hip_${O(s)}`].x));
  return G.deg(up - down);
}

// Hand length: 10.5% of the stature if known, else 0.69 forearm lengths (subjects e, m, l).
export function handLength(c) {
  return Number.isFinite(c.pxPerCm) ? 0.105 * (c.kp.ankle_l.y - c.kp.nose.y) / 0.87 : 0.69 * c.forearm;
}

// Signed angle of the hip off the shoulder-ankle line, degrees: + above the line
// (hips raised, piking), - below it (hips sagging).
function bodyLine(sh, hip, ank) {
  const bend = 180 - G.angle3(sh, hip, ank);
  const yLine = sh.y + ((ank.y - sh.y) * (hip.x - sh.x)) / ((ank.x - sh.x) || 1e-6);
  return hip.y < yLine ? bend : -bend;
}

// Order of the assessment (FMS order).

export const ASSESSMENT_ORDER = ["deep_squat", "hurdle_step", "inline_lunge", "shoulder_mobility",
                                 "aslr", "trunk_pushup", "rotary_stability"];
