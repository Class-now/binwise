import type { Item, Ward } from "./data";

// Deterministic lexical matcher over every alias of every item (all languages).
// Scores are 0..1; CONFIDENT means the answer can be shown without alternatives.
export const CONFIDENT = 0.85;
export const MIN_SCORE = 0.5;

export interface Scored {
  item: Item;
  score: number;
  alias: string;
}

const STOPWORDS = new Set(["a", "an", "the", "used", "old", "empty", "my", "some", "of", "broken", "dirty"]);

/** NFKC, lower-case, katakana → hiragana, punctuation to spaces, English stopwords and plural "s" removed. */
export function normalize(text: string): string {
  const base = text
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[ァ-ヶ]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0x60))
    .replace(/[\p{P}\p{S}]/gu, " ");
  return base
    .split(/\s+/)
    .filter((w) => w && !STOPWORDS.has(w))
    .map((w) => (/^[a-z]{4,}s$/.test(w) && !w.endsWith("ss") ? w.slice(0, -1) : w))
    .join(" ");
}

const compact = (s: string) => s.replace(/\s+/g, "");

function bigrams(s: string): Map<string, number> {
  const out = new Map<string, number>();
  for (let i = 0; i < s.length - 1; i++) {
    const g = s.slice(i, i + 2);
    out.set(g, (out.get(g) ?? 0) + 1);
  }
  return out;
}

function dice(a: string, b: string): number {
  if (a.length < 2 || b.length < 2) return 0;
  const ga = bigrams(a);
  const gb = bigrams(b);
  let overlap = 0;
  for (const [g, n] of ga) overlap += Math.min(n, gb.get(g) ?? 0);
  return (2 * overlap) / (a.length - 1 + (b.length - 1));
}

const LATIN = /^[\x20-\x7eÀ-ɏḀ-ỿ]+$/;

/** Substring test; Latin-script text must match on whole words ("pen" is not in "spaceship engine"). */
function contains(haystack: string, needle: string): boolean {
  if (LATIN.test(haystack) && LATIN.test(needle)) return ` ${haystack} `.includes(` ${needle} `);
  return compact(haystack).includes(compact(needle));
}

export function scoreAlias(query: string, alias: string): number {
  const qn = normalize(query);
  const an = normalize(alias);
  const q = compact(qn);
  const a = compact(an);
  if (!q || !a) return 0;
  if (q === a) return 1;
  if (a.length >= 2 && contains(qn, an)) return 0.75 + 0.2 * (a.length / q.length);
  if (q.length >= 2 && contains(an, qn)) return 0.6 + 0.3 * (q.length / a.length);
  return 0.8 * dice(q, a);
}

interface IndexEntry {
  item: Item;
  aliases: string[];
}

const indexCache = new WeakMap<Ward, IndexEntry[]>();

function index(ward: Ward): IndexEntry[] {
  let idx = indexCache.get(ward);
  if (!idx) {
    idx = ward.items.map((item) => ({ item, aliases: Object.values(item.names).flat() }));
    indexCache.set(ward, idx);
  }
  return idx;
}

/** Best score per item, highest first. */
export function lexicalMatch(ward: Ward, query: string, limit = 5): Scored[] {
  const scored: Scored[] = [];
  for (const { item, aliases } of index(ward)) {
    let best = 0;
    let bestAlias = "";
    for (const alias of aliases) {
      const s = scoreAlias(query, alias);
      if (s > best) {
        best = s;
        bestAlias = alias;
      }
    }
    if (best > 0) scored.push({ item, score: best, alias: bestAlias });
  }
  return scored.sort((x, y) => y.score - x.score).slice(0, limit);
}

/** Text embedded for each item: all English and Japanese aliases. */
export function embeddingText(item: Item): string {
  return [...(item.names.en ?? []), ...(item.names.ja ?? [])].join(" / ");
}

export function cosine(a: ArrayLike<number>, b: ArrayLike<number>): number {
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    const x = a[i]!;
    const y = b[i] ?? 0;
    dot += x * y;
    na += x * x;
    nb += y * y;
  }
  return na && nb ? dot / Math.sqrt(na * nb) : 0;
}

/** Maps bge-m3 cosine similarity onto the lexical 0..1 scale (0.8 → 1.0, 0.74 → 0.85, 0.6 → 0.5). */
export function embeddingScore(cos: number): number {
  return Math.max(0, Math.min(1, (cos - 0.4) / 0.4));
}

/** Merge candidate lists, keeping the best score per item id. */
export function mergeScored(...lists: Scored[][]): Scored[] {
  const best = new Map<string, Scored>();
  for (const list of lists) {
    for (const s of list) {
      const prev = best.get(s.item.id);
      if (!prev || s.score > prev.score) best.set(s.item.id, s);
    }
  }
  return [...best.values()].sort((x, y) => y.score - x.score);
}
