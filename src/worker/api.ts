import {
  EMBED_MODEL,
  TEXT_MODEL,
  VISION_MODEL,
  embed,
  identifyImage,
  normalizeQuery,
  translate,
  type AiRunner,
  type IdentifiedItem,
} from "./ai";
import { WARDS, isWardId, type Category, type Item, type Ward, type WardId } from "./data";
import {
  CONFIDENT,
  MIN_SCORE,
  cosine,
  embeddingScore,
  embeddingText,
  lexicalMatch,
  mergeScored,
  type Scored,
} from "./match";

export const LANGUAGES = ["en", "ja", "zh", "ko", "vi", "ne"] as const;
export type Language = (typeof LANGUAGES)[number];

export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
export const MAX_LOOKUP_BYTES = 8 * 1024;
export const MAX_QUERY_CHARS = 200;
export const RATE_LIMIT = 30;
const RATE_WINDOW_MS = 60_000;
const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"];

const JSON_HEADERS = {
  "content-type": "application/json; charset=utf-8",
  "cache-control": "no-store",
};

export function json(body: unknown, status = 200, extra: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...JSON_HEADERS, ...extra } });
}

// ---- rate limit (per isolate, in memory) ----

const hits = new Map<string, number[]>();

export function resetRateLimit(): void {
  hits.clear();
}

/** Returns seconds to wait when the IP is over the limit, else 0. */
export function rateLimit(ip: string, now = Date.now()): number {
  const recent = (hits.get(ip) ?? []).filter((t) => now - t < RATE_WINDOW_MS);
  if (recent.length >= RATE_LIMIT) {
    hits.set(ip, recent);
    return Math.ceil((RATE_WINDOW_MS - (now - recent[0]!)) / 1000);
  }
  recent.push(now);
  hits.set(ip, recent);
  if (hits.size > 10_000) hits.delete(hits.keys().next().value!);
  return 0;
}

export function clientIp(request: Request): string {
  return request.headers.get("cf-connecting-ip") ?? "anonymous";
}

// ---- trace ----

export interface TraceStep {
  step: string;
  model?: string;
  ms: number;
  detail?: string;
}

export interface Trace {
  mode: "ai" | "lexical-fallback";
  steps: TraceStep[];
  matched?: { query: string; itemId: string; score: number }[];
}

async function timed<T>(trace: Trace, step: string, model: string | undefined, fn: () => Promise<T>): Promise<T> {
  const t0 = Date.now();
  try {
    const out = await fn();
    trace.steps.push({ step, model, ms: Date.now() - t0 });
    return out;
  } catch (err) {
    trace.steps.push({ step, model, ms: Date.now() - t0, detail: `failed: ${err instanceof Error ? err.message : "error"}` });
    throw err;
  }
}

// ---- /api/identify ----

/** Reads the request body, giving up (undefined) as soon as it exceeds `max` bytes. */
async function readCapped(request: Request, max: number): Promise<Uint8Array<ArrayBuffer> | undefined> {
  if (!request.body) return new Uint8Array();
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > max) {
      await reader.cancel().catch(() => {});
      return undefined;
    }
    chunks.push(value);
  }
  const out = new Uint8Array(total);
  let offset = 0;
  for (const c of chunks) {
    out.set(c, offset);
    offset += c.byteLength;
  }
  return out;
}

