// Task 6.4: session-only account routes list/create/revoke API keys without
// leaking hashes or stored plaintext; revoked keys fail /v1 immediately.
const test = require("node:test");
const assert = require("node:assert/strict");
const { sha256 } = require("@nodera/db");
const { BASE, API, destroyWorkspaceFixture, prisma } = require("./helpers/api.js");

const emails = [];

async function signIn(email) {
  emails.push(email);
  const response = await fetch(`${BASE}/api/auth/dev-login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email }),
  });
  assert.equal(response.status, 200);
  return response.headers.get("set-cookie").split(";")[0];
}

async function createKey(cookie, label = "integration key") {
  const response = await fetch(`${BASE}/api/account/keys`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie, origin: BASE },
    body: JSON.stringify({ label }),
  });
  return { response, body: await response.json() };
}

test.after(async () => {
  for (const email of emails) {
    const user = await prisma.user.findUnique({ where: { email }, include: { workspace: true } });
    if (!user) continue;
    await prisma.user.deleteMany({ where: { workspaceId: user.workspaceId } });
    await destroyWorkspaceFixture(user.workspace);
  }
  await prisma.$disconnect();
});

test("account key routes require a session and same-origin mutations", async () => {
  const unauthenticated = await fetch(`${BASE}/api/account/keys`);
  assert.equal(unauthenticated.status, 401);
  assert.equal((await unauthenticated.json()).error.code, "unauthorized");

  const cookie = await signIn(`account-origin-${Date.now()}@nodera.local`);
  const crossOrigin = await fetch(`${BASE}/api/account/keys`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie, origin: "https://invalid.example" },
    body: JSON.stringify({ label: "blocked" }),
  });
  assert.equal(crossOrigin.status, 403);
  assert.equal((await crossOrigin.json()).error.code, "forbidden");
});

test("create returns plaintext once while list and database expose metadata or hash only", async () => {
  const email = `account-create-${Date.now()}@nodera.local`;
  const cookie = await signIn(email);
  const initial = await fetch(`${BASE}/api/account/keys`, { headers: { cookie } });
  assert.equal(initial.status, 200);
  assert.equal((await initial.json()).api_keys.length, 1);

  const { response, body } = await createKey(cookie);
  assert.equal(response.status, 201);
  assert.match(body.plaintext, /^nod_[A-Za-z0-9_-]+$/);
  assert.equal(body.api_key.label, "integration key");
  assert.equal(body.api_key.revoked_at, null);
  assert.equal(body.api_key.key_hash, undefined);

  const row = await prisma.apiKey.findUnique({ where: { id: body.api_key.key_id } });
  assert.equal(row.keyHash, sha256(body.plaintext));
  assert.notEqual(row.keyHash, body.plaintext);

  const listed = await fetch(`${BASE}/api/account/keys`, { headers: { cookie } });
  const listedText = await listed.text();
  assert.equal(listed.status, 200);
  assert.ok(!listedText.includes(body.plaintext));
  assert.ok(!listedText.includes(row.keyHash));
});

test("revocation is tenant-scoped, idempotent, and rejects the key on /v1 immediately", async () => {
  const ownerCookie = await signIn(`account-owner-${Date.now()}@nodera.local`);
  const otherCookie = await signIn(`account-other-${Date.now()}@nodera.local`);
  const { response, body } = await createKey(ownerCookie, "revocation key");
  assert.equal(response.status, 201);

  const worksBefore = await fetch(`${API}/models`, { headers: { "x-api-key": body.plaintext } });
  assert.equal(worksBefore.status, 200);

  const foreign = await fetch(`${BASE}/api/account/keys/${body.api_key.key_id}`, {
    method: "DELETE",
    headers: { cookie: otherCookie, origin: BASE },
  });
  assert.equal(foreign.status, 404);

  const revoked = await fetch(`${BASE}/api/account/keys/${body.api_key.key_id}`, {
    method: "DELETE",
    headers: { cookie: ownerCookie, origin: BASE },
  });
  assert.equal(revoked.status, 200);
  assert.ok((await revoked.json()).api_key.revoked_at);

  const duplicate = await fetch(`${BASE}/api/account/keys/${body.api_key.key_id}`, {
    method: "DELETE",
    headers: { cookie: ownerCookie, origin: BASE },
  });
  assert.equal(duplicate.status, 200);

  const rejectedAfter = await fetch(`${API}/models`, { headers: { "x-api-key": body.plaintext } });
  assert.equal(rejectedAfter.status, 401);
  assert.equal((await rejectedAfter.json()).error.code, "unauthorized");
});
