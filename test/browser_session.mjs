// End-to-end test of a training session in a real Chrome, on a video file:
// Oggi -> "Inizia allenamento" -> Allenati (Esercizi) -> exercise intro -> set ->
// summary (tally, Park-style charts, rep cards) -> replay with the corrected pose ->
// Allenati (Test FMS) -> the same exercise as a test -> pain -> Termina -> Progressi.
// Prints what each screen shows and saves screenshots.
//   node app/test/browser_session.mjs <video.mp4> <screenshot_prefix> [exercise name, default "Deep squat"]
// Needs puppeteer-core (npm i puppeteer-core; set PUPPETEER_FROM to its folder) and Chrome.
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(process.env.PUPPETEER_FROM || import.meta.url);
const puppeteer = require("puppeteer-core");
const APP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const [video, shots, exName = "Deep squat"] = process.argv.slice(2);
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
page.on("console", (m) => { if (m.type() === "error") console.log("  [console]", m.text()); });
page.on("dialog", (d) => d.accept());
const screen = () => page.evaluate(() => document.querySelector(".screen.active").id);
const text = (id) => page.evaluate((i) => document.getElementById(i).innerText.replace(/\n+/g, " | "), id);
const click = (sel) => page.evaluate((s) => document.querySelector(s).click(), sel);
const shot = (name) => page.screenshot({ path: `${shots}_${name}.png`, fullPage: true });

// skip the welcome screen
await page.goto("http://localhost:8767/", { waitUntil: "load" });
await page.evaluate(() => { localStorage.clear(); localStorage.setItem("movecoach.profile", JSON.stringify({ seenWelcome: true })); });
await page.goto("http://localhost:8767/", { waitUntil: "load", timeout: 120000 });
await page.waitForFunction(() => document.getElementById("modelStatus").textContent === "", { timeout: 120000 });
console.log("1. oggi:", await screen(), "|", await text("homeTitle"), "|", await text("homeProfile"));
await shot("1_home");

async function doSet(mode, n) {
  await click(mode === "test" ? "#segTest" : "#segTrain");
  await wait(200);
  if (n === 1) await shot(`2_picker_${mode}`);
  await page.evaluate((name) => [...document.querySelectorAll("#exList .ex-item")].find((e) => e.innerText.includes(name)).click(), exName);
  await wait(300);
  console.log(`${n}a. intro:`, await text("eiMode"), "|", await text("eiTitle"), "|", (await text("eiGuideTitle")));
  await shot(`3_intro_${mode}`);
  const input = await page.$("#fileInput");
  await input.uploadFile(video);
  const t0 = Date.now();
  while (Date.now() - t0 < 1500000 && (await screen()) !== "summary") await wait(3000);
  console.log(`${n}b. summary:`, await text("sTitle"), "|", await text("sReps"), "rip,", await text("sOk"), "ok,", await text("sPct"));
  console.log("    main:", await text("sMain"));
  console.log("    tally:", await text("sTally"));
  console.log("    rules:", await page.evaluate(() => [...document.querySelectorAll("#sRules .verdict")].map((v) => v.innerText).join(" || ")));
  console.log("    tempo:", await text("sTempoNote"));
  console.log("    people seen besides the athlete (last frame):", await page.evaluate(() => window.__squat.others.length));
  await wait(500);
  await shot(`4_summary_${mode}`);
  if (await page.evaluate(() => !document.getElementById("btnWorst").hidden)) {
    await click("#btnWorst");
    await wait(1500);
    console.log("    replay:", await text("replayTitle"), "|", await text("replayErr"));
    await page.screenshot({ path: `${shots}_5_replay_${mode}.png` });
    await click("#btnCloseReplay");
  } else console.log("    replay: none (all reps correct or no frames)");
  if (mode === "test") { await click("#btnPain"); console.log("    pain:", await text("sPct")); }
  await click("#btnDone");
  await wait(300);
}

await click("#btnSession");
await wait(300);
console.log("2. after Inizia:", await screen());
await doSet("train", 1);
console.log("   oggi:", await text("homeOpen"));
await shot("6_home_open");
await click("#btnAddEx");
await doSet("test", 2);
await click("#btnEndSession");
await wait(800);
console.log("3. progressi:", await screen(), "|", await text("histFilter"), "|", await text("histTitle"));
await shot("7_history");
await page.evaluate(() => document.querySelector("#tabbar [data-tab=profile]").click());
await wait(300);
console.log("4. profilo:", await screen(), "|", (await text("profile")).slice(0, 120));
await shot("8_profile");
await browser.close();
server.close();
