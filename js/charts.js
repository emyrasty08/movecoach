// Small SVG charts (no library): the set summary and the history.
//
// Set summary, after the panels of J. Park's vision-demos (chin_ups, push_ups,
// pull_ups): the movement signal over the whole set with every rep marked, one
// chart per form metric with its allowed band (as the push-up body line), and
// the phases of every rep with the fastest / slowest way up.
// Colors are CSS variables of style.css: one series color, status good/bad only
// for correct / faulty reps (always with the shape too: filled = correct, ring = faulty).

const NS = "http://www.w3.org/2000/svg";

function svgIn(container, W, H, label) {
  const svg = document.createElementNS(NS, "svg");
  svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
  svg.setAttribute("role", "img");
  svg.setAttribute("aria-label", label);
  container.appendChild(svg);
  const el = (name, attrs, text, parent = svg) => {
    const e = document.createElementNS(NS, name);
    for (const [k, v] of Object.entries(attrs)) {
      // CSS variables only work through style, not through presentation attributes
      if (typeof v === "string" && v.startsWith("var(")) e.style.setProperty(k, v);
      else e.setAttribute(k, v);
    }
    if (text !== undefined) e.textContent = text;
    parent.appendChild(e);
    return e;
  };
  return { svg, el };
}

function tooltip(container) {
  const tip = document.createElement("div");
  tip.className = "tip";
  tip.hidden = true;
  container.appendChild(tip);
  return tip;
}

const muted = { fill: "var(--muted)", "font-size": 11 };

// ---------------------------------------------------------------- set: movement over time
// trace: [{t ms, s}] (s = rep signal, 0 standing, 1 = deep enough to count);
// reps: [{t0, t1, ok}] in ms.
export function setTraceChart(container, trace, reps) {
  container.innerHTML = "";
  if (trace.length < 2) return;
  const W = Math.max(container.clientWidth, 280), H = 170, m = { l: 12, r: 12, t: 18, b: 22 };
  const t0 = trace[0].t, T = trace[trace.length - 1].t - t0 || 1;
  const smax = Math.max(1.3, ...trace.map((p) => p.s));
  const x = (t) => m.l + ((t - t0) / T) * (W - m.l - m.r);
  const y = (s) => m.t + (1 - Math.max(s, 0) / smax) * (H - m.t - m.b);
  const { svg, el } = svgIn(container, W, H, "Andamento del movimento nella serie, con le ripetizioni");
  for (const [i, r] of reps.entries()) {
    el("rect", { x: x(r.t0), y: m.t, width: Math.max(x(r.t1) - x(r.t0), 2), height: H - m.t - m.b,
                 fill: r.ok ? "var(--good)" : "var(--bad)", opacity: 0.13, rx: 4 });
    el("text", { x: (x(r.t0) + x(r.t1)) / 2, y: m.t - 5, "text-anchor": "middle", "font-size": 11,
                 fill: "var(--text-2)", "font-weight": 700 }, String(i + 1));
  }
  el("line", { x1: m.l, x2: W - m.r, y1: y(0), y2: y(0), stroke: "var(--grid)", "stroke-width": 1 });
  el("line", { x1: m.l, x2: W - m.r, y1: y(1), y2: y(1), stroke: "var(--muted)", "stroke-width": 1,
               "stroke-dasharray": "4 4" });
  el("text", { x: W - m.r, y: y(1) - 4, "text-anchor": "end", ...muted }, "soglia ripetizione");
  el("polyline", { points: trace.map((p) => `${x(p.t).toFixed(1)},${y(p.s).toFixed(1)}`).join(" "), fill: "none",
                   stroke: "var(--series-1)", "stroke-width": 2, "stroke-linejoin": "round" });
  el("text", { x: m.l, y: H - 6, ...muted }, "0 s");
  el("text", { x: W - m.r, y: H - 6, "text-anchor": "end", ...muted }, `${Math.round(T / 1000)} s`);
  return svg;
}

