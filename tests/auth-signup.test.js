// Task 6.2: dev-login auto-provisions a workspace + first API key; the
// session cookie authorizes the same /v1 endpoints (session-authed wrapper);
// re-login is idempotent.
const test = require("node:test");
const assert = require("node:assert/strict");
const { BASE, API, destroyWorkspaceFixture, prisma } = require("./helpers/api.js");

const emails = [];
test.after(async () => {
  for (const email of emails) {
    const user = await prisma.user.findUnique({ where: { email }, include: { workspace: true } });
    if (!user) continue;
    await prisma.user.deleteMany({ where: { workspaceId: user.workspaceId } });
    // destroyWorkspaceFixture tears down jobs/runs/artifacts/webhooks/keys too.
    await destroyWorkspaceFixture(user.workspace);
  }
  await prisma.$disconnect();
});

async function devLogin(email) {
  const res = await fetch(`${BASE}/api/auth/dev-login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email }),
  });
  const setCookie = res.headers.get("set-cookie");
  const body = await res.json();
  return { res, body, cookie: setCookie ? setCookie.split(";")[0] : null };
}

test("first sign-in provisions workspace + first API key; session authorizes /v1", async () => {
  const email = `signup-${Date.now()}@nodera.local`;
  emails.push(email);

  const { res, body, cookie } = await devLogin(email);
  assert.equal(res.status, 200);
  assert.equal(body.created, true);
  assert.match(body.workspace_id, /^ws_/);
  assert.ok(cookie, "a session cookie must be set");

  // Workspace has exactly one auto-provisioned key, stored hashed.
  const keys = await prisma.apiKey.findMany({ where: { workspaceId: body.workspace_id } });
  assert.equal(keys.length, 1);
  assert.equal(keys[0].label, "Default key");
  assert.ok(keys[0].keyHash && keys[0].keyHash.length === 64);

  // The session cookie alone authorizes GET /v1/models — no API key header.
  const models = await fetch(`${API}/models`, { headers: { cookie } });
  assert.equal(models.status, 200);
  assert.ok((await models.json()).models.length >= 1);

  // And POST /v1/jobs, scoped to the new workspace.
  const created = await fetch(`${API}/jobs`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({ model: "llama-3.1-8b", input: { prompt: "session job" } }),
  });
  assert.equal(created.status, 201);
  const job = await created.json();
  const row = await prisma.job.findUnique({ where: { id: job.job_id } });
  assert.equal(row.workspaceId, body.workspace_id);

  // /api/auth/me reflects the session.
  const me = await (await fetch(`${BASE}/api/auth/me`, { headers: { cookie } })).json();
  assert.equal(me.authenticated, true);
  assert.equal(me.email, email);
});

test("re-login for the same email reuses the workspace (idempotent)", async () => {
  const email = `returning-${Date.now()}@nodera.local`;
  emails.push(email);

  const first = await devLogin(email);
  assert.equal(first.body.created, true);
  const second = await devLogin(email);
  assert.equal(second.body.created, false);
  assert.equal(second.body.workspace_id, first.body.workspace_id);

  // No duplicate key or workspace.
  assert.equal(await prisma.apiKey.count({ where: { workspaceId: first.body.workspace_id } }), 1);
  assert.equal(await prisma.user.count({ where: { email } }), 1);
});

test("no session and no api key → 401", async () => {
  const res = await fetch(`${API}/jobs`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ model: "llama-3.1-8b", input: { prompt: "x" } }),
  });
  assert.equal(res.status, 401);
  assert.equal((await res.json()).error.code, "unauthorized");
});
