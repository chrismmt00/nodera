import { prisma, newId } from "@nodera/db";
import { withRoute, ApiError } from "@/lib/api/errors.js";
import { requireProvider } from "@/lib/api/auth.js";
import { permanentKey, writeLocalArtifact } from "@/lib/api/artifacts-local.js";

const NAME_RE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;
const USAGE_INTS = ["tokens_in", "tokens_out", "images", "duration_ms"];

function validateUsage(usage) {
  if (usage === null || typeof usage !== "object" || Array.isArray(usage)) {
    throw new ApiError("validation_failed", "usage must be an object.");
  }
  for (const field of USAGE_INTS) {
    if (!Number.isInteger(usage[field]) || usage[field] < 0) {
      throw new ApiError("validation_failed", `usage.${field} must be a non-negative integer.`);
    }
  }
  if (typeof usage.model_slug !== "string") {
    throw new ApiError("validation_failed", "usage.model_slug must be a string.");
  }
}

// Returns [{ name, mime, sizeBytes, buffer }] ready to persist.
function validateArtifacts(artifacts) {
  if (artifacts === undefined) return [];
  if (!Array.isArray(artifacts)) {
    throw new ApiError("validation_failed", "artifacts must be an array.");
  }
  const maxCount = parseInt(process.env.MAX_ARTIFACTS_PER_RUN || "10", 10);
  const maxTotal = parseInt(process.env.MAX_ARTIFACT_TOTAL_BYTES || "52428800", 10);
  const maxInline = parseInt(process.env.INLINE_ARTIFACT_MAX_BYTES || "262144", 10);
  if (artifacts.length > maxCount) {
    throw new ApiError("artifact_limits_exceeded", `At most ${maxCount} artifacts per run.`);
  }
  const out = [];
  const seen = new Set();
  let total = 0;
  for (const a of artifacts) {
    if (a === null || typeof a !== "object" || typeof a.name !== "string" || !NAME_RE.test(a.name)) {
      throw new ApiError("validation_failed", "Each artifact needs a safe name (letters, digits, . _ -).");
    }
    if (seen.has(a.name)) {
      throw new ApiError("validation_failed", `Duplicate artifact name '${a.name}'.`);
    }
    seen.add(a.name);
    if (typeof a.mime !== "string" || !a.mime) {
      throw new ApiError("validation_failed", `artifact '${a.name}' needs a mime type.`);
    }
    if (!Number.isInteger(a.size_bytes) || a.size_bytes < 0) {
      throw new ApiError("validation_failed", `artifact '${a.name}' needs an integer size_bytes.`);
    }
    total += a.size_bytes;
    if (total > maxTotal) {
      throw new ApiError("artifact_limits_exceeded", `Artifacts exceed ${maxTotal} total bytes.`);
    }
    if (a.inline_base64 === undefined) {
      // Presigned uploads arrive with the storage abstraction (Phase 4).
      throw new ApiError(
        "validation_failed",
        `artifact '${a.name}': only inline artifacts are supported right now.`
      );
    }
    let buffer;
    try {
      buffer = Buffer.from(a.inline_base64, "base64");
    } catch {
      throw new ApiError("validation_failed", `artifact '${a.name}': invalid base64.`);
    }
    if (buffer.length > maxInline) {
      throw new ApiError(
        "artifact_limits_exceeded",
        `artifact '${a.name}': inline artifacts are limited to ${maxInline} bytes.`
      );
    }
    if (buffer.length !== a.size_bytes) {
      throw new ApiError(
        "validation_failed",
        `artifact '${a.name}': size_bytes does not match the payload.`
      );
    }
    out.push({ name: a.name, mime: a.mime, sizeBytes: a.size_bytes, buffer });
  }
  return out;
}

// POST /v1/providers/report — finalize a run and its job.
// Duplicate identical final report → 200 no-op; conflicting → 409.
export const POST = withRoute(async (request) => {
  const provider = await requireProvider(request);

  let body;
  try {
    body = await request.json();
  } catch {
    throw new ApiError("validation_failed", "Request body must be valid JSON.");
  }
  if (typeof body.run_id !== "string") {
    throw new ApiError("validation_failed", "run_id is required.");
  }
  if (body.status !== "succeeded" && body.status !== "failed") {
    throw new ApiError("validation_failed", "status must be 'succeeded' or 'failed'.");
  }
  if (body.exit_code !== undefined && !Number.isInteger(body.exit_code)) {
    throw new ApiError("validation_failed", "exit_code must be an integer.");
  }

  const run = await prisma.run.findFirst({
    where: { id: body.run_id, providerId: provider.id },
    include: { job: true },
  });
  if (!run) throw new ApiError("not_found", `No run with id '${body.run_id}'.`);

  let usage = null;
  let artifacts = [];
  let runError = null;
  if (body.status === "succeeded") {
    if (body.usage === undefined) {
      throw new ApiError("validation_failed", "usage is required on success reports.");
    }
    validateUsage(body.usage);
    usage = body.usage;
    artifacts = validateArtifacts(body.artifacts);
  } else {
    if (body.error !== undefined) {
      if (
        body.error === null ||
        typeof body.error !== "object" ||
        typeof body.error.code !== "string" ||
        typeof body.error.message !== "string"
      ) {
        throw new ApiError("validation_failed", "error must be { code, message }.");
      }
      runError = { code: body.error.code, message: body.error.message };
    } else {
      runError = { code: "worker_error", message: "The worker reported a failure." };
    }
    if (body.usage !== undefined) {
      validateUsage(body.usage);
      usage = body.usage;
    }
  }

  // Persist artifact bytes before the transaction: a failed transaction only
  // orphans files, never the other way around.
  const artifactRows = artifacts.map((a) => {
    const objectKey = permanentKey(run.jobId, run.id, a.name);
    writeLocalArtifact(objectKey, a.buffer);
    return {
      id: newId("art"),
      runId: run.id,
      name: a.name,
      mime: a.mime,
      sizeBytes: a.sizeBytes,
      backend: "local",
      objectKey,
      inline: true,
    };
  });

  const outcome = await prisma.$transaction(async (tx) => {
    const claimed = await tx.run.updateMany({
      where: { id: run.id, status: "running" },
      data: {
        status: body.status,
        endedAt: new Date(),
        exitCode: body.exit_code ?? null,
        usage,
        error: runError,
      },
    });
    if (claimed.count !== 1) {
      const current = await tx.run.findUnique({ where: { id: run.id } });
      if (current.status === body.status) return "duplicate";
      return "conflict";
    }

    if (artifactRows.length > 0) {
      await tx.artifact.createMany({ data: artifactRows });
    }

    if (body.status === "succeeded") {
      await tx.job.updateMany({
        where: { id: run.jobId, status: { in: ["assigned", "running"] } },
        data: { status: "succeeded", finalizedAt: new Date() },
      });
    } else if (run.job.attempts < run.job.maxAttempts) {
      // Attempts remain: hand the job back to the queue for a fresh run.
      await tx.job.updateMany({
        where: { id: run.jobId, status: { in: ["assigned", "running"] } },
        data: { status: "queued" },
      });
    } else {
      await tx.job.updateMany({
        where: { id: run.jobId, status: { in: ["assigned", "running"] } },
        data: { status: "failed", finalizedAt: new Date() },
      });
    }
    return "finalized";
  });

  if (outcome === "conflict") {
    throw new ApiError(
      "report_conflict",
      "This run was already finalized with a different result."
    );
  }
  return Response.json({ ok: true });
});
