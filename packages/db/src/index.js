const { PrismaClient } = require("@prisma/client");
const { PrismaPg } = require("@prisma/adapter-pg");
const { newId, sha256, newSecret } = require("./ids-internal.js");
const { enqueueJobWebhook } = require("./webhooks.js");

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is not set — copy .env.example to .env (see README).");
}

// One PrismaClient per process. Next.js dev hot-reload re-evaluates modules,
// so park the instance on globalThis to avoid exhausting DB connections.
const globalForPrisma = globalThis;
const prisma =
  globalForPrisma.__noderaPrisma ||
  (globalForPrisma.__noderaPrisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
  }));

// Menu definitions live in @nodera/shared (the provider agent needs them
// without a database); re-exported here for seed and test convenience.
const { MODELS, ensureMenuModels } = require("@nodera/shared");

module.exports = { prisma, newId, sha256, newSecret, MODELS, ensureMenuModels, enqueueJobWebhook };
