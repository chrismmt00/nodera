import { prisma } from "@nodera/db";
import { getStorage, pendingKey } from "@nodera/storage";
import { withRoute, ApiError } from "@/lib/api/errors.js";
import { requireProvider } from "@/lib/api/auth.js";

const NAME_RE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;
const BODY_FIELDS = new Set(["run_id", "name", "mime", "size_bytes"]);

// POST /v1/providers/artifacts/upload-url — presigned PUT for one artifact.
// The object key is always server-derived under pending/ (docs/api.md).
export const POST = withRoute(async (request) => {
  const provider = await requireProvider(request);

  let body;
  try {
    body = await request.json();
  } catch {
    throw new ApiError("validation_failed", "Request body must be valid JSON.");
  }
  for (const field of Object.keys(body)) {
    if (!BODY_FIELDS.has(field)) {
      throw new ApiError("validation_failed", `Unknown field '${field}'.`);
    }
  }
  if (typeof body.run_id !== "string") {
    throw new ApiError("validation_failed", "run_id is required.");
  }
  if (typeof body.name !== "string" || !NAME_RE.test(body.name)) {
    throw new ApiError("validation_failed", "name must be a safe filename (letters, digits, . _ -).");
  }
  if (typeof body.mime !== "string" || !body.mime) {
    throw new ApiError("validation_failed", "mime is required.");
  }
  if (!Number.isInteger(body.size_bytes) || body.size_bytes < 1) {
    throw new ApiError("validation_failed", "size_bytes must be a positive integer.");
  }
  const maxTotal = parseInt(process.env.MAX_ARTIFACT_TOTAL_BYTES || "52428800", 10);
  if (body.size_bytes > maxTotal) {
    throw new ApiError("artifact_limits_exceeded", `Artifacts are limited to ${maxTotal} bytes.`);
  }

  // Must be this provider's run AND currently running (docs/api.md).
  const run = await prisma.run.findFirst({ where: { id: body.run_id, providerId: provider.id } });
  if (!run || run.status !== "running") {
    throw new ApiError("forbidden", "The run must belong to this provider and be running.");
  }

  const expiresS = parseInt(process.env.R2_UPLOAD_URL_TTL_S || "300", 10);
  const target = await getStorage().createUploadTarget({
    key: pendingKey(run.jobId, run.id, body.name),
    contentType: body.mime,
    sizeBytes: body.size_bytes,
    expiresS,
  });

  return Response.json({
    upload_url: target.url,
    method: target.method,
    headers: target.headers,
    expires_at: target.expiresAt.toISOString(),
  });
});
