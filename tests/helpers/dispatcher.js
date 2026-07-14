// Spawns a dedicated dispatcher for a test file with tuned env, and shuts it
// down gracefully afterwards. Tests run serially, so one dispatcher at a time.
const path = require("node:path");
const { spawn } = require("node:child_process");

const ROOT = path.join(__dirname, "..", "..");

async function startDispatcher(envOverrides = {}) {
  const port = envOverrides.DISPATCHER_PORT || "3902";
  const child = spawn(
    process.execPath,
    [path.join(ROOT, "apps", "dispatcher", "src", "index.js")],
    {
      cwd: ROOT,
      env: {
        ...process.env,
        DISPATCH_INTERVAL_MS: "200",
        DISPATCHER_PORT: port,
        ...envOverrides,
      },
      stdio: ["pipe", "pipe", "pipe"],
    }
  );
  const logChunks = [];
  child.stdout.on("data", (c) => logChunks.push(c));
  child.stderr.on("data", (c) => logChunks.push(c));

  const deadline = Date.now() + 30000;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`http://localhost:${port}/healthz`, {
        signal: AbortSignal.timeout(1000),
      });
      if (res.ok) break;
    } catch {
      // not up yet
    }
    await new Promise((r) => setTimeout(r, 200));
  }

  return {
    logs: () => Buffer.concat(logChunks).toString(),
    stop: () =>
      new Promise((resolve) => {
        child.on("exit", resolve);
        child.stdin.write("shutdown\n");
        setTimeout(() => child.kill(), 5000).unref();
      }),
  };
}

// Polls until `fn` returns truthy or the timeout passes.
async function waitFor(fn, { timeoutMs = 15000, stepMs = 150 } = {}) {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const value = await fn();
    if (value) return value;
    if (Date.now() > deadline) return null;
    await new Promise((r) => setTimeout(r, stepMs));
  }
}

module.exports = { startDispatcher, waitFor };
