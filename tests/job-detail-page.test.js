// Task 7.3: job detail uses the public /v1 detail and artifact routes for
// original input, rendered text/image results, downloads, failures, and reruns.
const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const { BASE, API, destroyWorkspaceFixture, prisma } = require("./helpers/api.js");
const { newId, newSecret } = require("@nodera/db");
const { getStorage, permanentKey } = require("@nodera/storage");

let userEmail;
let provider;

const ONE_PIXEL_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAFgwJ/lQe1sAAAAABJRU5ErkJggg==",
  "base64"
);

test.after(async () => {
  if (userEmail) {
    const user = await prisma.user.findUnique({ where: { email: userEmail }, include: { workspace: true } });
    if (user) {
      await prisma.user.deleteMany({ where: { workspaceId: user.workspaceId } });
      await destroyWorkspaceFixture(user.workspace);
    }
  }
  if (provider) await prisma.provider.deleteMany({ where: { id: provider.id } });
  await prisma.$disconnect();
});

test("job detail covers text/image success and text/image failure through /v1", async () => {
  const anonymousPage = await fetch(`${BASE}/jobs/job_missing`);
  assert.equal(anonymousPage.status, 200);
  assert.match(await anonymousPage.text(), /Loading job/);

  const { cookie, workspace } = await signIn();
  provider = await prisma.provider.create({
    data: {
      id: newId("prov"),
      name: "detail-test",
      tokenHash: newSecret("npt").hash,
      capabilities: { models_ready: ["llama-3.1-8b", "sdxl-1.0"] },
    },
  });

  const textSucceeded = await createSucceededJob({
    workspaceId: workspace.id,
    modelSlug: "llama-3.1-8b",
    input: { prompt: "summarize the account notes", max_tokens: 120 },
    artifact: {
      name: "result.json",
      mime: "application/json",
      body: Buffer.from(JSON.stringify({ text: "The account is ready for follow-up." })),
      inline: true,
    },
    usage: { tokens_in: 7, tokens_out: 8, images: 0, duration_ms: 1410, model_slug: "llama-3.1-8b" },
  });
  const imageSucceeded = await createSucceededJob({
    workspaceId: workspace.id,
    modelSlug: "sdxl-1.0",
    input: { prompt: "blue compute node in a glass cube", width: 1024, height: 1024 },
    artifact: {
      name: "output.png",
      mime: "image/png",
      body: ONE_PIXEL_PNG,
      inline: false,
    },
    usage: { tokens_in: 0, tokens_out: 0, images: 1, duration_ms: 2340, model_slug: "sdxl-1.0" },
  });
  const textFailed = await createFailedJob({
    workspaceId: workspace.id,
    modelSlug: "llama-3.1-8b",
    input: { prompt: "draft a renewal note" },
  });
  const imageFailed = await createFailedJob({
    workspaceId: workspace.id,
    modelSlug: "sdxl-1.0",
    input: { prompt: "render a product hero image", width: 1024, height: 1024 },
  });

  for (const seeded of [textSucceeded, imageSucceeded, textFailed, imageFailed]) {
    const page = await fetch(`${BASE}/jobs/${seeded.id}`, { headers: { cookie } });
    assert.equal(page.status, 200);
    assert.match(await page.text(), /Loading job/);
  }

  const textDetail = await getDetail(cookie, textSucceeded.id);
  assert.equal(textDetail.status, "succeeded");
  assert.deepEqual(textDetail.input, { prompt: "summarize the account notes", max_tokens: 120 });
  assert.equal(textDetail.output.text, "The account is ready for follow-up.");
  assert.equal(textDetail.artifacts[0].name, "result.json");

  const imageDetail = await getDetail(cookie, imageSucceeded.id);
  assert.equal(imageDetail.status, "succeeded");
  assert.deepEqual(imageDetail.input, { prompt: "blue compute node in a glass cube", width: 1024, height: 1024 });
  assert.equal(imageDetail.output, null);
  assert.equal(imageDetail.artifacts[0].mime, "image/png");

  const imageDownload = await fetch(`${API}/jobs/${imageSucceeded.id}/artifacts/output.png`, {
    headers: { cookie },
  });
  assert.equal(imageDownload.status, 200);
  assert.equal(imageDownload.headers.get("content-type"), "image/png");
  assert.deepEqual(Buffer.from(await imageDownload.arrayBuffer()), ONE_PIXEL_PNG);

  const textFailedDetail = await getDetail(cookie, textFailed.id);
  const imageFailedDetail = await getDetail(cookie, imageFailed.id);
  for (const failed of [textFailedDetail, imageFailedDetail]) {
    assert.equal(failed.status, "failed");
    assert.equal(failed.error.message, "This job could not be completed. Try again.");
    assert.equal(failed.output, null);
    assert.deepEqual(failed.artifacts, []);
    assert.ok(failed.input.prompt);
  }

  const helperPath = path.join(__dirname, "..", "apps", "web", "src", "lib", "client", "job-detail-view.js");
  const view = await import(pathToFileURL(helperPath).href);
  assert.equal(view.imageArtifact(imageDetail).name, "output.png");
  assert.equal(view.artifactUrl(imageDetail, imageDetail.artifacts[0]), `/api/v1/jobs/${imageSucceeded.id}/artifacts/output.png`);
  assert.equal(view.retryLabel(textFailedDetail), "Retry");
  assert.equal(view.retryLabel(textDetail), "Re-run");
  assert.equal(view.plainError(imageFailedDetail), "This job could not be completed. Try again.");

  const rerun = await fetch(`${API}/jobs`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({ model: imageFailedDetail.model, input: imageFailedDetail.input }),
  });
  assert.equal(rerun.status, 201);
  const rerunDetail = await getDetail(cookie, (await rerun.json()).job_id);
  assert.equal(rerunDetail.model, "sdxl-1.0");
  assert.deepEqual(rerunDetail.input, imageFailedDetail.input);
  assert.equal(rerunDetail.status, "queued");
});

