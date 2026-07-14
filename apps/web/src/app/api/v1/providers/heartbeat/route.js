import { prisma } from "@nodera/db";
import { withRoute, ApiError } from "@/lib/api/errors.js";
import { requireProvider } from "@/lib/api/auth.js";

// POST /v1/providers/heartbeat — updates last_heartbeat_at and model readiness.
export const POST = withRoute(async (request) => {
  const provider = await requireProvider(request);

  let body;
  try {
    body = await request.json();
  } catch {
    throw new ApiError("validation_failed", "Request body must be valid JSON.");
  }
  if (body.active_runs !== undefined && (!Number.isInteger(body.active_runs) || body.active_runs < 0)) {
    throw new ApiError("validation_failed", "active_runs must be a non-negative integer.");
  }
  if (
    body.models_ready !== undefined &&
    (!Array.isArray(body.models_ready) || body.models_ready.some((m) => typeof m !== "string"))
  ) {
    throw new ApiError("validation_failed", "models_ready must be an array of model slugs.");
  }

  const capabilities = { ...provider.capabilities };
  if (body.models_ready !== undefined) capabilities.models_ready = body.models_ready;

  await prisma.provider.update({
    where: { id: provider.id },
    data: { lastHeartbeatAt: new Date(), capabilities },
  });

  return Response.json({ ok: true });
});
