# Demo video script (target 2:30, max 3:00)

Raw footage: `node scripts/record-demo.mjs [baseUrl] [outDir]` records the text-search walkthrough at 1280×720 with captions (`demo-out/raw.webm`). Scene start times are in `demo-out/marks.json`, so narration and cuts can be aligned. The offline recording is about 72 s. The photo scene (B) has to be filmed against the deployed worker, because photo recognition needs Workers AI.

| # | Time | On screen | Narration |
|---|---|---|---|
| A | 0:00–0:15 | Title card, then a bag with a violation sticker (or the ward's sorting PDF scrolling) | "In Tokyo, every ward has its own garbage rules. Plastic is a recyclable in Shibuya, but it's burnable in Setagaya. Get it wrong and your bag stays on the street, recyclables get burned, and batteries start fires in garbage trucks." |
| B | 0:15–0:40 | Phone: tap **Snap an item**, photograph a PET bottle → three part cards | "BinWise Tokyo: snap an item. Llama 3.2 Vision identifies it and splits it into parts: bottle, cap, label. Each part gets my ward's bin, how to prepare it, and my next collection day." |
| C | 0:40–0:55 | Recording scenes `intro`, `setup`, `area` | "Setup takes ten seconds: pick your ward and language. In Shibuya, picking your area fills in the collection days. It's all stored on your phone only." |
| D | 0:55–1:15 | Scenes `pet-cards`, `trace` | "Typing works too. Every answer comes from a dataset I built from the wards' official pages, 181 items per ward, and links back to the source. 'How BinWise decided' shows each step. The AI identifies and translates, but it never decides the rule." |
| E | 1:15–1:35 | Scenes `multilingual`, `battery`, `oil` | "Any of six languages: here, 電池, battery. Batteries are the cause of many truck fires, so the card says exactly how to put them out, and the most common mistake. Used frying oil goes to a drop-off box or gets soaked up, never down the sink." |
| F | 1:35–1:45 | Scene `unknown` | "If an item isn't in the dataset, BinWise says so and links the ward's official search. No guessing." |
| G | 1:45–2:05 | Scenes `quiz`, `score`, `impact` | "'Sort it!' teaches your ward's rules in ten items. The impact counter tracks lookups of items people commonly get wrong." |
| H | 2:05–2:30 | `docs/impact.md` table, then the check-sources output | "Setagaya's own survey found 16.6% of its burnable waste was already-recyclable material. We'd measure BinWise by quiz scores before and after, by how often a user's guess was wrong before seeing the answer, and with a building pilot counting violation stickers. A monthly script re-checks every official page so the rules stay current." |
| I | 2:30–2:40 | End card: URL, repo, "Built with Llama · Cloudflare Workers AI" | "BinWise Tokyo. Throw it away right, the first time." |

Notes

- Keep every claim to what the app does in the recording. The numbers come from `docs/impact.md` (Setagaya R8 survey; Shibuya fire page).
- Captions are burned into the raw recording. For the final cut, either keep them or re-record with an empty caption and add subtitles in the editor.
- Upload to YouTube as public or unlisted, at 2:30–3:00.
