import { prisma } from "@nodera/db";
import { getStorage } from "@nodera/storage";
import { createLogger } from "@nodera/shared";
import { withRoute, ApiError } from "@/lib/api/errors.js";
import { requireWorkspace } from "@/lib/api/auth.js";

const log = createLogger("web");

// Parsed JSON of a small inline artifact, or null — output is a convenience,
// the artifact download route is the reliable path.
async function readInlineJson(objectKey, maxBytes) {
  try {
    const buffer = await getStorage().getBuffer(objectKey, maxBytes);
    return buffer ? JSON.parse(buffer.toString("utf8")) : null;
  } catch (err) {
    log.warn("inline artifact unreadable", { objectKey, error: err.message });
    return null;
  }
}

const FINAL_RUN_STATUSES = ["succeeded", "failed", "expired"];

// The winning run: the succeeded one, else (for finalized jobs) the last
// final attempt. Jobs still in flight expose run: null.
function winningRun(job, runs) {
  const succeeded = runs.find((r) => r.status === "succeeded");
  if (succeeded) return succeeded;
  if (job.status === "failed") {
    const finals = runs.filter((r) => FINAL_RUN_STATUSES.includes(r.status));
    return finals[finals.length - 1] || null;
  }
  return null;
}

export const GET = withRoute(async (request, ctx) => {
  const { workspaceId } = await requireWorkspace(request);
  const { id } = await ctx.params;

  // Cross-workspace access is indistinguishable from a missing job.
  const job = await prisma.job.findFirst({
    where: { id, workspaceId },
    include: {
      runs: { orderBy: { assignedAt: "asc" }, include: { artifacts: true } },
    },
  });
  if (!job) throw new ApiError("not_found", `No job with id '${id}'.`);

  const run = winningRun(job, job.runs);

  let output = null;
  if (job.status === "succeeded" && run) {
    const inlineLimit = parseInt(process.env.INLINE_ARTIFACT_MAX_BYTES || "262144", 10);
    const result = run.artifacts.find((a) => a.name === "result.json" && a.inline);
    if (result) output = await readInlineJson(result.objectKey, inlineLimit);
  }

  let error = null;
  if (job.status === "failed") {
    error = run?.error ?? {
      code: "internal",
      message: "This job could not be completed. Try again.",
    };
  }

  return Response.json({
    job_id: job.id,
    status: job.status,
    model: job.modelSlug,
    input: job.input,
    created_at: job.createdAt.toISOString(),
    finalized_at: job.finalizedAt ? job.finalizedAt.toISOString() : null,
    attempts: job.attempts,
    run: run
      ? {
          run_id: run.id,
          provider: run.providerId,
          started_at: run.startedAt ? run.startedAt.toISOString() : null,
          ended_at: run.endedAt ? run.endedAt.toISOString() : null,
          usage: run.usage ?? null,
        }
      : null,
    output,
    artifacts: (run?.artifacts ?? []).map((a) => ({
      name: a.name,
      mime: a.mime,
      size_bytes: a.sizeBytes,
    })),
    error,
  });
});
