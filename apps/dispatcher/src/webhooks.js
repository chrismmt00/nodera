// Webhook delivery (docs/BLUEPRINT.md §10): batch per tick, HMAC signing,
// SSRF guard with pinned addresses, backoff schedule, terminal failed state.
// Delivery outcome never changes job status.
const dns = require("node:dns/promises");
const http = require("node:http");
const https = require("node:https");
const net = require("node:net");
const { signWebhook } = require("@nodera/shared");

function config() {
  return {
    maxAttempts: parseInt(process.env.WEBHOOK_MAX_ATTEMPTS || "5", 10),
    backoffS: (process.env.WEBHOOK_BACKOFF_S || "60,300,900,3600,21600")
      .split(",")
      .map((s) => parseInt(s.trim(), 10)),
    timeoutMs: parseInt(process.env.WEBHOOK_TIMEOUT_MS || "10000", 10),
    batchSize: parseInt(process.env.WEBHOOK_BATCH_SIZE || "10", 10),
    allowPrivate:
      process.env.WEBHOOK_ALLOW_PRIVATE === "1" && process.env.NODE_ENV !== "production",
  };
}

// Pure scheduling: given the attempt count AFTER a failure, returns the delay
// in ms before the next try, or null when the delivery is terminally failed.
function nextRetryDelayMs(attempts, { maxAttempts, backoffS }) {
  if (attempts >= maxAttempts) return null;
  return backoffS[Math.min(attempts - 1, backoffS.length - 1)] * 1000;
}

function isPrivateIPv4(ip) {
  const [a, b] = ip.split(".").map(Number);
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 192 && b === 0) ||
    a >= 224
  );
}

function isBlockedAddress(ip) {
  if (net.isIPv4(ip)) return isPrivateIPv4(ip);
  const lower = ip.toLowerCase();
  if (lower === "::" || lower === "::1") return true;
  if (lower.startsWith("fc") || lower.startsWith("fd")) return true; // unique-local
  if (/^fe[89ab]/.test(lower)) return true; // link-local
  const mapped = lower.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (mapped) return isPrivateIPv4(mapped[1]);
  return false;
}

// Resolves the webhook host and refuses private/loopback/link-local ranges.
// Returns { ok: true, address } with the address later PINNED for the actual
// connection (DNS answers can't be swapped between check and send), or
// { ok: false, reason }.
async function guardWebhookUrl(url) {
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return { ok: false, reason: "invalid URL" };
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return { ok: false, reason: "only http(s) URLs are allowed" };
  }
  const host = parsed.hostname.replace(/^\[|\]$/g, "");
  let addresses;
  if (net.isIP(host)) {
    addresses = [{ address: host, family: net.isIP(host) }];
  } else {
    try {
      addresses = await dns.lookup(host, { all: true });
    } catch {
      return { ok: false, reason: "host does not resolve" };
    }
  }
  for (const { address } of addresses) {
    if (isBlockedAddress(address)) {
      return { ok: false, reason: `resolves to a blocked address (${address})` };
    }
  }
  return { ok: true, address: addresses[0].address, family: addresses[0].family };
}

// POSTs the signed payload with the connection pinned to the pre-validated
// address (lookup override), no redirect following, hard timeout.
function sendSignedWebhook(url, rawBody, secret, { timeoutMs, pin }) {
  return new Promise((resolve) => {
    const parsed = new URL(url);
    const mod = parsed.protocol === "https:" ? https : http;
    const options = {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "content-length": Buffer.byteLength(rawBody),
        "x-nodera-signature": signWebhook(secret, rawBody),
        "x-nodera-timestamp": String(Math.floor(Date.now() / 1000)),
      },
      timeout: timeoutMs,
    };
    if (pin) {
      options.lookup = (hostname, opts, cb) => {
        if (typeof opts === "function") return opts(null, pin.address, pin.family);
        return cb(null, pin.address, pin.family);
      };
    }
    const req = mod.request(parsed, options, (res) => {
      res.resume(); // drain
      resolve({ ok: res.statusCode >= 200 && res.statusCode < 300, status: res.statusCode });
    });
    req.on("timeout", () => req.destroy(new Error("timeout")));
    req.on("error", (err) => resolve({ ok: false, status: 0, error: err.message }));
    req.end(rawBody);
  });
}

