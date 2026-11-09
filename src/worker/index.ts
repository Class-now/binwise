import type { AiRunner } from "./ai";
import { clientIp, handleIdentify, handleLookup, json, rateLimit } from "./api";

export { json };

export interface Env {
  ASSETS: Fetcher;
  AI?: Ai;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const ai = env.AI as unknown as AiRunner | undefined;
    if (url.pathname === "/api/health") {
      return json({ ok: true, ai: Boolean(env.AI) });
    }
    if (url.pathname === "/api/identify" || url.pathname === "/api/lookup") {
      const wait = rateLimit(clientIp(request));
      if (wait) return json({ error: "rate_limited", retryAfter: wait }, 429, { "retry-after": String(wait) });
      try {
        return url.pathname === "/api/identify" ? await handleIdentify(request, ai) : await handleLookup(request, ai);
      } catch {
        return json({ error: "internal_error" }, 500);
      }
    }
    if (url.pathname.startsWith("/api/")) {
      return json({ error: "not_found" }, 404);
    }
    return env.ASSETS.fetch(request);
  },
} satisfies ExportedHandler<Env>;