export async function handleIdentify(request: Request, ai: AiRunner | undefined): Promise<Response> {
  if (request.method !== "POST") return json({ error: "method_not_allowed" }, 405);
  if (!ai) return json({ error: "ai_unavailable", message: "Photo identification needs Workers AI. Type the item name instead." }, 503);
  const declared = Number(request.headers.get("content-length") ?? "0");
  if (declared > MAX_IMAGE_BYTES + 64 * 1024) return json({ error: "image_too_large", maxBytes: MAX_IMAGE_BYTES }, 413);

  const contentType = request.headers.get("content-type") ?? "";
  // Read the body with a hard cap: Content-Length may be absent (chunked uploads).
  const body = await readCapped(request, MAX_IMAGE_BYTES + 64 * 1024);
  if (!body) return json({ error: "image_too_large", maxBytes: MAX_IMAGE_BYTES }, 413);
  let bytes: Uint8Array;
  let type: string;
  if (contentType.startsWith("multipart/form-data")) {
    let form: FormData;
    try {
      form = await new Response(body, { headers: { "content-type": contentType } }).formData();
    } catch {
      return json({ error: "image_missing" }, 400);
    }
    const file = form.get("image");
    if (!file || typeof file === "string") return json({ error: "image_missing" }, 400);
    type = file.type;
    bytes = new Uint8Array(await file.arrayBuffer());
  } else {
    type = contentType.split(";")[0]!.trim();
    bytes = body;
  }
  if (!IMAGE_TYPES.includes(type)) return json({ error: "unsupported_image_type", accepted: IMAGE_TYPES }, 415);
  if (bytes.byteLength === 0) return json({ error: "image_missing" }, 400);
  if (bytes.byteLength > MAX_IMAGE_BYTES) return json({ error: "image_too_large", maxBytes: MAX_IMAGE_BYTES }, 413);

  // The image is only passed to the model; it is never logged or stored.
  const trace: Trace = { mode: "ai", steps: [] };
  let result: Awaited<ReturnType<typeof identifyImage>>;
  try {
    result = await timed(trace, "identify", VISION_MODEL, () => identifyImage(ai, bytes));
  } catch {
    return json({ error: "identify_failed", trace }, 502);
  }
  trace.steps[trace.steps.length - 1]!.detail = `attempts: ${result.attempts}`;
  if (!result.items) return json({ error: "identify_failed", trace }, 502);
  return json({ items: result.items, trace });
}

// ---- /api/lookup ----

interface LookupBody {
  query?: unknown;
  identified?: unknown;
  ward?: unknown;
  language?: unknown;
}

export interface Card {
  part: { id: string; name: string; nameJa: string };
  category: {
    id: string;
    name: string;
    nameJa: string;
    color: string;
    icon: string;
    collection: string;
    url: string;
  };
  fate: string;
}

export interface Answer {
  id: string;
  name: string;
  nameJa: string;
  cards: Card[];
  prep: string[];
  prepOriginal?: string[];
  note?: string;
  commonMistake?: { text: string; wrongCategory?: string };
  source: string;
  derived: boolean;
  ruleQuote?: string;
}

export interface LookupResult {
  query: string;
  status: "found" | "weak" | "not_found";
  confidence: number;
  answer?: Answer;
  alternatives: { id: string; name: string; score: number }[];
  officialSearchUrl: string;
}

const embeddingCache = new Map<WardId, Promise<number[][]>>();

export function resetEmbeddingCache(): void {
  embeddingCache.clear();
}

function itemVectors(ai: AiRunner, wardId: WardId): Promise<number[][]> {
  let vectors = embeddingCache.get(wardId);
  if (!vectors) {
    vectors = embed(ai, WARDS[wardId].items.map(embeddingText));
    vectors.catch(() => embeddingCache.delete(wardId));
    embeddingCache.set(wardId, vectors);
  }
  return vectors;
}

