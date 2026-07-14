import crypto from "node:crypto";
import { prisma, newId, newSecret } from "@nodera/db";
import { withRoute, ApiError } from "@/lib/api/errors.js";

function secretsMatch(given, expected) {
  const a = crypto.createHash("sha256").update(String(given)).digest();
  const b = crypto.createHash("sha256").update(String(expected)).digest();
  return crypto.timingSafeEqual(a, b);
}

// POST /v1/providers/register — guarded by PROVIDER_ENROLL_SECRET.
// The provider token is returned exactly once; only its hash is stored.
export const POST = withRoute(async (request) => {
  let body;
  try {
    body = await request.json();
  } catch {
    throw new ApiError("validation_failed", "Request body must be valid JSON.");
  }

  const enrollSecret = process.env.PROVIDER_ENROLL_SECRET;
  // Fail closed if the deployment forgot to configure the secret.
  if (!enrollSecret || !body.enroll_secret || !secretsMatch(body.enroll_secret, enrollSecret)) {
    throw new ApiError("forbidden", "Invalid enrollment secret.");
  }

  if (typeof body.name !== "string" || !body.name.trim()) {
    throw new ApiError("validation_failed", "name is required.");
  }
  const caps = body.capabilities;
  if (caps === null || typeof caps !== "object" || Array.isArray(caps)) {
    throw new ApiError("validation_failed", "capabilities must be an object.");
  }
  if (!Array.isArray(caps.models) || caps.models.some((m) => typeof m !== "string")) {
    throw new ApiError("validation_failed", "capabilities.models must be an array of model slugs.");
  }
  const concurrency = caps.concurrency ?? 1;
  if (!Number.isInteger(concurrency) || concurrency < 1) {
    throw new ApiError("validation_failed", "capabilities.concurrency must be a positive integer.");
  }

  const { plaintext, hash } = newSecret("npt");
  const provider = await prisma.provider.create({
    data: {
      id: newId("prov"),
      name: body.name.trim(),
      tokenHash: hash,
      concurrency,
      capabilities: {
        models: caps.models,
        gpu: caps.gpu ?? null,
        models_ready: [],
      },
    },
  });

  return Response.json(
    { provider_id: provider.id, provider_token: plaintext },
    { status: 201 }
  );
});
