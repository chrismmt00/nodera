// Task 1.3: GET /v1/jobs/:id and GET /v1/jobs — contract shape, tenancy, pagination.
const test = require("node:test");
const assert = require("node:assert/strict");
const {
  API,
  createWorkspaceFixture,
  destroyWorkspaceFixture,
  prisma,
} = require("./helpers/api.js");

let fx;
let other;
test.before(async () => {
  fx = await createWorkspaceFixture();
  other = await createWorkspaceFixture();
});
test.after(async () => {
  await destroyWorkspaceFixture(fx.workspace);
  await destroyWorkspaceFixture(other.workspace);
  await prisma.$disconnect();
});

async function createJob(key, prompt) {
  const res = await fetch(`${API}/jobs`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-api-key": key },
    body: JSON.stringify({ model: "llama-3.1-8b", input: { prompt } }),
  });
  assert.equal(res.status, 201);
  return res.json();
}

test("job detail: queued job has every contract field", async () => {
  const created = await createJob(fx.apiKeyPlaintext, "detail test");
  const res = await fetch(`${API}/jobs/${created.job_id}`, {
    headers: { "x-api-key": fx.apiKeyPlaintext },
  });
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.deepEqual(Object.keys(body).sort(), [
    "artifacts",
    "attempts",
    "created_at",
    "error",
    "finalized_at",
    "job_id",
    "model",
    "output",
    "run",
    "status",
  ]);
  assert.equal(body.job_id, created.job_id);
  assert.equal(body.status, "queued");
  assert.equal(body.attempts, 0);
  assert.equal(body.run, null);
  assert.equal(body.output, null);
  assert.deepEqual(body.artifacts, []);
  assert.equal(body.error, null);
});

test("cross-workspace job access → 404 not_found", async () => {
  const created = await createJob(fx.apiKeyPlaintext, "tenancy test");
  const res = await fetch(`${API}/jobs/${created.job_id}`, {
    headers: { "x-api-key": other.apiKeyPlaintext },
  });
  assert.equal(res.status, 404);
  assert.equal((await res.json()).error.code, "not_found");
});

test("list: newest first, only own workspace, cursor pagination", async () => {
  const ids = [];
  for (let i = 0; i < 5; i++) {
    ids.push((await createJob(other.apiKeyPlaintext, `job ${i}`)).job_id);
  }

  const firstPage = await (
    await fetch(`${API}/jobs?limit=3`, { headers: { "x-api-key": other.apiKeyPlaintext } })
  ).json();
  assert.equal(firstPage.jobs.length, 3);
  assert.ok(firstPage.next_cursor);
  // Newest first.
  assert.equal(firstPage.jobs[0].job_id, ids[4]);
  for (const job of firstPage.jobs) {
    assert.deepEqual(Object.keys(job).sort(), [
      "created_at",
      "finalized_at",
      "job_id",
      "model",
      "status",
    ]);
  }

  const secondPage = await (
    await fetch(`${API}/jobs?limit=3&cursor=${firstPage.next_cursor}`, {
      headers: { "x-api-key": other.apiKeyPlaintext },
    })
  ).json();
  assert.equal(secondPage.next_cursor, null);
  const seen = [...firstPage.jobs, ...secondPage.jobs].map((j) => j.job_id);
  // No overlap, nothing from the other workspace, everything covered.
  assert.equal(new Set(seen).size, seen.length);
  for (const id of ids) assert.ok(seen.includes(id));
  for (const id of seen) assert.ok(!id.includes(fx.workspace.id));
});

test("list: invalid limit and foreign cursor → validation_failed", async () => {
  let res = await fetch(`${API}/jobs?limit=500`, {
    headers: { "x-api-key": fx.apiKeyPlaintext },
  });
  assert.equal(res.status, 400);
  assert.equal((await res.json()).error.code, "validation_failed");

  const created = await createJob(fx.apiKeyPlaintext, "cursor tenancy");
  res = await fetch(`${API}/jobs?cursor=${created.job_id}`, {
    headers: { "x-api-key": other.apiKeyPlaintext },
  });
  assert.equal(res.status, 400);
  assert.equal((await res.json()).error.code, "validation_failed");
});
