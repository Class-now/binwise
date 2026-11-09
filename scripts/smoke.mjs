// Headless Chromium smoke test of the web UI against the offline dev server.
// Usage: node scripts/smoke.mjs [baseUrl]   (default http://localhost:8798; starts `npm run dev` if nothing answers)
// Checks: setup → search "PET bottle" in Shibuya shows three part cards → a 10-item quiz completes.
// Saves screenshots to docs/screenshots/ at 1280×800 and 390×844.

import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { startServer, stopServer } from "./dev-server.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const base = process.argv[2] ?? "http://localhost:8798";
const shots = join(root, "docs/screenshots");
mkdirSync(shots, { recursive: true });

async function up() {
  try {
    const res = await fetch(`${base}/api/health`);
    return res.ok;
  } catch {
    return false;
  }
}


function check(cond, message) {
  if (!cond) throw new Error(message);
  console.log(`ok - ${message}`);
}

async function run(browser, width, height) {
  const tag = `${width}x${height}`;
  const context = await browser.newContext({ viewport: { width, height }, locale: "en-US", deviceScaleFactor: 1 });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));

  await page.goto(base);
  await page.locator("#setup").waitFor({ state: "visible" });
  await page.selectOption("#ward-select", "shibuya");
  await page.selectOption("#language-select", "en");
  await page.waitForLoadState("networkidle");
  await page.locator("#area-select option").nth(1).waitFor({ state: "attached" });
  const area = await page.locator("#area-select option").nth(1).getAttribute("value");
  await page.selectOption("#area-select", area);
  const checkedDays = await page.locator('#day-groups input[type="checkbox"]:checked').count();
  check(checkedDays >= 3, `[${tag}] area ${area} fills collection days (${checkedDays} chips)`);
  await page.screenshot({ path: join(shots, `setup-${tag}.png`), fullPage: true });
  await page.click("#save-setup");

  await page.locator("#search").waitFor({ state: "visible" });
  await page.fill("#query", "PET bottle");
  await page.click("#search-button");
  await page.locator(".part-card").first().waitFor();
  const cards = await page.locator(".part-card").count();
  check(cards === 3, `[${tag}] "PET bottle" in Shibuya shows ${cards} part cards`);
  const cats = await page.locator(".part-card").evaluateAll((els) => els.map((e) => e.getAttribute("data-category")));
  check(cats.join() === "pet-bottle,plastic,plastic", `[${tag}] parts map to ${cats.join(", ")}`);
  check((await page.locator(".part-card .next").count()) === 3, `[${tag}] each card shows the next collection day`);
  await page.locator(".trace-box summary").click();
  check(await page.locator(".trace-box li").first().isVisible(), `[${tag}] "How BinWise decided" trace opens`);
  await page.screenshot({ path: join(shots, `answer-${tag}.png`), fullPage: true });

  await page.click("#start-quiz");
  for (let i = 0; i < 10; i++) {
    await page.locator(".quiz-options button").first().click();
    if (i === 0) await page.screenshot({ path: join(shots, `quiz-${tag}.png`), fullPage: true });
    await page.locator("#quiz-next").click();
  }
  const score = await page.locator("#quiz-score").textContent();
  check(/of 10/.test(score ?? ""), `[${tag}] quiz completes: ${score?.trim()}`);
  await page.screenshot({ path: join(shots, `quiz-score-${tag}.png`), fullPage: true });

  check(errors.length === 0, `[${tag}] no page errors${errors.length ? `: ${errors.join(" | ")}` : ""}`);
  await context.close();
}

const server = await startServer(root, base);
let browser;
let failed = false;
try {
  browser = await chromium.launch();
  await run(browser, 1280, 800);
  await run(browser, 390, 844);
  console.log(`screenshots in ${shots}`);
} catch (err) {
  failed = true;
  console.error(`FAIL - ${err.message}`);
} finally {
  await browser?.close();
  if (server) stopServer(server);
}
process.exit(failed ? 1 : 0);
