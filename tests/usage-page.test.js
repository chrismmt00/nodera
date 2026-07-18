// Task 7.5: usage page totals jobs, tokens, images, and compute time from run metering.
const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const { BASE, destroyWorkspaceFixture, prisma } = require("./helpers/api.js");
const { newId, newSecret } = require("@nodera/db");

const emails = [];
let provider;

test.after(async () => {
  for (const email of emails) {
    const user = await prisma.user.findUnique({ where: { email }, include: { workspace: true } });
    if (!user) continue;
    await prisma.user.deleteMany({ where: { workspaceId: user.workspaceId } });
    await destroyWorkspaceFixture(user.workspace);
  }
  if (provider) await prisma.provider.deleteMany({ where: { id: provider.id } });
  await prisma.$disconnect();
});

test("usage page totals reconcile with current-month run rows", async () => {
  const unauthenticatedRoute = await fetch(`${BASE}/api/account/usage`);
  assert.equal(unauthenticatedRoute.status, 401);
  assert.equal((await unauthenticatedRoute.json()).error.code, "unauthorized");

  const anonymousPage = await fetch(`${BASE}/usage`);
  assert.equal(anonymousPage.status, 200);
  assert.match(await anonymousPage.text(), /Loading usage/);

  const { cookie, workspace } = await signIn(`usage-owner-${Date.now()}@nodera.local`);
  const other = await signIn(`usage-other-${Date.now()}@nodera.local`);
  provider = await prisma.provider.create({
    data: {
      id: newId("prov"),
      name: "usage-test",
      tokenHash: newSecret("npt").hash,
      capabilities: { models_ready: ["llama-3.1-8b", "sdxl-1.0"] },
    },
  });

  const now = new Date();
  const previousPeriod = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1) - 1000);
  await createSucceededJob({
    workspaceId: workspace.id,
    modelSlug: "llama-3.1-8b",
    finalizedAt: now,
    usage: { tokens_in: 11, tokens_out: 29, images: 0, duration_ms: 1800, model_slug: "llama-3.1-8b" },
  });
  await createSucceededJob({
    workspaceId: workspace.id,
    modelSlug: "sdxl-1.0",
    finalizedAt: new Date(now.getTime() - 1000),
    usage: { tokens_in: 0, tokens_out: 0, images: 1, duration_ms: 42000, model_slug: "sdxl-1.0" },
  });
  await createSucceededJob({
    workspaceId: workspace.id,
    modelSlug: "llama-3.1-8b",
    finalizedAt: previousPeriod,
    usage: { tokens_in: 99, tokens_out: 99, images: 0, duration_ms: 99000, model_slug: "llama-3.1-8b" },
  });
  await createFailedJob({ workspaceId: workspace.id, finalizedAt: now });
  await createQueuedJob({ workspaceId: workspace.id });
  await createSucceededJob({
    workspaceId: other.workspace.id,
    modelSlug: "llama-3.1-8b",
    finalizedAt: now,
    usage: { tokens_in: 500, tokens_out: 500, images: 0, duration_ms: 50000, model_slug: "llama-3.1-8b" },
  });

  const page = await fetch(`${BASE}/usage`, { headers: { cookie } });
  assert.equal(page.status, 200);
  assert.match(await page.text(), /Loading usage/);

  const response = await fetch(`${BASE}/api/account/usage`, { headers: { cookie } });
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.period.label, new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric", timeZone: "UTC" }).format(now));

  const expected = await expectedCurrentMonthTotals(workspace.id, body.period);
  assert.deepEqual(body.totals, expected.totals);
  assert.equal(body.recent_jobs.length, 2);
  assert.deepEqual(
    body.by_model.map((row) => [row.model, row.jobs, row.tokens_total, row.images, row.duration_ms]).sort(),
    [
      ["llama-3.1-8b", 1, 40, 0, 1800],
      ["sdxl-1.0", 1, 0, 1, 42000],
    ].sort()
  );

  const helperPath = path.join(__dirname, "..", "apps", "web", "src", "lib", "client", "usage-view.js");
  const view = await import(pathToFileURL(helperPath).href);
  assert.equal(view.hasUsage(body), true);
  assert.equal(view.formatDuration(body.totals.duration_ms), "44s");
});

