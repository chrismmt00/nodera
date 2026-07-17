// Test fixtures: isolated workspace + API key per suite, cleaned up after.
// Tests always talk to the real HTTP API — never to backdoor routes.
const { prisma, newId, newSecret, ensureMenuModels } = require("@nodera/db");

const BASE = `http://localhost:${process.env.PORT || "3000"}`;
const API = `${BASE}/api/v1`;

async function createWorkspaceFixture() {
  await ensureMenuModels(prisma);
  const workspace = await prisma.workspace.create({
    data: { id: newId("ws"), name: `test-${newId("t")}`, webhookSecret: newId("whsec") },
  });
  const { plaintext, hash } = newSecret("nod");
  const apiKey = await prisma.apiKey.create({
    data: { id: newId("key"), workspaceId: workspace.id, keyHash: hash, label: "test" },
  });
  return { workspace, apiKey, apiKeyPlaintext: plaintext };
}

// Deletes the workspace and everything hanging off it, respecting FK order.
async function destroyWorkspaceFixture(workspace) {
  const apiKeys = await prisma.apiKey.findMany({ where: { workspaceId: workspace.id } });
  const rateLimitPrincipals = [
    `session:${workspace.id}`,
    ...apiKeys.map((key) => `api_key:${key.id}`),
  ];
  const jobs = await prisma.job.findMany({ where: { workspaceId: workspace.id } });
  const jobIds = jobs.map((j) => j.id);
  const runs = await prisma.run.findMany({ where: { jobId: { in: jobIds } } });
  const runIds = runs.map((r) => r.id);
  await prisma.artifact.deleteMany({ where: { runId: { in: runIds } } });
  await prisma.webhookDelivery.deleteMany({ where: { jobId: { in: jobIds } } });
  await prisma.run.deleteMany({ where: { id: { in: runIds } } });
  await prisma.job.deleteMany({ where: { id: { in: jobIds } } });
  await prisma.rateLimitWindow.deleteMany({
    where: { principalId: { in: rateLimitPrincipals } },
  });
  await prisma.user.deleteMany({ where: { workspaceId: workspace.id } });
  await prisma.apiKey.deleteMany({ where: { workspaceId: workspace.id } });
  await prisma.workspace.delete({ where: { id: workspace.id } });
}

async function destroyProviderFixture(providerId) {
  await prisma.run.deleteMany({ where: { providerId } });
  await prisma.provider.delete({ where: { id: providerId } });
}

module.exports = { BASE, API, createWorkspaceFixture, destroyWorkspaceFixture, destroyProviderFixture, prisma };
