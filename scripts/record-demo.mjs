// Records the demo walkthrough as a video with caption overlays (raw material for the 2–3 minute Devpost video).
// Usage: node scripts/record-demo.mjs [baseUrl] [outDir]   (defaults http://localhost:8798, demo-out)
// Starts the offline dev server if nothing answers at baseUrl. Writes <outDir>/raw.webm (1280×720)
// and <outDir>/marks.json: [{ t, scene, caption }] with t in seconds from the start of the video,
// so the narration in docs/submission/video-script.md can be aligned with each scene.

import { mkdirSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { startServer, stopServer } from "./dev-server.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const base = process.argv[2] ?? "http://localhost:8798";
const outDir = resolve(process.argv[3] ?? join(root, "demo-out"));
const size = { width: 1280, height: 720 };

async function up() {
  try {
    return (await fetch(`${base}/api/health`)).ok;
  } catch {
    return false;
  }
}


// Caption bar drawn over the page; re-created after any navigation.
function showCaption(text) {
  let el = document.getElementById("demo-caption");
  if (!el) {
    el = document.createElement("div");
    el.id = "demo-caption";
    el.setAttribute("aria-hidden", "true");
    Object.assign(el.style, {
      position: "fixed", left: "50%", bottom: "28px", transform: "translateX(-50%)", zIndex: "2147483647",
      maxWidth: "88%", padding: "12px 22px", borderRadius: "12px", background: "rgba(17,17,17,.86)",
      color: "#fff", font: "600 24px/1.35 system-ui, sans-serif", textAlign: "center", pointerEvents: "none",
      boxShadow: "0 6px 24px rgba(0,0,0,.35)", transition: "opacity .25s",
    });
    document.body.appendChild(el);
  }
  el.textContent = text;
  el.style.opacity = text ? "1" : "0";
}

const pause = (ms) => new Promise((r) => setTimeout(r, ms));

async function record() {
  mkdirSync(outDir, { recursive: true });
  const tmp = join(outDir, ".video-tmp");
  rmSync(tmp, { recursive: true, force: true });

  const browser = await chromium.launch();
  const context = await browser.newContext({
    viewport: size,
    locale: "en-US",
    deviceScaleFactor: 1,
    recordVideo: { dir: tmp, size },
  });
  const started = Date.now();
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));

  const marks = [];
  const scene = async (name, caption, hold = 0) => {
    marks.push({ t: Math.round((Date.now() - started) / 100) / 10, scene: name, caption });
    await page.evaluate(showCaption, caption);
    if (hold) await pause(hold);
  };
  const type = async (text) => {
    await page.fill("#query", "");
    await page.locator("#query").pressSequentially(text, { delay: 70 });
  };
  const search = async (text) => {
    await type(text);
    await pause(400);
    const answered = page.waitForResponse((r) => r.url().endsWith("/api/lookup"));
    await page.click("#search-button");
    await answered;
    await page.locator("#results .result").first().waitFor();
    await pause(500);
  };
  const scrollResults = async () => {
    await page.locator("#results").scrollIntoViewIfNeeded();
    await pause(1500);
    await page.mouse.wheel(0, 500);
    await pause(2000);
  };

  // 1. Setup
  await page.goto(base);
  await page.locator("#setup").waitFor({ state: "visible" });
  await scene("intro", "BinWise Tokyo: how does MY ward want this thrown away?", 3500);
  await scene("setup", "Pick your ward and language once. Saved only on this device.", 1200);
  await page.selectOption("#ward-select", "shibuya");
  await pause(600);
  await page.selectOption("#language-select", "en");
  await page.waitForLoadState("networkidle");
  await page.locator("#area-select option").nth(1).waitFor({ state: "attached" });
  await scene("area", "Shibuya publishes collection days per area, so choosing yours fills them in.", 1200);
  const area = await page.locator("#area-select option").nth(1).getAttribute("value");
  await page.selectOption("#area-select", area);
  await pause(2500);
  await page.click("#save-setup");
  await page.locator("#search").waitFor({ state: "visible" });

  // 2. Composite item
  await scene("pet", "A PET bottle is three things: bottle, cap and label.", 500);
  await search("PET bottle");
  await scene("pet-cards", "Each part gets its own bin, prep steps and next collection day, all from the ward's rules.");
  await scrollResults();
  await page.locator(".trace-box summary").first().scrollIntoViewIfNeeded();
  await page.locator(".trace-box summary").first().click();
  await scene("trace", "“How BinWise decided”: every answer shows its matching steps and the official source.", 4000);

  // 3. Other languages and tricky items
  await page.evaluate(() => window.scrollTo(0, 0));
  await scene("multilingual", "Type in any language, e.g. Japanese 電池 (battery).", 300);
  await search("電池");
  await scene("battery", "Batteries cause garbage-truck fires. The answer says which kind goes where.");
  await scrollResults();
  await page.evaluate(() => window.scrollTo(0, 0));
  await scene("oil", "Used frying oil: soak it up or solidify it. Never pour it down the drain.", 300);
  await search("frying oil");
  await scrollResults();

  // 4. Unknown item
  await page.evaluate(() => window.scrollTo(0, 0));
  await scene("unknown", "Not in the dataset? BinWise says so and links the ward's official search. It never guesses.", 300);
  await search("antique samurai armor");
  await pause(3500);

  // 5. Quiz and impact
  await page.evaluate(() => window.scrollTo(0, 0));
  await scene("impact", "The impact counter: lookups where people commonly get the bin wrong.", 3500);
  await page.click("#start-quiz");
  await page.locator(".quiz-options button").first().waitFor();
  await scene("quiz", "“Sort it!”: 10 ward-specific items, instant feedback, learn the rules.", 1500);
  for (let i = 0; i < 10; i++) {
    await page.locator(".quiz-options button").nth(i % 2).click();
    await pause(i < 3 ? 2200 : 700);
    await page.locator("#quiz-next").click();
    await pause(300);
  }
  await page.locator("#quiz-score").waitFor();
  await scene("score", "Score and explanations at the end.", 3000);
  await scene("outro", "BinWise Tokyo: rules from official ward pages, AI only to identify and translate.", 4000);

  const video = page.video();
  await context.close();
  await browser.close();
  const raw = join(outDir, "raw.webm");
  renameSync(await video.path(), raw);
  rmSync(tmp, { recursive: true, force: true });
  const duration = Math.round((Date.now() - started) / 100) / 10;
  writeFileSync(join(outDir, "marks.json"), JSON.stringify({ base, size, duration, marks }, null, 1) + "\n");
  if (errors.length) throw new Error(`page errors: ${errors.join(" | ")}`);
  console.log(`recorded ${duration}s, ${marks.length} scenes -> ${raw}`);
}

const server = await startServer(root, base);
let failed = false;
try {
  await record();
} catch (err) {
  failed = true;
  console.error(`FAIL - ${err.message}`);
} finally {
  if (server) stopServer(server);
}
process.exit(failed ? 1 : 0);
