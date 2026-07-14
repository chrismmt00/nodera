/** @type {import('next').NextConfig} */
const nextConfig = {
  // Prisma's generated client and adapter load runtime assets from
  // node_modules; keep them external to the server bundle.
  serverExternalPackages: ["@prisma/client", "@prisma/adapter-pg", "@nodera/db"],
};

export default nextConfig;