async function candidates(
  wardId: WardId,
  query: string,
  ai: AiRunner | undefined,
  trace: Trace,
): Promise<Scored[]> {
  const ward = WARDS[wardId];
  const t0 = Date.now();
  const lexical = lexicalMatch(ward, query);
  trace.steps.push({ step: "lexical-match", ms: Date.now() - t0, detail: summary(lexical) });
  if (!ai || (lexical[0]?.score ?? 0) >= CONFIDENT) return lexical;

  const lists: Scored[][] = [lexical];
  let english = query;
  try {
    const n = await timed(trace, "normalize", TEXT_MODEL, () => normalizeQuery(ai, query));
    trace.steps[trace.steps.length - 1]!.detail = `→ ${n.name_en ?? "(none)"} / ${n.name_ja ?? "(none)"}`;
    for (const name of [n.name_en, n.name_ja]) if (name) lists.push(lexicalMatch(ward, name));
    if (n.name_en) english = n.name_en;
  } catch {
    // Keep the lexical result.
  }
  let merged = mergeScored(...lists);
  if ((merged[0]?.score ?? 0) >= CONFIDENT) return merged;

  try {
    const scored = await timed(trace, "embedding-match", EMBED_MODEL, async () => {
      const [vectors, [q]] = await Promise.all([itemVectors(ai, wardId), embed(ai, [english])]);
      if (!q) return [];
      return ward.items
        .map((item, i) => ({ item, score: embeddingScore(cosine(q, vectors[i] ?? [])), alias: english }))
        .sort((x, y) => y.score - x.score)
        .slice(0, 5);
    });
    trace.steps[trace.steps.length - 1]!.detail = summary(scored);
    merged = mergeScored(merged, scored);
  } catch {
    // Embeddings unavailable; lexical and normalised matches stand.
  }
  return merged;
}

function summary(list: Scored[]): string {
  return list
    .slice(0, 3)
    .map((s) => `${s.item.id}:${s.score.toFixed(2)}`)
    .join(", ");
}

const pick = (text: { ja: string; en: string }, lang: Language) => (lang === "ja" ? text.ja : text.en);

function itemName(item: Item, lang: Language): string {
  return item.names[lang]?.[0] ?? item.names.en?.[0] ?? item.id;
}

function buildAnswer(ward: Ward, item: Item, lang: Language): Answer {
  const categories = new Map<string, Category>(ward.categories.map((c) => [c.id, c]));
  const cards: Card[] = item.parts.map((part) => {
    const cat = categories.get(part.category)!;
    return {
      part: { id: part.id, name: pick(part.name, lang), nameJa: part.name.ja },
      category: {
        id: cat.id,
        name: pick(cat.name, lang),
        nameJa: cat.name.ja,
        color: cat.color,
        icon: cat.icon,
        collection: pick(cat.collection, lang),
        url: cat.url,
      },
      fate: pick(part.fate, lang),
    };
  });
  return {
    id: item.id,
    name: itemName(item, lang),
    nameJa: item.names.ja?.[0] ?? item.id,
    cards,
    prep: lang === "ja" ? item.prep.ja : item.prep.en,
    note: item.note ? pick(item.note, lang) : undefined,
    commonMistake: item.commonMistake
      ? { text: pick(item.commonMistake, lang), wrongCategory: item.commonMistake.wrongCategory }
      : undefined,
    source: item.source,
    derived: item.derived,
    ruleQuote: item.ruleQuote,
  };
}

const translationCache = new Map<string, string[]>();

/** Translate prep steps, note and common mistake (English dataset text) for languages other than ja/en. */
async function localize(answer: Answer, wardId: WardId, lang: Language, ai: AiRunner, trace: Trace): Promise<void> {
  const texts = [...answer.prep, answer.note ?? "", answer.commonMistake?.text ?? ""];
  const key = `${wardId}:${answer.id}:${lang}`;
  let out = translationCache.get(key);
  if (!out) {
    try {
      out = await timed(trace, "translate", TEXT_MODEL, () => translate(ai, texts.map((t) => t || "-"), lang));
    } catch {
      out = undefined;
    }
    if (!out) {
      trace.steps.push({ step: "translate", ms: 0, detail: "unusable output; showing English" });
      return;
    }
    translationCache.set(key, out);
  }
  answer.prepOriginal = answer.prep;
  answer.prep = out.slice(0, answer.prep.length);
  const [note, mistake] = out.slice(answer.prepOriginal.length);
  if (answer.note && note) answer.note = note;
  if (answer.commonMistake && mistake) answer.commonMistake.text = mistake;
}

