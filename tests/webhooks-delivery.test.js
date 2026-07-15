// Tasks 5.2/5.3: backoff schedule (clock-controlled), SSRF guard, HMAC
// signature verified with the exact docs/api.md snippet, live delivery.
const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const http = require("node:http");
const {
  createWorkspaceFixture,
  destroyWorkspaceFixture,
  prisma,
} = require("./helpers/api.js");
const { startDispatcher, waitFor } = require("./helpers/dispatcher.js");
const { newId } = require("@nodera/db");
const {
  nextRetryDelayMs,
  guardWebhookUrl,
} = require("../apps/dispatcher/src/webhooks.js");
const { signWebhook } = require("@nodera/shared");

// Verification snippet copied VERBATIM from docs/api.md — the contract.
function verifyNodera(rawBody, signatureHeader, timestampHeader, secret) {
  if (Math.abs(Date.now() / 1000 - Number(timestampHeader)) > 300) return false;
  const expected = "sha256=" + crypto.createHmac("sha256", secret).update(rawBody).digest("hex");
  return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signatureHeader));
}

test("5.2 schedule: exact backoff progression and terminal state (clock-controlled)", () => {
  const cfg = { maxAttempts: 5, backoffS: [60, 300, 900, 3600, 21600] };
  assert.equal(nextRetryDelayMs(1, cfg), 60_000);
  assert.equal(nextRetryDelayMs(2, cfg), 300_000);
  assert.equal(nextRetryDelayMs(3, cfg), 900_000);
  assert.equal(nextRetryDelayMs(4, cfg), 3_600_000);
  assert.equal(nextRetryDelayMs(5, cfg), null, "5th failure is terminal");
});

test("5.3 SSRF guard refuses metadata, loopback, private, link-local, non-http", async () => {
  for (const blocked of [
    "http://169.254.169.254/latest/meta-data",
    "http://localhost/hook",
    "http://127.0.0.1:8080/hook",
    "http://10.1.2.3/hook",
    "http://172.16.0.9/hook",
    "http://192.168.1.1/hook",
    "http://[::1]/hook",
    "http://0.0.0.0/hook",
    "http://100.64.0.1/hook",
    "ftp://example.com/hook",
  ]) {
    const res = await guardWebhookUrl(blocked);
    assert.equal(res.ok, false, `${blocked} must be refused`);
  }
  const ok = await guardWebhookUrl("http://8.8.8.8/hook");
  assert.equal(ok.ok, true);
  // The guard returns the address that will be PINNED for the connection —
  // a rebinding DNS answer after the check can't redirect the request.
  assert.equal(ok.address, "8.8.8.8");
});

test("5.3 signature verifies with the documented snippet", () => {
  const secret = "whsec_test";
  const rawBody = JSON.stringify({ event: "job.succeeded", job: { id: "job_x" } });
  const signature = signWebhook(secret, rawBody);
  const timestamp = String(Math.floor(Date.now() / 1000));
  assert.equal(verifyNodera(rawBody, signature, timestamp, secret), true);
  assert.equal(verifyNodera(rawBody + " ", signature, timestamp, secret), false);
  assert.equal(verifyNodera(rawBody, signature, String(Date.now() / 1000 - 400), secret), false);
});

test("live delivery: signed POST arrives, retries stop at terminal failed", async (t) => {
  const fx = await createWorkspaceFixture();
  t.after(() => destroyWorkspaceFixture(fx.workspace).then(() => prisma.$disconnect()));

  const received = [];
  let alwaysFailHits = 0;
  const server = http.createServer((req, res) => {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      if (req.url === "/fail") {
        alwaysFailHits += 1;
        res.writeHead(500).end();
        return;
      }
      received.push({ headers: req.headers, body });
      res.writeHead(200).end("ok");
    });
  });
  await new Promise((r) => server.listen(3921, r));
  t.after(() => new Promise((r) => server.close(r)));

  const dispatcher = await startDispatcher({
    DISPATCHER_PORT: "3904",
    WEBHOOK_ALLOW_PRIVATE: "1",
    WEBHOOK_BACKOFF_S: "1,1",
    WEBHOOK_MAX_ATTEMPTS: "3",
    WEBHOOK_TIMEOUT_MS: "3000",
  });
  t.after(() => dispatcher.stop());

  async function makeFinalizedJob(url) {
    const job = await prisma.job.create({
      data: {
        id: newId("job"),
        workspaceId: fx.workspace.id,
        modelSlug: "llama-3.1-8b",
        input: { prompt: "hooked" },
        status: "succeeded",
        attempts: 1,
        finalizedAt: new Date(),
        webhookUrl: url,
      },
    });
    await prisma.webhookDelivery.create({
      data: { id: newId("whd"), jobId: job.id, url },
    });
    return job;
  }

  // Happy path: delivered once, signed, correct payload shape.
  const job = await makeFinalizedJob("http://localhost:3921/hook");
  const delivered = await waitFor(async () => {
    const row = await prisma.webhookDelivery.findUnique({ where: { jobId: job.id } });
    return row.status === "succeeded" ? row : null;
  });
  assert.ok(delivered, "delivery never succeeded");
  assert.equal(delivered.attempts, 1);
  assert.equal(received.length, 1);
  const { headers, body } = received[0];
  assert.equal(
    verifyNodera(body, headers["x-nodera-signature"], headers["x-nodera-timestamp"], fx.workspace.webhookSecret),
    true,
    "signature must verify with the documented snippet"
  );
  const payload = JSON.parse(body);
  assert.equal(payload.event, "job.succeeded");
  assert.deepEqual(payload.job, { id: job.id, status: "succeeded", model: "llama-3.1-8b" });
  assert.ok("run" in payload && "sent_at" in payload);

  // Terminal path: always-500 receiver → exactly maxAttempts tries, then failed.
  const doomed = await makeFinalizedJob("http://localhost:3921/fail");
  const failed = await waitFor(
    async () => {
      const row = await prisma.webhookDelivery.findUnique({ where: { jobId: doomed.id } });
      return row.status === "failed" ? row : null;
    },
    { timeoutMs: 20000 }
  );
  assert.ok(failed, "delivery never reached terminal failed");
  assert.equal(failed.attempts, 3);
  assert.equal(alwaysFailHits, 3);
  assert.match(failed.lastError, /HTTP 500/);

  // Webhook outcome never changes job status.
  const jobAfter = await prisma.job.findUnique({ where: { id: doomed.id } });
  assert.equal(jobAfter.status, "succeeded");
});
