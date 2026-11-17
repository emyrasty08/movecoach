// Offline support: app files cache-first; MediaPipe library and model are
// cached on first use, so after one online session the app also works offline.
const CACHE = "movecoach-v4";
const APP = ["./", "index.html", "style.css", "manifest.webmanifest", "js/main.js", "js/coach.js",
             "js/draw.js", "js/history.js", "js/geometry.js", "js/movement.js", "js/exercises.js", "js/plan.js", "js/flow.js", "js/catalog.js", "js/session.js", "js/charts.js", "icons/icon-192.png", "icons/icon-512.png",
             "icons/apple-touch-icon.png"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(APP)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});
self.addEventListener("fetch", (e) => {
  if (e.request.method !== "GET") return;
  const url = new URL(e.request.url);
  const external = url.origin !== location.origin;
  if (!external) {
    // own files: network first (so updates arrive), cache as fallback
    e.respondWith(fetch(e.request).then((r) => { const cp = r.clone();
      caches.open(CACHE).then((c) => c.put(e.request, cp)); return r; }).catch(() => caches.match(e.request)));
    return;
  }
  if (/cdn\.jsdelivr\.net|storage\.googleapis\.com/.test(url.host)) {
    // pinned library version and model: cache first
    e.respondWith(caches.match(e.request).then((hit) => hit || fetch(e.request).then((r) => {
      if (r.ok) { const cp = r.clone(); caches.open(CACHE).then((c) => c.put(e.request, cp)); }
      return r;
    })));
  }
});
