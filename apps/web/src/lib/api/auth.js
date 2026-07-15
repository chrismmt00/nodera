import { prisma, sha256 } from "@nodera/db";
import { ApiError } from "./errors.js";
import { verifySessionToken, SESSION_COOKIE } from "./session.js";

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

// Resolves the caller's workspace from EITHER an x-api-key header OR a valid
// dashboard session cookie. The same /v1 endpoints serve both — this is the
// session-authed wrapper (DECISIONS 017), not a parallel route. Returns
// { workspaceId }.
export async function requireWorkspace(request) {
  if (request.headers.get("x-api-key")) {
    const apiKey = await requireApiKey(request);
    return { workspaceId: apiKey.workspaceId, via: "api_key" };
  }
  const token = readSessionCookie(request);
  const session = verifySessionToken(token);
  if (session) {
    // Confirm the workspace still exists (defence against stale cookies).
    const ws = await prisma.workspace.findUnique({ where: { id: session.workspaceId } });
    if (ws) return { workspaceId: ws.id, via: "session" };
  }
  throw new ApiError("unauthorized", "Sign in or provide an API key.");
}

function readSessionCookie(request) {
  const header = request.headers.get("cookie");
  if (!header) return null;
  for (const part of header.split(";")) {
    const [name, ...rest] = part.trim().split("=");
    if (name === SESSION_COOKIE) return decodeURIComponent(rest.join("="));
  }
  return null;
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