// ---------------------------------------------------------------- set: one form metric over time
// As the body-line panel of J. Park's push_ups demo: the metric frame by frame,
// the allowed band, the limit dashed, every rep shaded green / red for THIS rule.
// trace: [{t, m}] ; reps: [{t0, t1, bad}] ; spec: {key, name, min, max, fmt, high, low, zero}
export function ruleChart(container, trace, reps, spec) {
  container.innerHTML = "";
  const pts = trace.filter((p) => Number.isFinite(p.m?.[spec.key]));
  if (pts.length < 2) return;
  const W = Math.max(container.clientWidth, 280), H = 150, m = { l: 46, r: 12, t: 16, b: 22 };
  const vals = pts.map((p) => p.m[spec.key]);
  const lims = [spec.min, spec.max].filter((v) => v !== undefined);
  let lo = Math.min(...vals, ...lims), hi = Math.max(...vals, ...lims);
  const pad = (hi - lo) * 0.1 || 1;
  lo -= pad; hi += pad;
  const t0 = trace[0].t, T = trace[trace.length - 1].t - t0 || 1;
  const x = (t) => m.l + ((t - t0) / T) * (W - m.l - m.r);
  const y = (v) => m.t + (1 - (v - lo) / (hi - lo)) * (H - m.t - m.b);
  const { svg, el } = svgIn(container, W, H, `Andamento: ${spec.name}`);
  for (const r of reps)
    el("rect", { x: x(r.t0), y: m.t, width: Math.max(x(r.t1) - x(r.t0), 2), height: H - m.t - m.b,
                 fill: r.bad ? "var(--bad)" : "var(--good)", opacity: 0.12, rx: 4 });
  // outside the limits: faint red
  if (spec.max !== undefined) el("rect", { x: m.l, y: m.t, width: W - m.l - m.r, height: Math.max(y(spec.max) - m.t, 0),
                                           fill: "var(--bad)", opacity: 0.07 });
  if (spec.min !== undefined) el("rect", { x: m.l, y: y(spec.min), width: W - m.l - m.r, height: Math.max(H - m.b - y(spec.min), 0),
                                           fill: "var(--bad)", opacity: 0.07 });
  if (spec.zero && lo < 0 && hi > 0) {
    el("line", { x1: m.l, x2: W - m.r, y1: y(0), y2: y(0), stroke: "var(--text-2)", "stroke-width": 1 });
    el("text", { x: m.l - 6, y: y(0) + 4, "text-anchor": "end", ...muted }, spec.zero);
  }
  for (const v of lims) {
    el("line", { x1: m.l, x2: W - m.r, y1: y(v), y2: y(v), stroke: "var(--muted)", "stroke-width": 1, "stroke-dasharray": "4 4" });
    el("text", { x: m.l - 6, y: y(v) + 4, "text-anchor": "end", ...muted }, spec.fmt(v));
  }
  if (spec.high) el("text", { x: W - m.r, y: m.t + 10, "text-anchor": "end", ...muted }, spec.high);
  if (spec.low) el("text", { x: W - m.r, y: H - m.b - 4, "text-anchor": "end", ...muted }, spec.low);
  // the line breaks where the metric is missing (person not seen)
  let seg = [], prev = null;
  const flush = () => {
    if (seg.length > 1) el("polyline", { points: seg.join(" "), fill: "none", stroke: "var(--series-1)",
                                         "stroke-width": 2, "stroke-linejoin": "round" });
    seg = [];
  };
  for (const p of pts) {
    if (prev && p.t - prev.t > 300) flush();
    seg.push(`${x(p.t).toFixed(1)},${y(p.m[spec.key]).toFixed(1)}`);
    prev = p;
  }
  flush();
  el("text", { x: m.l, y: H - 6, ...muted }, "0 s");
  el("text", { x: W - m.r, y: H - 6, "text-anchor": "end", ...muted }, `${Math.round(T / 1000)} s`);
  const cross = el("line", { y1: m.t, y2: H - m.b, stroke: "var(--text-2)", "stroke-width": 1, opacity: 0 });
  const tip = tooltip(container);
  const onMove = (ev) => {
    const r = svg.getBoundingClientRect(), px = ((ev.clientX - r.left) / r.width) * W;
    let b = 0;
    pts.forEach((p, i) => { if (Math.abs(x(p.t) - px) < Math.abs(x(pts[b].t) - px)) b = i; });
    const p = pts[b];
    cross.setAttribute("x1", x(p.t)); cross.setAttribute("x2", x(p.t)); cross.setAttribute("opacity", 0.6);
    tip.hidden = false;
    tip.innerHTML = `<b>${spec.fmt(p.m[spec.key])}</b> · ${((p.t - t0) / 1000).toFixed(1).replace(".", ",")} s`;
    tip.style.left = `${(x(p.t) / W) * 100}%`;
    tip.style.top = `${(y(p.m[spec.key]) / H) * 100}%`;
  };
  svg.addEventListener("pointermove", onMove);
  svg.addEventListener("pointerdown", onMove);
  svg.addEventListener("pointerleave", () => { tip.hidden = true; cross.setAttribute("opacity", 0); });
  return svg;
}

