# Impact: the waste problem and how we would measure it

## Theme Track paragraph

BinWise Tokyo targets one specific waste problem: **household waste that gets sorted wrongly in Tokyo's wards**. Each ward has its own rules, published mostly in Japanese across long pages and PDFs. Plastic is a good example. Shibuya and Shinjuku collect it as a recyclable, while Setagaya still burns it. Mistakes go both ways. Recyclables end up in burnable waste: Setagaya's own 2026 survey found that 16.6% of its burnable household waste was material the ward already has a recycling route for. Hazardous items end up in the wrong bin as well: Shibuya reports garbage-truck fires caused by mis-sorted mobile batteries, lighters and gas canisters in March, June and July 2026. Wrongly sorted bags are also left at the collection point with a violation sticker. BinWise answers "which bin, how to prepare it and which day" per part of an item, for the user's own ward. Answers come only from a dataset built from the wards' official pages. We would measure whether it works in four ways. (1) Quiz accuracy before use and after the first week. (2) The share of lookups where the user's own guess, entered before seeing the answer, differs from the ward rule: each one is a mis-sort prevented. (3) A pilot with one apartment building, counting violation-sticker bags before and after. (4) A monthly automated check that the rules still match the official pages.

## The problem, with the wards' own figures

| Evidence | Figure | Source |
|---|---|---|
| Recyclables in Setagaya's **burnable** household waste (可燃系資源: items the ward already has a recycling route for: paper, cartons, PET bottles, cans, glass bottles, etc.) | **16.6%** of burnable waste by weight, ward-wide; 13.8%–20.0% across the eight survey districts | 世田谷区「家庭ごみ組成分析調査及び計量調査資料集（令和8年度版）」(August 2026), 図1-1 / 表 可燃ごみ組成 — https://www.city.setagaya.lg.jp/documents/495/soseir8-2.pdf |
| Recyclables in Setagaya's **non-burnable** waste | **6.9%** (不燃系資源 6.5% + 可燃系資源 0.4%); a further 7.0% was burnable material | same document, ②不燃ごみ |
| Items banned from collection (排出禁止物) found in Setagaya's burnable waste | **1.1%** ward-wide | same document |
| Fires in Shibuya's garbage trucks and facilities caused by mis-sorted items | Truck fires in **March 2026** (lighters, gas canisters), **June 2026** (a mobile battery), **July 2026**, and **August 2025** (a handheld fan's battery); a bulky-waste facility fire in **November 2023** (a cordless vacuum's battery). The page gives no yearly totals. | 渋谷区「清掃車両・処理施設で火災が多発しています」(updated 2026-07-09) — https://www.city.shibuya.tokyo.jp/kurashi/gomi/kateigomi/20150218kasai.html |

What we could **not** find published: a plastic-contamination rate for Shibuya's or Shinjuku's new plastic collection, and any ward's count of violation-sticker bags. We do not estimate these. Getting them is part of the pilot (method 3) and a question to ask each ward's 清掃事務所.

Why per-ward answers matter: the same item belongs in a different stream in different wards. In the dataset, plastic is a recyclable in Shibuya (since July 2022) and Shinjuku (since April 2024), but burnable in Setagaya. Fluorescent tubes are a recyclable in Shibuya but non-burnable in the other two. Rechargeable batteries go to shop collection boxes in Shibuya, to the recyclables day in Shinjuku (since April 2025), and to non-burnable waste in a separate bag in Setagaya (since October 2025). Advice copied from another ward or from a general "Japan recycling" guide is often wrong. See `docs/data-sources.md`.

## What the app counts today

The impact counter in the app is local to the device (localStorage, never sent anywhere):

- **checked**: number of items looked up.
- **avoided likely mis-sorts**: lookups of an item that has a `commonMistake` entry in the dataset (46 of the 181 items, e.g. batteries in burnable waste, PET bottles with caps on, cooking oil down the sink).

This is an **indicator, not a measurement**. It assumes the user would have made the common mistake, which is not known. The methods below replace it with measured numbers.

## How we would measure success

### 1. Quiz accuracy before and after (knowledge)

- The "Sort it!" quiz draws 10 random items from the user's ward. Before first use, an optional baseline quiz; after 7 days, a second quiz.
- Metric: mean score change, per category (plastic, batteries and other hazardous items, bulky items).
- Success threshold for a pilot: +2 correct answers out of 10 on average, and fewer than 1 in 10 users scoring lower.
- Needs: an opt-in, anonymous aggregate (score pairs only, no item history). Not built yet; today scores stay on the device.

### 2. Guess-before-answer (mis-sorts prevented)

- Optional prompt before the answer card: "Where would you have put it?" with the ward's categories.
- Metric: **share of lookups where the guess differs from the ward rule** = mis-sorts prevented (an actual measure, unlike today's counter). Broken down by item and by ward, it also shows which rules confuse people most. That is useful to the wards themselves.
- Not built yet; it is the next change to the answer flow.

### 3. Building pilot (behaviour on the street)

- One apartment building, ideally one with many students or foreign residents. Share BinWise with the residents (QR code at the collection point, in their languages).
- Metric: number of bags left with a violation sticker (違反シール) per month, and the building manager's own count of wrongly sorted bags. Compare 2 months before with 2 months after.
- Needs: a building manager or ward partner (the ward's 清掃事務所). The app cannot measure this on its own.

### 4. Data freshness (the answers stay right)

- `scripts/check-sources.mjs` re-checks all 89 official source URLs. For each URL it makes a HEAD request (status, ETag, Last-Modified), then a GET, and hashes the visible text. The hash is compared with the committed baseline `data/source-hashes.json`.
- Run monthly (`node scripts/check-sources.mjs --report report.md --strict`). A changed page means a person re-reads it and updates `data/research/<ward>.json`. A failed URL means the page has moved.
- Metric: days between a ward changing a rule and BinWise reflecting it. Target: under 31 days.
- Baseline written 2026-11-10: 89 URLs, all reachable.
