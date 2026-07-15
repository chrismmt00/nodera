import crypto from "node:crypto";

// Dashboard sessions: a signed, TTL'd cookie (payload.hmac). No DB session
// table — the payload carries userId + workspaceId, signed with SESSION_SECRET.
// This is the "session-authed wrapper" the dashboard uses to call the same
// /v1 endpoints (AGENTS.md rule 4 / DECISIONS 017); it never bypasses them.
const COOKIE = "nodera_session";
const TTL_S = 60 * 60 * 24 * 30;

function secret() {
  const s = process.env.SESSION_SECRET;
  if (!s) throw new Error("SESSION_SECRET is not set");
  return s;
}

function sign(payloadB64) {
  return crypto.createHmac("sha256", secret()).update(payloadB64).digest("base64url");
}

export function createSessionToken({ userId, workspaceId }) {
  const payload = Buffer.from(
    JSON.stringify({ userId, workspaceId, exp: Math.floor(Date.now() / 1000) + TTL_S })
  ).toString("base64url");
  return `${payload}.${sign(payload)}`;
}

export function verifySessionToken(token) {
  if (!token || typeof token !== "string") return null;
  const [payload, mac] = token.split(".");
  if (!payload || !mac) return null;
  const expected = sign(payload);
  const a = Buffer.from(mac);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  let claims;
  try {
    claims = JSON.parse(Buffer.from(payload, "base64url").toString());
  } catch {
    return null;
  }
  if (!claims.exp || claims.exp < Math.floor(Date.now() / 1000)) return null;
  return { userId: claims.userId, workspaceId: claims.workspaceId };
}

export const SESSION_COOKIE = COOKIE;
export const SESSION_TTL_S = TTL_S;

export function sessionCookieOptions() {
  return {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: TTL_S,
  };
}
