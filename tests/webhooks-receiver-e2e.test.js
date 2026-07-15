// Task 5.4: with the receiver harness set to fail twice, observe two induced
// failures then a success, with retry gaps matching the backoff schedule.
const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const { spawn } = require("node:child_process");
const {
  createWorkspaceFixture,
  destroyWorkspaceFixture,
  prisma,
} = require("./helpers/api.js");
const { startDispatcher, waitFor } = require("./helpers/dispatcher.js");
const { newId } = require("@nodera/db");

const ROOT = path.join(__dirname, "..");
const RECEIVER_PORT = 8799;
const BACKOFF_S = 2; // small, fixed gap for a fast but real timing check

test("receiver harness: fail twice, then succeed with correct retry gaps", async (t) => {
  const fx = await createWorkspaceFixture();
  t.after(() => destroyWorkspaceFixture(fx.workspace).then(() => prisma.$disconnect()));

  // Start the real receiver harness with WEBHOOK_FAILS_BEFORE_SUCCESS=2.
  const receiver = spawn(
    process.execPath,
    [path.join(ROOT, "scripts", "webhook-receiver.js")],
    {
      cwd: ROOT,
      env: {
        ...process.env,
        WEBHOOK_PORT: String(RECEIVER_PORT),
        WEBHOOK_FAILS_BEFORE_SUCCESS: "2",
        WEBHOOK_TEST_SECRET: fx.workspace.webhookSecret,
      },
      stdio: ["ignore", "pipe", "pipe"],
    }
  );
  const lines = [];
  receiver.stdout.on("data", (c) => lines.push(...c.toString().split(/\r?\n/).filter(Boolean)));
  t.after(() => receiver.kill());
  await waitFor(() => lines.some((l) => l.includes("webhook receiver on")), { timeoutMs: 8000 });

  const dispatcher = await startDispatcher({
    DISPATCHER_PORT: "3905",
    WEBHOOK_ALLOW_PRIVATE: "1",
    WEBHOOK_BACKOFF_S: `${BACKOFF_S},${BACKOFF_S},${BACKOFF_S}`,
    WEBHOOK_MAX_ATTEMPTS: "5",
    WEBHOOK_TIMEOUT_MS: "3000",
  });
  t.after(() => dispatcher.stop());

  const url = `http://localhost:${RECEIVER_PORT}/hook`;
  const job = await prisma.job.create({
    data: {
      id: newId("job"),
      workspaceId: fx.workspace.id,
      modelSlug: "llama-3.1-8b",
      input: { prompt: "receiver e2e" },
      status: "succeeded",
      attempts: 1,
      finalizedAt: new Date(),
      webhookUrl: url,
    },
  });
  await prisma.webhookDelivery.create({ data: { id: newId("whd"), jobId: job.id, url } });

  const delivered = await waitFor(
    async () => {
      const row = await prisma.webhookDelivery.findUnique({ where: { jobId: job.id } });
      return row.status === "succeeded" ? row : null;
    },
    { timeoutMs: 30000 }
  );
  assert.ok(delivered, "delivery never succeeded after retries");

  // Exactly 3 hits: two 500s then a 200 (fail-twice-then-succeed).
  const hits = lines.filter((l) => l.includes(job.id));
  assert.equal(hits.length, 3, `expected 3 attempts, saw:\n${hits.join("\n")}`);
  assert.match(hits[0], /attempt 1 → 500/);
  assert.match(hits[1], /attempt 2 → 500/);
  assert.match(hits[2], /attempt 3 → 200/);
  // Signature verified on the successful attempt.
  assert.match(hits[2], /signature OK/);
  assert.equal(delivered.attempts, 3);

  // Retry gaps honored the backoff (allow scheduler slack, but never faster).
  function tsOf(line) {
    return Date.parse(line.match(/^\[([^\]]+)\]/)[1]);
  }
  const gap1 = tsOf(hits[1]) - tsOf(hits[0]);
  const gap2 = tsOf(hits[2]) - tsOf(hits[1]);
  assert.ok(gap1 >= BACKOFF_S * 1000 - 200, `gap1 too small: ${gap1}ms`);
  assert.ok(gap2 >= BACKOFF_S * 1000 - 200, `gap2 too small: ${gap2}ms`);
});
