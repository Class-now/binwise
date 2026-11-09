const status = document.getElementById("status");

async function checkHealth(): Promise<void> {
  if (!status) return;
  try {
    const res = await fetch("/api/health");
    const body = (await res.json()) as { ok: boolean; ai: boolean };
    status.textContent = body.ok
      ? `Server ready (${body.ai ? "AI enabled" : "offline mode"})`
      : "Server not ready";
  } catch {
    status.textContent = "Server unreachable";
  }
}

void checkHealth();

export {};
