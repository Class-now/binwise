// Re-checks every official source page the rules dataset was built from and reports which ones changed.
// Usage: node scripts/check-sources.mjs [--update] [--report <file.md>] [--limit N] [--strict]
//   --update   write the current state as the new baseline (data/source-hashes.json)
//   --report   also write the report as Markdown
//   --limit    only check the first N URLs (quick run)
//   --strict   exit 1 when a page changed or failed (for CI / a monthly job)
// For each URL: HEAD request (status, ETag, Last-Modified), then GET and a SHA-256 of the content.
// HTML is reduced to its visible text first so that markup-only changes are not reported.

import { createHash } from "node:crypto";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const WARDS = ["shibuya", "shinjuku", "setagaya"];
export const BASELINE = join(root, "data/source-hashes.json");
const today = () => new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Tokyo" });
const UA = "BinWiseTokyo-source-check/0.1 (+https://github.com/Class-now/binwise)";

/** Every source URL in the ward datasets, the schedule table and docs/data-sources.md, deduplicated. */
export function collectUrls(dir = root) {
  const urls = new Map(); // url -> set of places it is used
  const add = (url, where) => {
    if (typeof url !== "string" || !/^https?:\/\//.test(url)) return;
    if (!urls.has(url)) urls.set(url, new Set());
    urls.get(url).add(where);
  };
  for (const ward of WARDS) {
    const data = JSON.parse(readFileSync(join(dir, `data/wards/${ward}.json`), "utf8"));
    add(data.searchUrl, `${ward}:search`);
    for (const s of data.sources ?? []) add(s.url, `${ward}:sources`);
    for (const c of data.categories ?? []) add(c.link, `${ward}:category ${c.id}`);
    for (const item of data.items ?? []) add(item.source, `${ward}:items`);
  }
  const schedule = join(dir, "data/wards/shibuya-schedule.json");
  if (existsSync(schedule)) add(JSON.parse(readFileSync(schedule, "utf8")).source, "shibuya:schedule");
  const doc = join(dir, "docs/data-sources.md");
  if (existsSync(doc)) {
    for (const m of readFileSync(doc, "utf8").matchAll(/https?:\/\/[^\s|)>」）]+/g)) add(m[0], "docs/data-sources.md");
  }
  return [...urls.entries()]
    .map(([url, where]) => ({ url, where: [...where].sort() }))
    .sort((a, b) => a.url.localeCompare(b.url));
}

/** Visible text of an HTML page with whitespace collapsed. */
export function normalizeHtml(html) {
  return html
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<(script|style|noscript|svg)\b[\s\S]*?<\/\1>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;|&#160;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function hashContent(body, contentType) {
  const isHtml = /html/i.test(contentType ?? "");
  const data = isHtml ? normalizeHtml(Buffer.from(body).toString("utf8")) : Buffer.from(body);
  return createHash("sha256").update(data).digest("hex");
}

/** Compares the current results with the baseline. Returns {changed, failed, added, removed, unchanged}. */
export function diff(baseline, current) {
  const out = { changed: [], failed: [], added: [], removed: [], unchanged: [] };
  for (const cur of current) {
    const prev = baseline[cur.url];
    if (cur.error) out.failed.push({ ...cur, prev });
    else if (!prev || !prev.hash) out.added.push(cur);
    else if (prev.hash !== cur.hash) out.changed.push({ ...cur, prev });
    else out.unchanged.push(cur);
  }
  const seen = new Set(current.map((c) => c.url));
  for (const url of Object.keys(baseline)) if (!seen.has(url)) out.removed.push({ url, ...baseline[url] });
  return out;
}

async function request(url, method) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 20000);
  try {
    return await fetch(url, { method, redirect: "follow", signal: ctrl.signal, headers: { "user-agent": UA } });
  } finally {
    clearTimeout(timer);
  }
}

export async function checkOne(url) {
  const result = { url, checkedOn: today() };
  try {
    let head;
    try {
      head = await request(url, "HEAD");
    } catch {
      head = undefined; // some servers refuse HEAD; the GET below decides
    }
    if (head) {
      result.headStatus = head.status;
      result.etag = head.headers.get("etag") ?? undefined;
      result.lastModified = head.headers.get("last-modified") ?? undefined;
    }
    const res = await request(url, "GET");
    result.status = res.status;
    if (!res.ok) {
      result.error = `HTTP ${res.status}`;
      return result;
    }
    const type = res.headers.get("content-type") ?? "";
    result.contentType = type.split(";")[0];
    result.hash = hashContent(await res.arrayBuffer(), type);
  } catch (err) {
    result.error = err.name === "AbortError" ? "timeout" : String(err.message ?? err);
  }
  return result;
}

async function pool(items, size, fn) {
  const out = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(size, items.length) }, async () => {
      while (next < items.length) {
        const i = next++;
        out[i] = await fn(items[i], i);
      }
    }),
  );
  return out;
}

export function report(d, total) {
  const lines = [
    `# Source check ${today()}`,
    "",
    `${total} URLs: ${d.unchanged.length} unchanged, ${d.changed.length} changed, ${d.added.length} new, ${d.failed.length} failed, ${d.removed.length} no longer used.`,
    "",
  ];
  const section = (title, rows, fmt) => {
    if (!rows.length) return;
    lines.push(`## ${title}`, "", ...rows.map(fmt), "");
  };
  section("Changed — re-read the page and update data/research/", d.changed, (r) => `- ${r.url} (last checked ${r.prev.checkedOn}; used by ${r.where.join(", ")})`);
  section("Failed", d.failed, (r) => `- ${r.url}: ${r.error}${r.prev ? "" : " (not in baseline)"}`);
  section("New (no baseline yet)", d.added, (r) => `- ${r.url}`);
  section("No longer used", d.removed, (r) => `- ${r.url}`);
  return lines.join("\n");
}

async function main(argv) {
  const arg = (name) => {
    const i = argv.indexOf(name);
    return i >= 0 ? argv[i + 1] : undefined;
  };
  let sources = collectUrls();
  const limit = Number(arg("--limit"));
  if (limit > 0) sources = sources.slice(0, limit);
  const baseline = existsSync(BASELINE) ? JSON.parse(readFileSync(BASELINE, "utf8")) : {};

  let done = 0;
  const results = await pool(sources, 4, async (s) => {
    const r = { ...(await checkOne(s.url)), where: s.where };
    done += 1;
    process.stderr.write(`\r${done}/${sources.length}`);
    return r;
  });
  process.stderr.write("\n");

  const d = diff(baseline, results);
  if (limit > 0) d.removed = []; // a partial run says nothing about unused URLs
  const text = report(d, results.length);
  console.log(text);
  const out = arg("--report");
  if (out) writeFileSync(out, text + "\n");

  if (argv.includes("--update")) {
    const next = limit > 0 ? { ...baseline } : {};
    for (const r of results) {
      if (r.error) {
        if (baseline[r.url]) next[r.url] = baseline[r.url];
        continue;
      }
      const { url, where, headStatus, ...keep } = r;
      next[url] = keep;
    }
    const sorted = Object.fromEntries(Object.entries(next).sort(([a], [b]) => a.localeCompare(b)));
    writeFileSync(BASELINE, JSON.stringify(sorted, null, 1) + "\n");
    console.log(`baseline written: ${Object.keys(sorted).length} URLs -> ${BASELINE}`);
  }
  if (argv.includes("--strict") && (d.changed.length || d.failed.length)) return 1;
  return 0;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  process.exitCode = await main(process.argv.slice(2));
}
