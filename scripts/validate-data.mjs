// Validates data/wards/<ward>.json files.
// Usage: node scripts/validate-data.mjs   (exits 1 on errors)
// Also imported by test/data.test.ts.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

export const WARDS = ["shibuya", "shinjuku", "setagaya"];
export const MIN_ITEMS = 150;
const LANGS = ["ja", "en", "zh", "ko", "vi", "ne"];

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

export function loadWard(ward) {
  return JSON.parse(readFileSync(join(root, "data", "wards", `${ward}.json`), "utf8"));
}

export function normalizeAlias(s) {
  return s.normalize("NFKC").toLowerCase().replace(/\s+/g, " ").trim();
}

const isUrl = (s) => typeof s === "string" && /^https:\/\/\S+$/.test(s);
const isText = (s) => typeof s === "string" && s.trim().length > 0;
const isBilingual = (o) => o && isText(o.ja) && isText(o.en);
const isStepList = (o) =>
  o && Array.isArray(o.ja) && Array.isArray(o.en) && o.ja.length === o.en.length &&
  o.ja.every(isText) && o.en.every(isText);

export function validateWard(data) {
  const errors = [];
  const err = (msg) => errors.push(`${data?.ward ?? "?"}: ${msg}`);

  if (!WARDS.includes(data.ward)) err(`unknown ward id ${data.ward}`);
  if (!isBilingual(data.name)) err("name must have ja and en");
  if (!isUrl(data.searchUrl)) err("searchUrl must be an https URL");
  if (!Array.isArray(data.sources) || data.sources.length === 0) err("sources missing");
  for (const s of data.sources ?? []) {
    if (!isUrl(s.url)) err(`source url invalid: ${s.url}`);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(s.readOn ?? "")) err(`source readOn invalid: ${s.url}`);
  }

  const catIds = new Set();
  for (const c of data.categories ?? []) {
    if (!isText(c.id)) { err("category without id"); continue; }
    if (catIds.has(c.id)) err(`duplicate category ${c.id}`);
    catIds.add(c.id);
    if (!isBilingual(c.name)) err(`category ${c.id}: name needs ja and en`);
    if (!/^#[0-9a-f]{6}$/i.test(c.color ?? "")) err(`category ${c.id}: color invalid`);
    if (!isText(c.icon)) err(`category ${c.id}: icon missing`);
    if (!isStepList(c.rules)) err(`category ${c.id}: rules need matching ja/en lists`);
    if (!isBilingual(c.fate)) err(`category ${c.id}: fate needs ja and en`);
    if (!isUrl(c.url)) err(`category ${c.id}: url invalid`);
  }
  if (catIds.size === 0) err("no categories");

  const items = data.items ?? [];
  if (items.length < MIN_ITEMS) err(`only ${items.length} items (need ${MIN_ITEMS})`);

  const itemIds = new Set();
  const aliasOwner = new Map();
  const usedCats = new Set();
  for (const it of items) {
    const where = `item ${it.id}`;
    if (!/^[a-z0-9-]+$/.test(it.id ?? "")) err(`${where}: bad id`);
    if (itemIds.has(it.id)) err(`${where}: duplicate id`);
    itemIds.add(it.id);

    if (!it.names || !Array.isArray(it.names.ja) || !it.names.ja.length || !Array.isArray(it.names.en) || !it.names.en.length) {
      err(`${where}: names.ja and names.en are required`);
    }
    for (const [lang, list] of Object.entries(it.names ?? {})) {
      if (!LANGS.includes(lang)) err(`${where}: unknown language ${lang}`);
      for (const a of list) {
        if (!isText(a)) { err(`${where}: empty alias`); continue; }
        const key = normalizeAlias(a);
        const owner = aliasOwner.get(key);
        if (owner && owner !== it.id) err(`${where}: alias "${a}" also used by ${owner}`);
        aliasOwner.set(key, it.id);
      }
    }

    if (!Array.isArray(it.parts) || it.parts.length === 0) err(`${where}: parts missing`);
    const partIds = new Set();
    for (const p of it.parts ?? []) {
      if (partIds.has(p.id)) err(`${where}: duplicate part ${p.id}`);
      partIds.add(p.id);
      if (!isBilingual(p.name)) err(`${where}/${p.id}: part name needs ja and en`);
      if (!catIds.has(p.category)) err(`${where}/${p.id}: category ${p.category} does not exist`);
      usedCats.add(p.category);
      if (!isBilingual(p.fate)) err(`${where}/${p.id}: fate needs ja and en`);
    }

    if (!isStepList(it.prep)) err(`${where}: prep needs matching ja/en lists`);
    if (!isUrl(it.source)) err(`${where}: source must be an https URL`);
    if (typeof it.derived !== "boolean") err(`${where}: derived must be boolean`);
    if (it.derived && !isText(it.ruleQuote)) err(`${where}: derived items must quote the rule`);
    if (it.note !== undefined && !isBilingual(it.note)) err(`${where}: note needs ja and en`);
    if (it.commonMistake !== undefined) {
      if (!isBilingual(it.commonMistake)) err(`${where}: commonMistake needs ja and en`);
      const w = it.commonMistake.wrongCategory;
      if (w !== undefined && !catIds.has(w)) err(`${where}: wrongCategory ${w} does not exist`);
      if (w !== undefined && it.parts?.every((p) => p.category === w)) err(`${where}: wrongCategory equals the right one`);
    }
  }
  return errors;
}

export function validateSchedule(data, ward) {
  const errors = [];
  if (!Array.isArray(data.areas) || data.areas.length === 0) errors.push("schedule: no areas");
  const cats = new Set(ward.categories.map((c) => c.id));
  for (const a of data.areas ?? []) {
    if (!isText(a.area)) errors.push("schedule: area without name");
    for (const [cat, days] of Object.entries(a.days ?? {})) {
      if (!cats.has(cat)) errors.push(`schedule ${a.area}: unknown category ${cat}`);
      if (!isText(days)) errors.push(`schedule ${a.area}: empty days for ${cat}`);
    }
  }
  return errors;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  let failed = false;
  for (const w of WARDS) {
    const errors = validateWard(loadWard(w));
    if (errors.length) { failed = true; console.error(errors.join("\n")); }
    else console.log(`${w}: ok`);
  }
  process.exit(failed ? 1 : 0);
}
