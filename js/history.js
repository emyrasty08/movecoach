// History screen: one card per training session with the exercises done in it,
// a chart of the % of correct reps per set for one exercise at a time, and the
// assessments.

import { historyChart } from "./charts.js";
import { topError } from "./session.js";
import { loadAssessments } from "./plan.js";

const $ = (id) => document.getElementById(id);
const SIDE = { l: "sinistra", r: "destra" };
let chosen = null;            // exercise shown in the chart

const fmtDate = (iso, withTime) => {
  const d = new Date(iso);
  const dd = `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}`;
  return withTime ? `${dd} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}` : dd;
};
const minutes = (a, b) => Math.max(1, Math.round((new Date(b) - new Date(a)) / 60000));

export function renderHistory(sessions) {
  const sets = sessions.flatMap((s) => s.sets);
  const names = new Map();
  for (const s of sets) names.set(s.exId, s.name);
  if (!names.has(chosen)) chosen = sets.length ? sets[sets.length - 1].exId : null;

  // exercise chips
  $("histFilter").innerHTML = "";
  for (const [id, name] of names) {
    const b = document.createElement("button");
    b.className = "chip" + (id === chosen ? " on" : "");
    b.textContent = name;
    b.onclick = () => { chosen = id; renderHistory(sessions); };
    $("histFilter").appendChild(b);
  }

  // chart and totals of the chosen exercise
  const mine = sets.filter((s) => s.exId === chosen && s.reps);
  $("histTitle").textContent = chosen ? `${names.get(chosen)}: ripetizioni corrette per serie` : "Ripetizioni corrette per serie";
  historyChart($("chart"), mine.map((s) => ({
    date: s.date, v: s.pct,
    tip: `<b>${s.pct}%</b> corrette · ${s.correct}/${s.reps} rip.<br>${fmtDate(s.date, true)}`,
  })), { label: "Percentuale di ripetizioni corrette per serie" });
  const reps = mine.reduce((a, s) => a + s.reps, 0), ok = mine.reduce((a, s) => a + s.correct, 0);
  const te = topError(mine);
  $("histStats").innerHTML = !mine.length ? "" :
    `<div class="tile"><span>${mine.length}</span><small>serie</small></div>` +
    `<div class="tile"><span>${reps}</span><small>ripetizioni</small></div>` +
    `<div class="tile"><span>${reps ? Math.round((100 * ok) / reps) : 0}%</span><small>corrette</small></div>`;
  $("histTop").textContent = te ? `Errore più frequente: ${te.label.toLowerCase()} (${te.n} volte).` : "";

  // assessments
  const as = loadAssessments();
  $("histAssess").innerHTML = as.length ? "<h2>Valutazioni</h2>" + [...as].reverse().map((a) =>
    `<div class="hist-item"><div class="pct">${a.total}<small>/${a.max}</small></div><div>Valutazione FMS` +
    `<div class="meta">${fmtDate(a.date, true)}</div></div></div>`).join("") : "";

  // sessions, newest first
  const list = $("histList");
  list.innerHTML = sessions.length ? "<h2>Allenamenti</h2>" : `<div class="empty">Ancora nessun allenamento: premi “Inizia allenamento” nella Home.</div>`;
  for (const s of [...sessions].reverse()) list.appendChild(sessionCard(s));
}

export function sessionCard(s) {
  const card = document.createElement("div");
  card.className = "session-card";
  const reps = s.sets.reduce((a, x) => a + x.reps, 0);
  const exs = new Set(s.sets.map((x) => x.exId)).size;
  card.innerHTML = `<div class="head"><b>${fmtDate(s.start, true)}</b><span class="meta">` +
    `${s.end ? `${minutes(s.start, s.end)} min · ` : ""}${exs} ${exs === 1 ? "esercizio" : "esercizi"} · ${reps} rip.</span></div>`;
  for (const x of s.sets) {
    const te = topError(x);
    const extra = [x.best !== null && x.best !== undefined ? `voto migliore ${x.best}/3` : "",
                   x.ipf !== null && x.ipf !== undefined ? `${x.ipf}/${x.reps} sotto il parallelo` : "",
                   te ? `più frequente: ${te.label.toLowerCase()}` : ""].filter(Boolean).join(" · ");
    const row = document.createElement("div");
    row.className = "set-row";
    row.innerHTML = `<div class="pct">${x.pct}%</div><div><div>${x.name}${x.side ? ` · ${SIDE[x.side]}` : ""}` +
      ` <span class="meta">${x.correct}/${x.reps} corrette</span></div><div class="meta">${extra}</div></div>`;
    card.appendChild(row);
  }
  return card;
}
