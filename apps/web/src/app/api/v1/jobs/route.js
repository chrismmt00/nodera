import { prisma, newId } from "@nodera/db";
import { withRoute, ApiError } from "@/lib/api/errors.js";
import { requireApiKey } from "@/lib/api/auth.js";
import { validateJobInput, validateWebhookUrl, canonicalJson } from "@/lib/api/validate.js";

const BODY_FIELDS = new Set(["model", "input", "webhook_url"]);

function jobResponse(job) {
  return {
    job_id: job.id,
    status: job.status,
    model: job.modelSlug,
    created_at: job.createdAt.toISOString(),
  };
}

// Replay of the same Idempotency-Key: identical request body returns the
// ORIGINAL job with 200; a different body is a 409 (docs/api.md).
function replayResponse(job, body) {
  const sameBody =
    job.modelSlug === body.model &&
    canonicalJson(job.input) === canonicalJson(body.input) &&
    (job.webhookUrl ?? null) === (body.webhook_url ?? null);
  if (!sameBody) {
    throw new ApiError(
      "idempotency_conflict",
      "This Idempotency-Key was already used with a different request body."
    );
  }
  return Response.json(jobResponse(job), { status: 200 });
}

export const POST = withRoute(async (request) => {
  const apiKey = await requireApiKey(request);

  let body;
  try {
    body = await request.json();
  } catch {
    throw new ApiError("validation_failed", "Request body must be valid JSON.");
  }
  if (body === null || typeof body !== "object" || Array.isArray(body)) {
    throw new ApiError("validation_failed", "Request body must be a JSON object.");
  }
  for (const field of Object.keys(body)) {
    if (!BODY_FIELDS.has(field)) {
      throw new ApiError("validation_failed", `Unknown field '${field}'.`);
    }
  }
  if (typeof body.model !== "string") {
    throw new ApiError("validation_failed", "model is required and must be a string.");
  }

  const model = await prisma.model.findUnique({ where: { slug: body.model } });
  if (!model || !model.active) {
    throw new ApiError("model_not_found", `No active model with slug '${body.model}'.`);
  }
  validateJobInput(model.params, body.input ?? null);
  const webhookUrl = validateWebhookUrl(body.webhook_url);

  const idempotencyKey = request.headers.get("idempotency-key");
  if (idempotencyKey && idempotencyKey.length > 128) {
    throw new ApiError("validation_failed", "Idempotency-Key must be at most 128 characters.");
  }
  if (idempotencyKey) {
    const existing = await prisma.job.findUnique({
      where: {
        workspaceId_idempotencyKey: { workspaceId: apiKey.workspaceId, idempotencyKey },
      },
    });
    if (existing) return replayResponse(existing, body);
  }

  try {
    const job = await prisma.job.create({
      data: {
        id: newId("job"),
        workspaceId: apiKey.workspaceId,
        modelSlug: model.slug,
        input: body.input,
        webhookUrl,
        idempotencyKey: idempotencyKey || null,
        maxAttempts: parseInt(process.env.JOB_MAX_ATTEMPTS || "3", 10),
      },
    });
    return Response.json(jobResponse(job), { status: 201 });
  } catch (err) {
    // Unique (workspace_id, idempotency_key) race: another request with the
    // same key won the insert — treat as a replay of that job.
    if (err.code === "P2002" && idempotencyKey) {
      const existing = await prisma.job.findUnique({
        where: {
          workspaceId_idempotencyKey: { workspaceId: apiKey.workspaceId, idempotencyKey },
        },
      });
      if (existing) return replayResponse(existing, body);
    }
    throw err;
  }
});
