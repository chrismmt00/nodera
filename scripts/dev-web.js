// Boots the Next.js control plane with the repo-root .env loaded.
// Next only auto-loads .env from the app directory, and node's --env-file
// flags are rejected when Next re-spawns itself via NODE_OPTIONS.
const path = require("node:path");
const { spawn } = require("node:child_process");
const { loadEnv } = require("@nodera/shared");

loadEnv(path.join(__dirname, ".."));
// The web app runs with cwd apps/web; anchor storage at the repo root.
process.env.STORAGE_ROOT = path.resolve(__dirname, "..", process.env.STORAGE_ROOT || "storage");

const nextBin = require.resolve("next/dist/bin/next");
const child = spawn(
  process.execPath,
  [nextBin, process.argv[2] || "dev", "-p", process.env.PORT || "3000"],
  { cwd: path.join(__dirname, "..", "apps", "web"), stdio: "inherit", env: process.env }
);
child.on("exit", (code) => process.exit(code ?? 0));
