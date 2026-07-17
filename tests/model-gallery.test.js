// Task 7.1: model gallery cards and composer are driven by GET /v1/models.
const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const { BASE, API, destroyWorkspaceFixture, prisma } = require("./helpers/api.js");

let userEmail;
let transientModelSlug;

test.after(async () => {
  if (userEmail) {
    const user = await prisma.user.findUnique({ where: { email: userEmail }, include: { workspace: true } });
    if (user) {
      await prisma.user.deleteMany({ where: { workspaceId: user.workspaceId } });
      await destroyWorkspaceFixture(user.workspace);
    }
  }
  if (transientModelSlug) {
    await prisma.model.deleteMany({ where: { slug: transientModelSlug } });
  }
  await prisma.$disconnect();
});

test("models page and generated form support a DB-added model", async () => {
  transientModelSlug = `gallery-test-${Date.now()}`;
  await prisma.model.create({
    data: {
      slug: transientModelSlug,
      modality: "llm",
      description: "A temporary text model added by the gallery test.",
      params: {
        prompt: { type: "string", required: true, max_bytes: 2048 },
        quality_steps: { type: "integer", default: 7, max: 9 },
      },
      workerImage: "nodera/llm-worker",
      runtimeRef: "test-runtime",
      minVramGb: 1,
      maxRuntimeS: 45,
      active: true,
    },
  });

  const page = await fetch(`${BASE}/models`);
  assert.equal(page.status, 200);
  assert.match(await page.text(), /Loading models/);

  userEmail = `model-gallery-${Date.now()}@nodera.local`;
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
  const model = models.find((candidate) => candidate.slug === transientModelSlug);
  assert.ok(model, "DB-added model should appear in the menu");

  const helperPath = path.join(__dirname, "..", "apps", "web", "src", "lib", "client", "model-form.js");
  const form = await import(pathToFileURL(helperPath).href);
  assert.deepEqual(form.modelFields(model).map((field) => field.name), ["prompt", "quality_steps"]);
  assert.equal(form.fieldLabel("quality_steps"), "Quality Steps");
  assert.deepEqual(form.initialModelValues(model), { prompt: "", quality_steps: 7 });
  assert.equal(form.validateModelValues(model, { prompt: "", quality_steps: 7 }), "Prompt is required.");

  const input = form.buildModelInput(model, { prompt: "Explain generated menus.", quality_steps: "7" });
  assert.deepEqual(input, { prompt: "Explain generated menus.", quality_steps: 7 });

  const created = await fetch(`${API}/jobs`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({ model: transientModelSlug, input }),
  });
  assert.equal(created.status, 201);
  const body = await created.json();
  const detail = await fetch(`${API}/jobs/${body.job_id}`, { headers: { cookie } });
  assert.equal(detail.status, 200);
  assert.equal((await detail.json()).model, transientModelSlug);
});
