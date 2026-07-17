# Nodera Runbook

How to run, verify, and reset everything. Commands are run from the repo root.

## Prerequisites

- Node.js 22+ and npm
- Docker (Desktop on Windows/macOS) — dev Postgres and worker containers
- [Ollama](https://ollama.com) running locally with the menu LLM pulled:
  `ollama pull llama3.1:8b` (needed by `npm run smoke` and real job execution)

## First-time setup

```bash
npm install                # also generates the Prisma client (postinstall)
cp .env.example .env       # Windows: copy .env.example .env
                           # then set PROVIDER_ENROLL_SECRET to any random string
docker compose up -d       # Postgres on localhost:5433
npx prisma migrate dev     # apply migrations
npm run seed               # dev workspace + API key (printed ONCE) + menu models
docker build -t nodera/llm-worker workers/llm-worker
```

## Daily commands

| Command | What it does |
|---|---|
| `npm run dev:all` | control plane (:3000) + dispatcher (:3001 healthz) + one dev provider agent |
| `npm run dev` | control plane only |
| `npm test` | integration tests (boots the control plane itself if needed; needs Docker) |
| `npm run smoke` | full REAL lifecycle: API → dispatcher → agent → Docker worker → Ollama |
| `npm run test:multi` | 2 fake providers drain 20 jobs; concurrency/claim assertions |
| `npx prisma migrate dev` | apply schema changes |
| `npx prisma generate` | regenerate the Prisma client after changing the schema |
| `npm run seed` | idempotent reseed |

## Health checks

- Control plane: `GET http://localhost:3000/healthz` → `{"ok":true}`
- Dispatcher: `GET http://localhost:3001/healthz` → `{"ok":true,"last_tick_at":...}`
- Ollama: `GET http://localhost:11434/api/tags`

## Reset the world

```bash
docker compose down -v     # drop the dev database volume
docker compose up -d
npx prisma migrate dev
npm run seed
```

Agent identity lives in `.nodera-agent.json` (delete it to force re-registration).
Job working dirs live under `AGENT_JOBS_DIR` (default `agent-jobs/`) and are
cleaned per run; artifacts live under `STORAGE_ROOT` (default `storage/`).

## Environment

`.env.example` is the always-current reference. Notable local overrides:

- `DATABASE_URL` — Postgres on host port 5433 (native PG may own 5432 — DECISIONS 022)
- `DOCKER_BIN` — absolute path to docker CLI if not on PATH
- `OLLAMA_URL` — model server as seen FROM CONTAINERS (`host.docker.internal`)
- `RATE_LIMIT_JOBS_PER_MIN` — authenticated `POST /v1/jobs` requests allowed per
  API key or workspace session each minute (default 60)
- `MAX_JOB_REQUEST_BYTES` — hard cap for the complete job JSON body (default
  65,536 bytes; model prompt limits may be lower)

(Deploy, backup/restore, and triage sections arrive with task 9.10.)