async function lookupOne(
  wardId: WardId,
  query: string,
  lang: Language,
  ai: AiRunner | undefined,
  trace: Trace,
): Promise<LookupResult> {
  const ward = WARDS[wardId];
  const ranked = await candidates(wardId, query, ai, trace);
  const top = ranked[0];
  const score = Math.round((top?.score ?? 0) * 100) / 100;
  const base = { query, officialSearchUrl: ward.searchUrl, confidence: score };
  const alt = (list: Scored[]) =>
    list
      .filter((s) => s.score >= 0.3)
      .slice(0, 3)
      .map((s) => ({ id: s.item.id, name: itemName(s.item, lang), score: Math.round(s.score * 100) / 100 }));

  if (!top || top.score < MIN_SCORE) return { ...base, status: "not_found", alternatives: alt(ranked) };

  const answer = buildAnswer(ward, top.item, lang);
  if (ai && !["ja", "en"].includes(lang)) await localize(answer, wardId, lang, ai, trace);
  (trace.matched ??= []).push({ query, itemId: top.item.id, score });
  if (top.score >= CONFIDENT) return { ...base, status: "found", answer, alternatives: [] };
  return { ...base, status: "weak", answer, alternatives: alt(ranked.slice(1)) };
}

function parseIdentified(value: unknown): IdentifiedItem[] | undefined {
  if (!value || typeof value !== "object") return undefined;
  const items = (value as { items?: unknown }).items;
  if (!Array.isArray(items)) return undefined;
  const out = items
    .slice(0, 3)
    .map((i) => (i && typeof i === "object" ? (i as { name_en?: unknown }).name_en : undefined))
    .filter((n): n is string => typeof n === "string" && n.trim().length > 0)
    .map((n) => ({ name_en: n.trim().slice(0, 60), materials: [], parts: [] }));
  return out.length ? out : undefined;
}

export async function handleLookup(request: Request, ai: AiRunner | undefined): Promise<Response> {
  if (request.method !== "POST") return json({ error: "method_not_allowed" }, 405);
  const text = await request.text();
  if (text.length > MAX_LOOKUP_BYTES) return json({ error: "body_too_large" }, 413);
  let body: LookupBody;
  try {
    body = JSON.parse(text) as LookupBody;
  } catch {
    return json({ error: "invalid_json" }, 400);
  }
  if (!body || typeof body !== "object") return json({ error: "invalid_json" }, 400);
  if (!isWardId(body.ward)) return json({ error: "unknown_ward", wards: Object.keys(WARDS) }, 400);
  const requested: Language = (LANGUAGES as readonly string[]).includes(body.language as string)
    ? (body.language as Language)
    : "en";

  let queries: string[];
  const identified = parseIdentified(body.identified);
  if (identified) {
    queries = identified.map((i) => i.name_en);
  } else if (typeof body.query === "string" && body.query.trim()) {
    if (body.query.length > MAX_QUERY_CHARS) return json({ error: "query_too_long", maxChars: MAX_QUERY_CHARS }, 400);
    queries = [body.query.trim()];
  } else {
    return json({ error: "query_missing" }, 400);
  }

  // Without AI: lexical matching only, answers in English or Japanese.
  const language: Language = ai || requested === "ja" ? requested : "en";
  const trace: Trace = { mode: ai ? "ai" : "lexical-fallback", steps: [] };
  if (!ai) trace.steps.push({ step: "fallback", ms: 0, detail: "Workers AI unavailable: lexical matching only, English/Japanese only" });

  const results: LookupResult[] = [];
  for (const q of queries) results.push(await lookupOne(body.ward, q, language, ai, trace));
  return json({ ward: body.ward, language, requestedLanguage: requested, results, trace });
}
