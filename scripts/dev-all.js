// Boots the full dev stack: control plane + dispatcher (+ one dev provider
// agent once Phase 3 lands). Ctrl+C stops everything.
const path = require("node:path");
const { spawn } = require("node:child_process");
const { loadEnv } = require("@nodera/shared");

const ROOT = path.join(__dirname, "..");
loadEnv(ROOT);
process.env.STORAGE_ROOT = path.resolve(ROOT, process.env.STORAGE_ROOT || "storage");

const children = [];

function boot(name, args, cwd) {
  const child = spawn(process.execPath, args, { cwd, env: process.env, stdio: ["ignore", "pipe", "pipe"] });
  const prefix = (line) => `[${name}] ${line}`;
  for (const stream of [child.stdout, child.stderr]) {
    stream.on("data", (chunk) => {
      for (const line of chunk.toString().split(/\r?\n/)) {
        if (line.trim()) console.log(prefix(line));
      }
    });
  }
  child.on("exit", (code) => console.log(prefix(`exited with code ${code}`)));
  children.push(child);
}

boot("web", [require.resolve("next/dist/bin/next"), "dev", "-p", process.env.PORT || "3000"],
  path.join(ROOT, "apps", "web"));
boot("dispatcher", [path.join(ROOT, "apps", "dispatcher", "src", "index.js")], ROOT);
boot("agent", [path.join(ROOT, "apps", "provider-agent", "src", "index.js")], ROOT);

process.on("SIGINT", () => {
  for (const child of children) child.kill();
  process.exit(0);
});
