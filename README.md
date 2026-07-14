# Nodera

Nodera is a distributed AI compute network. Customers submit async AI jobs through an API or web app; a dispatcher assigns runs to independent provider machines; provider agents execute approved Docker workers; results return as artifacts and signed webhooks.

This repository follows [AGENTS.md](./AGENTS.md). Build tasks are completed one at a time from [docs/TASKS.md](./docs/TASKS.md).

## Current Status

Phase 0 foundation is in progress. The repository has been reshaped into the monorepo layout from the blueprint, but the database, dispatcher, provider agent, workers, and API are not implemented yet.

## Layout

- `apps/web` - Next.js control plane and web app.
- `apps/dispatcher` - future standalone dispatcher service.
- `apps/provider-agent` - future provider agent.
- `packages/db` - future Prisma schema and migrations.
- `packages/shared` - future shared JavaScript helpers.
- `packages/storage` - future local/R2 storage abstraction.
- `workers/llm-worker` - future LLM worker image.
- `workers/image-worker` - future image worker image.
- `docs` - VISION, SCOPE, BLUEPRINT, USER-STORIES, api.md, TASKS, DECISIONS.

## Getting started (fresh clone)

```bash
npm install                # install all workspaces
cp .env.example .env       # then set PROVIDER_ENROLL_SECRET to any random string
docker compose up -d       # Postgres on localhost:5433
npx prisma migrate dev     # apply schema (also generates the Prisma client)
npm run seed               # dev workspace + API key (printed once) + menu models
```

On Windows use `copy .env.example .env`.

## Commands

```bash
npm run dev        # web app (control plane)
npm run build
npm run lint
npm run seed       # idempotent — safe to rerun
npm run smoke      # full job lifecycle check (boots the app if needed)
npm test           # integration tests (boots the app if needed)
```

The full dev stack (`npm run dev:all`) arrives with the dispatcher.
