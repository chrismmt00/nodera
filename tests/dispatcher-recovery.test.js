// Tasks 2.3/2.4/2.5: offline-provider requeue, deadline expiry, attempts cap.
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

const OFFLINE_MS = 1500;

let fx;
let dispatcher;
const providerIds = [];

async function makeProvider(name) {
  const { hash } = newSecret("npt");
  const provider = await prisma.provider.create({
    data: {
      id: newId("prov"),
      name,
      tokenHash: hash,
      concurrency: 1,
      capabilities: { models: ["llama-3.1-8b"], models_ready: ["llama-3.1-8b"] },
      lastHeartbeatAt: new Date(),
    },
  });
  providerIds.push(provider.id);
  return provider;
}

function keepAlive(providerId) {
  return prisma.provider.update({
    where: { id: providerId },
    data: { lastHeartbeatAt: new Date() },
  });
}

async function submitJob() {
  const res = await fetch(`${API}/jobs`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-api-key": fx.apiKeyPlaintext },
    body: JSON.stringify({ model: "llama-3.1-8b", input: { prompt: "recovery test" } }),
  });
  assert.equal(res.status, 201);
  return res.json();
}

test.before(async () => {
  fx = await createWorkspaceFixture();
  dispatcher = await startDispatcher({
    PROVIDER_OFFLINE_AFTER_MS: String(OFFLINE_MS),
    DISPATCHER_PORT: "3903",
  });
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

test("2.4: never-finishing run expires at deadline despite heartbeats", async (t) => {
  const hung = await makeProvider("recovery-hangs");
  const aliveTimer = setInterval(() => keepAlive(hung.id).catch(() => {}), 300);
  t.after(() => clearInterval(aliveTimer));

  const job = await submitJob();
  const run = await waitFor(() =>
    prisma.run.findFirst({ where: { jobId: job.job_id, providerId: hung.id } })
  );
  assert.ok(run, "job was never assigned");

  // The provider "claims" the run but never finishes: running with a
  // deadline already in the past, while heartbeats keep flowing.
  await prisma.run.update({
    where: { id: run.id },
    data: {
      status: "running",
      startedAt: new Date(Date.now() - 5000),
      deadlineAt: new Date(Date.now() - 1000),
    },
  });
  await prisma.job.update({ where: { id: job.job_id }, data: { status: "running" } });

  // The tick expires the run and may requeue + reassign within the same
  // tick, so assert the durable outcomes: run expired, job got attempt 2.
  const expired = await waitFor(async () => {
    const r = await prisma.run.findUnique({ where: { id: run.id } });
    return r.status === "expired" ? r : null;
  });
  assert.ok(expired, "run never expired despite passed deadline");
  assert.equal(expired.error.code, "deadline_exceeded");

  const jobAfter = await waitFor(async () => {
    const j = await prisma.job.findUnique({ where: { id: job.job_id } });
    return j.attempts === 2 && ["queued", "assigned", "running"].includes(j.status) ? j : null;
  });
  assert.ok(jobAfter, "job was never requeued/reassigned after expiry");

  // Stop the queue from reassigning forever: park the provider offline.
  clearInterval(aliveTimer);
  await prisma.job.update({ where: { id: job.job_id }, data: { status: "canceled" } });
});

test("2.3: dead provider's run fails, job requeues to the survivor with attempts+1", async (t) => {
  const dead = await makeProvider("recovery-dies");
  const job = await submitJob();

  // Keep the doomed provider alive until it has the run.
  const firstRun = await waitFor(async () => {
    await keepAlive(dead.id);
    return prisma.run.findFirst({ where: { jobId: job.job_id, providerId: dead.id } });
  });
  assert.ok(firstRun, "job was never assigned to the first provider");

  // Provider dies mid-job (heartbeats stop well past the offline window).
  await prisma.provider.update({
    where: { id: dead.id },
    data: { lastHeartbeatAt: new Date(Date.now() - OFFLINE_MS - 10000) },
  });

  // A healthy provider is standing by; the dispatcher must move the job.
  const survivor = await makeProvider("recovery-survives");
  const aliveTimer = setInterval(() => keepAlive(survivor.id).catch(() => {}), 300);
  t.after(() => clearInterval(aliveTimer));

  const secondRun = await waitFor(() =>
    prisma.run.findFirst({ where: { jobId: job.job_id, providerId: survivor.id } })
  );
  assert.ok(secondRun, "job was never reassigned to the surviving provider");
  assert.equal(secondRun.attempt, 2);

  const failedRun = await prisma.run.findUnique({ where: { id: firstRun.id } });
  assert.equal(failedRun.status, "failed");
  assert.equal(failedRun.error.code, "provider_offline");
  assert.ok(failedRun.error.message.length > 10, "error message should be a sentence");

  const jobRow = await prisma.job.findUnique({ where: { id: job.job_id } });
  assert.equal(jobRow.attempts, 2);
});
