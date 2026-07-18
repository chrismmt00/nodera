import { withRoute } from "@/lib/api/errors.js";
import { requireAccountSession } from "@/lib/api/account-auth.js";
import { buildUsageReport } from "@/lib/api/usage.js";

export const GET = withRoute(async () => {
  const { workspaceId } = await requireAccountSession();
  return Response.json(await buildUsageReport({ workspaceId }));
});
