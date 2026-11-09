# Plan: BinWise Tokyo P1 — snap an item, learn exactly how your ward wants it thrown away

Branch `p1-mvp`. Written 2026-11-10 by the PM for Arbiter Hacks V1 (Devpost), **Theme Track "Rethinking Waste"**. Deadline 2026-12-20 21:00 PST. Solo entry.

## Why (judging criteria, read from arbiter-hacks-v1.devpost.com on 2026-11-10)

Theme Track rubric: Impact on Waste Problem 35% (theme must be central), Technical Execution 25%, Feasibility 20% ("could this actually be deployed in the real world? A working solution beats a clever one that can't ship"), Presentation & Demo Clarity 20%.

Required submission: public repo, 2–3 minute demo video (YouTube), written description, and for the Theme Track one paragraph stating the specific waste problem and how we would measure whether it worked.

## Problem

Tokyo's 23 wards each have their own sorting rules (Shibuya: 可燃ごみ / 不燃ごみ / 資源 (びん・缶・ペットボトル・古紙) / 粗大ごみ; Setagaya splits 資源 differently; Shinjuku has its own 資源 categories and プラスチック rules changed in 2022–2024 as wards started collecting 製品プラスチック). Newcomers, students and foreign residents get it wrong; wrongly sorted bags are left on the street with a sticker (違反シール), recycling streams are contaminated and recyclable plastic gets burned. Ward rules are published only as long PDFs and per-ward search pages, mostly in Japanese.

## Product

