// Task 1.6: poll with atomic claim — two concurrent polls, exactly one winner.
const test = require("node:test");
const assert = require("node:assert/strict");
const {
  API,
  createWorkspaceFixture,
  destroyWorkspaceFixture,
  prisma,
} = require("./helpers/api.js");
const { newId, newSecret } = require("@nodera/db");

let fx;
const providers = [];

async function makeProvider() {
  const { plaintext, hash } = newSecret("npt");
  const provider = await prisma.provider.create({
    data: {
      id: newId("prov"),
      name: `poll-test-${providers.length}`,
      tokenHash: hash,
      capabilities: { models: ["llama-3.1-8b"], models_ready: ["llama-3.1-8b"] },
    },
  });
  providers.push(provider.id);
  return { provider, token: plaintext };
}

async function makeAssignedRun(providerId) {
  const job = await prisma.job.create({
    data: {
      id: newId("job"),
      workspaceId: fx.workspace.id,
      modelSlug: "llama-3.1-8b",
      input: { prompt: "poll test" },
      status: "assigned",
      attempts: 1,
    },
  });
  const run = await prisma.run.create({
    data: { id: newId("run"), jobId: job.id, providerId, attempt: 1 },
  });
  return { job, run };
}

function poll(token) {
  return fetch(`${API}/providers/poll`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-provider-token": token },
    body: JSON.stringify({}),
  }).then((r) => r.json());
}

test.before(async () => {
  fx = await createWorkspaceFixture();
});
test.after(async () => {
  await destroyWorkspaceFixture(fx.workspace);
  for (const id of providers) {
    await prisma.run.deleteMany({ where: { providerId: id } });
    await prisma.provider.delete({ where: { id } });
  }
  await prisma.$disconnect();
});

test("two concurrent polls for one assigned run — exactly one receives it", async () => {
  const { token, provider } = await makeProvider();
  const { job, run } = await makeAssignedRun(provider.id);

  const [a, b] = await Promise.all([poll(token), poll(token)]);
  const winners = [a, b].filter((r) => r.run !== null);
  assert.equal(winners.length, 1);

  const won = winners[0].run;
  assert.equal(won.run_id, run.id);
  assert.equal(won.job_id, job.id);
  assert.equal(won.model, "llama-3.1-8b");
  assert.deepEqual(won.input, { prompt: "poll test" });
  assert.ok(!Number.isNaN(Date.parse(won.deadline_at)));

  // Claim set started_at + deadline (120s model runtime) and job → running.
  const claimed = await prisma.run.findUnique({ where: { id: run.id } });
  assert.equal(claimed.status, "running");
  assert.ok(claimed.startedAt);
  const deadlineGap = claimed.deadlineAt.getTime() - claimed.startedAt.getTime();
  assert.equal(deadlineGap, 120 * 1000);
  assert.equal((await prisma.job.findUnique({ where: { id: job.id } })).status, "running");

  // The run is never handed out twice.
  const again = await poll(token);
  assert.equal(again.run, null);
});

test("poll returns only this provider's runs", async () => {
  const a = await makeProvider();
  const b = await makeProvider();
  await makeAssignedRun(a.provider.id);

  const res = await poll(b.token);
  assert.equal(res.run, null);

  const mine = await poll(a.token);
  assert.notEqual(mine.run, null);
});

test("poll with no assigned runs → { run: null }", async () => {
  const { token } = await makeProvider();
  assert.deepEqual(await poll(token), { run: null });
});
