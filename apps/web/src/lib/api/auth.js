import { prisma, sha256 } from "@nodera/db";
import { ApiError } from "./errors.js";

// Customer auth: x-api-key. Hashed lookup; revoked keys fail immediately.
export async function requireApiKey(request) {
  const key = request.headers.get("x-api-key");
  if (!key) throw new ApiError("unauthorized", "Missing x-api-key header.");
  const apiKey = await prisma.apiKey.findUnique({ where: { keyHash: sha256(key) } });
  if (!apiKey || apiKey.revokedAt) {
    throw new ApiError("unauthorized", "Invalid or revoked API key.");
  }
  return apiKey;
}

// Provider auth: x-provider-token. Identity always derives from the token,
// never from a request body (AGENTS.md rule 6).
export async function requireProvider(request) {
  const token = request.headers.get("x-provider-token");
  if (!token) throw new ApiError("unauthorized", "Missing x-provider-token header.");
  const provider = await prisma.provider.findUnique({ where: { tokenHash: sha256(token) } });
  if (!provider) throw new ApiError("unauthorized", "Invalid provider token.");
  if (provider.status === "disabled") {
    throw new ApiError("forbidden", "This provider has been disabled.");
  }
  return provider;
}
