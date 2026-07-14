// Dev seed: one workspace, one API key (plaintext printed exactly once),
// both menu models (docs/BLUEPRINT.md §4, params per docs/api.md).
// Idempotent: rerunning never duplicates rows and never prints a new key
// unless the workspace has no keys at all.
const crypto = require("node:crypto");
const { prisma, newId, newSecret } = require("@nodera/db");

const MODELS = [
  {
    slug: "llama-3.1-8b",
    modality: "llm",
    description: "Fast general text model — emails, summaries, descriptions.",
    params: {
      prompt: { type: "string", required: true, max_bytes: 32768 },
      max_tokens: { type: "integer", default: 512, max: 2048 },
    },
    workerImage: "nodera/llm-worker",
    runtimeRef: "llama3.1:8b",
    minVramGb: 8,
    maxRuntimeS: 120,
    active: true,
  },
  {
    slug: "sdxl-1.0",
    modality: "image",
    description: "High-quality image generation from a text prompt.",
    params: {
      prompt: { type: "string", required: true, max_bytes: 4096 },
      width: { type: "integer", default: 1024 },
      height: { type: "integer", default: 1024 },
    },
    workerImage: "nodera/image-worker",
    runtimeRef: "stabilityai/stable-diffusion-xl-base-1.0",
    minVramGb: 12,
    maxRuntimeS: 300,
    active: true,
  },
];

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

  for (const m of MODELS) {
    await prisma.model.upsert({
      where: { slug: m.slug },
      update: {
        modality: m.modality,
        description: m.description,
        params: m.params,
        workerImage: m.workerImage,
        runtimeRef: m.runtimeRef,
        minVramGb: m.minVramGb,
        maxRuntimeS: m.maxRuntimeS,
        active: m.active,
      },
      create: { ...m },
    });
    console.log(`Model ${m.slug} ready`);
  }
}

main()
  .then(() => prisma.$disconnect())
  .catch((err) => {
    console.error("Seed failed:", err.message);
    return prisma.$disconnect().finally(() => process.exit(1));
  });
