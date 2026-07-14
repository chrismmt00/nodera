// Task 1.4: GET /v1/models — menu from DB, single source with job validation.
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

test("menu matches docs/api.md shape and params drive validation", async () => {
  const res = await fetch(`${API}/models`, { headers: { "x-api-key": fx.apiKeyPlaintext } });
  assert.equal(res.status, 200);
  const { models } = await res.json();

  const llama = models.find((m) => m.slug === "llama-3.1-8b");
  assert.deepEqual(Object.keys(llama).sort(), [
    "description",
    "max_runtime_s",
    "modality",
    "params",
    "slug",
  ]);
  assert.equal(llama.modality, "llm");
  assert.deepEqual(llama.params.prompt, { type: "string", required: true, max_bytes: 32768 });
  assert.deepEqual(llama.params.max_tokens, { type: "integer", default: 512, max: 2048 });
  assert.equal(llama.max_runtime_s, 120);

  const sdxl = models.find((m) => m.slug === "sdxl-1.0");
  assert.equal(sdxl.modality, "image");
  assert.equal(sdxl.max_runtime_s, 300);

  // Single source: a limit published here is enforced by POST /v1/jobs.
  const over = llama.params.max_tokens.max + 1;
  const reject = await fetch(`${API}/jobs`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-api-key": fx.apiKeyPlaintext },
    body: JSON.stringify({ model: "llama-3.1-8b", input: { prompt: "x", max_tokens: over } }),
  });
  assert.equal(reject.status, 400);
});

test("inactive models are hidden from the menu", async (t) => {
  await prisma.model.update({ where: { slug: "sdxl-1.0" }, data: { active: false } });
  t.after(() => prisma.model.update({ where: { slug: "sdxl-1.0" }, data: { active: true } }));

  const res = await fetch(`${API}/models`, { headers: { "x-api-key": fx.apiKeyPlaintext } });
  const { models } = await res.json();
  assert.ok(!models.some((m) => m.slug === "sdxl-1.0"));
});

test("models requires an API key", async () => {
  const res = await fetch(`${API}/models`);
  assert.equal(res.status, 401);
  assert.equal((await res.json()).error.code, "unauthorized");
});
