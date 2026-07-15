// Local webhook receiver harness (docs/BLUEPRINT.md §10). Verifies the
// Nodera signature with the documented snippet and, for the first
// WEBHOOK_FAILS_BEFORE_SUCCESS deliveries of each job, responds 500 so the
// retry/backoff path can be exercised end to end.
const http = require("node:http");
const path = require("node:path");
const { loadEnv } = require("@nodera/shared");
loadEnv(path.join(__dirname, ".."));

const crypto = require("node:crypto");

const PORT = parseInt(process.env.WEBHOOK_PORT || "8787", 10);
const FAILS_BEFORE_SUCCESS = parseInt(process.env.WEBHOOK_FAILS_BEFORE_SUCCESS || "0", 10);

// Verification snippet from docs/api.md.
function verifyNodera(rawBody, signatureHeader, timestampHeader, secret) {
  if (!signatureHeader || !timestampHeader) return false;
  if (Math.abs(Date.now() / 1000 - Number(timestampHeader)) > 300) return false;
  const expected = "sha256=" + crypto.createHmac("sha256", secret).update(rawBody).digest("hex");
  const a = Buffer.from(expected);
  const b = Buffer.from(signatureHeader);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

const attemptsByJob = new Map();
const secret = process.env.WEBHOOK_TEST_SECRET; // optional: verify signatures

const server = http.createServer((req, res) => {
  let body = "";
  req.on("data", (c) => (body += c));
  req.on("end", () => {
    let event;
    try {
      event = JSON.parse(body);
    } catch {
      res.writeHead(400).end("bad json");
      return;
    }
    const jobId = event.job?.id || "unknown";
    const n = (attemptsByJob.get(jobId) || 0) + 1;
    attemptsByJob.set(jobId, n);

    const verified = secret
      ? verifyNodera(body, req.headers["x-nodera-signature"], req.headers["x-nodera-timestamp"], secret)
      : null;

    const ts = new Date().toISOString();
    if (n <= FAILS_BEFORE_SUCCESS) {
      console.log(`[${ts}] ${jobId} attempt ${n} → 500 (induced failure)`);
      res.writeHead(500).end("induced failure");
    } else {
      console.log(
        `[${ts}] ${jobId} attempt ${n} → 200 (${event.event}${
          verified === null ? "" : verified ? ", signature OK" : ", SIGNATURE INVALID"
        })`
      );
      res.writeHead(200).end("ok");
    }
  });
});

server.listen(PORT, () => {
  console.log(
    `webhook receiver on :${PORT} (fails ${FAILS_BEFORE_SUCCESS} time(s) before success per job)`
  );
});

process.on("SIGINT", () => server.close(() => process.exit(0)));
process.on("SIGTERM", () => server.close(() => process.exit(0)));
