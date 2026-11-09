// Starts the offline dev server for smoke tests and demo recording (Windows and POSIX).
import { spawn, spawnSync } from "node:child_process";

const isWin = process.platform === "win32";

async function up(base) {
  try {
    return (await fetch(`${base}/api/health`)).ok;
  } catch {
    return false;
  }
}

export function stopServer(child) {
  if (!child?.pid) return;
  try {
    if (isWin) spawnSync("taskkill", ["/pid", String(child.pid), "/T", "/F"], { stdio: "ignore" });
    else process.kill(-child.pid);
  } catch {
    // Already gone.
  }
}

/** Returns the spawned child, or undefined when a server is already running at `base`. */
export async function startServer(root, base) {
  if (await up(base)) return undefined;
  // Always rebuild the client bundle: public/app.js is gitignored and may be missing or stale.
  const build = spawnSync("npm", ["run", "build"], { cwd: root, stdio: "inherit", shell: isWin });
  if (build.status !== 0) throw new Error("npm run build failed");
  const port = new URL(base).port || "8798";
  const child = spawn("npx", ["wrangler", "dev", "-c", "wrangler.offline.jsonc", "--port", port], {
    cwd: root,
    stdio: ["ignore", "pipe", "pipe"],
    detached: !isWin,
    shell: isWin,
  });
  let log = "";
  let failed;
  child.on("error", (err) => (failed = err));
  child.stdout.on("data", (d) => (log += d));
  child.stderr.on("data", (d) => (log += d));
  for (let i = 0; i < 120; i++) {
    if (failed) throw new Error(`could not start dev server: ${failed.message}`);
    if (await up(base)) return child;
    await new Promise((r) => setTimeout(r, 500));
  }
  stopServer(child);
  throw new Error(`dev server did not start:\n${log.slice(-2000)}`);
}
