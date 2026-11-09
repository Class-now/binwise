// Collection-day logic: which categories share a collection day, and when the next one is.
// Pure functions so they can be tested without a browser.

/** Weekly rule: weekdays 0 (Sun) … 6 (Sat); `weeks` limits it to the nth occurrence in the month (1–4). */
export interface Rule {
  weekdays: number[];
  weeks?: number[];
}

export interface Group {
  id: "burnable" | "nonburnable" | "recyclables" | "pet";
  categories: string[];
  monthly: boolean;
}

export type Days = Partial<Record<Group["id"], Rule>>;

const RECYCLABLES = ["plastic", "pet-bottle", "glass-bottle", "can", "paper", "spray-can", "fluorescent", "carton"];

/** Collection groups for a ward, from the category ids it has. Drop-off categories (e.g. Shibuya cartons) are not scheduled. */
export function groupsFor(ward: string, categoryIds: string[]): Group[] {
  const has = (id: string) => categoryIds.includes(id);
  const groups: Group[] = [];
  if (has("burnable")) groups.push({ id: "burnable", categories: ["burnable"], monthly: false });
  if (has("nonburnable")) groups.push({ id: "nonburnable", categories: ["nonburnable"], monthly: true });
  // Setagaya collects PET bottles twice a month on their own day.
  const separatePet = ward === "setagaya" && has("pet-bottle");
  if (separatePet) groups.push({ id: "pet", categories: ["pet-bottle"], monthly: true });
  const recyclables = RECYCLABLES.filter(
    (id) => has(id) && !(separatePet && id === "pet-bottle") && !(id === "carton" && ward !== "setagaya"),
  );
  if (recyclables.length) groups.push({ id: "recyclables", categories: recyclables, monthly: false });
  return groups;
}

export function groupOf(groups: Group[], categoryId: string): Group | undefined {
  return groups.find((g) => g.categories.includes(categoryId));
}

const JA_WEEKDAYS = "日月火水木金土";

/** Parses the ward table's Japanese notation: "水・土", "火", "第2月", "第1・3水". */
export function parseJaRule(text: string): Rule | undefined {
  const t = text.normalize("NFKC").replace(/\s+/g, "");
  const nth = /^第([1-4](?:[・,、][1-4])*)([日月火水木金土])$/.exec(t);
  if (nth) {
    return { weekdays: [JA_WEEKDAYS.indexOf(nth[2]!)], weeks: nth[1]!.split(/[・,、]/).map(Number) };
  }
  const days = t.split(/[・,、]/);
  if (days.length && days.every((d) => d.length === 1 && JA_WEEKDAYS.includes(d))) {
    return { weekdays: days.map((d) => JA_WEEKDAYS.indexOf(d)) };
  }
  return undefined;
}

/** Days for every group from one row of the Shibuya area table (keys are category ids). */
export function daysFromArea(row: Record<string, string>, groups: Group[]): Days {
  const out: Days = {};
  for (const g of groups) {
    const text = g.categories.map((c) => row[c]).find(Boolean);
    const rule = text ? parseJaRule(text) : undefined;
    if (rule) out[g.id] = rule;
  }
  return out;
}

export function isValidRule(rule: Rule | undefined): rule is Rule {
  return Boolean(rule && rule.weekdays.length);
}

/** The next collection day on or after `from` (date only), or undefined if none within ~2 months. */
export function nextCollection(rule: Rule, from: Date): { date: Date; inDays: number } | undefined {
  if (!isValidRule(rule)) return undefined;
  const start = new Date(from.getFullYear(), from.getMonth(), from.getDate());
  for (let i = 0; i < 62; i++) {
    const d = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i);
    if (!rule.weekdays.includes(d.getDay())) continue;
    if (rule.weeks?.length && !rule.weeks.includes(Math.ceil(d.getDate() / 7))) continue;
    return { date: d, inDays: i };
  }
  return undefined;
}
