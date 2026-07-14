import { prisma } from "@nodera/db";
import { withRoute } from "@/lib/api/errors.js";
import { requireProvider } from "@/lib/api/auth.js";

// POST /v1/providers/poll — hands one of THIS provider's assigned runs to
// exactly one poll, ever. The claim is a guarded single-row update: the
// status filter makes concurrent claims race safely, the loser just moves
// on to the next assigned run (or gets null).
export const POST = withRoute(async (request) => {
  const provider = await requireProvider(request);

  for (;;) {
    const candidate = await prisma.run.findFirst({
      where: { providerId: provider.id, status: "assigned" },
      orderBy: { assignedAt: "asc" },
      include: { job: { include: { model: true } } },
    });
    if (!candidate) return Response.json({ run: null });

    const startedAt = new Date();
    const deadlineAt = new Date(startedAt.getTime() + candidate.job.model.maxRuntimeS * 1000);
    const claimed = await prisma.run.updateMany({
      where: { id: candidate.id, providerId: provider.id, status: "assigned" },
      data: { status: "running", startedAt, deadlineAt },
    });
    if (claimed.count !== 1) continue; // lost the race — try the next run

    await prisma.job.updateMany({
      where: { id: candidate.jobId, status: "assigned" },
      data: { status: "running" },
    });

    return Response.json({
      run: {
        run_id: candidate.id,
        job_id: candidate.jobId,
        model: candidate.job.modelSlug,
        input: candidate.job.input,
        deadline_at: deadlineAt.toISOString(),
      },
    });
  }
});
