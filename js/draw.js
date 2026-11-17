// Skeleton drawing on a 2D canvas.

export const COL = {
  ok: "#3ddc84",
  bad: "#ff4d4d",
  fix: "#22d3ee",
  ghost: "rgba(40,40,40,0.85)",
  neutral: "rgba(255,255,255,0.9)",
};

// [from, to, tag]  (tag = part that can be flagged red)
export const SIDE_EDGES = [
  ["ear", "shoulder", "head"], ["shoulder", "elbow", "arm"], ["elbow", "wrist", "arm"],
  ["shoulder", "hip", "trunk"], ["hip", "knee", "thigh"], ["knee", "ankle", "shin"],
  ["ankle", "heel", "foot"], ["heel", "toe", "foot"], ["ankle", "toe", "foot"],
];
export const FRONT_EDGES = [
  ["shoulder_l", "shoulder_r", "trunk"], ["shoulder_l", "hip_l", "trunk"], ["shoulder_r", "hip_r", "trunk"],
  ["hip_l", "hip_r", "pelvis"],
  ["shoulder_l", "elbow_l", "arm"], ["elbow_l", "wrist_l", "arm"],
  ["shoulder_r", "elbow_r", "arm"], ["elbow_r", "wrist_r", "arm"],
  ["hip_l", "knee_l", "legs"], ["knee_l", "ankle_l", "legs"],
  ["hip_r", "knee_r", "legs"], ["knee_r", "ankle_r", "legs"],
  ["ankle_l", "heel_l", "foot"], ["heel_l", "toe_l", "foot"],
  ["ankle_r", "heel_r", "foot"], ["heel_r", "toe_r", "foot"],
];

const ok = (p) => p && Number.isFinite(p.x) && Number.isFinite(p.y);

// colorOf(tag) -> css color. lw in px of the canvas.
export function drawSkeleton(ctx, pts, edges, colorOf, lw) {
  ctx.save();
  ctx.lineCap = "round";
  ctx.lineWidth = lw;
  const dots = new Map();
  for (const [a, b, tag] of edges) {
    const pa = pts[a], pb = pts[b];
    if (!ok(pa) || !ok(pb)) continue;
    const c = colorOf(tag);
    ctx.strokeStyle = c;
    ctx.beginPath();
    ctx.moveTo(pa.x, pa.y);
    ctx.lineTo(pb.x, pb.y);
    ctx.stroke();
    dots.set(a, dots.get(a) === COL.bad ? COL.bad : c);
    dots.set(b, dots.get(b) === COL.bad ? COL.bad : c);
  }
  for (const [n, c] of dots) {
    ctx.fillStyle = c;
    ctx.beginPath();
    ctx.arc(pts[n].x, pts[n].y, lw * 0.9, 0, 2 * Math.PI);
    ctx.fill();
  }
  ctx.restore();
}

// Text with a dark outline, readable on any background.
export function tag(ctx, text, x, y, color, size) {
  ctx.save();
  ctx.font = `700 ${size}px system-ui, -apple-system, sans-serif`;
  ctx.lineJoin = "round";
  ctx.lineWidth = size / 4;
  ctx.strokeStyle = "rgba(0,0,0,0.85)";
  ctx.strokeText(text, x, y);
  ctx.fillStyle = color;
  ctx.fillText(text, x, y);
  ctx.restore();
}

const deg = (r) => (r * 180) / Math.PI;
function angle3(a, b, c) {
  const u = { x: a.x - b.x, y: a.y - b.y }, v = { x: c.x - b.x, y: c.y - b.y };
  const cos = (u.x * v.x + u.y * v.y) / (Math.hypot(u.x, u.y) * Math.hypot(v.x, v.y));
  return deg(Math.acos(Math.max(-1, Math.min(1, cos))));
}

// Angle labels: side view knee / thigh / trunk, front view the two knees.
// badTags: parts in red -> their label red too.
export function angleLabels(ctx, pts, view, f, color, badTags, size) {
  const col = (t) => (badTags.has(t) ? COL.bad : color);
  const off = size * 0.8;
  if (view === "side") {
    if (![pts.hip, pts.knee, pts.ankle].every(ok)) return;
    tag(ctx, `${Math.round(angle3(pts.hip, pts.knee, pts.ankle))}°`, pts.knee.x + off, pts.knee.y, col("shin"), size);
    const th = { x: pts.hip.x - pts.knee.x, y: pts.hip.y - pts.knee.y };
    const ta = Math.round(deg(Math.atan2(-th.y, Math.abs(th.x))));
    tag(ctx, `coscia ${ta > 0 ? "+" : ""}${ta}°`, (pts.hip.x + pts.knee.x) / 2 + off,
        (pts.hip.y + pts.knee.y) / 2 + size * 1.4, col("thigh"), size);
    if (ok(pts.shoulder)) {
      const tr = { x: pts.shoulder.x - pts.hip.x, y: pts.shoulder.y - pts.hip.y };
      const la = Math.round(deg(Math.atan2(f * tr.x, -tr.y)));
      tag(ctx, `busto ${la}°`, (pts.shoulder.x + pts.hip.x) / 2 + off, (pts.shoulder.y + pts.hip.y) / 2,
          col("trunk"), size);
    }
  } else {
    // front: knee distance / ankle distance (< 0.8 = knees caving in), one label under the knees
    const kl = pts.knee_l, kr = pts.knee_r, al = pts.ankle_l, ar = pts.ankle_r;
    if ([kl, kr, al, ar].every(ok)) {
      const r = Math.abs(kl.x - kr.x) / Math.max(Math.abs(al.x - ar.x), 1);
      ctx.save(); ctx.textAlign = "center";
      tag(ctx, `ginocchia/caviglie ${r.toFixed(2)}`, (kl.x + kr.x) / 2, Math.max(kl.y, kr.y) + size * 1.6,
          col("legs"), size);
      ctx.restore();
    }
  }
}

