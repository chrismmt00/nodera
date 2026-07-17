# syntax=docker/dockerfile:1
FROM node:22-bookworm AS dependencies

WORKDIR /app
ENV DATABASE_URL=postgresql://build:build@localhost:5432/build

COPY package.json package-lock.json prisma.config.js ./
COPY apps/web/package.json apps/web/package.json
COPY apps/dispatcher/package.json apps/dispatcher/package.json
COPY apps/provider-agent/package.json apps/provider-agent/package.json
COPY packages/db/package.json packages/db/package.json
COPY packages/shared/package.json packages/shared/package.json
COPY packages/storage/package.json packages/storage/package.json
COPY packages/db/prisma packages/db/prisma
COPY packages/shared packages/shared
RUN npm ci

FROM dependencies AS build
COPY . .
RUN npm run build
RUN rm -rf apps/web/.next/cache apps/web/.next/dev

FROM node:22-bookworm-slim AS dispatcher-dependencies
WORKDIR /app
COPY package.json package-lock.json ./
COPY apps/dispatcher/package.json apps/dispatcher/package.json
COPY packages/db/package.json packages/db/package.json
COPY packages/shared/package.json packages/shared/package.json
RUN npm ci --ignore-scripts --omit=dev --omit=optional --omit=peer --workspace @nodera/dispatcher --include-workspace-root=false
COPY --from=dependencies /app/node_modules/.prisma ./node_modules/.prisma

FROM node:22-bookworm AS migrate
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json prisma.config.js ./
COPY packages/db/package.json packages/db/package.json
COPY packages/shared/package.json packages/shared/package.json
COPY packages/db/prisma packages/db/prisma
COPY packages/shared packages/shared
RUN npm ci --workspace @nodera/db --include-workspace-root=false
COPY --chown=node:node packages/db/src ./packages/db/src
COPY --chown=node:node scripts/start-production.js ./scripts/start-production.js
COPY --chown=node:node scripts/lib/production-env.js ./scripts/lib/production-env.js
USER node
CMD ["node", "scripts/start-production.js", "migrate"]

FROM node:22-bookworm-slim AS web
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build --chown=node:node /app/apps/web/.next/standalone ./
COPY --from=build --chown=node:node /app/scripts/start-production.js ./scripts/start-production.js
COPY --from=build --chown=node:node /app/scripts/lib/production-env.js ./scripts/lib/production-env.js
COPY --from=build --chown=node:node /app/apps/web/.next/static ./apps/web/.next/static
COPY --from=build --chown=node:node /app/apps/web/public ./apps/web/public
USER node
EXPOSE 3000
CMD ["node", "scripts/start-production.js", "web"]

FROM node:22-bookworm-slim AS dispatcher
WORKDIR /app
ENV NODE_ENV=production
COPY --from=dispatcher-dependencies --chown=node:node /app/node_modules ./node_modules
COPY --chown=node:node packages/db ./packages/db
COPY --chown=node:node packages/shared ./packages/shared
COPY --chown=node:node scripts/start-production.js ./scripts/start-production.js
COPY --chown=node:node scripts/lib/production-env.js ./scripts/lib/production-env.js
COPY --chown=node:node apps/dispatcher ./apps/dispatcher
USER node
EXPOSE 3001
CMD ["node", "scripts/start-production.js", "dispatcher"]
