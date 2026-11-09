import { describe, expect, it } from "vitest";
import { LANGUAGES, STRINGS, detectLanguage, t } from "../src/client/i18n";
import { daysFromArea, groupOf, groupsFor, nextCollection, parseJaRule } from "../src/client/schedule";
import worker, { type Env } from "../src/worker/index";
import { WARDS, WARD_IDS } from "../src/worker/data";
import shibuyaSchedule from "../data/wards/shibuya-schedule.json";

const env = { ASSETS: { fetch: async () => new Response("asset") } } as unknown as Env;

describe("collection schedule", () => {
  it("parses the ward table notation", () => {
    expect(parseJaRule("水・土")).toEqual({ weekdays: [3, 6] });
    expect(parseJaRule("火")).toEqual({ weekdays: [2] });
    expect(parseJaRule("第2月")).toEqual({ weekdays: [1], weeks: [2] });
    expect(parseJaRule("第1・3水")).toEqual({ weekdays: [3], weeks: [1, 3] });
    expect(parseJaRule("要申込")).toBeUndefined();
  });

  it("parses every entry of the Shibuya area table", () => {
    for (const area of shibuyaSchedule.areas) {
      for (const text of Object.values(area.days)) expect(parseJaRule(text), `${area.area}: ${text}`).toBeDefined();
    }
  });

  it("finds the next weekly and nth-weekday collection", () => {
    const tue = new Date(2026, 10, 10); // Tuesday 10 Nov 2026
    expect(nextCollection({ weekdays: [2] }, tue)).toMatchObject({ inDays: 0 });
    expect(nextCollection({ weekdays: [3, 6] }, tue)).toMatchObject({ inDays: 1 });
    // 2nd Monday after 10 Nov 2026 is 14 Dec (9 Nov was the 2nd Monday of November).
    const second = nextCollection({ weekdays: [1], weeks: [2] }, tue)!;
    expect(second.date.getMonth()).toBe(11);
    expect(second.date.getDate()).toBe(14);
    expect(nextCollection({ weekdays: [] }, tue)).toBeUndefined();
  });

  it("groups categories per ward", () => {
    const ids = (w: (typeof WARD_IDS)[number]) => WARDS[w].categories.map((c) => c.id);
    const shibuya = groupsFor("shibuya", ids("shibuya"));
    expect(shibuya.map((g) => g.id)).toEqual(["burnable", "nonburnable", "recyclables"]);
    expect(groupOf(shibuya, "pet-bottle")?.id).toBe("recyclables");
    expect(groupOf(shibuya, "carton")).toBeUndefined(); // drop-off boxes in Shibuya
    const setagaya = groupsFor("setagaya", ids("setagaya"));
    expect(groupOf(setagaya, "pet-bottle")?.id).toBe("pet");
    expect(groupOf(setagaya, "carton")?.id).toBe("recyclables");
    expect(groupOf(setagaya, "oversized")).toBeUndefined();
  });

  it("fills days from a Shibuya area row", () => {
    const groups = groupsFor("shibuya", WARDS.shibuya.categories.map((c) => c.id));
    const days = daysFromArea(shibuyaSchedule.areas[0]!.days, groups);
    expect(days.burnable?.weekdays.length).toBeGreaterThan(0);
    expect(days.nonburnable?.weeks?.length).toBe(1);
    expect(days.recyclables?.weekdays.length).toBe(1);
  });
});

describe("UI strings", () => {
  it("has every key in every language", () => {
    const keys = Object.keys(STRINGS.en).sort();
    for (const lang of LANGUAGES) {
      expect(Object.keys(STRINGS[lang]).sort(), lang).toEqual(keys);
      for (const key of keys) expect(STRINGS[lang][key as keyof typeof STRINGS.en].trim(), `${lang}.${key}`).not.toBe("");
    }
  });

  it("keeps the same placeholders across languages", () => {
    const vars = (s: string) => (s.match(/\{\w+\}/g) ?? []).sort().join();
    for (const lang of LANGUAGES) {
      for (const [key, text] of Object.entries(STRINGS.en)) {
        expect(vars(STRINGS[lang][key as keyof typeof STRINGS.en]), `${lang}.${key}`).toBe(vars(text));
      }
    }
  });

  it("fills placeholders and detects the browser language", () => {
    expect(t("en", "inDays", { n: 3 })).toBe("in 3 days");
    expect(detectLanguage(["ko-KR", "en"])).toBe("ko");
    expect(detectLanguage(["fr-FR"])).toBe("en");
  });
});

describe("GET /api/catalog", () => {
  it("returns categories, items and the Shibuya area table", async () => {
    const res = await worker.fetch(new Request("http://x/api/catalog?ward=shibuya&language=en"), env);
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("no-store");
    const body = (await res.json()) as any;
    expect(body.items.length).toBe(WARDS.shibuya.items.length);
    const pet = body.items.find((i: any) => i.id === "pet-bottle");
    expect(pet.aliases).toContain("PET bottle");
    expect(pet.aliases).toContain("ペットボトル");
    expect(pet.categories).toEqual(["pet-bottle", "plastic"]);
    expect(body.areas.length).toBeGreaterThan(10);
    expect(body.categories.every((c: any) => c.color && c.icon && c.name)).toBe(true);
  });

  it("uses Japanese text and omits areas for other wards", async () => {
    const res = await worker.fetch(new Request("http://x/api/catalog?ward=setagaya&language=ja"), env);
    const body = (await res.json()) as any;
    expect(body.name).toBe("世田谷区");
    expect(body.areas).toBeUndefined();
    expect(body.categories[0].name).toMatch(/[ぁ-んァ-ン一-龥]/);
  });

  it("rejects unknown wards", async () => {
    const res = await worker.fetch(new Request("http://x/api/catalog?ward=minato"), env);
    expect(res.status).toBe(400);
  });
});
