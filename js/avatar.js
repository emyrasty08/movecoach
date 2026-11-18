// Leo, the cartoon personal trainer: an SVG bust that talks with the app's voice.
//
// The mouth follows the spoken text: every letter has a mouth shape (viseme:
// "a" wide open, "o"/"u" round, "m"/"b"/"p" closed...) and a cursor runs along
// the text at the speed of the voice. The browser's word boundary events (when the
// voice sends them: iOS, desktop Chrome) put the cursor back on the word being
// said; without them (many Android voices) the cursor runs on its own until the
// utterance ends. If speech does not start at all (voice off, iOS without a tap)
// the mouth can still move on the estimated duration, so the bubble text reads
// as spoken.

const SVGNS = "http://www.w3.org/2000/svg";
const CHARS_PER_S = 14.5;     // Italian TTS at rate 1.05, measured on the phrases of the app
const avatars = new Set();
let uid = 0;

// ---------------------------------------------------------------- visemes
// [open, wide, round]: open 0..1 jaw, wide = corners apart, round = lips forward
const VIS = {
  a: [0.95, 0.35, 0], à: [0.95, 0.35, 0],
  e: [0.6, 0.7, 0], è: [0.6, 0.7, 0], é: [0.55, 0.75, 0],
  i: [0.35, 0.95, 0], ì: [0.35, 0.95, 0],
  o: [0.7, 0, 0.75], ò: [0.7, 0, 0.75],
  u: [0.4, 0, 1], ù: [0.4, 0, 1],
  m: [0, 0.2, 0], b: [0, 0.2, 0], p: [0, 0.2, 0],
  f: [0.15, 0.45, 0], v: [0.15, 0.45, 0],
  l: [0.35, 0.4, 0], n: [0.25, 0.4, 0], t: [0.25, 0.45, 0], d: [0.3, 0.45, 0],
  s: [0.18, 0.7, 0], z: [0.2, 0.6, 0], c: [0.3, 0.5, 0], g: [0.35, 0.4, 0],
  r: [0.35, 0.35, 0.2], q: [0.3, 0, 0.6],
};
const REST = [0, 0.25, 0];
function visemeAt(text, i) {
  const ch = (text[i] || " ").toLowerCase();
  if (VIS[ch]) return VIS[ch];
  if (/[a-z0-9]/.test(ch)) return [0.3, 0.4, 0];
  return REST;
}

