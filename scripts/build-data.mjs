// Builds data/wards/<ward>.json from
//   data/src/items.mjs           — shared item names, aliases, parts, tips, common mistakes
//   data/src/categories.mjs      — colours, icons, English names, what happens after collection
//   data/research/<ward>.json    — the ward's official categories and per-item rules (Japanese)
//   data/src/en/<ward>.json      — English for every Japanese rule string { "<ja>": "<en>" }
// Usage: node scripts/build-data.mjs [--missing]   (--missing prints untranslated strings as JSON)

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { items as master } from "../data/src/items.mjs";
import { categoryMeta } from "../data/src/categories.mjs";
import { WARDS } from "./validate-data.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const readJson = (p) => JSON.parse(readFileSync(join(root, p), "utf8"));

const TAKEBACK_FATE = {
  "used-cooking-oil": {
    ja: "回収された油は、燃料やせっけんなどの原料として再利用される。",
    en: "Collected oil is reused as a raw material, for example for fuel or soap.",
  },
  "plastic-food-tray": {
    ja: "店頭で回収されたトレイはリサイクル事業者に送られ、新しいトレイなどのプラスチック製品になる。",
    en: "Trays returned at shops go to recyclers and become new trays or other plastic products.",
  },
  "insulin-needle": {
    ja: "薬局や医療機関に戻し、医療廃棄物として処理される。収集作業員のけがを防ぐため家庭ごみに混ぜない。",
    en: "Returned to the pharmacy or clinic and treated as medical waste; kept out of household waste so collection workers are not injured.",
  },
  "mercury-thermometer": {
    ja: "専門の施設に送られ、水銀が回収される。",
    en: "Sent to a specialist facility that recovers the mercury.",
  },
};

function partKey(name) {
  // research files use the item-list names: "cup (plastic or paper)" → cup, "film window" → window
  return name.replace(/[(（].*$/, "").trim().split(/\s+/).at(-1).toLowerCase();
}

export function buildWard(ward) {
  const r = readJson(`data/research/${ward}.json`);
  const enPath = `data/src/en/${ward}.json`;
  const en = existsSync(join(root, enPath)) ? readJson(enPath) : {};
  const missing = new Set();
  const tr = (ja) => {
    const t = (ja ?? "").trim();
    if (!t) return "";
    if (en[t] === undefined) missing.add(t);
    return en[t] ?? "";
  };
  const steps = (list) => {
    const ja = (list ?? []).map((s) => s.trim()).filter(Boolean);
    return { ja, en: ja.map(tr) };
  };

  const categories = r.categories.map((c) => {
    const meta = categoryMeta[c.id];
    if (!meta) throw new Error(`${ward}: no metadata for category ${c.id}`);
    return {
      id: c.id,
      name: { ja: c.ja, en: c.en || meta.en },
      color: meta.color,
      icon: meta.icon,
      rules: steps(c.rulesJa),
      collection: { ja: c.collectionJa, en: tr(c.collectionJa) },
      fate: meta.fate,
      url: c.url,
    };
  });
  const catIds = new Set(categories.map((c) => c.id));
  const fateOf = (cat) => categories.find((c) => c.id === cat)?.fate;

  const items = master.map((m) => {
    const ri = r.items[m.id];
    if (!ri) throw new Error(`${ward}: research has no entry for ${m.id}`);
    // the ward's own steps win; generic tips are used only when the ward gives none
    const wardPrep = steps(ri.prepJa);
    const prep = wardPrep.ja.length ? wardPrep : (m.prep ?? { ja: [], en: [] });

    let parts;
    if (m.parts) {
      const map = Object.fromEntries(Object.entries(ri.parts ?? {}).map(([k, v]) => [partKey(k), v]));
      parts = m.parts.map((p) => {
        const category = map[p.id] ?? ri.category;
        if (!category) throw new Error(`${ward}: ${m.id} has no category for part ${p.id}`);
        return { id: p.id, name: { ja: p.ja, en: p.en }, category };
      });
    } else {
      const category = ri.category ?? Object.values(ri.parts ?? {})[0];
      if (!category) throw new Error(`${ward}: ${m.id} has no category`);
      parts = [{ id: "whole", name: { ja: m.n.ja[0], en: m.n.en[0] }, category }];
    }
    // The take-back category text is about batteries; these items go back through shops for other reasons.
    const takeback = p => (p.category === "store-takeback" ? TAKEBACK_FATE[m.id] : undefined);
    parts = parts.map((p) => ({ ...p, fate: takeback(p) ?? fateOf(p.category) }));

    const item = {
      id: m.id,
      names: m.n,
      parts,
      prep,
      source: ri.source,
      derived: !ri.explicit,
    };
    if (ri.ruleQuoteJa) item.ruleQuote = ri.ruleQuoteJa;
    if (ri.noteJa && ri.noteJa.trim()) item.note = { ja: ri.noteJa.trim(), en: tr(ri.noteJa) };
    if (m.mistake) {
      const mistake = { ja: m.mistake.ja[0], en: m.mistake.en[0] };
      const w = m.mistake.wrong;
      // only keep the "wrong bin" when it exists in this ward and is actually wrong here
      if (w && catIds.has(w) && !parts.every((p) => p.category === w)) mistake.wrongCategory = w;
      item.commonMistake = mistake;
    }
    return item;
  });

  const readOn = r.sources.map((s) => s.readOn).sort().at(-1);
  const out = {
    ward,
    name: { ja: r.nameJa, en: r.nameEn },
    searchUrl: r.searchUrl,
    readOn,
    sources: r.sources.map(({ url, title, readOn }) => ({ url, title, readOn })),
    categories,
    items,
  };
  return { out, missing: [...missing], research: r };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const showMissing = process.argv.includes("--missing");
  mkdirSync(join(root, "data", "wards"), { recursive: true });
  const allMissing = {};
  let failed = false;
  for (const w of WARDS) {
    if (!existsSync(join(root, `data/research/${w}.json`))) { console.error(`${w}: research file missing`); failed = true; continue; }
    let built;
    try { built = buildWard(w); } catch (e) { console.error(e.message); failed = true; continue; }
    const { out, missing, research } = built;
    if (missing.length) { allMissing[w] = missing; failed = true; }
    writeFileSync(join(root, `data/wards/${w}.json`), JSON.stringify(out, null, 1) + "\n");
    if (research.scheduleTable?.length) {
      writeFileSync(join(root, `data/wards/${w}-schedule.json`), JSON.stringify({
        ward: w, source: research.schedule?.url, readOn: out.readOn, notes: research.schedule?.notes,
        areas: research.scheduleTable,
      }, null, 1) + "\n");
    }
    console.error(`${w}: ${out.items.length} items, ${out.categories.length} categories, ${missing.length} untranslated`);
  }
  if (showMissing) console.log(JSON.stringify(allMissing, null, 1));
  process.exit(failed ? 1 : 0);
}
