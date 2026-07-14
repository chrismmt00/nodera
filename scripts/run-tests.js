// Self-contained test runner: boots the control plane if it isn't already
// running, executes the node:test suite, and tears down anything it started.
// Keeps `npm test` honest on a fresh clone (Gate 0/1 requirement).
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { loadEnv } = require("@nodera/shared");

const ROOT = path.join(__dirname, "..");
loadEnv(ROOT);
process.env.STORAGE_ROOT = path.resolve(ROOT, process.env.STORAGE_ROOT || "storage");

const { ensureWeb } = require("./lib/ensure-web.js");

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
  const { stop } = await ensureWeb();

  // Serial: suites share one database, and some fixtures (e.g. menu
  // activation) are global state.
  const files = listTestFiles(path.join(ROOT, "tests"));
  const result = spawnSync(process.execPath, ["--test", "--test-concurrency=1", ...files], {
    cwd: ROOT,
    env: process.env,
    stdio: "inherit",
  });

  stop();
  process.exit(result.status ?? 1);
}

main();
