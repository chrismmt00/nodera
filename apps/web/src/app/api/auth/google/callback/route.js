import { cookies } from "next/headers";
import { prisma, provisionUserWorkspace } from "@nodera/db";
import { createLogger } from "@nodera/shared";
import { createSessionToken, SESSION_COOKIE, sessionCookieOptions } from "@/lib/api/session.js";

const log = createLogger("web");

// Google OAuth2 callback: exchange code → tokens → userinfo, auto-provision a
// workspace + first API key on first sign-in, set the session, land the user
// in the playground (docs/BLUEPRINT.md §17).
export async function GET(request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const store = await cookies();
  const expectedState = store.get("nodera_oauth_state")?.value;
  store.delete("nodera_oauth_state");

  const appUrl = process.env.APP_URL || url.origin;
  if (!code || !state || !expectedState || state !== expectedState) {
    return Response.redirect(`${appUrl}/?auth_error=invalid_state`, 302);
  }

  try {
    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: process.env.GOOGLE_CLIENT_ID,
        client_secret: process.env.GOOGLE_CLIENT_SECRET,
        redirect_uri: `${appUrl}/api/auth/google/callback`,
        grant_type: "authorization_code",
      }),
    });
    if (!tokenRes.ok) throw new Error(`token exchange failed: ${tokenRes.status}`);
    const tokens = await tokenRes.json();

    const infoRes = await fetch("https://openidconnect.googleapis.com/v1/userinfo", {
      headers: { authorization: `Bearer ${tokens.access_token}` },
    });
    if (!infoRes.ok) throw new Error(`userinfo failed: ${infoRes.status}`);
    const profile = await infoRes.json();
    if (!profile.email || !profile.email_verified) {
      return Response.redirect(`${appUrl}/?auth_error=email_unverified`, 302);
    }

    const { user, created } = await provisionUserWorkspace(prisma, {
      email: profile.email,
      name: profile.name || profile.given_name,
      provider: "google",
    });
    log.info("oauth sign-in", { userId: user.id, workspaceId: user.workspaceId, created });

    store.set(
      SESSION_COOKIE,
      createSessionToken({ userId: user.id, workspaceId: user.workspaceId }),
      sessionCookieOptions()
    );
    return Response.redirect(`${appUrl}/playground?welcome=${created ? 1 : 0}`, 302);
  } catch (err) {
    log.error("oauth callback failed", { error: err.message });
    return Response.redirect(`${appUrl}/?auth_error=signin_failed`, 302);
  }
}
