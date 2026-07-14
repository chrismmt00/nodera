// Task 1.7: report — finalize, idempotent duplicate, conflict, retry logic.
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
      name: "report-test",
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

// A running run, as if assigned and claimed (dispatcher arrives in Phase 2).
async function makeRunningRun({ attempts = 1, maxAttempts = 3 } = {}) {
  const job = await prisma.job.create({
    data: {
      id: newId("job"),
      workspaceId: fx.workspace.id,
      modelSlug: "llama-3.1-8b",
      input: { prompt: "report test" },
      status: "running",
      attempts,
      maxAttempts,
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
      deadlineAt: new Date(Date.now() + 120000),
    },
  });
  return { job, run };
}

function report(body, useToken = token) {
  return fetch(`${API}/providers/report`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-provider-token": useToken },
    body: JSON.stringify(body),
  });
}

const USAGE = { tokens_in: 52, tokens_out: 311, images: 0, duration_ms: 8400, model_slug: "llama-3.1-8b" };

test("success report finalizes run+job, records usage, stores inline artifact", async () => {
  const { job, run } = await makeRunningRun();
  const resultJson = JSON.stringify({ text: "Hello from the fake worker." });
  const res = await report({
    run_id: run.id,
    status: "succeeded",
    exit_code: 0,
    usage: USAGE,
    artifacts: [
      {
        name: "result.json",
        mime: "application/json",
        size_bytes: Buffer.byteLength(resultJson),
        inline_base64: Buffer.from(resultJson).toString("base64"),
      },
    ],
  });
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { ok: true });

  // Customer view reflects everything (docs/api.md job detail).
  const detail = await (
    await fetch(`${API}/jobs/${job.id}`, { headers: { "x-api-key": fx.apiKeyPlaintext } })
  ).json();
  assert.equal(detail.status, "succeeded");
  assert.ok(detail.finalized_at);
  assert.equal(detail.run.run_id, run.id);
  assert.equal(detail.run.provider, provider.id);
  assert.deepEqual(detail.run.usage, USAGE);
  assert.deepEqual(detail.output, { text: "Hello from the fake worker." });
  assert.deepEqual(detail.artifacts, [
    { name: "result.json", mime: "application/json", size_bytes: Buffer.byteLength(resultJson) },
  ]);
  assert.equal(detail.error, null);
});

test("duplicate identical report → 200 no-op; conflicting → 409", async () => {
  const { job, run } = await makeRunningRun();
  const first = await report({ run_id: run.id, status: "succeeded", exit_code: 0, usage: USAGE });
  assert.equal(first.status, 200);

  const duplicate = await report({ run_id: run.id, status: "succeeded", exit_code: 0, usage: USAGE });
  assert.equal(duplicate.status, 200);
  assert.deepEqual(await duplicate.json(), { ok: true });

  const conflict = await report({
    run_id: run.id,
    status: "failed",
    exit_code: 1,
    error: { code: "worker_error", message: "boom" },
  });
  assert.equal(conflict.status, 409);
  assert.equal((await conflict.json()).error.code, "report_conflict");

  // Neither the duplicate nor the conflict changed anything.
  const finalJob = await prisma.job.findUnique({ where: { id: job.id } });
  assert.equal(finalJob.status, "succeeded");
});

test("failed report with attempts remaining requeues the job", async () => {
  const { job, run } = await makeRunningRun({ attempts: 1, maxAttempts: 3 });
  const res = await report({
    run_id: run.id,
    status: "failed",
    exit_code: 1,
    error: { code: "worker_error", message: "GPU fell over." },
  });
  assert.equal(res.status, 200);

  const after = await prisma.job.findUnique({ where: { id: job.id } });
  assert.equal(after.status, "queued");
  assert.equal(after.finalizedAt, null);
  const failedRun = await prisma.run.findUnique({ where: { id: run.id } });
  assert.equal(failedRun.status, "failed");
});

test("failed report at the attempts cap finalizes the job with the error", async () => {
  const { job, run } = await makeRunningRun({ attempts: 3, maxAttempts: 3 });
  const res = await report({
    run_id: run.id,
    status: "failed",
    exit_code: 1,
    error: { code: "worker_error", message: "Third strike." },
  });
  assert.equal(res.status, 200);

  const detail = await (
    await fetch(`${API}/jobs/${job.id}`, { headers: { "x-api-key": fx.apiKeyPlaintext } })
  ).json();
  assert.equal(detail.status, "failed");
  assert.ok(detail.finalized_at);
  assert.deepEqual(detail.error, { code: "worker_error", message: "Third strike." });
});

test("foreign run → 404; oversized inline artifact → artifact_limits_exceeded", async () => {
  const res = await report({ run_id: "run_doesnotexist", status: "succeeded", usage: USAGE });
  assert.equal(res.status, 404);

  const { run } = await makeRunningRun();
  const big = Buffer.alloc(262145, 1); // one byte over INLINE_ARTIFACT_MAX_BYTES
  const over = await report({
    run_id: run.id,
    status: "succeeded",
    usage: USAGE,
    artifacts: [
      {
        name: "big.bin",
        mime: "application/octet-stream",
        size_bytes: big.length,
        inline_base64: big.toString("base64"),
      },
    ],
  });
  assert.equal(over.status, 400);
  assert.equal((await over.json()).error.code, "artifact_limits_exceeded");

  const bad = await report({ run_id: run.id, status: "succeeded" });
  assert.equal((await bad.json()).error.code, "validation_failed");
});
