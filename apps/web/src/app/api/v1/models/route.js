import { prisma } from "@nodera/db";
import { withRoute } from "@/lib/api/errors.js";
import { requireApiKey } from "@/lib/api/auth.js";

// GET /v1/models — the public menu. `params` here is the same DB column that
// drives POST /v1/jobs validation: one definition, two uses.
export const GET = withRoute(async (request) => {
  await requireApiKey(request);
  const models = await prisma.model.findMany({
    where: { active: true },
    orderBy: { slug: "asc" },
  });
  return Response.json({
    models: models.map((m) => ({
      slug: m.slug,
      modality: m.modality,
      description: m.description,
      params: m.params,
      max_runtime_s: m.maxRuntimeS,
    })),
  });
});
