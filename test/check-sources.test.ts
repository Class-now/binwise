import { describe, expect, it } from "vitest";
// @ts-expect-error plain JS module without types
import { collectUrls, normalizeHtml, hashContent, diff, report } from "../scripts/check-sources.mjs";
import baseline from "../data/source-hashes.json";

type Source = { url: string; where: string[] };

describe("check-sources", () => {
  const urls: Source[] = collectUrls();

  it("collects every dataset source URL once", () => {
    expect(urls.length).toBeGreaterThan(50);
    expect(new Set(urls.map((u) => u.url)).size).toBe(urls.length);
    for (const ward of ["shibuya", "shinjuku", "setagaya"]) {
      expect(urls.some((u) => u.where.includes(`${ward}:items`))).toBe(true);
    }
    expect(urls.some((u) => u.where.includes("shibuya:schedule"))).toBe(true);
  });

  it("has a committed baseline for every URL", () => {
    const missing = urls.filter((u) => !(u.url in baseline)).map((u) => u.url);
    expect(missing).toEqual([]);
  });

  it("ignores markup, scripts and whitespace when hashing HTML", () => {
    const a = "<html><head><script>var t=1</script></head><body><p>可燃ごみ  は週2回</p><!-- x --></body></html>";
    const b = "<html><body class='new'>\n<div>可燃ごみ は週2回</div><script>var t=2</script></body></html>";
    expect(normalizeHtml(a)).toBe("可燃ごみ は週2回");
    expect(hashContent(new TextEncoder().encode(a), "text/html")).toBe(hashContent(new TextEncoder().encode(b), "text/html; charset=utf-8"));
    const c = "<p>可燃ごみ は週3回</p>";
    expect(hashContent(new TextEncoder().encode(a), "text/html")).not.toBe(hashContent(new TextEncoder().encode(c), "text/html"));
  });

  it("reports changed, failed, new and removed pages", () => {
    const base = {
      "https://a.example/1": { hash: "h1", checkedOn: "2026-11-10" },
      "https://a.example/2": { hash: "h2", checkedOn: "2026-11-10" },
      "https://a.example/gone": { hash: "h3", checkedOn: "2026-11-10" },
    };
    const current = [
      { url: "https://a.example/1", hash: "h1", where: ["x"] },
      { url: "https://a.example/2", hash: "CHANGED", where: ["x"] },
      { url: "https://a.example/new", hash: "h4", where: ["x"] },
      { url: "https://a.example/down", error: "HTTP 404", where: ["x"] },
    ];
    const d = diff(base, current);
    expect(d.unchanged.map((r: Source) => r.url)).toEqual(["https://a.example/1"]);
    expect(d.changed.map((r: Source) => r.url)).toEqual(["https://a.example/2"]);
    expect(d.added.map((r: Source) => r.url)).toEqual(["https://a.example/new"]);
    expect(d.failed.map((r: Source) => r.url)).toEqual(["https://a.example/down"]);
    expect(d.removed.map((r: Source) => r.url)).toEqual(["https://a.example/gone"]);
    const text: string = report(d, 4);
    expect(text).toContain("1 changed");
    expect(text).toContain("https://a.example/2");
  });
});
