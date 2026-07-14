const fs = require("node:fs");
const path = require("node:path");
const { defineConfig } = require("prisma/config");

// Prisma 7 no longer auto-loads .env; load the repo-root .env here so every
// CLI command (migrate/generate/studio) sees DATABASE_URL without extra deps.
const envPath = path.join(__dirname, ".env");
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const m = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/.exec(line);
    if (!m || line.trim().startsWith("#")) continue;
    if (process.env[m[1]] === undefined) {
      process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
    }
  }
}

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
