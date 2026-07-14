// Task 1.1: error shape + hashed auth lookups (docs/api.md conventions).
const test = require("node:test");
const assert = require("node:assert/strict");
const { prisma, newId, newSecret } = require("@nodera/db");

// The lib under test is ESM (Next.js app code); load it dynamically.
let errors;
let auth;
test.before(async () => {
  errors = await import("../apps/web/src/lib/api/errors.js");
  auth = await import("../apps/web/src/lib/api/auth.js");
});
test.after(() => prisma.$disconnect());

function requestWithHeaders(headers) {
  return new Request("http://localhost/test", { headers });
}

test("ApiError maps codes to contract statuses and shape", async () => {
  const err = new errors.ApiError("unauthorized", "Missing x-api-key header.");
  assert.equal(err.status, 401);
  const res = errors.errorResponse(err);
  assert.equal(res.status, 401);
  const body = await res.json();
  assert.deepEqual(body, {
    error: { code: "unauthorized", message: "Missing x-api-key header." },
  });
  assert.equal(new errors.ApiError("rate_limited", "x").status, 429);
  assert.equal(new errors.ApiError("report_conflict", "x").status, 409);
  assert.throws(() => new errors.ApiError("nonsense", "x"));
});

test("api key auth: missing, invalid, valid, revoked", async (t) => {
  const ws = await prisma.workspace.create({
    data: { id: newId("ws"), name: `test-${newId("t")}`, webhookSecret: "s" },
  });
  const { plaintext, hash } = newSecret("nod");
  const key = await prisma.apiKey.create({
    data: { id: newId("key"), workspaceId: ws.id, keyHash: hash, label: "t" },
  });
  t.after(async () => {
    await prisma.apiKey.delete({ where: { id: key.id } });
    await prisma.workspace.delete({ where: { id: ws.id } });
  });

  await assert.rejects(auth.requireApiKey(requestWithHeaders({})), (e) => e.code === "unauthorized");
  await assert.rejects(
    auth.requireApiKey(requestWithHeaders({ "x-api-key": "nod_wrong" })),
    (e) => e.code === "unauthorized"
  );

  const found = await auth.requireApiKey(requestWithHeaders({ "x-api-key": plaintext }));
  assert.equal(found.workspaceId, ws.id);

  await prisma.apiKey.update({ where: { id: key.id }, data: { revokedAt: new Date() } });
  await assert.rejects(
    auth.requireApiKey(requestWithHeaders({ "x-api-key": plaintext })),
    (e) => e.code === "unauthorized"
  );
});

test("provider auth: missing, invalid, valid, disabled", async (t) => {
  const { plaintext, hash } = newSecret("npt");
  const provider = await prisma.provider.create({
    data: { id: newId("prov"), name: "test-prov", tokenHash: hash, capabilities: {} },
  });
  t.after(() => prisma.provider.delete({ where: { id: provider.id } }));

  await assert.rejects(auth.requireProvider(requestWithHeaders({})), (e) => e.code === "unauthorized");
  await assert.rejects(
    auth.requireProvider(requestWithHeaders({ "x-provider-token": "npt_wrong" })),
    (e) => e.code === "unauthorized"
  );

  const found = await auth.requireProvider(requestWithHeaders({ "x-provider-token": plaintext }));
  assert.equal(found.id, provider.id);

  await prisma.provider.update({ where: { id: provider.id }, data: { status: "disabled" } });
  await assert.rejects(
    auth.requireProvider(requestWithHeaders({ "x-provider-token": plaintext })),
    (e) => e.code === "forbidden"
  );
});
