import { cookies } from "next/headers";
import { prisma, provisionUserWorkspace } from "@nodera/db";
import { createSessionToken, SESSION_COOKIE, sessionCookieOptions } from "@/lib/api/session.js";

// Dev-only sign-in: auto-provisions/reuses a workspace for an email without
// Google, so the whole onboarding path is testable locally. Disabled in
// production (Google is the real door).
export async function POST(request) {
  if (process.env.NODE_ENV === "production" && process.env.ALLOW_DEV_LOGIN !== "1") {
    return Response.json(
      { error: { code: "not_found", message: "Not available." } },
      { status: 404 }
    );
  }
  let body = {};
  try {
    body = await request.json();
  } catch {
    // empty body ok
  }
  const email = (body.email || "dev@nodera.local").toLowerCase();
  const { user, created } = await provisionUserWorkspace(prisma, {
    email,
    name: body.name || "Dev User",
    provider: "dev",
  });

  const store = await cookies();
  store.set(
    SESSION_COOKIE,
    createSessionToken({ userId: user.id, workspaceId: user.workspaceId }),
    sessionCookieOptions()
  );
  return Response.json({
    ok: true,
    created,
    workspace_id: user.workspaceId,
    email: user.email,
  });
}
