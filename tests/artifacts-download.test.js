// Task 4.5: streaming download — >5MB arrives chunked with correct headers;
// cross-workspace access is a 404.
const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const {
  API,
  createWorkspaceFixture,
  destroyWorkspaceFixture,
  prisma,
} = require("./helpers/api.js");
const { newId, newSecret } = require("@nodera/db");
const { getStorage, permanentKey } = require("@nodera/storage");

let fx;
let other;
let provider;
let job;
const BIG = crypto.randomBytes(6 * 1024 * 1024); // 6MB

test.before(async () => {
  fx = await createWorkspaceFixture();
  other = await createWorkspaceFixture();
  provider = await prisma.provider.create({
    data: {
      id: newId("prov"),
      name: "download-test",
      tokenHash: newSecret("npt").hash,
      capabilities: {},
    },
  });
  job = await prisma.job.create({
    data: {
      id: newId("job"),
      workspaceId: fx.workspace.id,
      modelSlug: "llama-3.1-8b",
      input: { prompt: "download" },
      status: "succeeded",
      attempts: 1,
      finalizedAt: new Date(),
    },
  });
  const run = await prisma.run.create({
    data: {
      id: newId("run"),
      jobId: job.id,
      providerId: provider.id,
      attempt: 1,
      status: "succeeded",
      startedAt: new Date(),
      endedAt: new Date(),
    },
  });
  const key = permanentKey(job.id, run.id, "big.bin");
  await getStorage().putBuffer(key, BIG, { contentType: "application/octet-stream" });
  await prisma.artifact.create({
    data: {
      id: newId("art"),
      runId: run.id,
      name: "big.bin",
      mime: "application/octet-stream",
      sizeBytes: BIG.length,
      backend: "local",
      objectKey: key,
      inline: false,
    },
  });
});
test.after(async () => {
  await destroyWorkspaceFixture(fx.workspace);
  await destroyWorkspaceFixture(other.workspace);
  await prisma.provider.delete({ where: { id: provider.id } });
  await prisma.$disconnect();
});

test(">5MB artifact streams in chunks with correct headers and exact bytes", async () => {
  const res = await fetch(`${API}/jobs/${job.id}/artifacts/big.bin`, {
    headers: { "x-api-key": fx.apiKeyPlaintext },
  });
  assert.equal(res.status, 200);
  assert.equal(res.headers.get("content-type"), "application/octet-stream");
  assert.equal(res.headers.get("content-length"), String(BIG.length));
  assert.match(res.headers.get("content-disposition"), /big\.bin/);

  let chunkCount = 0;
  const received = [];
  for await (const chunk of res.body) {
    chunkCount += 1;
    received.push(chunk);
  }
  const full = Buffer.concat(received);
  assert.equal(full.length, BIG.length);
  assert.ok(full.equals(BIG), "downloaded bytes must match exactly");
  // A buffered response would arrive as one blob; streaming arrives chunked.
  assert.ok(chunkCount > 1, `expected chunked delivery, got ${chunkCount} chunk(s)`);
});

test("cross-workspace download → 404; unknown artifact → 404", async () => {
  const foreign = await fetch(`${API}/jobs/${job.id}/artifacts/big.bin`, {
    headers: { "x-api-key": other.apiKeyPlaintext },
  });
  assert.equal(foreign.status, 404);
  assert.equal((await foreign.json()).error.code, "not_found");

  const missing = await fetch(`${API}/jobs/${job.id}/artifacts/nope.bin`, {
    headers: { "x-api-key": fx.apiKeyPlaintext },
  });
  assert.equal(missing.status, 404);
});
