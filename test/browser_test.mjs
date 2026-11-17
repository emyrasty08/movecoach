// End-to-end test in a real Chrome: serves app/, opens it, loads a video file
// through "Analizza un video", waits for the end and prints the summary.
//   node app/test/browser_test.mjs <video.mp4> <screenshot_prefix>
// needs puppeteer-core (npm i puppeteer-core) and Google Chrome.
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(process.env.PUPPETEER_FROM || import.meta.url);
const puppeteer = require("puppeteer-core");
const APP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const [video, shots] = process.argv.slice(2);
const TYPES = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".png": "image/png",
                ".webmanifest": "application/manifest+json" };

const server = http.createServer((req, res) => {
  const p = path.join(APP, decodeURIComponent(new URL(req.url, "http://x").pathname));
  const f = fs.existsSync(p) && fs.statSync(p).isDirectory() ? path.join(p, "index.html") : p;
  if (!fs.existsSync(f)) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { "content-type": TYPES[path.extname(f)] || "application/octet-stream" });
  fs.createReadStream(f).pipe(res);
}).listen(8765);

const browser = await puppeteer.launch({
  executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe",
  headless: true, args: ["--use-angle=swiftshader", "--autoplay-policy=no-user-gesture-required"] });
const page = await browser.newPage();
await page.setViewport({ width: 900, height: 900 });
page.on("console", (m) => console.log("  [page]", m.type(), m.text()));
page.on("pageerror", (e) => console.log("  [pageerror]", e.message));
await page.goto("http://localhost:8765/", { waitUntil: "load", timeout: 120000 });
await page.waitForFunction(() => document.getElementById("modelStatus").textContent === "", { timeout: 120000 });
console.log("model loaded");
await page.screenshot({ path: `${shots}_home.png` });

const input = await page.$("#fileInput");
await input.uploadFile(video);
let shot = 0;
const t0 = Date.now();
while (Date.now() - t0 < 300000) {
  await new Promise((r) => setTimeout(r, 4000));
  const scr = await page.evaluate(() => document.querySelector(".screen.active").id);
  if (scr === "summary") break;
  if (shot < 3) await page.screenshot({ path: `${shots}_live${shot++}.png` });
}
const vals = await page.evaluate(() => window.__squat.reps.map((r) => Object.fromEntries(Object.entries(r.values).map(([k, v]) => [k, +v.toFixed(3)]))));
console.log("values", JSON.stringify(vals));
const fixK = await page.evaluate(async () => { const { correctedFrame, angle3 } = await import("./js/coach.js"); return window.__squat.reps.map((r) => { const c = correctedFrame(r, r.b).pts; return r.view === "side" ? Math.round(angle3(c.hip, c.knee, c.ankle)) : null; }); });
console.log("corrected knee at bottom", JSON.stringify(fixK));
const sum = await page.evaluate(() => ({
  reps: document.getElementById("sReps").textContent, ok: document.getElementById("sOk").textContent,
  main: document.getElementById("sMain").textContent,
  cards: [...document.querySelectorAll(".rep-card .info")].map((e) => e.innerText.replace(/\n/g, " | ")),
}));
console.log(JSON.stringify(sum, null, 1));
await page.screenshot({ path: `${shots}_summary.png`, fullPage: true });
if (await page.$("#btnWorst:not([hidden])")) {
  await page.click("#btnWorst");
  await new Promise((r) => setTimeout(r, 1500));
  // jump to the bottom of the rep
  await page.evaluate(() => {
    const rep = window.__squat.worst, fr = rep.frames;
    const sc = document.getElementById("scrub");
    sc.value = String(Math.round((1000 * (fr[rep.b].t - fr[0].t)) / (fr[fr.length - 1].t - fr[0].t)));
    sc.dispatchEvent(new Event("input"));
  });
  await new Promise((r) => setTimeout(r, 800));
  await page.screenshot({ path: `${shots}_replay.png` });
}
await page.click("#btnHome1").catch(() => {});
await page.evaluate(() => document.getElementById("btnHistory").click());
await new Promise((r) => setTimeout(r, 800));
await page.screenshot({ path: `${shots}_history.png` });
await browser.close();
server.close();
