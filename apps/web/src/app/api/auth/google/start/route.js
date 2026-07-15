import crypto from "node:crypto";
import { cookies } from "next/headers";

// Kicks off Google OAuth2 (authorization code). Needs GOOGLE_CLIENT_ID/SECRET;
// see docs/LAUNCH-CHECKLIST.md §3. A short-lived state cookie guards CSRF.
export async function GET(request) {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  if (!clientId) {
    return Response.json(
      { error: { code: "internal", message: "Google sign-in is not configured." } },
      { status: 503 }
    );
  }
  const appUrl = process.env.APP_URL || new URL(request.url).origin;
  const redirectUri = `${appUrl}/api/auth/google/callback`;
  const state = crypto.randomBytes(16).toString("hex");

  const store = await cookies();
  store.set("nodera_oauth_state", state, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 600,
  });

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: "openid email profile",
    state,
    prompt: "select_account",
  });
  return Response.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params}`, 302);
}
