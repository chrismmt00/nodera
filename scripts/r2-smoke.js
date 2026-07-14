// Task 4.2 verification: put/head/stream/copy (+ presigned PUT) against a
// REAL R2 bucket. Needs R2_* env values (docs/LAUNCH-CHECKLIST.md).
const path = require("node:path");
const { loadEnv } = require("@nodera/shared");
loadEnv(path.join(__dirname, ".."));

process.env.STORAGE_BACKEND = "r2";
const { createStorage } = require("@nodera/storage");

function fail(msg) {
  console.error(`R2 SMOKE FAIL: ${msg}`);
  process.exit(1);
}

async function main() {
  let storage;
  try {
    storage = createStorage();
  } catch (err) {
    fail(err.message);
  }

  const key = `pending/r2-smoke/${Date.now()}/hello.txt`;
  const permanent = key.replace("pending/", "");
  const payload = Buffer.from(`r2 smoke ${new Date().toISOString()}`);

  await storage.putBuffer(key, payload, { contentType: "text/plain" });
  console.log(`put ${key}`);

  const head = await storage.headObject(key);
  if (!head || head.size !== payload.length) fail(`head mismatch: ${JSON.stringify(head)}`);
  console.log(`head ok (${head.size} bytes)`);

  const chunks = [];
  for await (const c of storage.getReadStream(key)) chunks.push(c);
  if (Buffer.concat(chunks).toString() !== payload.toString()) fail("stream content mismatch");
  console.log("stream ok");

  await storage.copyObject(key, permanent);
  const copied = await storage.headObject(permanent);
  if (!copied || copied.size !== payload.length) fail("copy verification failed");
  console.log(`copy ok → ${permanent}`);

  // Presigned PUT round-trip.
  const target = await storage.createUploadTarget({
    key: `pending/r2-smoke/${Date.now()}/upload.bin`,
    contentType: "application/octet-stream",
    sizeBytes: 4,
    expiresS: 120,
  });
  const res = await fetch(target.url, { method: "PUT", headers: target.headers, body: Buffer.from("ping") });
  if (!res.ok) fail(`presigned PUT returned ${res.status}`);
  console.log("presigned PUT ok");

  console.log("R2 SMOKE PASS");
}

main().catch((err) => fail(err.message));