// ---------------------------------------------------------------- set: phases of every rep
// One stacked bar per rep: way down, hold at the bottom, way up (the concentric,
// timed as in J. Park's demos). A dot on top: filled = correct, ring = faulty.
// phases: [{down, hold, up}] s ; ok: [bool]. Returns the verdict lines.
export function phasesChart(container, phases, ok) {
  container.innerHTML = "";
  const n = phases.length;
  if (!n) return [];
  const W = Math.max(container.clientWidth, 280), H = 170, m = { l: 40, r: 12, t: 18, b: 24 };
  const tot = phases.map((p) => p.down + p.hold + p.up);
  const vmax = Math.max(...tot) * 1.12 || 1;
  const slot = (W - m.l - m.r) / n, bw = Math.min(slot * 0.6, 34);
  const cx = (i) => m.l + slot * (i + 0.5);
  const y = (v) => m.t + (1 - v / vmax) * (H - m.t - m.b);
  const { svg, el } = svgIn(container, W, H, "Discesa, fermo e risalita di ogni ripetizione");
  for (const g of [0, vmax / 2]) {
    el("line", { x1: m.l, x2: W - m.r, y1: y(g), y2: y(g), stroke: "var(--grid)", "stroke-width": 1 });
    el("text", { x: m.l - 8, y: y(g) + 4, "text-anchor": "end", ...muted }, `${g.toFixed(1)} s`);
  }
  // way down light, hold grey, way up full: the part that matters is the strongest
  const PARTS = [["down", "var(--series-1)", 0.4], ["hold", "var(--text-2)", 0.45], ["up", "var(--series-1)", 1]];
  phases.forEach((p, i) => {
    let base = 0;
    for (const [k, fill, op] of PARTS) {
      if (p[k] > 0) el("rect", { x: cx(i) - bw / 2, y: y(base + p[k]), width: bw,
                                 height: Math.max(y(base) - y(base + p[k]) - 1, 0.5), fill, opacity: op, rx: 2 });
      base += p[k];
    }
    el("circle", { cx: cx(i), cy: y(base) - 8, r: 4.5, "stroke-width": 2,
                   fill: ok[i] ? "var(--good)" : "var(--surface)", stroke: ok[i] ? "var(--surface)" : "var(--bad)" });
    el("text", { x: cx(i), y: H - 7, "text-anchor": "middle", ...muted }, String(i + 1));
  });
  const tip = tooltip(container);
  const f = (v) => `${v.toFixed(2).replace(".", ",")} s`;
  const onMove = (ev) => {
    const r = svg.getBoundingClientRect(), px = ((ev.clientX - r.left) / r.width) * W;
    const b = Math.max(0, Math.min(n - 1, Math.floor((px - m.l) / slot)));
    const p = phases[b];
    tip.hidden = false;
    tip.innerHTML = `Rip. ${b + 1} · ${ok[b] ? "corretta" : "da correggere"}<br>discesa ${f(p.down)} · fermo ${f(p.hold)} · <b>risalita ${f(p.up)}</b>`;
    tip.style.left = `${(cx(b) / W) * 100}%`;
    tip.style.top = `${(y(tot[b]) / H) * 100}%`;
  };
  svg.addEventListener("pointermove", onMove);
  svg.addEventListener("pointerdown", onMove);
  svg.addEventListener("pointerleave", () => { tip.hidden = true; });
  const avg = (k) => phases.reduce((a, p) => a + p[k], 0) / n;
  return tempoVerdict(phases.map((p) => p.up))
    .concat(`in media: discesa ${f(avg("down"))} · fermo ${f(avg("hold"))} · risalita ${f(avg("up"))}`);
}

