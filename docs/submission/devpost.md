# BinWise Tokyo: Devpost submission text

**Tagline:** Snap an item, learn exactly how your ward wants it thrown away.

**Track:** Theme Track "Rethinking Waste"

**Links:** live demo https://binwise.shotaro-takakura.workers.dev · repo https://github.com/Class-now/binwise · video https://youtu.be/ccLrkW5QbEQ

## Inspiration

I'm a university student living alone in Shibuya. In Tokyo, "how do I throw this away?" has a different answer in each ward. Shibuya and Shinjuku now collect plastic as a recyclable, but Setagaya still burns it. Fluorescent tubes, rechargeable batteries and spray cans each follow different rules from ward to ward. The official answers exist, but they are spread across long Japanese pages and PDFs. The cost of getting it wrong is real. Setagaya's own 2026 survey found that 16.6% of its burnable household waste was material it already recycles. Shibuya reports garbage-truck fires caused by mis-sorted batteries, lighters and gas canisters several times in 2026 alone. I wanted an answer that takes seconds, is right for *my* ward, and shows where it came from.

## What it does

- Take a photo or type an item in any of six languages (English, Japanese, Chinese, Korean, Vietnamese, Nepali).
- BinWise identifies the item and splits it into separable parts: a PET bottle becomes bottle → PET bottles, cap → plastic, label → plastic.
- For each part you get the ward's category (colour, icon and text), the preparation steps as a checklist, your **next collection day** from the days you saved, what happens to it after collection, the most common mistake, and the official source link.
- "How BinWise decided" shows exactly how the answer was reached: matching steps, models, scores.
- Unknown item? It says so and links the ward's official search. It never guesses a category.
- The "Sort it!" quiz teaches your ward's rules with 10 random items. An impact counter tracks lookups of commonly mis-sorted items.
- Covers Shibuya, Shinjuku and Setagaya, 181 items each.

## How we built it

- **Rules dataset first.** I read the official waste pages of all three wards (89 URLs: sorting dictionaries, category pages, bulky-waste fee lists, collection-day tables). From them I built a dataset of 181 household items with shared ids across wards. Every entry has its source URL. When a ward doesn't name an item, the category is derived from a general rule, and that rule is quoted. A validation script checks the schema and that every part's category exists.
- **Cloudflare Workers** serves the frontend (vanilla TypeScript, bundled with esbuild) and the API. The dataset is bundled JSON, so there is no database.
- **Workers AI, with a deliberately narrow role.** Llama 4 Scout identifies the object and its parts and returns JSON only. Llama 3.3 70B normalises odd queries ("the thing you fry tempura with, but used") and translates preparation steps. bge-m3 embeddings provide multilingual fuzzy matching. Each answer card is built only from dataset fields, so the model never writes a rule.
- A deterministic lexical matcher over aliases in six languages runs first and is also the offline fallback. It is fully tested with a fake AI binding.
- `check-sources.mjs` re-hashes every official page so I know when a ward changes its rules.

## Challenges we ran into

- **The wards disagree, and they change.** Shinjuku started product-plastic collection in April 2024 and battery collection in April 2025. Setagaya changed rechargeable batteries in October 2025. Generic "Japan recycling" advice is often wrong for a specific ward, so the data had to be per ward and dated.
- **Not letting the AI decide.** A language model will confidently produce a plausible category. Keeping it limited to identifying, matching and translating meant designing the pipeline so that a weak match shows alternatives or "not found" rather than a guess.
- **Using government pages responsibly.** All three wards restrict reproduction of their content. I use the rules as facts, quote only short rule texts with attribution, link every answer to the official page, and copy no images or PDFs.
- Composite items: deciding what counts as a separable part, and keeping the "mixed material, judge by the main material" rules consistent.

## Accomplishments that we're proud of

- 543 item-ward rules (181 × 3), each traceable to an official page. Items that no page covers are labelled "ask the office" instead of being guessed.
- Part-level answers with your actual next collection day, not just a category name.
- Fully works offline in deterministic mode. Tests cover the composite-item, weak-match, prompt-injection, unknown-item and fallback paths.
- A transparent "How BinWise decided" panel on every answer.

## What we learned

- For a waste problem, the hard part is the **rules data**, not the image recognition. Getting one ward's rules right took far longer than wiring up the vision model.
- The differences between neighbouring wards are larger than I expected, even for everyday items like plastic, batteries and fluorescent tubes.
- Grounding answers in a dataset and showing the trace makes the AI parts easier to trust, and easier to debug.

## What's next

- **Measure it** (see the Theme Track paragraph): a guess-before-answer prompt that counts actual mis-sorts prevented, before/after quiz scores, and a pilot with one apartment building counting violation-sticker bags.
- More wards, starting with the ones with the most foreign residents. Ward staff could check the dataset.
- Native-speaker review of the Chinese, Korean, Vietnamese and Nepali interface text.
- Collection-day tables for Shinjuku and Setagaya, which also publish them per area.

## Theme Track: the waste problem and how we'd measure success

BinWise Tokyo targets one specific waste problem: **household waste that gets sorted wrongly in Tokyo's wards**. Each ward has its own rules, published mostly in Japanese across long pages and PDFs. Plastic is a good example. Shibuya and Shinjuku collect it as a recyclable, while Setagaya still burns it. Mistakes go both ways. Recyclables end up in burnable waste: Setagaya's own 2026 survey found that 16.6% of its burnable household waste was material the ward already has a recycling route for. Hazardous items end up in the wrong bin as well: Shibuya reports garbage-truck fires caused by mis-sorted mobile batteries, lighters and gas canisters in March, June and July 2026. Wrongly sorted bags are also left at the collection point with a violation sticker. BinWise answers "which bin, how to prepare it and which day" per part of an item, for the user's own ward. Answers come only from a dataset built from the wards' official pages. I would measure whether it works in four ways. (1) Quiz accuracy before use and after the first week. (2) The share of lookups where the user's own guess, entered before seeing the answer, differs from the ward rule: each one is a mis-sort prevented. (3) A pilot with one apartment building, counting violation-sticker bags before and after. (4) A monthly automated check that the rules still match the official pages.

## Built with

cloudflare-workers · workers-ai · llama · typescript · esbuild · vitest · playwright
