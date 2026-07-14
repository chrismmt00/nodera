// Task 4.4: report verification + promote — HEAD retries, size check,
// pending→permanent copy, artifact_missing.
const test = require("node:test");
const assert = require("node:assert/strict");
const {
  API,
  createWorkspaceFixture,
  destroyWorkspaceFixture,
  prisma,
} = require("./helpers/api.js");
const { newId, newSecret } = require("@nodera/db");
const { getStorage, pendingKey, permanentKey } = require("@nodera/storage");

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
      name: "promote-test",
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

async function makeRunningRun() {
  const job = await prisma.job.create({
    data: {
      id: newId("job"),
      workspaceId: fx.workspace.id,
      modelSlug: "llama-3.1-8b",
      input: { prompt: "promote test" },
      status: "running",
      attempts: 1,
    },
  });
  const run = await prisma.run.create({
    data: {
      id: newId("run"),
      jobId: job.id,
      providerId: provider.id,
      attempt: 1,
      status: "running",
      startedAt: new Date(),
    },
  });
  return { job, run };
}

function providerFetch(pathname, body) {
  return fetch(`${API}${pathname}`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-provider-token": token },
    body: JSON.stringify(body),
  });
}

const USAGE = { tokens_in: 5, tokens_out: 9, images: 1, duration_ms: 100, model_slug: "llama-3.1-8b" };

test("uploaded artifact: verified, promoted pending→permanent, row created", async () => {
  const { job, run } = await makeRunningRun();
  const payload = Buffer.alloc(1024 * 1024, 7); // 1MB — over the inline limit

  const target = await (
    await providerFetch("/providers/artifacts/upload-url", {
      run_id: run.id,
      name: "output.png",
      mime: "image/png",
      size_bytes: payload.length,
    })
  ).json();
  const put = await fetch(target.upload_url, {
    method: "PUT",
    headers: target.headers,
    body: payload,
  });
  assert.equal(put.status, 200);

  const report = await providerFetch("/providers/report", {
    run_id: run.id,
    status: "succeeded",
    exit_code: 0,
    usage: USAGE,
    artifacts: [{ name: "output.png", mime: "image/png", size_bytes: payload.length }],
  });
  assert.equal(report.status, 200);

  // Pending and permanent are distinct objects — lifecycle can only ever
  // touch pending/ (DECISIONS 009).
  const storage = getStorage();
  assert.deepEqual(await storage.headObject(pendingKey(job.id, run.id, "output.png")), {
    size: payload.length,
  });
  assert.deepEqual(await storage.headObject(permanentKey(job.id, run.id, "output.png")), {
    size: payload.length,
  });

  const row = await prisma.artifact.findFirst({ where: { runId: run.id, name: "output.png" } });
  assert.equal(row.inline, false);
  assert.equal(row.objectKey, permanentKey(job.id, run.id, "output.png"));
  assert.equal(row.sizeBytes, payload.length);

  const detail = await (
    await fetch(`${API}/jobs/${job.id}`, { headers: { "x-api-key": fx.apiKeyPlaintext } })
  ).json();
  assert.deepEqual(detail.artifacts, [
    { name: "output.png", mime: "image/png", size_bytes: payload.length },
  ]);
});

test("missing uploaded object → 400 artifact_missing; run stays reportable", async () => {
  const { run } = await makeRunningRun();
  const res = await providerFetch("/providers/report", {
    run_id: run.id,
    status: "succeeded",
    usage: USAGE,
    artifacts: [{ name: "ghost.bin", mime: "application/octet-stream", size_bytes: 10 }],
  });
  assert.equal(res.status, 400);
  assert.equal((await res.json()).error.code, "artifact_missing");

  // The failure happened before finalization — a corrected report succeeds.
  const retry = await providerFetch("/providers/report", {
    run_id: run.id,
    status: "succeeded",
    usage: USAGE,
  });
  assert.equal(retry.status, 200);
});

test("size mismatch is rejected", async () => {
  const { run } = await makeRunningRun();
  const target = await (
    await providerFetch("/providers/artifacts/upload-url", {
      run_id: run.id,
      name: "short.bin",
      mime: "application/octet-stream",
      size_bytes: 20,
    })
  ).json();
  await fetch(target.upload_url, {
    method: "PUT",
    headers: target.headers,
    body: Buffer.alloc(10), // uploads 10 bytes, declares 20
  });

  const res = await providerFetch("/providers/report", {
    run_id: run.id,
    status: "succeeded",
    usage: USAGE,
    artifacts: [{ name: "short.bin", mime: "application/octet-stream", size_bytes: 20 }],
  });
  assert.equal(res.status, 400);
  assert.equal((await res.json()).error.code, "validation_failed");
});
