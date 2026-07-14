// Task 2.6: two fake providers (concurrency 1), 20 jobs. Scripted assertions:
// queue drains, max 2 concurrent (proven from run timestamps), both providers
// used, zero double-claims.
const path = require("node:path");
const { loadEnv } = require("@nodera/shared");
loadEnv(path.join(__dirname, ".."));
process.env.STORAGE_ROOT = path.resolve(__dirname, "..", process.env.STORAGE_ROOT || "storage");

const { prisma, newId, newSecret, ensureMenuModels } = require("@nodera/db");
const { ensureWeb } = require("./lib/ensure-web.js");
const { ensureDispatcher } = require("./lib/ensure-dispatcher.js");
const { FakeProvider } = require("./lib/fake-provider.js");

const JOB_COUNT = 20;

function fail(msg) {
  console.error(`MULTI-PROVIDER FAIL: ${msg}`);
  process.exitCode = 1;
  throw new Error(msg);
}
function assert(cond, msg) {
  if (!cond) fail(msg);
}

// Max simultaneous [startedAt, endedAt] overlaps via timestamp sweep.
function maxOverlap(runs) {
  const events = [];
  for (const r of runs) {
    events.push([r.startedAt.getTime(), 1]);
    events.push([r.endedAt.getTime(), -1]);
  }
  events.sort((a, b) => a[0] - b[0] || a[1] - b[1]); // ends before starts on ties
  let now = 0;
  let max = 0;
  for (const [, delta] of events) {
    now += delta;
    max = Math.max(max, now);
  }
  return max;
}

async function main() {
  const { base, stop: stopWeb } = await ensureWeb();
  const { stop: stopDispatcher } = await ensureDispatcher({ DISPATCH_INTERVAL_MS: "250" });
  const api = `${base}/api/v1`;
  const cleanup = { workspaceId: null, providerIds: [] };
  const providers = [];

  try {
    await ensureMenuModels(prisma);
    const workspace = await prisma.workspace.create({
      data: { id: newId("ws"), name: `multi-${Date.now()}`, webhookSecret: newId("whsec") },
    });
    cleanup.workspaceId = workspace.id;
    const { plaintext: apiKey, hash } = newSecret("nod");
    await prisma.apiKey.create({
      data: { id: newId("key"), workspaceId: workspace.id, keyHash: hash, label: "multi" },
    });

    for (const name of ["fake-provider-a", "fake-provider-b"]) {
      const p = new FakeProvider({ api, name, concurrency: 1, simulateMs: 400 });
      await p.start();
      cleanup.providerIds.push(p.providerId);
      providers.push(p);
    }
    console.log(`providers online: ${providers.map((p) => p.providerId).join(", ")}`);

    const jobIds = [];
    for (let i = 0; i < JOB_COUNT; i++) {
      const res = await fetch(`${api}/jobs`, {
        method: "POST",
        headers: { "content-type": "application/json", "x-api-key": apiKey },
        body: JSON.stringify({ model: "llama-3.1-8b", input: { prompt: `multi job ${i}` } }),
      });
      assert(res.status === 201, `job ${i}: expected 201, got ${res.status}`);
      jobIds.push((await res.json()).job_id);
    }
    console.log(`${JOB_COUNT} jobs submitted`);

    const started = Date.now();
    const deadline = started + 120000;
    let finals = 0;
    while (Date.now() < deadline) {
      finals = await prisma.job.count({
        where: { id: { in: jobIds }, status: { in: ["succeeded", "failed"] } },
      });
      if (finals === JOB_COUNT) break;
      await new Promise((r) => setTimeout(r, 300));
    }
    const drainMs = Date.now() - started;

    // 1. Queue drains, everything succeeded.
    assert(finals === JOB_COUNT, `queue did not drain: ${finals}/${JOB_COUNT} final`);
    const succeeded = await prisma.job.count({
      where: { id: { in: jobIds }, status: "succeeded" },
    });
    assert(succeeded === JOB_COUNT, `${JOB_COUNT - succeeded} jobs failed`);

    // 2. No double-claims: one run per job, every claim unique, and the two
    // providers' claim sets are disjoint and complete.
    const runs = await prisma.run.findMany({ where: { jobId: { in: jobIds } } });
    assert(runs.length === JOB_COUNT, `expected ${JOB_COUNT} runs, found ${runs.length}`);
    const claimed = providers.flatMap((p) => p.stats.claimedRunIds);
    assert(claimed.length === JOB_COUNT, `providers claimed ${claimed.length} runs, expected ${JOB_COUNT}`);
    assert(new Set(claimed).size === claimed.length, "a run was claimed twice");

    // 3. Both providers did real work.
    for (const p of providers) {
      assert(
        p.stats.claimedRunIds.length > 0,
        `${p.name} never received a run (claims: a=${providers[0].stats.claimedRunIds.length}, b=${providers[1].stats.claimedRunIds.length})`
      );
    }

    // 4. Never more than 2 concurrent, proven from run timestamps.
    const overlap = maxOverlap(runs);
    assert(overlap <= 2, `observed ${overlap} concurrent runs (max allowed 2)`);

    const split = providers.map((p) => `${p.name}=${p.stats.claimedRunIds.length}`).join(", ");
    console.log(`drained ${JOB_COUNT} jobs in ${(drainMs / 1000).toFixed(1)}s`);
    console.log(`split: ${split}; max concurrent observed: ${overlap}`);
    console.log("MULTI-PROVIDER PASS");
  } finally {
    for (const p of providers) await p.stop();
    if (cleanup.workspaceId) {
      const jobs = await prisma.job.findMany({ where: { workspaceId: cleanup.workspaceId } });
      const jobIds = jobs.map((j) => j.id);
      const runs = await prisma.run.findMany({ where: { jobId: { in: jobIds } } });
      await prisma.artifact.deleteMany({ where: { runId: { in: runs.map((r) => r.id) } } });
      await prisma.webhookDelivery.deleteMany({ where: { jobId: { in: jobIds } } });
      await prisma.run.deleteMany({ where: { jobId: { in: jobIds } } });
      await prisma.job.deleteMany({ where: { id: { in: jobIds } } });
      await prisma.apiKey.deleteMany({ where: { workspaceId: cleanup.workspaceId } });
      await prisma.workspace.delete({ where: { id: cleanup.workspaceId } });
    }
    for (const id of cleanup.providerIds) {
      await prisma.run.deleteMany({ where: { providerId: id } });
      await prisma.provider.delete({ where: { id } });
    }
    await prisma.$disconnect();
    await stopDispatcher();
    stopWeb();
  }
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
