import { cookies } from "next/headers";
import { verifySessionToken, SESSION_COOKIE } from "./session.js";

// Route-handler helpers that touch the Next cookie store. Kept separate from
// session.js so the pure token logic (used by the /v1 auth resolver) never
// pulls in `next/headers`, which only resolves inside the Next runtime.
export async function getSession() {
  const store = await cookies();
  return verifySessionToken(store.get(SESSION_COOKIE)?.value);
}
