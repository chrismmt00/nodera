import { prisma } from "@nodera/db";
import { withRoute, ApiError } from "@/lib/api/errors.js";
import { requireAccountSession, requireSameOrigin } from "@/lib/api/account-auth.js";

function keyMetadata(key) {
  return {
    key_id: key.id,
    label: key.label,
    created_at: key.createdAt.toISOString(),
    revoked_at: key.revokedAt ? key.revokedAt.toISOString() : null,
  };
}

export const DELETE = withRoute(async (request, ctx) => {
  requireSameOrigin(request);
  const { workspaceId } = await requireAccountSession();
  const { id } = await ctx.params;
  const existing = await prisma.apiKey.findFirst({ where: { id, workspaceId } });
  if (!existing) throw new ApiError("not_found", "API key not found.");

  const key = existing.revokedAt
    ? existing
    : await prisma.apiKey.update({ where: { id: existing.id }, data: { revokedAt: new Date() } });
  return Response.json({ api_key: keyMetadata(key) });
});
