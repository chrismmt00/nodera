# Nodera

Nodera is a distributed AI compute network. Customers submit async AI jobs through an API or web app; a dispatcher assigns runs to independent provider machines; provider agents execute approved Docker workers; results return as artifacts and signed webhooks.

This repository follows [AGENTS.md](./AGENTS.md). Build tasks are completed one at a time from [TASKS.md](./TASKS.md).

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
- `docs` - project docs will be copied here in Phase 0.5.

## Commands

```bash
npm install
docker compose up -d
npm run dev
npm run build
npm run lint
```

`docker compose up -d` starts Postgres at the `DATABASE_URL` published in `.env.example`. Prisma, seed data, smoke tests, and the full dev stack arrive in later tasks.
