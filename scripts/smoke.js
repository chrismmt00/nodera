// Full job lifecycle check (docs/BLUEPRINT.md §15): submit a job through the
// public API, let the REAL dispatcher assign it to the REAL provider agent,
// which runs the REAL Docker worker against the REAL model server — and
// assert real text and real token counts come back (Gate 3).
const os = require("node:os");
const fs = require("node:fs");
const path = require("node:path");
const { loadEnv } = require("@nodera/shared");
loadEnv(path.join(__dirname, ".."));
process.env.STORAGE_ROOT = path.resolve(__dirname, "..", process.env.STORAGE_ROOT || "storage");

const { prisma, newId, newSecret, ensureMenuModels, MODELS } = require("@nodera/db");
const { ensureWeb } = require("./lib/ensure-web.js");
const { ensureDispatcher } = require("./lib/ensure-dispatcher.js");
const { ProviderAgent } = require("../apps/provider-agent/src/agent.js");

// The real pipeline needs the local model server that workers call.
async function checkOllama() {
  const url = (process.env.OLLAMA_URL || "http://host.docker.internal:11434").replace(
    "host.docker.internal",
    "localhost"
  );
  const runtimeRef = MODELS.find((m) => m.slug === "llama-3.1-8b").runtimeRef;
  try {
    const res = await fetch(`${url}/api/tags`, { signal: AbortSignal.timeout(3000) });
    const tags = await res.json();
    if (!tags.models?.some((m) => m.name === runtimeRef || m.model === runtimeRef)) {
      throw new Error(`model ${runtimeRef} is not pulled — run: ollama pull ${runtimeRef}`);
    }
  } catch (err) {
    throw new Error(
      `Ollama is required for smoke (real end-to-end pipeline): ${err.message}. ` +
        `Install/start Ollama and pull ${runtimeRef} (see docs/RUNBOOK.md).`
    );
  }
}

function fail(msg) {
  console.error(`SMOKE FAIL: ${msg}`);
  process.exitCode = 1;
  throw new Error(msg);
}

function assert(cond, msg) {
  if (!cond) fail(msg);
}

async function main() {
  await checkOllama();
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

    // 1. The REAL provider agent: registers, heartbeats, polls, runs Docker.
    const scratch = fs.mkdtempSync(path.join(os.tmpdir(), "nodera-smoke-"));
    provider = new ProviderAgent({
      name: "smoke-agent",
      jobsDir: path.join(scratch, "jobs"),
      stateFile: path.join(scratch, "agent-state.json"),
      pollMs: 300,
      modelsReady: ["llama-3.1-8b"],
    });
    await provider.start();
    cleanup.providerId = provider.providerId;
    console.log(`real agent online: ${provider.providerId}`);

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
    const deadline = Date.now() + 150000;
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
    // Real token counts, not zeros (3.5), and real generated text.
    assert(
      detail.run.usage && detail.run.usage.tokens_in > 0 && detail.run.usage.tokens_out > 0,
      "usage not real (tokens are zero or missing)"
    );
    assert(
      detail.output && typeof detail.output.text === "string" && detail.output.text.trim().length > 0,
      "output.text missing or empty"
    );
    assert(
      detail.artifacts.some((a) => a.name === "result.json"),
      "result.json artifact missing"
    );
    console.log(
      `real usage: ${detail.run.usage.tokens_in} in / ${detail.run.usage.tokens_out} out / ${detail.run.usage.duration_ms}ms`
    );
    console.log(`real text: ${detail.output.text.slice(0, 100).replace(/\n/g, " / ")}`);
    console.log("SMOKE PASS: real prompt → real model → real text, end to end");
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
