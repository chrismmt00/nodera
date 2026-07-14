const crypto = require("node:crypto");
const { PrismaClient } = require("@prisma/client");
const { PrismaPg } = require("@prisma/adapter-pg");

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

// IDs are prefixed strings per docs/api.md conventions: job_..., run_..., prov_..., ws_...
function newId(prefix) {
  return `${prefix}_${crypto.randomBytes(12).toString("base64url")}`;
}

// API keys and provider tokens are high-entropy random strings, so a plain
// SHA-256 lookup hash is sufficient (no salt/KDF needed) and allows unique-index lookups.
function sha256(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

// key = plaintext returned to the caller exactly once; only the hash is stored.
function newSecret(prefix) {
  const plaintext = `${prefix}_${crypto.randomBytes(24).toString("base64url")}`;
  return { plaintext, hash: sha256(plaintext) };
}

module.exports = { prisma, newId, sha256, newSecret };
