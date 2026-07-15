const crypto = require("node:crypto");
const { newId, newSecret } = require("./ids-internal.js");

// Find-or-create the workspace behind an OAuth identity. On first sign-in
// this auto-provisions a workspace and a first API key in one transaction
// (docs/BLUEPRINT.md §17). Idempotent: a returning user reuses everything.
// The first key's plaintext is returned ONLY when freshly created (shown once).
async function provisionUserWorkspace(prisma, { email, name, provider = "google" }) {
  const existing = await prisma.user.findUnique({ where: { email }, include: { workspace: true } });
  if (existing) {
    return { user: existing, workspace: existing.workspace, created: false, apiKeyPlaintext: null };
  }

  const { plaintext, hash } = newSecret("nod");
  const result = await prisma.$transaction(async (tx) => {
    const workspace = await tx.workspace.create({
      data: {
        id: newId("ws"),
        name: name ? `${name}'s workspace` : email,
        webhookSecret: crypto.randomBytes(32).toString("hex"),
      },
    });
    await tx.apiKey.create({
      data: { id: newId("key"), workspaceId: workspace.id, keyHash: hash, label: "Default key" },
    });
    const user = await tx.user.create({
      data: { id: newId("user"), email, name: name || null, provider, workspaceId: workspace.id },
    });
    return { user, workspace };
  });

  return { ...result, created: true, apiKeyPlaintext: plaintext };
}

module.exports = { provisionUserWorkspace };