async function signIn(email) {
  emails.push(email);
  const login = await fetch(`${BASE}/api/auth/dev-login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email }),
  });
  assert.equal(login.status, 200);
  const cookie = login.headers.get("set-cookie").split(";")[0];
  const user = await prisma.user.findUnique({ where: { email }, include: { workspace: true } });
  assert.ok(user);
  return { cookie, workspace: user.workspace };
}

async function createSucceededJob({ workspaceId, modelSlug, finalizedAt, usage }) {
  const job = await prisma.job.create({
    data: {
      id: newId("job"),
      workspaceId,
      modelSlug,
      input: { prompt: "usage fixture" },
      status: "succeeded",
      attempts: 1,
      createdAt: new Date(finalizedAt.getTime() - 3000),
      finalizedAt,
    },
  });
  await prisma.run.create({
    data: {
      id: newId("run"),
      jobId: job.id,
      providerId: provider.id,
      attempt: 1,
      status: "succeeded",
      assignedAt: new Date(finalizedAt.getTime() - 2600),
      startedAt: new Date(finalizedAt.getTime() - usage.duration_ms),
      endedAt: finalizedAt,
      usage,
    },
  });
  return job;
}

async function createFailedJob({ workspaceId, finalizedAt }) {
  const job = await prisma.job.create({
    data: {
      id: newId("job"),
      workspaceId,
      modelSlug: "llama-3.1-8b",
      input: { prompt: "failed usage fixture" },
      status: "failed",
      attempts: 1,
      createdAt: new Date(finalizedAt.getTime() - 3000),
      finalizedAt,
    },
  });
  await prisma.run.create({
    data: {
      id: newId("run"),
      jobId: job.id,
      providerId: provider.id,
      attempt: 1,
      status: "failed",
      assignedAt: new Date(finalizedAt.getTime() - 2600),
      startedAt: new Date(finalizedAt.getTime() - 2000),
      endedAt: finalizedAt,
      usage: { tokens_in: 13, tokens_out: 21, images: 0, duration_ms: 2000, model_slug: "llama-3.1-8b" },
      error: { code: "worker_error", message: "Not counted in customer usage totals." },
    },
  });
}

async function createQueuedJob({ workspaceId }) {
  await prisma.job.create({
    data: {
      id: newId("job"),
      workspaceId,
      modelSlug: "llama-3.1-8b",
      input: { prompt: "queued usage fixture" },
      status: "queued",
    },
  });
}

async function expectedCurrentMonthTotals(workspaceId, period) {
  const rows = await prisma.run.findMany({
    where: {
      status: "succeeded",
      job: {
        workspaceId,
        status: "succeeded",
        finalizedAt: { gte: new Date(period.start), lt: new Date(period.end) },
      },
    },
    include: { job: true },
    orderBy: [{ assignedAt: "asc" }, { id: "asc" }],
  });
  const firstRunByJob = new Map();
  for (const row of rows) {
    if (row.usage && !firstRunByJob.has(row.jobId)) firstRunByJob.set(row.jobId, row);
  }
  const totals = {
    jobs: 0,
    tokens_in: 0,
    tokens_out: 0,
    tokens_total: 0,
    images: 0,
    duration_ms: 0,
  };
  for (const row of firstRunByJob.values()) {
    totals.jobs += 1;
    totals.tokens_in += row.usage.tokens_in;
    totals.tokens_out += row.usage.tokens_out;
    totals.tokens_total += row.usage.tokens_in + row.usage.tokens_out;
    totals.images += row.usage.images;
    totals.duration_ms += row.usage.duration_ms;
  }
  return { totals };
}
