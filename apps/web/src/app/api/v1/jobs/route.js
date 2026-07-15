import { prisma, newId } from "@nodera/db";
import { withRoute, ApiError } from "@/lib/api/errors.js";
import { requireWorkspace } from "@/lib/api/auth.js";
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

// GET /v1/jobs — newest first, cursor pagination (docs/api.md conventions).
export const GET = withRoute(async (request) => {
  const { workspaceId } = await requireWorkspace(request);
  const url = new URL(request.url);

  let limit = 20;
  if (url.searchParams.has("limit")) {
    limit = Number(url.searchParams.get("limit"));
    if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
      throw new ApiError("validation_failed", "limit must be an integer between 1 and 100.");
    }
  }

  const query = {
    where: { workspaceId },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: limit + 1,
  };
  const cursor = url.searchParams.get("cursor");
  if (cursor) {
    const anchor = await prisma.job.findFirst({
      where: { id: cursor, workspaceId },
    });
    if (!anchor) throw new ApiError("validation_failed", "Invalid cursor.");
    query.cursor = { id: cursor };
    query.skip = 1;
  }

  const rows = await prisma.job.findMany(query);
  const page = rows.slice(0, limit);
  const nextCursor = rows.length > limit ? page[page.length - 1].id : null;

  return Response.json({
    jobs: page.map((job) => ({
      job_id: job.id,
      status: job.status,
      model: job.modelSlug,
      created_at: job.createdAt.toISOString(),
      finalized_at: job.finalizedAt ? job.finalizedAt.toISOString() : null,
    })),
    next_cursor: nextCursor,
  });
});

export const POST = withRoute(async (request) => {
  const { workspaceId } = await requireWorkspace(request);

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
        workspaceId_idempotencyKey: { workspaceId, idempotencyKey },
      },
    });
    if (existing) return replayResponse(existing, body);
  }

  try {
    const job = await prisma.job.create({
      data: {
        id: newId("job"),
        workspaceId,
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
          workspaceId_idempotencyKey: { workspaceId, idempotencyKey },
        },
      });
      if (existing) return replayResponse(existing, body);
    }
    throw err;
  }
});
