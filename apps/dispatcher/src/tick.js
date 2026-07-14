// One dispatcher tick. Phases: assignment (2.2), offline-provider requeue
// (2.3), deadline expiry (2.4) — all bounded by the attempts cap (2.5).
const { newId } = require("@nodera/db");

function offlineAfterMs() {
  return parseInt(process.env.PROVIDER_OFFLINE_AFTER_MS || "120000", 10);
}

// Finalizes an active run negatively and hands its job back to the queue,
// or fails the job when attempts are exhausted (2.5). Guarded updates make
// this safe against concurrent reports.
async function finalizeRunAndRequeue(prisma, log, run, runStatus, error) {
  await prisma.$transaction(async (tx) => {
    const closed = await tx.run.updateMany({
      where: { id: run.id, status: { in: ["assigned", "running"] } },
      data: { status: runStatus, endedAt: new Date(), error },
    });
    if (closed.count !== 1) return; // a report beat us to it — nothing to do

    const job = await tx.job.findUnique({ where: { id: run.jobId } });
    if (!job || !["assigned", "running"].includes(job.status)) return;
    if (job.attempts < job.maxAttempts) {
      await tx.job.updateMany({
        where: { id: job.id, status: { in: ["assigned", "running"] } },
        data: { status: "queued" },
      });
      log.info("job requeued", { jobId: job.id, runId: run.id, reason: error.code });
    } else {
      await tx.job.updateMany({
        where: { id: job.id, status: { in: ["assigned", "running"] } },
        data: { status: "failed", finalizedAt: new Date() },
      });
      log.info("job failed (attempts exhausted)", { jobId: job.id, runId: run.id });
    }
  });
}

// 2.3: a provider with no heartbeat for PROVIDER_OFFLINE_AFTER_MS is offline —
// fail its unfinished runs and requeue their jobs.
async function failOfflineProviderRuns(prisma, log) {
  const cutoff = new Date(Date.now() - offlineAfterMs());
  const stuckRuns = await prisma.run.findMany({
    where: {
      status: { in: ["assigned", "running"] },
      provider: {
        OR: [
          { lastHeartbeatAt: { lt: cutoff } },
          // Never heartbeated and registered long enough ago to be dead.
          { lastHeartbeatAt: null, createdAt: { lt: cutoff } },
        ],
      },
    },
  });
  for (const run of stuckRuns) {
    await finalizeRunAndRequeue(prisma, log, run, "failed", {
      code: "provider_offline",
      message: "The machine running this job went offline — it will be retried.",
    });
  }
  return stuckRuns.length;
}

// Oldest queued job × online approved provider with the model ready and a
// free slot. Each assignment is one transaction: job queued→assigned with
// attempts+1, run created (blueprint §6).
async function assignQueuedJobs(prisma, log) {
  const onlineCutoff = new Date(Date.now() - offlineAfterMs());
  const providers = await prisma.provider.findMany({
    where: { status: "approved", lastHeartbeatAt: { gte: onlineCutoff } },
  });
  if (providers.length === 0) return 0;

  const activeCounts = await prisma.run.groupBy({
    by: ["providerId"],
    where: {
      providerId: { in: providers.map((p) => p.id) },
      status: { in: ["assigned", "running"] },
    },
    _count: { _all: true },
  });
  const active = new Map(activeCounts.map((c) => [c.providerId, c._count._all]));

  const slots = new Map();
  const ready = new Map();
  let capacity = 0;
  for (const p of providers) {
    const free = Math.max(0, p.concurrency - (active.get(p.id) || 0));
    slots.set(p.id, free);
    ready.set(p.id, new Set(p.capabilities?.models_ready || []));
    capacity += free;
  }
  if (capacity === 0) return 0;

  const queued = await prisma.job.findMany({
    where: { status: "queued" },
    orderBy: { createdAt: "asc" },
    take: Math.max(200, capacity * 4),
  });

  let assigned = 0;
  for (const job of queued) {
    if (capacity === 0) break;
    // Spread across providers: most free slots first.
    let best = null;
    for (const p of providers) {
      if (slots.get(p.id) > 0 && ready.get(p.id).has(job.modelSlug)) {
        if (!best || slots.get(p.id) > slots.get(best.id)) best = p;
      }
    }
    if (!best) continue;

    const ok = await prisma.$transaction(async (tx) => {
      const claimed = await tx.job.updateMany({
        where: { id: job.id, status: "queued" },
        data: { status: "assigned", attempts: { increment: 1 } },
      });
      if (claimed.count !== 1) return false;
      const fresh = await tx.job.findUnique({
        where: { id: job.id },
        select: { attempts: true },
      });
      await tx.run.create({
        data: { id: newId("run"), jobId: job.id, providerId: best.id, attempt: fresh.attempts },
      });
      return true;
    });
    if (ok) {
      slots.set(best.id, slots.get(best.id) - 1);
      capacity -= 1;
      assigned += 1;
      log.info("assigned", { jobId: job.id, providerId: best.id });
    }
  }
  return assigned;
}

// 2.4: any running run past its deadline expires — even when the provider is
// still heartbeating (DECISIONS 010 closes the hung-worker hole).
async function expireOverdueRuns(prisma, log) {
  const overdue = await prisma.run.findMany({
    where: { status: "running", deadlineAt: { lt: new Date() } },
  });
  for (const run of overdue) {
    await finalizeRunAndRequeue(prisma, log, run, "expired", {
      code: "deadline_exceeded",
      message: "This took too long and was stopped — try again.",
    });
  }
  return overdue.length;
}

async function runTick(prisma, log) {
  const expired = await expireOverdueRuns(prisma, log);
  const offlined = await failOfflineProviderRuns(prisma, log);
  const assigned = await assignQueuedJobs(prisma, log);
  const queued = await prisma.job.count({ where: { status: "queued" } });
  return { queued, assigned, expired, offlined };
}

module.exports = { runTick };
