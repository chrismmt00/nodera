import { Readable } from "node:stream";
import { prisma } from "@nodera/db";
import { getStorage } from "@nodera/storage";
import { withRoute, ApiError } from "@/lib/api/errors.js";
import { requireWorkspace } from "@/lib/api/auth.js";

// GET /v1/jobs/:id/artifacts/:name — streams the bytes, never buffers the
// whole file (docs/api.md). Workspace-scoped: anything foreign is a 404.
export const GET = withRoute(async (request, ctx) => {
  const { workspaceId } = await requireWorkspace(request);
  const { id, name } = await ctx.params;

  const job = await prisma.job.findFirst({
    where: { id, workspaceId },
    include: { runs: { include: { artifacts: true }, orderBy: { assignedAt: "asc" } } },
  });
  if (!job) throw new ApiError("not_found", `No job with id '${id}'.`);

  // Serve from the winning run first, falling back over earlier attempts.
  const runs = [...job.runs].reverse();
  const winning = runs.find((r) => r.status === "succeeded");
  const ordered = winning ? [winning, ...runs.filter((r) => r !== winning)] : runs;
  let artifact = null;
  for (const run of ordered) {
    artifact = run.artifacts.find((a) => a.name === name);
    if (artifact) break;
  }
  if (!artifact) throw new ApiError("not_found", `No artifact named '${name}' on this job.`);

  const storage = getStorage();
  const head = await storage.headObject(artifact.objectKey);
  if (!head) throw new ApiError("not_found", `No artifact named '${name}' on this job.`);

  const stream = storage.getReadStream(artifact.objectKey);
  return new Response(Readable.toWeb(stream), {
    headers: {
      "content-type": artifact.mime,
      "content-length": String(head.size),
      "content-disposition": `attachment; filename="${artifact.name}"`,
    },
  });
});