async function signIn() {
  userEmail = `job-detail-${Date.now()}@nodera.local`;
  const login = await fetch(`${BASE}/api/auth/dev-login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: userEmail }),
  });
  assert.equal(login.status, 200);
  const cookie = login.headers.get("set-cookie").split(";")[0];
  const user = await prisma.user.findUnique({ where: { email: userEmail }, include: { workspace: true } });
  assert.ok(user);
  return { cookie, workspace: user.workspace };
}

async function getDetail(cookie, id) {
  const response = await fetch(`${API}/jobs/${id}`, { headers: { cookie } });
  assert.equal(response.status, 200);
  return response.json();
}

async function createSucceededJob({ workspaceId, modelSlug, input, artifact, usage }) {
  const now = new Date();
  const job = await prisma.job.create({
    data: {
      id: newId("job"),
      workspaceId,
      modelSlug,
      input,
      status: "succeeded",
      attempts: 1,
      finalizedAt: now,
    },
  });
  const run = await prisma.run.create({
    data: {
      id: newId("run"),
      jobId: job.id,
      providerId: provider.id,
      attempt: 1,
      status: "succeeded",
      startedAt: new Date(now.getTime() - 2000),
      endedAt: now,
      usage,
    },
  });
  const objectKey = permanentKey(job.id, run.id, artifact.name);
  await getStorage().putBuffer(objectKey, artifact.body, { contentType: artifact.mime });
  await prisma.artifact.create({
    data: {
      id: newId("art"),
      runId: run.id,
      name: artifact.name,
      mime: artifact.mime,
      sizeBytes: artifact.body.length,
      backend: "local",
      objectKey,
      inline: artifact.inline,
    },
  });
  return job;
}

async function createFailedJob({ workspaceId, modelSlug, input }) {
  const now = new Date();
  const job = await prisma.job.create({
    data: {
      id: newId("job"),
      workspaceId,
      modelSlug,
      input,
      status: "failed",
      attempts: 1,
      finalizedAt: now,
    },
  });
  await prisma.run.create({
    data: {
      id: newId("run"),
      jobId: job.id,
      providerId: provider.id,
      attempt: 1,
      status: "failed",
      startedAt: new Date(now.getTime() - 2000),
      endedAt: now,
      exitCode: 1,
      error: { code: "worker_error", message: "This job could not be completed. Try again." },
    },
  });
  return job;
}
