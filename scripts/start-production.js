const fs = require("node:fs");
const path = require("node:path");
const { spawn } = require("node:child_process");
const { validateProductionEnv } = require("./lib/production-env.js");

const ROOT = path.join(__dirname, "..");
const service = process.argv[2];

try {
  validateProductionEnv(service);
} catch (err) {
  console.error(err.message);
  process.exit(1);
}

let command;
let args;
let cwd = ROOT;

if (service === "web") {
  command = process.execPath;
  const standaloneServer = path.join(ROOT, "apps", "web", "server.js");
  if (fs.existsSync(standaloneServer)) {
    process.env.HOSTNAME = process.env.HOSTNAME || "0.0.0.0";
    args = [standaloneServer];
  } else {
    args = [
      require.resolve("next/dist/bin/next"),
      "start",
      "-H",
      "0.0.0.0",
      "-p",
      process.env.PORT || "3000",
    ];
    cwd = path.join(ROOT, "apps", "web");
  }
} else if (service === "dispatcher") {
  command = process.execPath;
  args = [path.join(ROOT, "apps", "dispatcher", "src", "index.js")];
} else {
  command = process.platform === "win32" ? "npm.cmd" : "npm";
  args = ["run", "migrate:deploy", "-w", "@nodera/db"];
}

const child = spawn(command, args, { cwd, env: process.env, stdio: "inherit" });
let stopping = false;

function forward(signal) {
  if (stopping || child.exitCode !== null) return;
  stopping = true;
  child.kill(signal);
}

process.on("SIGINT", () => forward("SIGINT"));
process.on("SIGTERM", () => forward("SIGTERM"));

child.on("error", (err) => {
  console.error(`Failed to start ${service}: ${err.message}`);
  process.exit(1);
});

child.on("exit", (code, signal) => {
  if (signal && !stopping) console.error(`${service} stopped by ${signal}`);
  process.exit(code ?? (stopping ? 0 : 1));
});
