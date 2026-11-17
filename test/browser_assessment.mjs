// End-to-end test of the assessment flow in a real Chrome, with a fake camera
// that plays a video (Chrome option --use-file-for-fake-video-capture, .mjpeg file).
//
//   node app/test/browser_assessment.mjs <deep_squat_video.mjpeg> <screenshot_prefix>
//
// Steps: first launch -> welcome -> height -> assessment -> test 1 (deep squat) on
// the fake camera for 30 s -> "Fine test" -> score -> the other tests skipped ->
// results -> plan -> exercise list. Prints what each screen shows and saves screenshots.
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

// static server for app/ (the camera needs localhost or https)
const server = http.createServer((req, res) => {
  const p = path.join(APP, decodeURIComponent(new URL(req.url, "http://x").pathname));
  const f = fs.existsSync(p) && fs.statSync(p).isDirectory() ? path.join(p, "index.html") : p;
  if (!fs.existsSync(f)) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { "content-type": TYPES[path.extname(f)] || "application/octet-stream" });
  fs.createReadStream(f).pipe(res);
}).listen(8766);

const browser = await puppeteer.launch({
  executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe",
  headless: true,
  args: ["--use-angle=swiftshader", "--autoplay-policy=no-user-gesture-required",
         "--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream",
         `--use-file-for-fake-video-capture=${video}`] });
const page = await browser.newPage();
await page.setViewport({ width: 420, height: 860 });
page.on("pageerror", (e) => console.log("  [pageerror]", e.message));
page.on("dialog", (d) => d.accept());
const screen = () => page.evaluate(() => document.querySelector(".screen.active").id);
const text = (id) => page.evaluate((i) => document.getElementById(i).innerText, id);

await page.goto("http://localhost:8766/", { waitUntil: "load", timeout: 120000 });
await page.waitForFunction(() => document.getElementById("modelStatus").textContent === "", { timeout: 120000 });
console.log("1. first screen:", await screen());
await page.screenshot({ path: `${shots}_1_welcome.png`, fullPage: true });

await page.type("#inHeight", "157");
await page.click("#btnAssess");
await wait(500);
console.log("2. after start:", await screen(), "|", (await text("tiStep")), "|", await text("tiTitle"));
await page.screenshot({ path: `${shots}_2_intro.png`, fullPage: true });

await page.click("#btnTestGo");
for (let s = 0; s < 30; s += 5) {
  await wait(5000);
  const st = await page.evaluate(() => ({ phase: window.__squat.coach.phase, reps: window.__squat.reps.length,
    guide: document.getElementById("guideText").textContent }));
  console.log(`   t=${s + 5}s`, JSON.stringify(st));
  if (s === 10) await page.screenshot({ path: `${shots}_3_live.png` });
}
await page.click("#btnStop");
await wait(800);
console.log("3. result:", await screen(), "| score", await text("trScore"), "|", (await text("trFaults")).replace(/\n/g, " / "));
await page.screenshot({ path: `${shots}_4_result.png`, fullPage: true });

await page.click("#btnPainNo");
// skip the other 9 steps (6 tests, 3 of them bilateral... order in exercises.js)
for (let i = 0; i < 20 && (await screen()) === "testIntro"; i++) { await page.click("#btnTestSkip"); await wait(200); }
console.log("4. end:", await screen(), "| total", await text("rsTotal"), await text("rsMax"));
console.log("   ", (await text("rsBars")).replace(/\n/g, " / "));
console.log("   ", await text("rsNote"));
await page.screenshot({ path: `${shots}_5_results.png`, fullPage: true });

await page.click("#btnSeePlan");
await wait(300);
console.log("5. plan:", (await text("plBlocks")).replace(/\n/g, " / ").slice(0, 600));
await page.screenshot({ path: `${shots}_6_plan.png`, fullPage: true });

await page.click("#btnHome4");
await wait(300);
console.log("6. home:", await text("homeScore"));
await page.click("#btnTrain");
await wait(300);
await page.screenshot({ path: `${shots}_7_exercises.png`, fullPage: true });
console.log("7. exercises:", (await text("exList")).split("\n").filter((l) => l && l !== "Con coach").length / 2, "items");
await browser.close();
server.close();
