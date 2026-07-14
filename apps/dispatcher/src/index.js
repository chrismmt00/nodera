// The Nodera dispatcher (docs/BLUEPRINT.md §3): assigns queued jobs to
// compatible providers, enforces deadlines and retries, and (Phase 5)
// drives webhook delivery. Standalone long-running Node service — never
// inside a serverless route. It talks to Postgres directly.
const path = require("node:path");
const http = require("node:http");
const { loadEnv } = require("@nodera/shared");

loadEnv(path.join(__dirname, "..", "..", ".."));

const { createLogger } = require("@nodera/shared");
const { prisma } = require("@nodera/db");
const { runTick } = require("./tick.js");

const log = createLogger("dispatcher");
const intervalMs = parseInt(process.env.DISPATCH_INTERVAL_MS || "1000", 10);

let state = "running"; // running | draining | stopped
let lastTickAt = null;
let lastTickError = null;
let timer = null;
let tickInFlight = null;

async function tick() {
  tickInFlight = (async () => {
    try {
      const summary = await runTick(prisma, log);
      lastTickAt = new Date();
      lastTickError = null;
      log.info("tick", summary);
    } catch (err) {
      lastTickError = err.message;
      log.error("tick failed", { error: err.message, stack: err.stack });
    }
  })();
  await tickInFlight;
  tickInFlight = null;
  if (state === "running") timer = setTimeout(tick, intervalMs);
}

// Ops health endpoint for the dispatcher process.
const healthPort = parseInt(process.env.DISPATCHER_PORT || "3001", 10);
const healthServer = http.createServer((req, res) => {
  if (req.url === "/healthz") {
    const stale = lastTickAt === null || Date.now() - lastTickAt.getTime() > intervalMs * 10;
    res.writeHead(stale ? 503 : 200, { "content-type": "application/json" });
    res.end(
      JSON.stringify({
        ok: !stale,
        last_tick_at: lastTickAt ? lastTickAt.toISOString() : null,
        last_tick_error: lastTickError,
      })
    );
  } else {
    res.writeHead(404).end();
  }
});

async function shutdown(reason) {
  if (state !== "running") return;
  state = "draining";
  log.info("shutdown requested", { reason });
  if (timer) clearTimeout(timer);
  if (tickInFlight) await tickInFlight; // finish the in-flight tick — no half-assigned jobs
  healthServer.close();
  await prisma.$disconnect();
  state = "stopped";
  log.info("shutdown complete", {});
  process.exit(0);
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
// Windows services get no useful signals; accept a stdin command too.
process.stdin.on("data", (chunk) => {
  if (chunk.toString().trim() === "shutdown") shutdown("stdin");
});
process.stdin.on("error", () => {});

healthServer.listen(healthPort, () => {
  log.info("dispatcher started", { intervalMs, healthPort });
  tick();
});
