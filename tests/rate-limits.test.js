// Task 6.5: POST /v1/jobs applies a database-backed per-principal fixed
// window and rejects oversized request bodies before they enter the queue.
const test = require("node:test");
const assert = require("node:assert/strict");
const {
  API,
  BASE,
  createWorkspaceFixture,
  destroyWorkspaceFixture,
  prisma,
} = require("./helpers/api.js");

const BODY = {
  model: "llama-3.1-8b",
  input: { prompt: "Rate limit integration check.", max_tokens: 32 },
};
let oversizedFx;
let hammerFx;
let otherFx;
let sessionWorkspace;
let sessionCookie;

test.before(async () => {
  [oversizedFx, hammerFx, otherFx] = await Promise.all([
    createWorkspaceFixture(),
    createWorkspaceFixture(),
    createWorkspaceFixture(),
  ]);

  const email = `rate-session-${Date.now()}@nodera.local`;
  const login = await fetch(`${BASE}/api/auth/dev-login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email }),
  });
  assert.equal(login.status, 200);
  sessionCookie = login.headers.get("set-cookie").split(";")[0];
  const user = await prisma.user.findUnique({ where: { email }, include: { workspace: true } });
  sessionWorkspace = user.workspace;
});

test.after(async () => {
  await prisma.user.deleteMany({ where: { workspaceId: sessionWorkspace.id } });
  for (const fixture of [oversizedFx, hammerFx, otherFx]) {
    await destroyWorkspaceFixture(fixture.workspace);
  }
  await destroyWorkspaceFixture(sessionWorkspace);
  await prisma.$disconnect();
});

function postWithKey(apiKey, body = BODY) {
  return fetch(`${API}/jobs`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-api-key": apiKey },
    body: JSON.stringify(body),
  });
}

function postWithSession() {
  return fetch(`${API}/jobs`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie: sessionCookie },
    body: JSON.stringify(BODY),
  });
}

async function hammer(post) {
  const limit = Number(process.env.RATE_LIMIT_JOBS_PER_MIN);
  const remaining = 60_000 - (Date.now() % 60_000);
  if (remaining < 2_000) await new Promise((resolve) => setTimeout(resolve, remaining + 50));

  const responses = await Promise.all(
    Array.from({ length: limit + 5 }, () => post())
  );
  const accepted = responses.filter((response) => response.status === 201);
  const limited = responses.filter((response) => response.status === 429);
  assert.equal(accepted.length, limit);
  assert.equal(limited.length, 5);

  const retryAfter = limited[0].headers.get("retry-after");
  assert.match(retryAfter, /^\d+$/);
  assert.ok(Number(retryAfter) >= 1 && Number(retryAfter) <= 60);
  const error = (await limited[0].json()).error;
  assert.equal(error.code, "rate_limited");
  assert.match(error.message, new RegExp(`${limit} POST /v1/jobs requests per minute`));
}

test("whole request cap rejects oversized JSON without queuing a job", async () => {
  const before = await prisma.job.count({ where: { workspaceId: oversizedFx.workspace.id } });
  const response = await postWithKey(oversizedFx.apiKeyPlaintext, {
    ...BODY,
    padding: "x".repeat(Number(process.env.MAX_JOB_REQUEST_BYTES || 65_536)),
  });
  assert.equal(response.status, 400);
  assert.equal((await response.json()).error.code, "input_too_large");
  const after = await prisma.job.count({ where: { workspaceId: oversizedFx.workspace.id } });
  assert.equal(after, before);
});

test("API-key hammering returns 429 while another key and the queue stay healthy", async () => {
  await hammer(() => postWithKey(hammerFx.apiKeyPlaintext));

  const queued = await prisma.job.findMany({ where: { workspaceId: hammerFx.workspace.id } });
  assert.equal(queued.length, Number(process.env.RATE_LIMIT_JOBS_PER_MIN));
  assert.ok(queued.every((job) => job.status === "queued"));

  const other = await postWithKey(otherFx.apiKeyPlaintext);
  assert.equal(other.status, 201);
});

test("dashboard sessions are limited independently by workspace", async () => {
  await hammer(postWithSession);
  const queued = await prisma.job.count({ where: { workspaceId: sessionWorkspace.id } });
  assert.equal(queued, Number(process.env.RATE_LIMIT_JOBS_PER_MIN));
});
