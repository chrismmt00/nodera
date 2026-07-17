// Task 6.3: the playground loads and its session follows the public /v1 API
// sequence for every active menu model. Real execution remains covered by the
// smoke test, while this test keeps the browser-facing route and both request
// shapes wired to the same contract.
const test = require("node:test");
const assert = require("node:assert/strict");
const { BASE, API, destroyWorkspaceFixture, prisma } = require("./helpers/api.js");

let userEmail;

test.after(async () => {
  if (userEmail) {
    const user = await prisma.user.findUnique({ where: { email: userEmail }, include: { workspace: true } });
    if (user) {
      await prisma.user.deleteMany({ where: { workspaceId: user.workspaceId } });
      await destroyWorkspaceFixture(user.workspace);
    }
  }
  await prisma.$disconnect();
});

test("playground loads and creates jobs for both menu models through /v1", async () => {
  const page = await fetch(`${BASE}/playground`);
  assert.equal(page.status, 200);
  assert.match(await page.text(), /Loading your workspace/);

  userEmail = `playground-${Date.now()}@nodera.local`;
  const login = await fetch(`${BASE}/api/auth/dev-login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: userEmail }),
  });
  assert.equal(login.status, 200);
  const cookie = login.headers.get("set-cookie").split(";")[0];

  const modelResponse = await fetch(`${API}/models`, { headers: { cookie } });
  assert.equal(modelResponse.status, 200);
  const { models } = await modelResponse.json();
  assert.deepEqual(models.map((model) => model.slug).sort(), ["llama-3.1-8b", "sdxl-1.0"]);

  for (const model of models) {
    const input = { prompt: `playground request for ${model.slug}` };
    for (const [name, definition] of Object.entries(model.params)) {
      if (name !== "prompt" && definition.default !== undefined) input[name] = definition.default;
    }
    const created = await fetch(`${API}/jobs`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie },
      body: JSON.stringify({ model: model.slug, input }),
    });
    assert.equal(created.status, 201, `${model.slug} should create a job`);
    const body = await created.json();
    const detail = await fetch(`${API}/jobs/${body.job_id}`, { headers: { cookie } });
    assert.equal(detail.status, 200);
    assert.equal((await detail.json()).model, model.slug);
  }
});