async function buildPayload(prisma, delivery) {
  const job = await prisma.job.findUnique({
    where: { id: delivery.jobId },
    include: { workspace: true, runs: { orderBy: { assignedAt: "asc" } } },
  });
  if (!job) return null;
  const winning =
    job.runs.find((r) => r.status === "succeeded") ||
    [...job.runs].reverse().find((r) => ["failed", "expired"].includes(r.status)) ||
    null;
  return {
    secret: job.workspace.webhookSecret,
    payload: {
      event: job.status === "succeeded" ? "job.succeeded" : "job.failed",
      job: { id: job.id, status: job.status, model: job.modelSlug },
      run: { id: winning ? winning.id : null },
      sent_at: new Date().toISOString(),
    },
  };
}

async function processWebhookDeliveries(prisma, log) {
  const cfg = config();
  const now = new Date();

  // Recover deliveries whose worker died mid-send: the delivering "lease"
  // (nextAttemptAt) has passed.
  await prisma.webhookDelivery.updateMany({
    where: { status: "delivering", nextAttemptAt: { lt: now } },
    data: { status: "pending" },
  });

  const due = await prisma.webhookDelivery.findMany({
    where: { status: "pending", nextAttemptAt: { lte: now } },
    orderBy: { nextAttemptAt: "asc" },
    take: cfg.batchSize,
  });

  let delivered = 0;
  for (const delivery of due) {
    const claimed = await prisma.webhookDelivery.updateMany({
      where: { id: delivery.id, status: "pending" },
      data: {
        status: "delivering",
        nextAttemptAt: new Date(Date.now() + cfg.timeoutMs * 3),
      },
    });
    if (claimed.count !== 1) continue;

    let outcome; // { ok } | { ok: false, error, terminal }
    const built = await buildPayload(prisma, delivery);
    if (!built) {
      outcome = { ok: false, error: "job no longer exists", terminal: true };
    } else if (!cfg.allowPrivate) {
      const guard = await guardWebhookUrl(delivery.url);
      if (!guard.ok) {
        outcome = { ok: false, error: `blocked: ${guard.reason}`, terminal: true };
      } else {
        const res = await sendSignedWebhook(delivery.url, JSON.stringify(built.payload), built.secret, {
          timeoutMs: cfg.timeoutMs,
          pin: guard,
        });
        outcome = res.ok ? { ok: true } : { ok: false, error: res.error || `HTTP ${res.status}` };
      }
    } else {
      const res = await sendSignedWebhook(delivery.url, JSON.stringify(built.payload), built.secret, {
        timeoutMs: cfg.timeoutMs,
      });
      outcome = res.ok ? { ok: true } : { ok: false, error: res.error || `HTTP ${res.status}` };
    }

    const attempts = delivery.attempts + 1;
    if (outcome.ok) {
      await prisma.webhookDelivery.updateMany({
        where: { id: delivery.id, status: "delivering" },
        data: { status: "succeeded", attempts },
      });
      delivered += 1;
      log.info("webhook delivered", { deliveryId: delivery.id, jobId: delivery.jobId, attempts });
    } else {
      const delayMs = outcome.terminal ? null : nextRetryDelayMs(attempts, cfg);
      await prisma.webhookDelivery.updateMany({
        where: { id: delivery.id, status: "delivering" },
        data:
          delayMs === null
            ? { status: "failed", attempts, lastError: outcome.error }
            : {
                status: "pending",
                attempts,
                lastError: outcome.error,
                nextAttemptAt: new Date(Date.now() + delayMs),
              },
      });
      log.warn("webhook delivery failed", {
        deliveryId: delivery.id,
        jobId: delivery.jobId,
        attempts,
        error: outcome.error,
        terminal: delayMs === null,
      });
    }
  }
  return delivered;
}

module.exports = {
  processWebhookDeliveries,
  nextRetryDelayMs,
  guardWebhookUrl,
  sendSignedWebhook,
};