// ---------------------------------------------------------------- mannequin
// A body-shaped "coach" drawn from the same keypoints: tapered capsules for the
// limbs, a trunk, head and feet. Painted opaque on a scratch layer and then
// composited once with alpha, so overlapping parts do not get darker.
let layer = null;
function scratch(w, h) {
  if (!layer) layer = document.createElement("canvas");
  if (layer.width !== w || layer.height !== h) { layer.width = w; layer.height = h; }
  const c = layer.getContext("2d");
  c.setTransform(1, 0, 0, 1, 0, 0);
  c.clearRect(0, 0, w, h);
  return c;
}

// capsule from a (width wa) to b (width wb)
function capsule(c, a, b, wa, wb) {
  if (!ok(a) || !ok(b)) return;
  const dx = b.x - a.x, dy = b.y - a.y, L = Math.hypot(dx, dy) || 1;
  const nx = -dy / L, ny = dx / L;
  c.beginPath();
  c.moveTo(a.x + nx * wa / 2, a.y + ny * wa / 2);
  c.lineTo(b.x + nx * wb / 2, b.y + ny * wb / 2);
  c.lineTo(b.x - nx * wb / 2, b.y - ny * wb / 2);
  c.lineTo(a.x - nx * wa / 2, a.y - ny * wa / 2);
  c.closePath();
  c.fill();
  c.beginPath(); c.arc(a.x, a.y, wa / 2, 0, 2 * Math.PI); c.fill();
  c.beginPath(); c.arc(b.x, b.y, wb / 2, 0, 2 * Math.PI); c.fill();
}
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const lerp = (a, b, t) => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });

// pts in the coordinates of ctx's current transform; color css; alpha 0..1
export function drawMannequin(ctx, pts, view, color, alpha = 0.55) {
  const T = ctx.getTransform();
  const c = scratch(ctx.canvas.width, ctx.canvas.height);
  c.setTransform(T);
  c.fillStyle = color;
  if (view === "side") {
    const { ear, shoulder, elbow, wrist, hip, knee, ankle, heel, toe } = pts;
    if (![shoulder, hip, knee, ankle].every(ok)) return;
    const u = dist(shoulder, hip);                       // trunk length = body scale
    capsule(c, hip, knee, 0.46 * u, 0.27 * u);           // thigh
    capsule(c, knee, ankle, 0.26 * u, 0.14 * u);         // shin
    if (ok(toe)) capsule(c, ok(heel) ? heel : ankle, toe, 0.13 * u, 0.1 * u);   // foot
    capsule(c, lerp(hip, shoulder, -0.08), lerp(hip, shoulder, 0.92), 0.55 * u, 0.48 * u);   // trunk
    const head = ok(ear) ? lerp(shoulder, ear, 1.1) : lerp(hip, shoulder, 1.45);
    capsule(c, shoulder, lerp(shoulder, head, 0.6), 0.16 * u, 0.16 * u);                    // neck
    c.beginPath(); c.arc(head.x, head.y, 0.24 * u, 0, 2 * Math.PI); c.fill();
    if (ok(elbow)) capsule(c, shoulder, elbow, 0.19 * u, 0.15 * u);
    if (ok(elbow) && ok(wrist)) capsule(c, elbow, wrist, 0.15 * u, 0.11 * u);
  } else {
    const g = (n) => pts[n];
    const shL = g("shoulder_l"), shR = g("shoulder_r"), hpL = g("hip_l"), hpR = g("hip_r");
    if (![shL, shR, hpL, hpR].every(ok)) return;
    const shM = lerp(shL, shR, 0.5), hpM = lerp(hpL, hpR, 0.5), u = dist(shM, hpM);
    // trunk: quad shoulders -> hips, rounded by capsules on its sides
    c.beginPath();
    c.moveTo(shL.x, shL.y); c.lineTo(shR.x, shR.y); c.lineTo(hpR.x, hpR.y); c.lineTo(hpL.x, hpL.y);
    c.closePath(); c.fill();
    capsule(c, shL, hpL, 0.22 * u, 0.26 * u);
    capsule(c, shR, hpR, 0.22 * u, 0.26 * u);
    capsule(c, hpL, hpR, 0.3 * u, 0.3 * u);
    for (const s of ["l", "r"]) {
      capsule(c, g(`hip_${s}`), g(`knee_${s}`), 0.36 * u, 0.22 * u);
      capsule(c, g(`knee_${s}`), g(`ankle_${s}`), 0.21 * u, 0.12 * u);
      if (ok(g(`toe_${s}`))) capsule(c, g(`ankle_${s}`), g(`toe_${s}`), 0.12 * u, 0.1 * u);
      capsule(c, g(`shoulder_${s}`), g(`elbow_${s}`), 0.17 * u, 0.13 * u);
      capsule(c, g(`elbow_${s}`), g(`wrist_${s}`), 0.13 * u, 0.1 * u);
    }
    const head = ok(g("nose")) ? lerp(shM, g("nose"), 1.05) : lerp(hpM, shM, 1.4);
    capsule(c, shM, lerp(shM, head, 0.6), 0.18 * u, 0.18 * u);
    c.beginPath(); c.arc(head.x, head.y, 0.24 * u, 0, 2 * Math.PI); c.fill();
  }
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalAlpha = alpha;
  ctx.drawImage(layer, 0, 0);
  ctx.restore();
}
