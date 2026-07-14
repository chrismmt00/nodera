// Ensures the control plane is up for a script run. Returns a stop()
// function that tears down only what this process started.
const path = require("node:path");
const { spawn, execSync } = require("node:child_process");

const ROOT = path.join(__dirname, "..", "..");

async function healthy(base) {
  try {
    const res = await fetch(`${base}/healthz`, { signal: AbortSignal.timeout(2000) });
    return res.ok;
  } catch {
    return false;
  }
}

async function ensureWeb() {
  const base = `http://localhost:${process.env.PORT || "3000"}`;
  if (await healthy(base)) return { base, stop: () => {} };

  console.log("starting control plane...");
  const server = spawn(process.execPath, [path.join(ROOT, "scripts", "dev-web.js"), "dev"], {
    cwd: ROOT,
    env: process.env,
    stdio: ["ignore", "pipe", "pipe"],
  });
  const logChunks = [];
  server.stdout.on("data", (c) => logChunks.push(c));
  server.stderr.on("data", (c) => logChunks.push(c));

  const deadline = Date.now() + 120000;
  while (Date.now() < deadline) {
    if (await healthy(base)) {
      return {
        base,
        stop: () => {
          if (process.platform === "win32") {
            try {
              execSync(`taskkill /F /T /PID ${server.pid}`, { stdio: "ignore" });
            } catch (err) {
              console.error(`failed to stop control plane pid ${server.pid}: ${err.message}`);
            }
          } else {
            server.kill("SIGTERM");
          }
        },
      };
    }
    await new Promise((r) => setTimeout(r, 1500));
  }
  console.error("control plane never became healthy. Output:");
  console.error(Buffer.concat(logChunks).toString());
  process.exit(1);
}

module.exports = { ensureWeb };
