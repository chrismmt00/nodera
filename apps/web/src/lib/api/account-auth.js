import { prisma } from "@nodera/db";
import { ApiError } from "./errors.js";
import { getSession } from "./session-cookies.js";

// Account routes are dashboard-only. API keys cannot manage other API keys;
// a valid signed-in user and workspace pair is required.
export async function requireAccountSession() {
  const session = await getSession();
  if (!session) throw new ApiError("unauthorized", "Sign in to manage your account.");

  const user = await prisma.user.findFirst({
    where: { id: session.userId, workspaceId: session.workspaceId },
  });
  if (!user) throw new ApiError("unauthorized", "Your session is no longer valid.");
  return { user, workspaceId: user.workspaceId };
}

// SameSite cookies and JSON-only bodies already narrow CSRF risk; checking the
// Origin as well makes mutation routes fail closed.
export function requireSameOrigin(request) {
  const origin = request.headers.get("origin");
  if (!origin || origin !== new URL(request.url).origin) {
    throw new ApiError("forbidden", "This account action must come from Nodera.");
  }
}
