import { describe, expect, it } from "vitest";
// @ts-expect-error plain JS module without types
import { WARDS, MIN_ITEMS, loadWard, validateWard, validateSchedule } from "../scripts/validate-data.mjs";
import shibuyaSchedule from "../data/wards/shibuya-schedule.json";

type Part = { id: string; category: string };
type Item = { id: string; parts: Part[]; source: string; derived: boolean };
type Ward = { ward: string; items: Item[]; categories: { id: string }[] };

const wards: Record<string, Ward> = Object.fromEntries((WARDS as string[]).map((w) => [w, loadWard(w)]));

describe("ward datasets", () => {
  for (const w of WARDS as string[]) {
    it(`${w} passes validation`, () => {
      expect(validateWard(wards[w])).toEqual([]);
    });

    it(`${w} has at least ${MIN_ITEMS} items, each with a source`, () => {
      const ward = wards[w]!;
      expect(ward.items.length).toBeGreaterThanOrEqual(MIN_ITEMS);
      expect(ward.items.every((i) => i.source.startsWith("https://"))).toBe(true);
    });
  }

  it("uses the same item ids in every ward", () => {
    const ids = (WARDS as string[]).map((w) => wards[w]!.items.map((i) => i.id).sort().join(","));
    expect(new Set(ids).size).toBe(1);
  });

  it("splits a PET bottle into bottle, cap and label", () => {
    for (const w of WARDS as string[]) {
      const pet = wards[w]!.items.find((i) => i.id === "pet-bottle")!;
      expect(pet.parts.map((p) => p.id)).toEqual(["bottle", "cap", "label"]);
      expect(pet.parts[0]!.category).toBe("pet-bottle");
    }
  });

  it("never sends the four recycling-law appliances to the ward", () => {
    for (const w of WARDS as string[]) {
      for (const id of ["tv", "refrigerator", "washing-machine", "air-conditioner"]) {
        const item = wards[w]!.items.find((i) => i.id === id)!;
        expect(item.parts[0]!.category).toBe("appliance-recycling");
      }
    }
  });

  it("Shibuya schedule table references existing categories", () => {
    expect(validateSchedule(shibuyaSchedule, wards.shibuya)).toEqual([]);
  });
});

describe("validator", () => {
  const base = () => structuredClone(wards.shibuya!) as Ward & Record<string, unknown>;

  it("rejects a part with an unknown category", () => {
    const d = base();
    d.items[0]!.parts[0]!.category = "nope";
    expect(validateWard(d).join("\n")).toMatch(/category nope does not exist/);
  });

  it("rejects duplicate ids and missing sources", () => {
    const d = base();
    d.items.push(structuredClone(d.items[0]!));
    d.items[1]!.source = "";
    const errors = validateWard(d).join("\n");
    expect(errors).toMatch(/duplicate id/);
    expect(errors).toMatch(/source must be an https URL/);
  });

  it("rejects an alias shared by two items", () => {
    const d = base() as unknown as { items: { names: { en: string[] } }[] };
    d.items[1]!.names.en.push(d.items[0]!.names.en[0]!);
    expect(validateWard(d).join("\n")).toMatch(/also used by/);
  });

  it("rejects too few items", () => {
    const d = base();
    d.items = d.items.slice(0, 10);
    expect(validateWard(d).join("\n")).toMatch(/only 10 items/);
  });
});
