// Task 2.2: matching + assignment transaction.
const test = require("node:test");
const assert = require("node:assert/strict");
const {
  API,
  createWorkspaceFixture,
  destroyWorkspaceFixture,
  prisma,
} = require("./helpers/api.js");
const { startDispatcher, waitFor } = require("./helpers/dispatcher.js");
const { newId, newSecret } = require("@nodera/db");

let fx;
let dispatcher;
const providerIds = [];

async function makeProvider({ modelsReady = ["llama-3.1-8b"], concurrency = 1, heartbeatAt = new Date() } = {}) {
  const { hash } = newSecret("npt");
  const provider = await prisma.provider.create({
    data: {
      id: newId("prov"),
      name: `assign-test-${providerIds.length}`,
      tokenHash: hash,
      concurrency,
      capabilities: { models: modelsReady, models_ready: modelsReady },
      lastHeartbeatAt: heartbeatAt,
    },
  });
  providerIds.push(provider.id);
  return provider;
}

async function submitJob(model = "llama-3.1-8b") {
  const res = await fetch(`${API}/jobs`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-api-key": fx.apiKeyPlaintext },
    body: JSON.stringify({ model, input: { prompt: "assign me" } }),
  });
  assert.equal(res.status, 201);
  return res.json();
}

test.before(async () => {
  fx = await createWorkspaceFixture();
  dispatcher = await startDispatcher();
});
test.after(async () => {
  if (dispatcher) await dispatcher.stop();
  await destroyWorkspaceFixture(fx.workspace);
  for (const id of providerIds) {
    await prisma.run.deleteMany({ where: { providerId: id } });
    await prisma.provider.delete({ where: { id } });
  }
  await prisma.$disconnect();
});

test("assigns oldest queued job to a ready provider in one transaction", async () => {
  const provider = await makeProvider();
  const job = await submitJob();

  const assigned = await waitFor(async () => {
    const j = await prisma.job.findUnique({ where: { id: job.job_id } });
    return j.status === "assigned" ? j : null;
  });
  assert.ok(assigned, "job was never assigned");
  assert.equal(assigned.attempts, 1);

  const run = await prisma.run.findFirst({ where: { jobId: job.job_id } });
  assert.equal(run.providerId, provider.id);
  assert.equal(run.attempt, 1);
  assert.equal(run.status, "assigned");
});

test("respects concurrency: second job waits until the slot frees", async () => {
  const provider = await makeProvider();
  const first = await submitJob();
  const second = await submitJob();

  // Exactly one of the two gets the single slot (the older one).
  const firstAssigned = await waitFor(async () => {
    const j = await prisma.job.findUnique({ where: { id: first.job_id } });
    return j.status === "assigned" ? j : null;
  });
  assert.ok(firstAssigned, "older job was never assigned");
  // Give the dispatcher a few more ticks — the second must stay queued.
  await new Promise((r) => setTimeout(r, 800));
  const stillQueued = await prisma.job.findUnique({ where: { id: second.job_id } });
  assert.equal(stillQueued.status, "queued");

  // Free the slot by finalizing the first run; the second then gets assigned.
  const run = await prisma.run.findFirst({ where: { jobId: first.job_id } });
  await prisma.$transaction([
    prisma.run.update({
      where: { id: run.id },
      data: { status: "succeeded", endedAt: new Date() },
    }),
    prisma.job.update({
      where: { id: first.job_id },
      data: { status: "succeeded", finalizedAt: new Date() },
    }),
  ]);
  const secondAssigned = await waitFor(async () => {
    const j = await prisma.job.findUnique({ where: { id: second.job_id } });
    return j.status === "assigned" ? j : null;
  });
  assert.ok(secondAssigned, "second job never got the freed slot");
});

test("never assigns to offline, unready, or unapproved providers", async () => {
  // Offline (stale heartbeat), wrong model, and pending-approval providers.
  await makeProvider({ heartbeatAt: new Date(Date.now() - 3600_000) });
  await makeProvider({ modelsReady: ["sdxl-1.0"] });
  const pending = await makeProvider();
  await prisma.provider.update({ where: { id: pending.id }, data: { status: "pending" } });

  const job = await submitJob();
  await new Promise((r) => setTimeout(r, 1000));
  const after = await prisma.job.findUnique({ where: { id: job.job_id } });
  assert.equal(after.status, "queued");
});
