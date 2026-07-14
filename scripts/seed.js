// Dev seed: one workspace, one API key (plaintext printed exactly once),
// both menu models (docs/BLUEPRINT.md §4, params per docs/api.md).
// Idempotent: rerunning never duplicates rows and never prints a new key
// unless the workspace has no keys at all.
const crypto = require("node:crypto");
const { prisma, newId, newSecret, MODELS, ensureMenuModels } = require("@nodera/db");

async function main() {
  let workspace = await prisma.workspace.findFirst({ where: { name: "Dev Workspace" } });
  if (!workspace) {
    workspace = await prisma.workspace.create({
      data: {
        id: newId("ws"),
        name: "Dev Workspace",
        webhookSecret: crypto.randomBytes(32).toString("hex"),
      },
    });
    console.log(`Created workspace ${workspace.id}`);
  } else {
    console.log(`Workspace ${workspace.id} already exists`);
  }

  const keyCount = await prisma.apiKey.count({ where: { workspaceId: workspace.id } });
  if (keyCount === 0) {
    const { plaintext, hash } = newSecret("nod");
    await prisma.apiKey.create({
      data: { id: newId("key"), workspaceId: workspace.id, keyHash: hash, label: "Default key" },
    });
    console.log("");
    console.log("  API key (shown ONCE — save it now):");
    console.log(`  ${plaintext}`);
    console.log("");
  } else {
    console.log("API key already exists (plaintext is only shown at creation)");
  }

  await ensureMenuModels(prisma);
  for (const m of MODELS) console.log(`Model ${m.slug} ready`);
}

main()
  .then(() => prisma.$disconnect())
  .catch((err) => {
    console.error("Seed failed:", err.message);
    return prisma.$disconnect().finally(() => process.exit(1));
  });
