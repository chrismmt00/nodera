import { prisma } from "@nodera/db";
import { getSession } from "@/lib/api/session-cookies.js";

// Current signed-in identity for the dashboard shell. Not part of /v1.
export async function GET() {
  const session = await getSession();
  if (!session) return Response.json({ authenticated: false }, { status: 200 });
  const user = await prisma.user.findUnique({ where: { id: session.userId } });
  if (!user) return Response.json({ authenticated: false }, { status: 200 });
  return Response.json({
    authenticated: true,
    email: user.email,
    name: user.name,
    workspace_id: user.workspaceId,
  });
}
