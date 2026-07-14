import { prisma } from "@nodera/db";
import { createLogger } from "@nodera/shared";

const log = createLogger("web");

// Ops health endpoint (not part of the public /v1 contract).
export async function GET() {
  try {
    await prisma.model.count();
    return Response.json({ ok: true });
  } catch (err) {
    log.error("healthz db check failed", { error: err.message });
    return Response.json({ ok: false }, { status: 503 });
  }
}
