// Task 4.1: storage abstraction — local backend regression.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

let storage;
test.before(() => {
  process.env.STORAGE_ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "nodera-storage-"));
  process.env.STORAGE_SIGNING_SECRET = "test-signing-secret";
  const { createStorage } = require("@nodera/storage");
  storage = createStorage();
});

test("putBuffer / headObject / getBuffer / getReadStream / copyObject", async () => {
  const key = "jobs/job_a/runs/run_a/result.json";
  const payload = Buffer.from(JSON.stringify({ text: "stored" }));

  await storage.putBuffer(key, payload, { contentType: "application/json" });
  assert.deepEqual(await storage.headObject(key), { size: payload.length });
  assert.equal(await storage.headObject("jobs/nope"), null);

  const buf = await storage.getBuffer(key);
  assert.equal(buf.toString(), payload.toString());
  assert.equal(await storage.getBuffer(key, 3), null, "maxBytes must be honored");

  const chunks = [];
  for await (const c of storage.getReadStream(key)) chunks.push(c);
  assert.equal(Buffer.concat(chunks).toString(), payload.toString());

  const dst = "jobs/job_a/runs/run_a/copy.json";
  await storage.copyObject(key, dst);
  assert.deepEqual(await storage.headObject(dst), { size: payload.length });
});

test("unsafe keys are rejected", async () => {
  for (const bad of ["../etc/passwd", "jobs/../../x", "/absolute", "a b"]) {
    await assert.rejects(storage.putBuffer(bad, Buffer.from("x")), /unsafe object key/);
  }
});

test("upload target round-trip: token verifies, expiry and tamper rejected", async () => {
  const target = await storage.createUploadTarget({
    key: "pending/jobs/j/runs/r/big.bin",
    contentType: "application/octet-stream",
    sizeBytes: 1234,
    expiresS: 300,
  });
  assert.equal(target.method, "PUT");
  assert.equal(target.headers["Content-Type"], "application/octet-stream");
  const token = new URL(target.url).searchParams.get("token");

  const claims = storage.verifyUploadToken(token);
  assert.deepEqual(claims, {
    key: "pending/jobs/j/runs/r/big.bin",
    contentType: "application/octet-stream",
    sizeBytes: 1234,
  });

  // Tampered payload fails.
  const [payload, mac] = token.split(".");
  const forged = Buffer.from(
    JSON.stringify({ key: "pending/other", ct: "x", size: 1, exp: 9999999999 })
  ).toString("base64url");
  assert.equal(storage.verifyUploadToken(`${forged}.${mac}`), null);
  assert.equal(storage.verifyUploadToken(`${payload}.AAAA`), null);

  // Expired token fails.
  const expired = await storage.createUploadTarget({
    key: "pending/jobs/j/runs/r/late.bin",
    contentType: "text/plain",
    sizeBytes: 1,
    expiresS: -1,
  });
  assert.equal(
    storage.verifyUploadToken(new URL(expired.url).searchParams.get("token")),
    null
  );
});
