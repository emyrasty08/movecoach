// Which person does the app follow? Runs a video with more people in the frame
// and saves a screenshot of the live view every few seconds (the athlete in color,
// the others faint grey), plus the followed box over time.
//   node app/test/browser_people.mjs <video.mp4> <screenshot_prefix> [exercise name]
// Needs puppeteer-core (set PUPPETEER_FROM to its folder) and Chrome.
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(process.env.PUPPETEER_FROM || import.meta.url);
const puppeteer = require("puppeteer-core");
const APP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const [video, shots, exName = "Deep squat"] = process.argv.slice(2);
const TYPES = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".png": "image/png" };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const server = http.createServer((req, res) => {
  const p = path.join(APP, decodeURIComponent(new URL(req.url, "http://x").pathname));
  const f = fs.existsSync(p) && fs.statSync(p).isDirectory() ? path.join(p, "index.html") : p;
  if (!fs.existsSync(f)) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { "content-type": TYPES[path.extname(f)] || "application/octet-stream" });
  fs.createReadStream(f).pipe(res);
}).listen(8768);

const browser = await puppeteer.launch({
  executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe",
  headless: true, args: ["--use-angle=swiftshader", "--autoplay-policy=no-user-gesture-required"] });
const page = await browser.newPage();
await page.setViewport({ width: 420, height: 760 });
page.on("pageerror", (e) => console.log("  [pageerror]", e.message));
await page.goto("http://localhost:8768/", { waitUntil: "load" });
await page.evaluate(() => { localStorage.clear(); localStorage.setItem("movecoach.profile", JSON.stringify({ seenWelcome: true })); });
await page.goto("http://localhost:8768/", { waitUntil: "load" });
await page.waitForFunction(() => document.getElementById("modelStatus").textContent === "", { timeout: 120000 });
await page.evaluate(() => document.querySelector("#tabbar [data-tab=train]").click());
await page.evaluate((name) => [...document.querySelectorAll("#exList .ex-item")].find((e) => e.innerText.includes(name)).click(), exName);
await (await page.$("#fileInput")).uploadFile(video);
let k = 0;
while ((await page.evaluate(() => document.querySelector(".screen.active").id)) === "live" || k === 0) {
  await wait(6000);
  const st = await page.evaluate(() => ({ t: document.getElementById("video").currentTime.toFixed(1),
    target: window.__squat.target && Object.fromEntries(Object.entries(window.__squat.target).map(([a, b]) => [a, +b.toFixed(2)])),
    others: window.__squat.others.length, phase: window.__squat.coach.phase, reps: window.__squat.reps.length,
    guide: document.getElementById("guideText").textContent }));
  if ((await page.evaluate(() => document.querySelector(".screen.active").id)) !== "live") break;
  console.log(JSON.stringify(st));
  await page.screenshot({ path: `${shots}_live${k++}.png` });
}
console.log("end:", await page.evaluate(() => document.querySelector(".screen.active").id), await page.evaluate(() => window.__squat.reps.length), "reps");
await browser.close();
server.close();
