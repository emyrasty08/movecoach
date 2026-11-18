// App tour with Leo: a dimmed overlay with a spotlight on one element at a time
// (the start button, the tabs...), Leo speaking each step with the bubble text.
// Runs at the first launch, before the initial assessment, and again from Profilo.

import { createAvatar, speak, stopSpeaking } from "./avatar.js";

const $ = (id) => document.getElementById(id);

// target: element id or tab name; tab: the tab to show behind the overlay
const STEPS = [
  { text: "Ciao! Sono Leo, il tuo personal trainer. Ti faccio fare un giro dell'app: ci vuole un minuto.",
    next: "Iniziamo" },
  { tab: "home", target: "btnSession",
    text: "Da qui inizi un allenamento. Scegli un esercizio, fai la serie davanti al telefono: io conto le ripetizioni e ti correggo a voce." },
  { tab: "home", target: "tab:train",
    text: "In Allenati trovi tutti gli esercizi. Per ognuno ti spiego come si fa, con le linee guida ufficiali, e dove mettere il telefono." },
  { tab: "home", target: "homeProfile",
    text: "Ti consiglio di partire dalla valutazione: sette test brevi, poi ti preparo un piano di lavoro su misura." },
  { tab: "home", target: "tab:history",
    text: "In Progressi vedi come migliori, serie dopo serie e allenamento dopo allenamento." },
  { tab: "home", target: "tab:profile",
    text: "Nel Profilo trovi il punteggio della valutazione e il piano. Da lì puoi anche rifare questo giro." },
  { text: "Durante la serie mi senti parlare. Se sbagli ti dico cosa correggere, e alla fine ti mostro la posizione giusta, in azzurro. Pronto?",
    next: "Fai la valutazione", alt: "Più tardi" },
];

const T = { i: 0, api: null, onDone: null, avatar: null };

export function initTour(api) {
  T.api = api;
  T.avatar = createAvatar($("tourAvatar"), { wave: true });
  $("tourNext").onclick = () => go(T.i + 1, "next");
  $("tourAlt").onclick = () => finish("alt");
  $("tourSkip").onclick = () => finish("skip");
  $("tourAvatar").onclick = () => speak(STEPS[T.i].text, { animate: true });
  window.addEventListener("resize", () => { if (!$("tour").hidden) place(); });
}

// onDone(how): "next" = last step accepted, "alt" = "Più tardi", "skip"
export function startTour(onDone) {
  T.onDone = onDone;
  $("tour").hidden = false;
  document.body.classList.add("touring");
  go(0);
}

function go(i, how) {
  if (i >= STEPS.length) { finish(how); return; }
  T.i = i;
  const s = STEPS[i];
  if (s.tab) T.api.goTab(s.tab);
  $("tourText").textContent = s.text;
  $("tourNext").textContent = s.next || "Avanti";
  $("tourAlt").hidden = !s.alt;
  $("tourAlt").textContent = s.alt || "";
  $("tourSkip").hidden = i === STEPS.length - 1;
  $("tourDots").innerHTML = STEPS.map((_, k) => `<i class="${k === i ? "on" : ""}"></i>`).join("");
  place();
  speak(s.text, { animate: true, wave: i === 0 });
}

// Spotlight on the target, Leo on the other half of the screen.
function place() {
  const s = STEPS[T.i], spot = $("tourSpot"), box = $("tourBox");
  const el = !s.target ? null : s.target.startsWith("tab:")
    ? document.querySelector(`#tabbar button[data-tab="${s.target.slice(4)}"]`) : $(s.target);
  const r = el && el.getClientRects().length ? el.getBoundingClientRect() : null;
  $("tour").classList.toggle("dim", !r);
  spot.hidden = !r;
  box.classList.remove("top", "bottom", "center");
  if (!r) { box.classList.add("center"); return; }
  el.scrollIntoView?.({ block: "nearest" });
  const pad = 8;
  Object.assign(spot.style, { left: `${r.left - pad}px`, top: `${r.top - pad}px`,
                              width: `${r.width + 2 * pad}px`, height: `${r.height + 2 * pad}px` });
  box.classList.add(r.top + r.height / 2 > window.innerHeight / 2 ? "top" : "bottom");
}

function finish(how) {
  stopSpeaking();
  $("tour").hidden = true;
  document.body.classList.remove("touring");
  const cb = T.onDone;
  T.onDone = null;
  cb?.(how);
}
