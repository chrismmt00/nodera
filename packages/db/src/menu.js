// The v1 model menu (docs/BLUEPRINT.md §4, params per docs/api.md).
// Single source for the seed script and test fixtures.
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

async function ensureMenuModels(prisma) {
  for (const m of MODELS) {
    const { slug, ...rest } = m;
    await prisma.model.upsert({ where: { slug }, update: rest, create: m });
  }
}

module.exports = { MODELS, ensureMenuModels };
