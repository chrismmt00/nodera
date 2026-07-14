// One dispatcher tick. Grows with Phase 2: assignment (2.2), offline-provider
// requeue (2.3), deadline expiry (2.4), attempts cap (2.5).
async function runTick(prisma, log) {
  const queued = await prisma.job.count({ where: { status: "queued" } });
  return { queued, assigned: 0, expired: 0, requeued: 0 };
}

module.exports = { runTick };
