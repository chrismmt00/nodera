// Task 1.2: POST /v1/jobs — contract examples, validation, Idempotency-Key.
const test = require("node:test");
const assert = require("node:assert/strict");
const {
  API,
  createWorkspaceFixture,
  destroyWorkspaceFixture,
  prisma,
} = require("./helpers/api.js");

let fx;
test.before(async () => {
  fx = await createWorkspaceFixture();
});
test.after(async () => {
  await destroyWorkspaceFixture(fx.workspace);
  await prisma.$disconnect();
});

function post(body, headers) {
  return fetch(`${API}/jobs`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": fx.apiKeyPlaintext,
      ...headers,
    },
    body: JSON.stringify(body),
  });
}

const GOOD_BODY = {
  model: "llama-3.1-8b",
  input: { prompt: "Write a follow-up email for this lead.", max_tokens: 400 },
};

test("creates a job: contract response shape, 201", async () => {
  const res = await post(GOOD_BODY);
  assert.equal(res.status, 201);
  const body = await res.json();
  assert.match(body.job_id, /^job_/);
  assert.equal(body.status, "queued");
  assert.equal(body.model, "llama-3.1-8b");
  assert.ok(!Number.isNaN(Date.parse(body.created_at)));
  assert.deepEqual(Object.keys(body).sort(), ["created_at", "job_id", "model", "status"]);
});

test("missing API key → 401 contract shape", async () => {
  const res = await fetch(`${API}/jobs`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(GOOD_BODY),
  });
  assert.equal(res.status, 401);
  const body = await res.json();
  assert.equal(body.error.code, "unauthorized");
  assert.equal(typeof body.error.message, "string");
});

test("unknown model → 404 model_not_found with contract message", async () => {
  const res = await post({ model: "sdxl-2", input: { prompt: "x" } });
  assert.equal(res.status, 404);
  const body = await res.json();
  assert.equal(body.error.code, "model_not_found");
  assert.equal(body.error.message, "No active model with slug 'sdxl-2'.");
});

test("validation: missing prompt, wrong type, over max, unknown field", async () => {
  let res = await post({ model: "llama-3.1-8b", input: {} });
  assert.equal(res.status, 400);
  assert.equal((await res.json()).error.code, "validation_failed");

  res = await post({ model: "llama-3.1-8b", input: { prompt: 42 } });
  assert.equal((await res.json()).error.code, "validation_failed");

  res = await post({ model: "llama-3.1-8b", input: { prompt: "x", max_tokens: 4096 } });
  assert.equal((await res.json()).error.code, "validation_failed");

  res = await post({ model: "llama-3.1-8b", input: { prompt: "x", temperature: 1 } });
  assert.equal((await res.json()).error.code, "validation_failed");

  res = await post({ model: "llama-3.1-8b", input: { prompt: "x" }, extra: true });
  assert.equal((await res.json()).error.code, "validation_failed");
});

test("prompt over max_bytes → input_too_large", async () => {
  const res = await post({ model: "llama-3.1-8b", input: { prompt: "x".repeat(33000) } });
  assert.equal(res.status, 400);
  assert.equal((await res.json()).error.code, "input_too_large");
});

test("idempotency: replay returns original with 200, different body → 409", async () => {
  const key = `test-${Date.now()}`;
  const first = await post(GOOD_BODY, { "Idempotency-Key": key });
  assert.equal(first.status, 201);
  const created = await first.json();

  const replay = await post(GOOD_BODY, { "Idempotency-Key": key });
  assert.equal(replay.status, 200);
  const replayed = await replay.json();
  assert.equal(replayed.job_id, created.job_id);

  const conflict = await post(
    { ...GOOD_BODY, input: { ...GOOD_BODY.input, prompt: "different" } },
    { "Idempotency-Key": key }
  );
  assert.equal(conflict.status, 409);
  assert.equal((await conflict.json()).error.code, "idempotency_conflict");

  // Replay must not have created a second job.
  const count = await prisma.job.count({
    where: { workspaceId: fx.workspace.id, idempotencyKey: key },
  });
  assert.equal(count, 1);
});

test("Idempotency-Key longer than 128 chars → validation_failed", async () => {
  const res = await post(GOOD_BODY, { "Idempotency-Key": "k".repeat(129) });
  assert.equal(res.status, 400);
  assert.equal((await res.json()).error.code, "validation_failed");
});

test("webhook_url must be a valid http(s) URL", async () => {
  const res = await post({ ...GOOD_BODY, webhook_url: "ftp://example.com/x" });
  assert.equal(res.status, 400);
  assert.equal((await res.json()).error.code, "validation_failed");

  const ok = await post({ ...GOOD_BODY, webhook_url: "http://localhost:8787/hook" });
  assert.equal(ok.status, 201);
});
