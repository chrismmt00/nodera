// Full job lifecycle check (docs/BLUEPRINT.md §15): submit a job through the
// public API, let the REAL dispatcher assign it, drive a fake provider
// through poll → report, and assert queued → assigned → running → succeeded
// with usage recorded.
const path = require("node:path");
const { loadEnv } = require("@nodera/shared");
loadEnv(path.join(__dirname, ".."));
process.env.STORAGE_ROOT = path.resolve(__dirname, "..", process.env.STORAGE_ROOT || "storage");

const { prisma, newId, newSecret, ensureMenuModels } = require("@nodera/db");
const { ensureWeb } = require("./lib/ensure-web.js");
const { ensureDispatcher } = require("./lib/ensure-dispatcher.js");
const { FakeProvider } = require("./lib/fake-provider.js");

function fail(msg) {
  console.error(`SMOKE FAIL: ${msg}`);
  process.exitCode = 1;
  throw new Error(msg);
}

function assert(cond, msg) {
  if (!cond) fail(msg);
}

async function main() {
  const { base, stop: stopWeb } = await ensureWeb();
  const { stop: stopDispatcher } = await ensureDispatcher();
  const api = `${base}/api/v1`;
  const cleanup = { workspaceId: null, providerId: null };
  let provider = null;

  try {
    await ensureMenuModels(prisma);
    const workspace = await prisma.workspace.create({
      data: { id: newId("ws"), name: `smoke-${Date.now()}`, webhookSecret: newId("whsec") },
    });
    cleanup.workspaceId = workspace.id;
    const { plaintext: apiKey, hash } = newSecret("nod");
    await prisma.apiKey.create({
      data: { id: newId("key"), workspaceId: workspace.id, keyHash: hash, label: "smoke" },
    });

    // 1. Fake provider registers, heartbeats, and starts polling.
    provider = new FakeProvider({ api, name: "smoke-fake-provider", simulateMs: 400 });
    await provider.start();
    cleanup.providerId = provider.providerId;
    console.log(`provider online: ${provider.providerId}`);

    // 2. Submit a job.
    const createRes = await fetch(`${api}/jobs`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": apiKey },
      body: JSON.stringify({
        model: "llama-3.1-8b",
        input: { prompt: "Write a haiku about spare GPUs.", max_tokens: 64 },
      }),
    });
    assert(createRes.status === 201, `create job: expected 201, got ${createRes.status}`);
    const created = await createRes.json();
    assert(created.status === "queued", `job should start queued, got ${created.status}`);
    console.log(`job queued: ${created.job_id}`);

    // 3. Watch the lifecycle through the customer API until final.
    const seen = new Set(["queued"]);
    const deadline = Date.now() + 45000;
    let detail = null;
    while (Date.now() < deadline) {
      detail = await (
        await fetch(`${api}/jobs/${created.job_id}`, { headers: { "x-api-key": apiKey } })
      ).json();
      seen.add(detail.status);
      if (detail.status === "succeeded" || detail.status === "failed") break;
      await new Promise((r) => setTimeout(r, 150));
    }
    console.log(`statuses observed: ${[...seen].join(" → ")}`);

    // 4. Assertions.
    assert(detail.status === "succeeded", `expected succeeded, got ${detail?.status}`);
    assert(seen.has("running"), "never observed the running state");
    assert(detail.finalized_at, "finalized_at missing");
    assert(detail.attempts === 1, `expected 1 attempt, got ${detail.attempts}`);
    assert(detail.run && detail.run.provider === provider.providerId, "winning run/provider missing");
    assert(
      detail.run.usage && detail.run.usage.tokens_out > 0,
      "usage not recorded (tokens_out is zero or missing)"
    );
    assert(detail.output && typeof detail.output.text === "string", "output.text missing");
    assert(
      detail.artifacts.some((a) => a.name === "result.json"),
      "result.json artifact missing"
    );
    console.log(
      `usage recorded: ${detail.run.usage.tokens_in} in / ${detail.run.usage.tokens_out} out`
    );
    console.log("SMOKE PASS: dispatcher-assigned lifecycle reached succeeded with usage recorded");
  } finally {
    if (provider) await provider.stop();
    // Leave the database the way we found it.
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
    if (cleanup.providerId) {
      await prisma.run.deleteMany({ where: { providerId: cleanup.providerId } });
      await prisma.provider.delete({ where: { id: cleanup.providerId } });
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
