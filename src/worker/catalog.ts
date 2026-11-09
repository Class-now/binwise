import shibuyaSchedule from "../../data/wards/shibuya-schedule.json";
import { json } from "./api";
import { WARDS, isWardId, type WardId } from "./data";

// GET /api/catalog?ward=&language= — what the page needs without calling AI:
// categories, item names and aliases (autocomplete), single-bin items (quiz), and Shibuya's area table.

export interface CatalogItem {
  id: string;
  name: string;
  nameJa: string;
  aliases: string[];
  categories: string[];
  prep: string[];
  mistake?: string;
}

export interface Catalog {
  ward: WardId;
  name: string;
  nameJa: string;
  searchUrl: string;
  readOn: string;
  categories: { id: string; name: string; nameJa: string; color: string; icon: string; collection: string; url: string }[];
  items: CatalogItem[];
  areas?: { area: string; days: Record<string, string> }[];
  scheduleSource?: string;
}

const SCHEDULES: Partial<Record<WardId, { source: string; areas: { area: string; days: Record<string, string> }[] }>> = {
  shibuya: shibuyaSchedule as { source: string; areas: { area: string; days: Record<string, string> }[] },
};

export function buildCatalog(wardId: WardId, language: string): Catalog {
  const ward = WARDS[wardId];
  const ja = language === "ja";
  const pick = (t: { ja: string; en: string }) => (ja ? t.ja : t.en);
  const schedule = SCHEDULES[wardId];
  return {
    ward: wardId,
    name: pick(ward.name),
    nameJa: ward.name.ja,
    searchUrl: ward.searchUrl,
    readOn: ward.readOn,
    categories: ward.categories.map((c) => ({
      id: c.id,
      name: pick(c.name),
      nameJa: c.name.ja,
      color: c.color,
      icon: c.icon,
      collection: pick(c.collection),
      url: c.url,
    })),
    items: ward.items.map((item) => {
      const names = item.names;
      const own = names[language] ?? [];
      const aliases = [...new Set([...own, ...(names.en ?? []), ...(names.ja ?? [])])];
      return {
        id: item.id,
        name: own[0] ?? names.en?.[0] ?? item.id,
        nameJa: names.ja?.[0] ?? item.id,
        aliases,
        categories: [...new Set(item.parts.map((p) => p.category))],
        prep: ja ? item.prep.ja : item.prep.en,
        mistake: item.commonMistake ? pick(item.commonMistake) : undefined,
      };
    }),
    areas: schedule?.areas,
    scheduleSource: schedule?.source,
  };
}

export function handleCatalog(request: Request): Response {
  if (request.method !== "GET") return json({ error: "method_not_allowed" }, 405);
  const url = new URL(request.url);
  const ward = url.searchParams.get("ward");
  if (!isWardId(ward)) return json({ error: "unknown_ward", wards: Object.keys(WARDS) }, 400);
  return json(buildCatalog(ward, url.searchParams.get("language") ?? "en"));
}