// ---------------------------------------------------------------- drawing
function el(tag, attrs, parent) {
  const e = document.createElementNS(SVGNS, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  parent?.appendChild(e);
  return e;
}

// Mouth outline for open/wide/round, centred on (0, 0).
function mouthPath(o, w, r) {
  const half = 13 * (1 + 0.3 * w - 0.45 * r);
  const h = 1.5 + 17 * o;
  const cy = -2.5 * (1 - r);                  // corners up: a smile, flattened when rounding
  return `M${-half},${cy} C${-half * 0.5},${cy - 2 - h * 0.25} ${half * 0.5},${cy - 2 - h * 0.25} ${half},${cy} ` +
         `C${half * 0.7},${cy + 3 + h} ${-half * 0.7},${cy + 3 + h} ${-half},${cy} Z`;
}

// Build Leo inside `host`. opts.wave: the right arm can wave (larger avatars).
export function createAvatar(host, opts = {}) {
  const id = `av${++uid}`;
  const svg = el("svg", { viewBox: "0 0 200 210", class: "leo", role: "img", "aria-label": "Leo, il coach" });
  const defs = el("defs", {}, svg);
  const clip = el("clipPath", { id: `${id}m` }, defs);
  const clipPath = el("path", { d: mouthPath(0, 0.25, 0) }, clip);
  const shirtG = el("linearGradient", { id: `${id}s`, x1: 0, y1: 0, x2: 0, y2: 1 }, defs);
  el("stop", { offset: 0, "stop-color": "#2be0f7" }, shirtG);
  el("stop", { offset: 1, "stop-color": "#0ea5c0" }, shirtG);

  const SKIN = "#e9b48c", SKIN_D = "#d39a72", HAIR = "#3b2a20", INK = "#1d1712";
  // arms behind the shirt edge
  const armL = el("path", { fill: "none", stroke: SKIN, "stroke-width": 17, "stroke-linecap": "round" }, svg);
  const handL = el("circle", { r: 10, fill: SKIN }, svg);
  const armR = el("path", { fill: "none", stroke: SKIN, "stroke-width": 17, "stroke-linecap": "round" }, svg);
  const handR = el("circle", { r: 10, fill: SKIN }, svg);
  // body: tank top with a dark trim, whistle on a cord
  const body = el("g", { class: "leo-body" }, svg);
  el("path", { d: "M84 128 L116 128 L118 146 L82 146 Z", fill: SKIN_D }, body);                  // neck
  el("path", { d: "M44 210 C44 168 58 150 82 142 C90 154 110 154 118 142 C142 150 156 168 156 210 Z",
               fill: `url(#${id}s)` }, body);
  el("path", { d: "M82 142 C90 156 110 156 118 142", fill: "none", stroke: "#0b7285", "stroke-width": 4 }, body);
  el("path", { d: "M70 147 C70 165 70 172 63 210 M130 147 C130 165 130 172 137 210", fill: "none",
               stroke: "#0b7285", "stroke-width": 3, opacity: 0.6 }, body);
  el("path", { d: "M88 150 L100 176 L112 150", fill: "none", stroke: "#f4f5f6", "stroke-width": 1.6 }, body);
  el("rect", { x: 93, y: 175, width: 14, height: 8, rx: 3, fill: "#c9ced6" }, body);
  el("circle", { cx: 100, cy: 179, r: 2, fill: "#5b6470" }, body);
  // head
  const head = el("g", { class: "leo-head" }, svg);
  el("ellipse", { cx: 55, cy: 86, rx: 8, ry: 11, fill: SKIN_D }, head);
  el("ellipse", { cx: 145, cy: 86, rx: 8, ry: 11, fill: SKIN_D }, head);
  el("ellipse", { cx: 100, cy: 82, rx: 46, ry: 52, fill: SKIN }, head);
  el("path", { d: "M54 74 C50 36 76 22 100 24 C128 22 152 38 146 74 C140 58 132 50 120 46 C104 52 82 52 66 48 C60 56 56 64 54 74 Z",
               fill: HAIR }, head);
  el("path", { d: "M55 62 C80 50 120 50 145 62 L146 72 C120 60 80 60 54 72 Z", fill: "#22d3ee" }, head);  // headband
  const browL = el("path", { d: "M70 70 Q80 64 90 69", fill: "none", stroke: HAIR, "stroke-width": 4, "stroke-linecap": "round" }, head);
  const browR = el("path", { d: "M110 69 Q120 64 130 70", fill: "none", stroke: HAIR, "stroke-width": 4, "stroke-linecap": "round" }, head);
  const eyes = el("g", { class: "leo-eyes" }, head);
  for (const x of [80, 120]) {
    el("ellipse", { cx: x, cy: 84, rx: 8.5, ry: 9.5, fill: "#fff" }, eyes);
    el("circle", { cx: x + 1, cy: 85, r: 5, fill: INK }, eyes);
    el("circle", { cx: x + 2.8, cy: 83, r: 1.6, fill: "#fff" }, eyes);
  }
  el("path", { d: "M100 90 Q96 101 101 103", fill: "none", stroke: SKIN_D, "stroke-width": 3, "stroke-linecap": "round" }, head);
  el("ellipse", { cx: 70, cy: 104, rx: 7, ry: 4, fill: "#f08a7a", opacity: 0.35 }, head);
  el("ellipse", { cx: 130, cy: 104, rx: 7, ry: 4, fill: "#f08a7a", opacity: 0.35 }, head);
  const mouth = el("g", { transform: "translate(100 116)" }, head);
  const mouthBg = el("path", { fill: "#5a1f1f" }, mouth);
  const inner = el("g", { "clip-path": `url(#${id}m)` }, mouth);
  const teeth = el("rect", { x: -16, y: -14, width: 32, height: 6, rx: 2, fill: "#fff" }, inner);
  const tongue = el("ellipse", { cx: 0, cy: 12, rx: 9, ry: 6, fill: "#e86a6a" }, inner);
  const lips = el("path", { fill: "none", stroke: "#a85a4a", "stroke-width": 2, "stroke-linejoin": "round" }, mouth);
  host.replaceChildren(svg);

  const A = {
    host, svg, wave: !!opts.wave, m: [...REST], target: [...REST], waveT: -1, mood: "",
    talking: false, bob: 0,
    // arms: shoulder points; when waving the right arm goes up and the hand swings
    setArms(t) {
      const w = this.waveT >= 0 ? Math.min(1, this.waveT / 0.35, Math.max(0, (2.2 - this.waveT) / 0.35)) : 0;
      const sx = 152, sy = 160;
      const ex = 170 + 16 * w, ey = 196 - 66 * w;
      const hx = 168 + 28 * w + 8 * w * Math.sin(t * 14), hy = 222 - 128 * w;
      armR.setAttribute("d", `M${sx} ${sy} Q${ex} ${ey} ${hx} ${hy}`);
      handR.setAttribute("cx", hx); handR.setAttribute("cy", hy);
      armL.setAttribute("d", "M48 160 Q30 196 32 222");
      handL.setAttribute("cx", 32); handL.setAttribute("cy", 222);
    },
    draw() {
      const [o, w, r] = this.m;
      const d = mouthPath(o, w, r);
      mouthBg.setAttribute("d", d); lips.setAttribute("d", d); clipPath.setAttribute("d", d);
      teeth.setAttribute("y", -6 - 4 * (1 - r));
      tongue.setAttribute("cy", 3 + 15 * o);
      const lift = this.mood === "happy" ? -4 : this.mood === "fix" ? 0 : this.talking ? -1.5 : 0;
      const tilt = this.mood === "fix" ? 4 : 0;
      browL.setAttribute("transform", `translate(0 ${lift}) rotate(${tilt} 80 68)`);
      browR.setAttribute("transform", `translate(0 ${lift}) rotate(${-tilt} 120 68)`);
      head.setAttribute("transform", `rotate(${this.bob.toFixed(2)} 100 130)`);
    },
  };
  A.setArms(0);
  A.draw();
  avatars.add(A);
  return A;
}

export function removeAvatar(a) { avatars.delete(a); }

// ---------------------------------------------------------------- speech
// Android Chrome drops an utterance queued right after cancel(): cancel only if
// something is playing, then speak on the next tick. Chrome also stalls the queue
// after a while without resume(), so call it every time.
const V = { enabled: true, voice: null, cur: null, raf: 0, last: 0 };
// The app has no voice of its own: it uses the Italian voices of the phone, and the
// default one is often a female, low quality one. Leo is a man: male voices first,
// then the better quality ones ("Enhanced", "Premium", "Natural"/"Neural" voices).
// The person can choose another one in Profilo (setVoiceName).
const MALE = /luca|cosimo|diego|giuseppe|benigno|calimero|roberto|giorgio|federico|riccardo|male|maschil|it-it-x-it[cd]|#male/i;
const FEMALE = /female|femmin|alice|federica|paola|elsa|isabella|carla|silvia|giulia|chiara|emma|it-it-x-it[ab]|google italiano/i;
const GOOD = /enhanced|premium|natural|neural|online|avanzat|migliorat|network/i;
export function voiceScore(v) {
  return (MALE.test(v.name) || MALE.test(v.voiceURI || "") ? 10 : 0) - (FEMALE.test(v.name) ? 10 : 0) +
         (GOOD.test(v.name) || GOOD.test(v.voiceURI || "") ? 4 : 0) + (/^it[-_]it/i.test(v.lang) ? 1 : 0);
}
export function italianVoices() {
  if (!("speechSynthesis" in window)) return [];
  return speechSynthesis.getVoices().filter((v) => /^it[-_]/i.test(v.lang)).sort((a, b) => voiceScore(b) - voiceScore(a));
}
function pickVoice() {
  const vs = italianVoices();
  V.voice = (V.wanted && vs.find((v) => v.voiceURI === V.wanted)) || vs[0] || null;
  V.onVoices?.();
}
if ("speechSynthesis" in window) { pickVoice(); speechSynthesis.onvoiceschanged = pickVoice; }

// uri of the voice chosen in Profilo ("" = automatic); onVoices: the list changed
export function setVoiceName(uri, onVoices) {
  V.wanted = uri || "";
  if (onVoices) V.onVoices = onVoices;
  if ("speechSynthesis" in window) pickVoice();
}
export const currentVoice = () => V.voice;

export function setVoiceEnabled(on) {
  V.enabled = on;
  if (!on) { try { speechSynthesis.cancel(); } catch {} endTalk(V.cur); }
}

// speak(text, { mood, wave, animate }): voice + mouth of every avatar on screen.
// animate: move the mouth even when the voice is off or does not start (tour, home).
export function speak(text, opts = {}) {
  const talk = text.trim() ? { text, pos: 0, boundary: false, started: false, end: 0, opts } : null;
  if (V.cur) endTalk(V.cur);
  V.cur = talk;
  if (talk) startLook(talk);
  const synth = V.enabled && "speechSynthesis" in window;
  if (!synth) { if (talk && opts.animate) beginMouth(talk); return; }
  const busy = speechSynthesis.speaking || speechSynthesis.pending;
  if (busy) speechSynthesis.cancel();
  setTimeout(() => {
    if (V.cur !== talk) return;
    const u = new SpeechSynthesisUtterance(text);
    u.lang = "it-IT";
    if (V.voice) u.voice = V.voice;
    u.rate = 1.05;
    // a female voice (no male one on the phone): a bit lower, less out of character
    u.pitch = V.voice && voiceScore(V.voice) < 0 ? 0.85 : 1;
    if (talk) {
      u.onstart = () => beginMouth(talk);
      u.onboundary = (e) => {
        if (e.name && e.name !== "word") return;
        talk.boundary = true;
        talk.pos = e.charIndex;
        talk.wordEnd = e.charIndex + (e.charLength || (text.slice(e.charIndex).match(/^\S+/) || [""])[0].length);
      };
      u.onend = () => endTalk(talk);
      // "not-allowed": no tap yet (first launch, tour): the mouth still reads the bubble
      u.onerror = (e) => {
        if (!talk.started && talk.opts.animate && !/interrupted|canceled/.test(e.error)) beginMouth(talk);
        else endTalk(talk);
      };
      // no onstart within 1.2 s (iOS without a tap, no voices): the mouth goes anyway
      setTimeout(() => { if (!talk.started && V.cur === talk && opts.animate !== false) beginMouth(talk); }, 1200);
    }
    speechSynthesis.resume();
    speechSynthesis.speak(u);
  }, busy ? 120 : 0);
}

export function stopSpeaking() {
  try { speechSynthesis.cancel(); } catch {}
  endTalk(V.cur);
}

function startLook(talk) {
  for (const a of avatars) {
    a.mood = talk.opts.mood || "";
    if (a.wave && (talk.opts.wave || /^ciao\b/i.test(talk.text))) a.waveT = 0;
  }
  loop();
}

function beginMouth(talk) {
  if (talk.started) return;
  talk.started = true;
  // safety end: Chrome sometimes never fires onend on long utterances
  talk.end = performance.now() + (talk.text.length / CHARS_PER_S) * 1000 * 1.6 + 1500;
  talk.free = !V.enabled || !("speechSynthesis" in window) || !speechSynthesis.speaking;
  if (talk.free) talk.end = performance.now() + (talk.text.length / CHARS_PER_S) * 1000 + 300;
  for (const a of avatars) a.talking = true;
  loop();
}

function endTalk(talk) {
  if (!talk || talk.done) return;            // late onend of an utterance already replaced
  talk.done = true;
  if (V.cur === talk) V.cur = null;
  if (!V.cur) for (const a of avatars) { a.talking = false; a.target = [...REST]; }
  talk.opts.onend?.();
  loop();
}

function loop() {
  if (V.raf) return;
  V.last = performance.now();
  const step = (now) => {
    const dt = Math.min(0.1, (now - V.last) / 1000);
    V.last = now;
    const t = V.cur;
    let busy = false;
    if (t && t.started && !t.done) {
      // cursor along the text; with boundary events it waits at the end of the word
      t.pos += dt * CHARS_PER_S;
      if (t.boundary && t.wordEnd !== undefined) t.pos = Math.min(t.pos, t.wordEnd + 0.9);
      if (t.free && t.pos >= t.text.length) endTalk(t);
      else if (now > t.end) endTalk(t);
      else busy = true;
    }
    for (const a of avatars) {
      if (!a.host.isConnected) { avatars.delete(a); continue; }
      if (t && t.started && !t.done) {
        // a little jitter on the open jaw so long vowels do not look frozen
        const v = visemeAt(t.text, Math.floor(t.pos));
        a.target = [v[0] * (0.85 + 0.15 * Math.sin(now / 45)), v[1], v[2]];
        a.bob = 1.6 * Math.sin(now / 260);
      } else a.bob *= 0.85;
      for (let k = 0; k < 3; k++) a.m[k] += (a.target[k] - a.m[k]) * Math.min(1, dt * 22);
      if (a.waveT >= 0) { a.waveT += dt; if (a.waveT > 2.2) a.waveT = -1; else busy = true; }
      a.setArms(now / 1000);
      a.draw();
      if (Math.abs(a.m[0] - a.target[0]) > 0.01 || Math.abs(a.bob) > 0.05) busy = true;
    }
    V.raf = busy ? requestAnimationFrame(step) : 0;
  };
  V.raf = requestAnimationFrame(step);
}
