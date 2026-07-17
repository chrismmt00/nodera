import { prisma, newId, newSecret } from "@nodera/db";
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

export const GET = withRoute(async () => {
  const { workspaceId } = await requireAccountSession();
  const keys = await prisma.apiKey.findMany({
    where: { workspaceId },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
  });
  return Response.json({ api_keys: keys.map(keyMetadata) });
});

export const POST = withRoute(async (request) => {
  requireSameOrigin(request);
  const { workspaceId } = await requireAccountSession();

  let body;
  try {
    body = await request.json();
  } catch {
    throw new ApiError("validation_failed", "Request body must be valid JSON.");
  }
  if (body === null || typeof body !== "object" || Array.isArray(body)) {
    throw new ApiError("validation_failed", "Request body must be a JSON object.");
  }
  if (Object.keys(body).some((field) => field !== "label")) {
    throw new ApiError("validation_failed", "Only label may be provided.");
  }
  const label = typeof body.label === "string" ? body.label.trim() : "";
  if (!label || Buffer.byteLength(label, "utf8") > 64) {
    throw new ApiError("validation_failed", "label must be between 1 and 64 bytes.");
  }

  const { plaintext, hash } = newSecret("nod");
  const key = await prisma.apiKey.create({
    data: { id: newId("key"), workspaceId, keyHash: hash, label },
  });
  return Response.json({ api_key: keyMetadata(key), plaintext }, { status: 201 });
});
