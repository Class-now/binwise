import shibuya from "../../data/wards/shibuya.json";
import shinjuku from "../../data/wards/shinjuku.json";
import setagaya from "../../data/wards/setagaya.json";

export type Bilingual = { ja: string; en: string };
export type BilingualList = { ja: string[]; en: string[] };

export interface Category {
  id: string;
  name: Bilingual;
  color: string;
  icon: string;
  rules: BilingualList;
  collection: Bilingual;
  fate: Bilingual;
  url: string;
}

export interface Part {
  id: string;
  name: Bilingual;
  category: string;
  fate: Bilingual;
}

export interface Item {
  id: string;
  names: Record<string, string[]>;
  parts: Part[];
  prep: BilingualList;
  source: string;
  derived: boolean;
  ruleQuote?: string;
  note?: Bilingual | null;
  commonMistake?: (Bilingual & { wrongCategory?: string }) | null;
}

export interface Ward {
  ward: string;
  name: Bilingual;
  searchUrl: string;
  readOn: string;
  categories: Category[];
  items: Item[];
}

export const WARD_IDS = ["shibuya", "shinjuku", "setagaya"] as const;
export type WardId = (typeof WARD_IDS)[number];

export const WARDS: Record<WardId, Ward> = {
  shibuya: shibuya as unknown as Ward,
  shinjuku: shinjuku as unknown as Ward,
  setagaya: setagaya as unknown as Ward,
};

export function isWardId(value: unknown): value is WardId {
  return typeof value === "string" && (WARD_IDS as readonly string[]).includes(value);
}
