// Session history: kept in this phone's localStorage (no account, no server).
import { RULES_SIDE, RULES_FRONT } from "./coach.js";

const KEY = "squatcoach.sessions.v1";
const R = { ...RULES_SIDE, ...RULES_FRONT };

export function loadSessions() {
  try { return JSON.parse(localStorage.getItem(KEY)) || []; } catch { return []; }
}
export function saveSession(s) {
  const all = loadSessions();
  all.push(s);
  try { localStorage.setItem(KEY, JSON.stringify(all.slice(-200))); } catch {}
}
export function clearSessions() {
  try { localStorage.removeItem(KEY); } catch {}
}

const fmtDate = (iso, withTime) => {
  const d = new Date(iso);
  const dd = `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}`;
  return withTime ? `${dd} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}` : dd;
};
const topError = (s) => Object.entries(s.errors || {}).sort((a, b) => b[1] - a[1])[0];

// Line chart: % correct reps per session (last 20), crosshair + tooltip on hover/touch.
export function renderHistory(chartEl, listEl, sessions) {
  chartEl.innerHTML = "";
  listEl.innerHTML = "";
  if (!sessions.length) {
    chartEl.innerHTML = `<div class="empty">Ancora nessuna sessione: fai una serie e la trovi qui.</div>`;
    return;
  }
  const data = sessions.slice(-20);
  const W = Math.max(chartEl.clientWidth, 280), H = 210;
  const m = { l: 40, r: 14, t: 12, b: 28 };
  const iw = W - m.l - m.r, ih = H - m.t - m.b;
  const x = (i) => m.l + (data.length === 1 ? iw / 2 : (i * iw) / (data.length - 1));
  const y = (v) => m.t + ih - (v / 100) * ih;
  const ns = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(ns, "svg");
  svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
  svg.setAttribute("role", "img");
  svg.setAttribute("aria-label", "Percentuale di ripetizioni corrette per sessione");
  const el = (name, attrs, text) => {
    const e = document.createElementNS(ns, name);
    for (const [k, v] of Object.entries(attrs)) {
      // CSS variables only work through style, not through presentation attributes
      if (typeof v === "string" && v.startsWith("var(")) e.style.setProperty(k, v);
      else e.setAttribute(k, v);
    }
    if (text !== undefined) e.textContent = text;
    svg.appendChild(e);
    return e;
  };
  for (const g of [0, 50, 100]) {
    el("line", { x1: m.l, x2: W - m.r, y1: y(g), y2: y(g), stroke: "var(--grid)", "stroke-width": 1 });
    el("text", { x: m.l - 8, y: y(g) + 4, "text-anchor": "end", fill: "var(--muted)", "font-size": 11 }, `${g}%`);
  }
  el("text", { x: x(0), y: H - 8, "text-anchor": data.length === 1 ? "middle" : "start", fill: "var(--muted)",
               "font-size": 11 }, fmtDate(data[0].date));
  if (data.length > 1)
    el("text", { x: x(data.length - 1), y: H - 8, "text-anchor": "end", fill: "var(--muted)", "font-size": 11 },
       fmtDate(data[data.length - 1].date));
  const cross = el("line", { y1: m.t, y2: m.t + ih, stroke: "var(--text-2)", "stroke-width": 1, opacity: 0 });
  el("polyline", { points: data.map((s, i) => `${x(i)},${y(s.pct)}`).join(" "), fill: "none",
                   stroke: "var(--series-1)", "stroke-width": 2, "stroke-linejoin": "round" });
  const dots = data.map((s, i) => el("circle", { cx: x(i), cy: y(s.pct), r: 5, fill: "var(--series-1)",
                                                 stroke: "var(--surface)", "stroke-width": 2 }));
  // direct label on the latest value only
  const last = data[data.length - 1];
  el("text", { x: x(data.length - 1) - 8, y: y(last.pct) - 10, "text-anchor": "end", fill: "var(--text)",
               "font-size": 12, "font-weight": 700 }, `${last.pct}%`);
  chartEl.appendChild(svg);

  const tip = document.createElement("div");
  tip.className = "tip";
  tip.hidden = true;
  chartEl.appendChild(tip);
  const onMove = (ev) => {
    const r = svg.getBoundingClientRect();
    const px = ((ev.clientX - r.left) / r.width) * W;
    let best = 0;
    data.forEach((_, i) => { if (Math.abs(x(i) - px) < Math.abs(x(best) - px)) best = i; });
    const s = data[best];
    cross.setAttribute("x1", x(best)); cross.setAttribute("x2", x(best)); cross.setAttribute("opacity", 0.6);
    dots.forEach((d, i) => d.setAttribute("r", i === best ? 7 : 5));
    tip.hidden = false;
    tip.innerHTML = `<b>${s.pct}%</b> corrette · ${s.correct}/${s.reps} rip.<br>${fmtDate(s.date, true)}`;
    tip.style.left = `${(x(best) / W) * 100}%`;
    tip.style.top = `${(y(s.pct) / H) * 100}%`;
  };
  const onLeave = () => { tip.hidden = true; cross.setAttribute("opacity", 0); dots.forEach((d) => d.setAttribute("r", 5)); };
  svg.addEventListener("pointermove", onMove);
  svg.addEventListener("pointerdown", onMove);
  svg.addEventListener("pointerleave", onLeave);

  for (const s of [...sessions].reverse()) {
    const it = document.createElement("div");
    it.className = "hist-item";
    const te = topError(s);
    it.innerHTML = `<div class="pct">${s.pct}%</div><div><div>${s.correct}/${s.reps} corrette · ` +
      `${s.view === "side" ? "di lato" : "di fronte"}</div><div class="meta">${fmtDate(s.date, true)}` +
      (te ? ` · più frequente: ${R[te[0]].label.toLowerCase()}` : "") + `</div></div>`;
    listEl.appendChild(it);
  }
}
