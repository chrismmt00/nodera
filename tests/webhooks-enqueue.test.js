// Task 5.1: exactly one webhook_deliveries row per job finalization,
// idempotent with duplicate reports; no row without a webhook_url.
const test = require("node:test");
const assert = require("node:assert/strict");
const {
  API,
  createWorkspaceFixture,
  destroyWorkspaceFixture,
  prisma,
} = require("./helpers/api.js");
const { newId, newSecret } = require("@nodera/db");

let fx;
let provider;
let token;

test.before(async () => {
  fx = await createWorkspaceFixture();
  const secret = newSecret("npt");
  token = secret.plaintext;
  provider = await prisma.provider.create({
    data: {
      id: newId("prov"),
      name: "webhook-enqueue-test",
      tokenHash: secret.hash,
      capabilities: { models: ["llama-3.1-8b"], models_ready: ["llama-3.1-8b"] },
    },
  });
});
test.after(async () => {
  await destroyWorkspaceFixture(fx.workspace);
  await prisma.provider.delete({ where: { id: provider.id } });
  await prisma.$disconnect();
});

async function makeRunningRun({ webhookUrl, attempts = 1, maxAttempts = 3 } = {}) {
  const job = await prisma.job.create({
    data: {
      id: newId("job"),
      workspaceId: fx.workspace.id,
      modelSlug: "llama-3.1-8b",
      input: { prompt: "webhook test" },
      status: "running",
      attempts,
      maxAttempts,
      webhookUrl: webhookUrl ?? null,
    },
  });
  const run = await prisma.run.create({
    data: {
      id: newId("run"),
      jobId: job.id,
      providerId: provider.id,
      attempt: attempts,
      status: "running",
      startedAt: new Date(),
    },
  });
  return { job, run };
}

function report(body) {
  return fetch(`${API}/providers/report`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-provider-token": token },
    body: JSON.stringify(body),
  });
}

const USAGE = { tokens_in: 1, tokens_out: 2, images: 0, duration_ms: 10, model_slug: "llama-3.1-8b" };

test("success finalization enqueues exactly one delivery, even on duplicate report", async () => {
  const { job, run } = await makeRunningRun({ webhookUrl: "http://localhost:8787/hook" });
  await report({ run_id: run.id, status: "succeeded", usage: USAGE });
  await report({ run_id: run.id, status: "succeeded", usage: USAGE }); // duplicate no-op

  const rows = await prisma.webhookDelivery.findMany({ where: { jobId: job.id } });
  assert.equal(rows.length, 1);
  assert.equal(rows[0].status, "pending");
  assert.equal(rows[0].url, "http://localhost:8787/hook");
  assert.equal(rows[0].attempts, 0);
});

test("failure at the attempts cap enqueues exactly one delivery", async () => {
  const { job, run } = await makeRunningRun({
    webhookUrl: "http://localhost:8787/hook",
    attempts: 3,
  });
  await report({
    run_id: run.id,
    status: "failed",
    error: { code: "worker_error", message: "final failure" },
  });
  assert.equal(await prisma.webhookDelivery.count({ where: { jobId: job.id } }), 1);
});

test("requeue (attempts remaining) does NOT enqueue; no webhook_url does NOT enqueue", async () => {
  const retried = await makeRunningRun({ webhookUrl: "http://localhost:8787/hook", attempts: 1 });
  await report({
    run_id: retried.run.id,
    status: "failed",
    error: { code: "worker_error", message: "retry me" },
  });
  assert.equal(await prisma.webhookDelivery.count({ where: { jobId: retried.job.id } }), 0);

  const silent = await makeRunningRun({});
  await report({ run_id: silent.run.id, status: "succeeded", usage: USAGE });
  assert.equal(await prisma.webhookDelivery.count({ where: { jobId: silent.job.id } }), 0);
});
