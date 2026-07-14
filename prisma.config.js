const path = require("node:path");
const { defineConfig } = require("prisma/config");
const { loadEnv } = require("@nodera/shared");

// Prisma 7 no longer auto-loads .env; load the repo-root .env here so every
// CLI command (migrate/generate/studio) sees DATABASE_URL without extra deps.
loadEnv(__dirname);

module.exports = defineConfig({
  schema: "packages/db/prisma/schema.prisma",
  migrations: {
    path: "packages/db/prisma/migrations",
    seed: "node scripts/seed.js",
  },
  datasource: {
    url: process.env.DATABASE_URL,
  },
});
