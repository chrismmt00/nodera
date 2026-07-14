// Task 4.3: upload-url — ownership, server-derived pending/ key, TTL,
// content-type in signature, limits.
const test = require("node:test");
const assert = require("node:assert/strict");
const {
  API,
  BASE,
  createWorkspaceFixture,
  destroyWorkspaceFixture,
  prisma,
} = require("./helpers/api.js");
const { newId, newSecret } = require("@nodera/db");

let fx;
let provider;
let token;
let otherToken;
const providerIds = [];

async function makeProvider(name) {
  const secret = newSecret("npt");
  const row = await prisma.provider.create({
    data: {
      id: newId("prov"),
      name,
      tokenHash: secret.hash,
      capabilities: { models: ["llama-3.1-8b"], models_ready: ["llama-3.1-8b"] },
    },
  });
  providerIds.push(row.id);
  return { row, token: secret.plaintext };
}

async function makeRunningRun(providerId) {
  const job = await prisma.job.create({
    data: {
      id: newId("job"),
      workspaceId: fx.workspace.id,
      modelSlug: "llama-3.1-8b",
      input: { prompt: "upload test" },
      status: "running",
      attempts: 1,
    },
  });
  const run = await prisma.run.create({
    data: {
      id: newId("run"),
      jobId: job.id,
      providerId,
      attempt: 1,
      status: "running",
      startedAt: new Date(),
    },
  });
  return { job, run };
}

function uploadUrl(body, useToken = token) {
  return fetch(`${API}/providers/artifacts/upload-url`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-provider-token": useToken },
    body: JSON.stringify(body),
  });
}

test.before(async () => {
  fx = await createWorkspaceFixture();
  const a = await makeProvider("upload-owner");
  provider = a.row;
  token = a.token;
  otherToken = (await makeProvider("upload-other")).token;
});
test.after(async () => {
  await destroyWorkspaceFixture(fx.workspace);
  for (const id of providerIds) {
    await prisma.run.deleteMany({ where: { providerId: id } });
    await prisma.provider.delete({ where: { id } });
  }
  await prisma.$disconnect();
});

test("contract flow: URL issued, PUT stores under server-derived pending/ key", async () => {
  const { job, run } = await makeRunningRun(provider.id);
  const res = await uploadUrl({
    run_id: run.id,
    name: "output.png",
    mime: "image/png",
    size_bytes: 8,
  });
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.deepEqual(Object.keys(body).sort(), ["expires_at", "headers", "method", "upload_url"]);
  assert.equal(body.method, "PUT");
  assert.equal(body.headers["Content-Type"], "image/png");
  assert.ok(Date.parse(body.expires_at) > Date.now());

  // PUT through the issued URL (content-type is part of the signature).
  const put = await fetch(body.upload_url, {
    method: "PUT",
    headers: body.headers,
    body: Buffer.from("PNGDATA!"),
  });
  assert.equal(put.status, 200);

  const { getStorage, pendingKey } = require("@nodera/storage");
  const head = await getStorage().headObject(pendingKey(job.id, run.id, "output.png"));
  assert.deepEqual(head, { size: 8 });

  // Wrong content-type is refused.
  const wrongCt = await fetch(body.upload_url, {
    method: "PUT",
    headers: { "Content-Type": "text/plain" },
    body: Buffer.from("x"),
  });
  assert.equal(wrongCt.status, 400);
});

test("foreign run → 403; finished run → 403", async () => {
  const { run } = await makeRunningRun(provider.id);
  const foreign = await uploadUrl(
    { run_id: run.id, name: "a.txt", mime: "text/plain", size_bytes: 1 },
    otherToken
  );
  assert.equal(foreign.status, 403);
  assert.equal((await foreign.json()).error.code, "forbidden");

  await prisma.run.update({ where: { id: run.id }, data: { status: "succeeded" } });
  const finished = await uploadUrl({ run_id: run.id, name: "a.txt", mime: "text/plain", size_bytes: 1 });
  assert.equal(finished.status, 403);
});

test("limits and validation errors", async () => {
  const { run } = await makeRunningRun(provider.id);

  const over = await uploadUrl({
    run_id: run.id,
    name: "big.bin",
    mime: "application/octet-stream",
    size_bytes: 52428801,
  });
  assert.equal(over.status, 400);
  assert.equal((await over.json()).error.code, "artifact_limits_exceeded");

  for (const bad of [
    { run_id: run.id, name: "../evil", mime: "text/plain", size_bytes: 1 },
    { run_id: run.id, name: "ok.txt", mime: "", size_bytes: 1 },
    { run_id: run.id, name: "ok.txt", mime: "text/plain", size_bytes: 0 },
    { run_id: run.id, name: "ok.txt", mime: "text/plain", size_bytes: 1, extra: true },
  ]) {
    const res = await uploadUrl(bad);
    assert.equal(res.status, 400);
    assert.equal((await res.json()).error.code, "validation_failed");
  }
});
