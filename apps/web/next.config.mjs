import path from "node:path";
import { fileURLToPath } from "node:url";

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone",
  outputFileTracingRoot: path.dirname(path.dirname(path.dirname(fileURLToPath(import.meta.url)))),
  // Prisma's generated client and adapter load runtime assets from
  // node_modules; keep them external to the server bundle.
  serverExternalPackages: ["@prisma/client", "@prisma/adapter-pg", "@nodera/db", "@nodera/storage"],
};

export default nextConfig;
