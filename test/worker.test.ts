import { describe, expect, it } from "vitest";
import worker, { type Env } from "../src/worker/index";

const env = {
  ASSETS: { fetch: async () => new Response("asset") },
} as unknown as Env;

describe("worker scaffold", () => {
  it("reports health in offline mode", async () => {
    const res = await worker.fetch(new Request("http://x/api/health"), env);
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(await res.json()).toEqual({ ok: true, ai: false });
  });

  it("returns 404 JSON for unknown API routes", async () => {
    const res = await worker.fetch(new Request("http://x/api/nope"), env);
    expect(res.status).toBe(404);
  });

  it("serves static assets for other paths", async () => {
    const res = await worker.fetch(new Request("http://x/"), env);
    expect(await res.text()).toBe("asset");
  });
});
