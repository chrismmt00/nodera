// Ensures a dispatcher is running for a script run. Returns a stop()
// that gracefully shuts down only what this process started.
const path = require("node:path");
const { spawn } = require("node:child_process");

const ROOT = path.join(__dirname, "..", "..");

async function healthy(port) {
  try {
    const res = await fetch(`http://localhost:${port}/healthz`, {
      signal: AbortSignal.timeout(2000),
    });
    return res.ok;
  } catch {
    return false;
  }
}

async function ensureDispatcher(envOverrides = {}) {
  const port = envOverrides.DISPATCHER_PORT || process.env.DISPATCHER_PORT || "3001";
  if (await healthy(port)) return { stop: async () => {} };

  const child = spawn(
    process.execPath,
    [path.join(ROOT, "apps", "dispatcher", "src", "index.js")],
    {
      cwd: ROOT,
      env: { ...process.env, ...envOverrides, DISPATCHER_PORT: String(port) },
      stdio: ["pipe", "pipe", "pipe"],
    }
  );
  const logChunks = [];
  child.stdout.on("data", (c) => logChunks.push(c));
  child.stderr.on("data", (c) => logChunks.push(c));

  const deadline = Date.now() + 30000;
  while (Date.now() < deadline) {
    if (await healthy(port)) {
      return {
        child,
        logs: () => Buffer.concat(logChunks).toString(),
        stop: () =>
          new Promise((resolve) => {
            child.on("exit", resolve);
            child.stdin.write("shutdown\n");
            setTimeout(() => child.kill(), 5000).unref();
          }),
      };
    }
    await new Promise((r) => setTimeout(r, 300));
  }
  console.error("dispatcher never became healthy. Output:");
  console.error(Buffer.concat(logChunks).toString());
  process.exit(1);
}

module.exports = { ensureDispatcher };
