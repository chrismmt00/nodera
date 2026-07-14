// Task 1.5: provider register (enroll secret, one-time token) + heartbeat.
const test = require("node:test");
const assert = require("node:assert/strict");
const { API, destroyProviderFixture, prisma } = require("./helpers/api.js");

const created = [];
test.after(async () => {
  for (const id of created) await destroyProviderFixture(id);
  await prisma.$disconnect();
});

function register(body) {
  return fetch(`${API}/providers/register`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

const GOOD = {
  enroll_secret: process.env.PROVIDER_ENROLL_SECRET,
  name: "pats-gaming-pc",
  capabilities: {
    models: ["llama-3.1-8b", "sdxl-1.0"],
    gpu: { model: "RTX 4090", vram_gb: 24 },
    concurrency: 1,
  },
};

test("wrong enroll secret → 403 forbidden", async () => {
  const res = await register({ ...GOOD, enroll_secret: "nope" });
  assert.equal(res.status, 403);
  assert.equal((await res.json()).error.code, "forbidden");
});

test("register returns token exactly once; heartbeat works with it", async () => {
  const res = await register(GOOD);
  assert.equal(res.status, 201);
  const body = await res.json();
  created.push(body.provider_id);
  assert.match(body.provider_id, /^prov_/);
  assert.match(body.provider_token, /^npt_/);
  assert.deepEqual(Object.keys(body).sort(), ["provider_id", "provider_token"]);

  // Only the hash is stored — the plaintext appears nowhere in the DB.
  const row = await prisma.provider.findUnique({ where: { id: body.provider_id } });
  assert.notEqual(row.tokenHash, body.provider_token);
  assert.equal(row.lastHeartbeatAt, null);
  assert.equal(row.concurrency, 1);
  assert.deepEqual(row.capabilities.models_ready, []);

  const hb = await fetch(`${API}/providers/heartbeat`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-provider-token": body.provider_token },
    body: JSON.stringify({ active_runs: 0, models_ready: ["llama-3.1-8b"] }),
  });
  assert.equal(hb.status, 200);
  assert.deepEqual(await hb.json(), { ok: true });

  const after = await prisma.provider.findUnique({ where: { id: body.provider_id } });
  assert.ok(after.lastHeartbeatAt instanceof Date || after.lastHeartbeatAt !== null);
  assert.deepEqual(after.capabilities.models_ready, ["llama-3.1-8b"]);
  // Advertised capabilities are preserved alongside readiness.
  assert.deepEqual(after.capabilities.models, ["llama-3.1-8b", "sdxl-1.0"]);
});

test("register validation: bad name, bad models, bad concurrency", async () => {
  for (const bad of [
    { ...GOOD, name: "" },
    { ...GOOD, capabilities: { ...GOOD.capabilities, models: "llama" } },
    { ...GOOD, capabilities: { ...GOOD.capabilities, concurrency: 0 } },
  ]) {
    const res = await register(bad);
    assert.equal(res.status, 400);
    assert.equal((await res.json()).error.code, "validation_failed");
  }
});

test("heartbeat without token → 401", async () => {
  const res = await fetch(`${API}/providers/heartbeat`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({}),
  });
  assert.equal(res.status, 401);
  assert.equal((await res.json()).error.code, "unauthorized");
});