// "Risalita più veloce: rip. 2 (0,84 s) · più lenta: rip. 7 (1,21 s) · +44%"
export function tempoVerdict(up) {
  if (!up.length) return [];
  let f = 0, s = 0;
  up.forEach((v, i) => { if (v < up[f]) f = i; if (v > up[s]) s = i; });
  const fmt = (v) => `${v.toFixed(2).replace(".", ",")} s`;
  const out = [`Risalita più veloce: rip. ${f + 1} (${fmt(up[f])})`];
  if (up.length === 1 || up[s] - up[f] < 0.01) return out.concat("ritmo costante in tutta la serie");
  out.push(`più lenta: rip. ${s + 1} (${fmt(up[s])})`);
  out.push(`la più lenta ha impiegato il ${Math.round(((up[s] - up[f]) / up[f]) * 100)}% in più`);
  return out;
}

// ---------------------------------------------------------------- history: one value per set over time
// points: [{date, v, tip}] ; v in 0..vmax ; unit appended to the axis labels.
export function historyChart(container, points, { vmax = 100, unit = "%", label }) {
  container.innerHTML = "";
  if (!points.length) {
    container.innerHTML = `<div class="empty">Ancora nessuna serie di questo esercizio.</div>`;
    return;
  }
  const data = points.slice(-20);
  const W = Math.max(container.clientWidth, 280), H = 210, m = { l: 40, r: 14, t: 26, b: 28 };
  const iw = W - m.l - m.r, ih = H - m.t - m.b;
  const x = (i) => m.l + (data.length === 1 ? iw / 2 : (i * iw) / (data.length - 1));
  const y = (v) => m.t + ih - (v / vmax) * ih;
  const { svg, el } = svgIn(container, W, H, label);
  const fmtD = (iso) => { const d = new Date(iso); return `${d.getDate()}/${d.getMonth() + 1}`; };
  for (const g of [0, vmax / 2, vmax]) {
    el("line", { x1: m.l, x2: W - m.r, y1: y(g), y2: y(g), stroke: "var(--grid)", "stroke-width": 1 });
    el("text", { x: m.l - 8, y: y(g) + 4, "text-anchor": "end", ...muted }, `${g}${unit}`);
  }
  el("text", { x: x(0), y: H - 8, "text-anchor": data.length === 1 ? "middle" : "start", ...muted }, fmtD(data[0].date));
  if (data.length > 1)
    el("text", { x: x(data.length - 1), y: H - 8, "text-anchor": "end", ...muted }, fmtD(data[data.length - 1].date));
  const cross = el("line", { y1: m.t, y2: m.t + ih, stroke: "var(--text-2)", "stroke-width": 1, opacity: 0 });
  el("polyline", { points: data.map((p, i) => `${x(i)},${y(p.v)}`).join(" "), fill: "none",
                   stroke: "var(--series-1)", "stroke-width": 2, "stroke-linejoin": "round" });
  const dots = data.map((p, i) => el("circle", { cx: x(i), cy: y(p.v), r: 5, fill: "var(--series-1)",
                                                 stroke: "var(--surface)", "stroke-width": 2 }));
  const last = data[data.length - 1];
  el("text", { x: x(data.length - 1) - 8, y: y(last.v) - 10, "text-anchor": "end", fill: "var(--text)",
               "font-size": 12, "font-weight": 700 }, `${last.v}${unit}`);
  const tip = tooltip(container);
  const onMove = (ev) => {
    const r = svg.getBoundingClientRect(), px = ((ev.clientX - r.left) / r.width) * W;
    let b = 0;
    data.forEach((_, i) => { if (Math.abs(x(i) - px) < Math.abs(x(b) - px)) b = i; });
    cross.setAttribute("x1", x(b)); cross.setAttribute("x2", x(b)); cross.setAttribute("opacity", 0.6);
    dots.forEach((d, i) => d.setAttribute("r", i === b ? 7 : 5));
    tip.hidden = false;
    tip.innerHTML = data[b].tip;
    tip.style.left = `${(x(b) / W) * 100}%`;
    tip.style.top = `${(y(data[b].v) / H) * 100}%`;
  };
  svg.addEventListener("pointermove", onMove);
  svg.addEventListener("pointerdown", onMove);
  svg.addEventListener("pointerleave", () => { tip.hidden = true; cross.setAttribute("opacity", 0);
                                                dots.forEach((d) => d.setAttribute("r", 5)); });
}
