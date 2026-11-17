// End-to-end test of a training session in a real Chrome:
// Home -> "Inizia allenamento" -> squat (video file) -> summary with charts ->
// back to the session -> a second exercise (FMS deep squat, same video) ->
// "Termina allenamento" -> history. Prints what each screen shows and saves screenshots.
//   node app/test/browser_session.mjs <video.mp4> <screenshot_prefix>
// Needs puppeteer-core (npm i puppeteer-core; set PUPPETEER_FROM to its folder) and Chrome.
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
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

const server = http.createServer((req, res) => {
  const p = path.join(APP, decodeURIComponent(new URL(req.url, "http://x").pathname));
  const f = fs.existsSync(p) && fs.statSync(p).isDirectory() ? path.join(p, "index.html") : p;
  if (!fs.existsSync(f)) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { "content-type": TYPES[path.extname(f)] || "application/octet-stream" });
  fs.createReadStream(f).pipe(res);
}).listen(8767);

const browser = await puppeteer.launch({
  executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe",
  headless: true, args: ["--use-angle=swiftshader", "--autoplay-policy=no-user-gesture-required"] });
const page = await browser.newPage();
await page.setViewport({ width: 420, height: 860 });
page.on("pageerror", (e) => console.log("  [pageerror]", e.message));
page.on("dialog", (d) => d.accept());
const screen = () => page.evaluate(() => document.querySelector(".screen.active").id);
const text = (id) => page.evaluate((i) => document.getElementById(i).innerText.replace(/\n+/g, " | "), id);
const click = (sel) => page.evaluate((s) => document.querySelector(s).click(), sel);

// skip the welcome screen
await page.goto("http://localhost:8767/", { waitUntil: "load" });
await page.evaluate(() => localStorage.setItem("movecoach.profile", JSON.stringify({ seenWelcome: true })));
await page.goto("http://localhost:8767/", { waitUntil: "load", timeout: 120000 });
await page.waitForFunction(() => document.getElementById("modelStatus").textContent === "", { timeout: 120000 });
console.log("1. home:", await screen(), "|", await text("btnSession"));
await page.screenshot({ path: `${shots}_1_home.png`, fullPage: true });

async function doSet(item, n) {
  await click("#btnAddEx");
  await wait(300);
  const items = await page.evaluate(() => [...document.querySelectorAll("#exList .ex-item")].map((e) => e.innerText.split("\n")[0]));
  if (n === 1) { console.log("   picker:", items.join(", ")); await page.screenshot({ path: `${shots}_3_picker.png`, fullPage: true }); }
  await page.evaluate((name) => [...document.querySelectorAll("#exList .ex-item")].find((e) => e.innerText.startsWith(name)).click(), item);
  await wait(300);
  console.log(`${n}a. intro:`, await screen(), "|", await text("eiTitle"), "|", (await text("eiSource")).slice(0, 80));
  if (n === 1) await page.screenshot({ path: `${shots}_4_intro.png`, fullPage: true });
  const input = await page.$("#fileInput");
  await input.uploadFile(video);
  const t0 = Date.now();
  while (Date.now() - t0 < 1500000 && (await screen()) !== "summary") await wait(3000);
  console.log(`${n}b. summary:`, await text("sReps"), "reps,", await text("sOk"), "ok |", await text("sMain"));
  console.log("    tempo:", await text("sTempoNote"));
  await page.screenshot({ path: `${shots}_5_summary${n}.png`, fullPage: true });
  await click("#btnHome1");
  await wait(300);
  console.log(`${n}c. back to:`, await screen(), "|", await text("sessSub"));
}

await click("#btnSession");
await wait(300);
console.log("2. session:", await screen(), "|", await text("sessSub"));
await page.screenshot({ path: `${shots}_2_session.png`, fullPage: true });
await doSet("Squat", 1);
await doSet("Deep squat", 2);
await page.screenshot({ path: `${shots}_6_session.png`, fullPage: true });
await click("#btnEndSession");
await wait(800);
console.log("3. after end:", await screen(), "|", await text("histTitle"), "|", await text("histList"));
await page.screenshot({ path: `${shots}_7_history.png`, fullPage: true });
await click("#btnHome2");
console.log("4. home:", await text("btnSession"));
await browser.close();
server.close();
