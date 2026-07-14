// Full job lifecycle check (docs/BLUEPRINT.md §15): submit a job through the
// public API, drive a fake provider through poll → report, and assert
// queued → assigned → running → succeeded with usage recorded.
// Phase 1: assignment happens directly in the DB; the dispatcher (Phase 2)
// replaces that step.
const path = require("node:path");
const { loadEnv } = require("@nodera/shared");
loadEnv(path.join(__dirname, ".."));
process.env.STORAGE_ROOT = path.resolve(__dirname, "..", process.env.STORAGE_ROOT || "storage");

const { prisma, newId, newSecret, ensureMenuModels } = require("@nodera/db");
const { ensureWeb } = require("./lib/ensure-web.js");

function fail(msg) {
  console.error(`SMOKE FAIL: ${msg}`);
  process.exitCode = 1;
  throw new Error(msg);
}

function assert(cond, msg) {
  if (!cond) fail(msg);
}

async function main() {
  const { base, stop } = await ensureWeb();
  const api = `${base}/api/v1`;
  const cleanup = { workspaceId: null, providerId: null };

  try {
    // Fixtures: menu models (idempotent), a smoke workspace + key.
    await ensureMenuModels(prisma);
    const workspace = await prisma.workspace.create({
      data: { id: newId("ws"), name: `smoke-${Date.now()}`, webhookSecret: newId("whsec") },
    });
    cleanup.workspaceId = workspace.id;
    const { plaintext: apiKey, hash } = newSecret("nod");
    await prisma.apiKey.create({
      data: { id: newId("key"), workspaceId: workspace.id, keyHash: hash, label: "smoke" },
    });

    // 1. Register a fake provider through the public API.
    const regRes = await fetch(`${api}/providers/register`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        enroll_secret: process.env.PROVIDER_ENROLL_SECRET,
        name: "smoke-fake-provider",
        capabilities: {
          models: ["llama-3.1-8b"],
          gpu: { model: "Fake GPU", vram_gb: 24 },
          concurrency: 1,
        },
      }),
    });
    assert(regRes.status === 201, `register: expected 201, got ${regRes.status}`);
    const { provider_id: providerId, provider_token: providerToken } = await regRes.json();
    cleanup.providerId = providerId;
    console.log(`provider registered: ${providerId}`);

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

    // 3. Assign in the DB (dispatcher stand-in, per TASKS 1.8 note).
    const runId = newId("run");
    await prisma.$transaction([
      prisma.job.update({
        where: { id: created.job_id },
        data: { status: "assigned", attempts: { increment: 1 } },
      }),
      prisma.run.create({
        data: { id: runId, jobId: created.job_id, providerId, attempt: 1 },
      }),
    ]);
    const detailAssigned = await (
      await fetch(`${api}/jobs/${created.job_id}`, { headers: { "x-api-key": apiKey } })
    ).json();
    assert(detailAssigned.status === "assigned", `expected assigned, got ${detailAssigned.status}`);
    console.log("job assigned");

    // 4. Fake provider polls and receives the run.
    const pollRes = await (
      await fetch(`${api}/providers/poll`, {
        method: "POST",
        headers: { "content-type": "application/json", "x-provider-token": providerToken },
        body: JSON.stringify({}),
      })
    ).json();
    assert(pollRes.run && pollRes.run.run_id === runId, "poll did not return the assigned run");
    assert(typeof pollRes.run.input.prompt === "string", "poll run is missing the input");

    const detailRunning = await (
      await fetch(`${api}/jobs/${created.job_id}`, { headers: { "x-api-key": apiKey } })
    ).json();
    assert(detailRunning.status === "running", `expected running, got ${detailRunning.status}`);
    console.log("job running (claimed via poll)");

    // 5. Fake execution + success report with usage and result.json.
    const resultJson = JSON.stringify({ text: "Idle silicon hums / jobs arrive from strangers' code / warm cards earn their keep" });
    const usage = { tokens_in: 12, tokens_out: 24, images: 0, duration_ms: 850, model_slug: "llama-3.1-8b" };
    const reportRes = await fetch(`${api}/providers/report`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-provider-token": providerToken },
      body: JSON.stringify({
        run_id: runId,
        status: "succeeded",
        exit_code: 0,
        usage,
        artifacts: [
          {
            name: "result.json",
            mime: "application/json",
            size_bytes: Buffer.byteLength(resultJson),
            inline_base64: Buffer.from(resultJson).toString("base64"),
          },
        ],
      }),
    });
    assert(reportRes.status === 200, `report: expected 200, got ${reportRes.status}`);

    // 6. Final assertions through the customer API.
    const detail = await (
      await fetch(`${api}/jobs/${created.job_id}`, { headers: { "x-api-key": apiKey } })
    ).json();
    assert(detail.status === "succeeded", `expected succeeded, got ${detail.status}`);
    assert(detail.finalized_at, "finalized_at missing");
    assert(detail.run && detail.run.run_id === runId, "winning run missing");
    assert(detail.run.usage && detail.run.usage.tokens_out === usage.tokens_out, "usage not recorded");
    assert(detail.output && typeof detail.output.text === "string", "output.text missing");
    assert(
      detail.artifacts.some((a) => a.name === "result.json"),
      "result.json artifact missing"
    );
    console.log(`usage recorded: ${detail.run.usage.tokens_in} in / ${detail.run.usage.tokens_out} out`);
    console.log("SMOKE PASS: queued → assigned → running → succeeded with usage recorded");
  } finally {
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
    stop();
  }
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