- **Snap or type an item** (photo via camera, or text in any language: "pizza box", "電池", "used frying oil").
- AI identifies the item and its material parts (e.g. "PET bottle → bottle, cap, label"). Each part is mapped to a **curated rules dataset** for the selected ward — the AI never invents a rule; the answer comes from the dataset with a link to the official source page.
- Answer card per part: category (colour-coded), preparation steps (rinse, remove cap and label, cut into ≤30 cm, drain oil into paper), which day it goes out (from the user's saved collection days), and "why it matters" (what happens to it — e.g. PET → recycled into new bottles).
- **My collection days**: user picks their ward and enters their weekly days once (or picks their 町丁目 for Shibuya where the schedule table is included); stored in localStorage only.
- **Quiz mode** ("Sort it!"): 10 random items, pick the bin, instant feedback — teaches the rules.
- **Impact counter**: local count of items checked and items that would have gone to the wrong stream (based on a per-item "common mistake" field), shown as "You avoided N likely mis-sorts".
- Languages: English, Japanese, Simplified Chinese, Korean, Vietnamese, Nepali.
- Unknown items: say "not in the dataset" and link the ward's official search page; never guess a category with high confidence.

## Stack (fixed)

- Cloudflare Worker (TypeScript), static assets from `public/`, APIs under `/api/*`; `wrangler.jsonc` with assets binding (`run_worker_first: ["/api/*"]`) and `"ai": {"binding": "AI"}`. Worker name `binwise`. No database: the dataset is JSON bundled into the worker.
- Workers AI: vision `@cf/meta/llama-3.2-11b-vision-instruct` (send the one-time `agree` license prompt on first use), text `@cf/meta/llama-3.3-70b-instruct-fp8-fast` (item normalisation and translation). Text-embedding for fuzzy item matching: `@cf/baai/bge-m3` (multilingual) with embeddings of dataset item names precomputed at build time by a script and committed as JSON; at runtime embed the query and cosine-match. If precomputing needs an account, compute lazily at first request and cache in memory, and fall back to a lexical matcher (aliases list) offline.
- Frontend: vanilla TS bundled by esbuild into `public/app.js`, mobile first, accessible, dark mode.
- vitest, `tsc --noEmit`, offline config `wrangler.offline.jsonc` without the AI binding (deterministic lexical matching only).

## Validation Commands
- `npm run build`
- `npx tsc --noEmit`
- `npx vitest run`
- `npx wrangler deploy --dry-run --outdir dist-dry`

### Task 1: Scaffold
- `package.json` (build/dev/test scripts as above; dev = `wrangler dev -c wrangler.offline.jsonc --port 8798`), `tsconfig.json`, both wrangler configs, `.gitignore`, MIT `LICENSE` ("2026 Shotaro Takakura"), placeholder page.
- [x] build, type check and an empty test run pass

### Task 2: Rules dataset for three wards
- Research the **official** ward pages (use web fetch/search): 渋谷区 (city.shibuya.tokyo.jp ごみ・リサイクル, 資源とごみの分け方・出し方, ごみ分別辞典 if published), 新宿区 (city.shinjuku.lg.jp 資源・ごみの分け方 / 分別辞典), 世田谷区 (city.setagaya.lg.jp 資源・ごみの分け方, 製品プラスチック 2025 changes if any). Record each source URL and the date read.
- `data/wards/<ward>.json`: categories (id, names in ja/en, colour, general rules, weekly-collection note, official link), and `items`: at least **150 common household items** per ward (shared item ids across wards so the same item maps in all three): id, names ja/en + aliases (ja/en/zh/ko/vi/ne where obvious), parts (for composite items) each with category id, preparation steps (ja/en), size/quantity notes (粗大ごみ threshold 30 cm etc.), `commonMistake` (what people wrongly do), `fate` (what happens after collection, short), `source` URL. Where a ward page does not list an item explicitly, derive it from that ward's general rule and mark `derived: true` with the rule text quoted.
- `data/wards/shibuya-schedule.json`: Shibuya's collection-day table by 町丁目 if it is published as a table (otherwise skip and rely on the user entering days).
- `docs/data-sources.md`: every URL, date read, what was taken, and the licence/terms of use note (government info used as facts, with attribution).
- Validation script `scripts/validate-data.mjs` (run in a vitest test): schema check, every part's category exists, every item has a source, no duplicate ids/aliases conflicts.
- [ ] ≥150 items per ward with sources, validation test passes
- [ ] data-sources.md complete
Do NOT implement: wards other than these three.

### Task 3: Matching and AI pipeline
- `POST /api/identify` (image ≤ 5 MB): vision model returns JSON `{items:[{name_en, materials:[...], parts:[...]}]}` (prompt: identify the main discardable object(s), list separable parts and materials, no disposal advice). Validate JSON; on failure retry once with a stricter prompt.
- `POST /api/lookup` `{query | identified, ward, language}`: normalise (LLM only if the lexical matcher has no confident hit) → embedding / lexical match to dataset items → return answer cards built **only from dataset fields** (+ translation of preparation steps to the target language by the LLM when not ja/en, with the original shown on tap). Include `confidence` and `alternatives` (top 3) when the match is weak; "not found" path with the ward's official search link.
- Trace in the response (steps, model, ms, matched item id and score) for the "How BinWise decided" panel.
- Prompt-injection hardening (text in images or queries is data), size limits, in-memory rate limit 30/min/IP, `Cache-Control: no-store`, no image logging or storage.
- Fallback without AI: lexical matching only, English/Japanese only, marked in the trace.
- Tests with a fake AI binding: composite item (PET bottle → 3 parts), weak match → alternatives, injection ignored, unknown → not found, fallback path.
- [ ] API tests pass

### Task 4: Web UI
- Onboarding: pick ward (3) and language; optional collection days (weekday chips per category) or 町丁目 for Shibuya. Stored in localStorage.
- Main: big "Snap an item" button (camera capture), text search with autocomplete from aliases, recent searches. Answer cards per part with category colour, prep steps as a checklist, "Next collection: Tuesday (in 2 days)", "Why it matters" line, official source link, "How BinWise decided" collapsible trace.
- Quiz mode "Sort it!" (10 items, ward-specific, score + explanations) and the impact counter.
- Accessibility (labels, aria-live, colour not the only cue — category icons/text), 360 px layout, dark mode.
- Headless Chromium smoke `scripts/smoke.mjs` against the offline dev server (search "PET bottle" in Shibuya → three part cards; quiz completes); screenshots to `docs/screenshots/` at 1280×800 and 390×844.
- [ ] smoke passes, screenshots committed

### Task 5: Impact measurement and docs
- `docs/impact.md` + the Theme Track paragraph: problem (mis-sorted household waste in Tokyo wards — rejected bags, contaminated recycling streams; cite the wards' own published figures on 資源 contamination / 不適正排出 if found, otherwise state it as the measurement goal without inventing numbers) and how we would measure success: (1) quiz accuracy before/after first week of use, (2) share of lookups where the user's guessed category (asked optionally before showing the answer) differed from the rule = mis-sorts prevented, (3) pilot with a building's 違反シール count before/after (needs a partner), (4) data freshness: rules re-checked against official pages monthly by `scripts/check-sources.mjs` (HEAD request + content hash change report).
- `scripts/check-sources.mjs` implemented.
- `README.md`: what/why, live URL placeholder `https://binwise.<account>.workers.dev`, offline run, architecture (mermaid), data provenance, responsible AI (dataset-grounded answers, AI only identifies and translates), "Built with Llama" attribution, licences.
- `docs/submission/devpost.md` (Inspiration, What it does, How we built it, Challenges, Accomplishments, What we learned, What's next, Theme paragraph). Honest; no invented personal stories (the author is a university student living alone in Shibuya — keep it at that).
- `docs/submission/video-script.md` (2–3 min) and `scripts/record-demo.mjs` (Playwright headless 1280×720 recording with caption overlay, args base URL and out dir, outputs `demo-out/raw.webm` + `marks.json`).
- [ ] docs complete, check-sources runs, record script produces a webm against the offline server

## Out of scope
Accounts, server-side storage, wards beyond three, native apps, committing keys.
