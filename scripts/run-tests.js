// Self-contained test runner: boots the control plane if it isn't already
// running, executes the node:test suite, and tears down anything it started.
// Keeps `npm test` honest on a fresh clone (Gate 0/1 requirement).
const fs = require("node:fs");
const path = require("node:path");
const { spawn, spawnSync, execSync } = require("node:child_process");
const { loadEnv } = require("@nodera/shared");

const ROOT = path.join(__dirname, "..");
loadEnv(ROOT);

const PORT = process.env.PORT || "3000";
const BASE = `http://localhost:${PORT}`;

async function healthy() {
  try {
    const res = await fetch(`${BASE}/healthz`, { signal: AbortSignal.timeout(2000) });
    return res.ok;
  } catch {
    return false;
  }
}

function listTestFiles(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...listTestFiles(p));
    else if (entry.name.endsWith(".test.js")) out.push(p);
  }
  return out;
}

async function main() {
  let server = null;
  if (!(await healthy())) {
    console.log("test-runner: starting control plane...");
    server = spawn(process.execPath, [path.join(ROOT, "scripts", "dev-web.js"), "dev"], {
      cwd: ROOT,
      env: process.env,
      stdio: ["ignore", "pipe", "pipe"],
    });
    const logChunks = [];
    server.stdout.on("data", (c) => logChunks.push(c));
    server.stderr.on("data", (c) => logChunks.push(c));
    const deadline = Date.now() + 120000;
    let up = false;
    while (Date.now() < deadline) {
      if (await healthy()) {
        up = true;
        break;
      }
      await new Promise((r) => setTimeout(r, 1500));
    }
    if (!up) {
      console.error("test-runner: control plane never became healthy. Output:");
      console.error(Buffer.concat(logChunks).toString());
      process.exit(1);
    }
  }

  // Serial: suites share one database, and some fixtures (e.g. menu
  // activation) are global state.
  const files = listTestFiles(path.join(ROOT, "tests"));
  const result = spawnSync(process.execPath, ["--test", "--test-concurrency=1", ...files], {
    cwd: ROOT,
    env: process.env,
    stdio: "inherit",
  });

  if (server) {
    // next dev forks workers; kill the whole tree on Windows.
    if (process.platform === "win32") {
      try {
        execSync(`taskkill /F /T /PID ${server.pid}`, { stdio: "ignore" });
      } catch (err) {
        console.error(`test-runner: failed to stop server pid ${server.pid}: ${err.message}`);
      }
    } else {
      server.kill("SIGTERM");
    }
  }
  process.exit(result.status ?? 1);
}

main();
