// Small SVG charts (no library): the set summary and the history.
//
// Set summary, after the rep-timing panels of J. Park's vision-demos (chin_ups,
// push_ups, pull_ups): the movement signal over the whole set with every rep
// marked, and one dot per rep for the time of the way up, with the fastest and
// the slowest named and how much slower the slowest was.
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

// ---------------------------------------------------------------- set: time of the way up per rep
// up: seconds per rep, ok: [bool]. Returns the verdict lines (also drawn under the chart).
export function tempoChart(container, up, ok) {
  container.innerHTML = "";
  const n = up.length;
  if (!n) return [];
  const W = Math.max(container.clientWidth, 280), H = 170, m = { l: 40, r: 14, t: 14, b: 26 };
  const vmax = Math.max(...up) * 1.15 || 1;
  const x = (i) => m.l + (n === 1 ? (W - m.l - m.r) / 2 : (i * (W - m.l - m.r)) / (n - 1));
  const y = (v) => m.t + (1 - v / vmax) * (H - m.t - m.b);
  const { svg, el } = svgIn(container, W, H, "Tempo di risalita di ogni ripetizione");
  for (const g of [0, vmax / 2]) {
    el("line", { x1: m.l, x2: W - m.r, y1: y(g), y2: y(g), stroke: "var(--grid)", "stroke-width": 1 });
    el("text", { x: m.l - 8, y: y(g) + 4, "text-anchor": "end", ...muted }, `${g.toFixed(1)} s`);
  }
  if (n > 1) el("polyline", { points: up.map((v, i) => `${x(i)},${y(v)}`).join(" "), fill: "none",
                              stroke: "var(--series-1)", "stroke-width": 2, opacity: 0.5 });
  const dots = up.map((v, i) => el("circle", {
    cx: x(i), cy: y(v), r: 6, "stroke-width": 2.5,
    fill: ok[i] ? "var(--good)" : "var(--surface)", stroke: ok[i] ? "var(--surface)" : "var(--bad)" }));
  for (let i = 0; i < n; i++)
    el("text", { x: x(i), y: H - 8, "text-anchor": "middle", ...muted }, String(i + 1));
  const tip = tooltip(container);
  svg.addEventListener("pointermove", (ev) => {
    const r = svg.getBoundingClientRect(), px = ((ev.clientX - r.left) / r.width) * W;
    let b = 0;
    for (let i = 0; i < n; i++) if (Math.abs(x(i) - px) < Math.abs(x(b) - px)) b = i;
    dots.forEach((d, i) => d.setAttribute("r", i === b ? 8 : 6));
    tip.hidden = false;
    tip.innerHTML = `Rip. ${b + 1}: <b>${up[b].toFixed(2)} s</b> · ${ok[b] ? "corretta" : "da correggere"}`;
    tip.style.left = `${(x(b) / W) * 100}%`;
    tip.style.top = `${(y(up[b]) / H) * 100}%`;
  });
  svg.addEventListener("pointerleave", () => { tip.hidden = true; dots.forEach((d) => d.setAttribute("r", 6)); });
  return tempoVerdict(up);
}

// "Più veloce: rip. 2 (0,84 s) · più lenta: rip. 7 (1,21 s) · +44%"
export function tempoVerdict(up) {
  if (!up.length) return [];
  let f = 0, s = 0;
  up.forEach((v, i) => { if (v < up[f]) f = i; if (v > up[s]) s = i; });
  const fmt = (v) => `${v.toFixed(2).replace(".", ",")} s`;
  const out = [`Più veloce: rip. ${f + 1} (${fmt(up[f])})`];
  if (up.length === 1 || up[s] - up[f] < 0.01) return out.concat("ritmo costante in tutta la serie");
  out.push(`Più lenta: rip. ${s + 1} (${fmt(up[s])})`);
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
