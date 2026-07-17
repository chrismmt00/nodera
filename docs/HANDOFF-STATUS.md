# Nodera — Handoff Status (what's been built)

_Snapshot for the next engineer/AI picking this up. Written 2026-07-16._

This is the ground truth of where the build stands. The authoritative
checkbox list is `docs/TASKS.md`; this doc adds the context, gotchas, and
"why" that checkboxes can't carry. Remaining work is in
`docs/REMAINING-TASKS.md`.

---

## TL;DR

- **Phases 0–5 are complete and their gates pass.** Phase 6 is in progress.
- **67 integration tests pass** (`npm test`), plus `npm run smoke` (real
  end-to-end AI), `npm run test:multi` (multi-provider drain).
- The system runs a **real** job end to end: customer API → dispatcher →
  provider agent → hardened Docker worker → local Ollama (`llama3.1:8b` on GPU)
  → metered result → webhook. Verified live.
- Everything is committed through **Phase 6.3**.
- **Phase 6.3 (playground) is implemented and verified** with a live LLM run,
  both model request paths, desktop/mobile checks, and browser console review.
- Several tasks are **`[~]` blocked on human-only resources** (R2 creds,
  Google OAuth creds, a ≥12 GB GPU, a VPS/domain, live stopwatch tests). Each
  has exact instructions in `docs/LAUNCH-CHECKLIST.md`.

---

## What is done (committed)

| Phase | State | Notes |
|---|---|---|
| 0 Foundation | ✅ Gate 0 | monorepo, docker Postgres (host **5433**), Prisma schema + migrations, seed |
| 1 Core API | ✅ Gate 1 | jobs CRUD, idempotency, models, provider register/heartbeat/poll/report, smoke |
| 2 Dispatcher | ✅ Gate 2 | assignment txn, offline requeue, deadline expiry, attempts cap, multi-provider drain |
| 3 Docker + real LLM | ✅ Gate 3 | worker contract, real Ollama LLM worker, hardened runner, kill timer, metering |
| 4 Artifacts + storage | ✅ Gate 4* | storage abstraction, local backend, upload-url, verify+promote, streaming download |
| 5 Webhooks | ✅ Gate 5 | enqueue, delivery worker + backoff, HMAC signing, SSRF guard, receiver harness |
| 6.1 Image worker | `[~]` | SDXL/Diffusers worker + Dockerfile built; **live run blocked on ≥12 GB GPU** |
| 6.2 OAuth signup | `[~]` | full flow + auto-provision + sessions built & tested via dev-login; **live Google blocked on creds** |
| 6.3 Playground | `[~]` | reusable live model runner; LLM verified in browser; **live SDXL render inherits the 6.1 GPU block** |

\* Gate 4 passed with a documented exception: everything is proven on the
local storage backend; live R2 verification needs credentials (DECISIONS 026).

### The five critical tests (blueprint §15) — all green
1. Atomic claim (two concurrent polls → one winner) — `tests/providers-poll.test.js`
2. Idempotency (replay returns original) — `tests/jobs-create.test.js`
3. Duplicate report (200 no-op / 409 conflict) — `tests/providers-report.test.js`
4. Deadline expiry (never-finishing run requeues) — `tests/dispatcher-recovery.test.js`
5. Webhook signature (verifies with the api.md snippet) — `tests/webhooks-delivery.test.js`

---

## Phase 6.3 verification

- `/playground` uses a reusable product shell, model-driven form component,
  and shared UI primitives from the existing design language.
- Dev sign-in → `GET /v1/models` → `POST /v1/jobs` → poll
  `GET /v1/jobs/:id` → rendered text and usage was exercised in the browser
  with a real `llama-3.1-8b` run.
- `tests/playground.test.js` covers page availability plus both active model
  request shapes through the session-authenticated public API.
- Desktop and 390px mobile layouts have no horizontal overflow, and browser
  console review found no warnings or errors.
- The SDXL form, width/height defaults, job creation, and image result renderer
  are wired. A live SDXL result is still blocked by the 6.1 hardware requirement
  and is deliberately recorded as `[~]`, not faked.

---

## How to run & verify (Windows dev box)

```bash
npm install                       # postinstall runs `prisma generate`
docker compose up -d              # Postgres on localhost:5433
npx prisma migrate dev            # apply migrations
npm run seed                      # dev workspace + API key (printed once) + models
docker build -t nodera/llm-worker workers/llm-worker
npm test                          # 66 tests (boots the app itself; needs Docker)
npm run smoke                     # real end-to-end (needs Ollama + llama3.1:8b)
npm run dev:all                   # web(:3000) + dispatcher(:3001) + one agent
```

Full command list and reset steps: `docs/RUNBOOK.md`.

---

## Environment gotchas (these will bite you — read them)

- **This is a Windows box with Git Bash + PowerShell.** `docker` is **not on
  PATH**; use `DOCKER_BIN` (set in `.env` to
  `C:/Program Files/Docker/Docker/resources/bin/docker.exe`) or that full path.
- **Postgres runs on host port 5433**, not 5432 — a native PostgreSQL 18 owns
  5432 on this machine (DECISIONS 022). `DATABASE_URL` already points at 5433.
- **`.env` paths must use forward slashes.** `DOCKER_BIN` and `AGENT_JOBS_DIR`
  broke once when written with backslashes (`\r`/`\b` escape corruption). Keep
  them as `C:/...`.
- **Turbopack caches a stale module graph.** After adding a new
  `require()`/import of a workspace package to a route, a request can 500 with
  `module-not-found` even though the file exists. Fix: kill the dev server,
  `rm -rf apps/web/.next`, restart.
- **Kill stale `:3000` servers before `npm test`** when you changed the Prisma
  schema or a shared module — the test runner reuses an already-healthy server,
  which may hold a stale in-memory Prisma client (this caused the `prisma.user
  is undefined` failure until the server was restarted after `add_users`).
- **Ollama** is installed at
  `C:/Users/Chris/AppData/Local/Programs/Ollama/ollama`, with `llama3.1:8b`
  pulled and `nodera/llm-worker` image built. Workers reach it via
  `host.docker.internal:11434`.
- **GPU is an RTX 2080 (8 GB).** Enough for the 8B LLM; **not** enough for
  SDXL (`min_vram_gb=12`) → 6.1 live run is blocked on hardware.

---

## Architecture as built (five pieces)

- `apps/web` — Next.js 16 (App Router) control plane + (mock) web app. Serves
  `/api/v1/*` (public contract), `/api/auth/*` (sessions), `/healthz`,
  `/internal/storage/upload` (local-backend presign stand-in).
- `apps/dispatcher` — standalone loop: assignment, offline requeue, deadline
  expiry, attempts cap, **and** webhook delivery. `/healthz` on `:3001`.
- `apps/provider-agent` — registers (saved identity), heartbeats, polls, runs
  hardened Docker workers, uploads large artifacts, reports; graceful stop.
- `workers/llm-worker` (real, Ollama) and `workers/image-worker` (SDXL, built,
  GPU-blocked).
- `packages/db` (Prisma + helpers), `packages/shared` (logger, env, menu,
  worker-contract, webhook-sign), `packages/storage` (local + R2 backends).

### Key design decisions to respect (full list in `docs/DECISIONS.md`)
- **022** Postgres host port 5433.
- **024** Prisma 7: `prisma-client-js` generator (NOT `prisma-client`, which
  emits TypeScript — rule 1), `@prisma/adapter-pg`, config in `prisma.config.js`.
- **025** The agent reads model→image/runtime from `@nodera/shared` menu.js,
  not the network (the /v1 menu is customer-authed and omits worker_image).
- **027** Auth is hand-rolled (Google OAuth2 code flow + signed-cookie
  sessions, no auth library — Next 16 is too new to trust next-auth). The /v1
  customer resolver `requireWorkspace` accepts **x-api-key OR the session
  cookie** — same endpoints, session-authed (rule 4), never a parallel route.

---

## Discipline the next session must keep (from AGENTS.md)

- **JavaScript only** (no TypeScript/`.ts`). **Prisma only** for DB. Never edit
  an applied migration — add a new one.
- **The public /v1 API is exactly `docs/api.md`.** The dashboard uses those
  same endpoints session-authed; no parallel backdoor routes.
- Every API error is `{ "error": { "code", "message" } }` with codes from
  `docs/api.md`.
- Secrets stored hashed, never logged, never in fixtures. Provider identity
  always from the token.
- **One task = one commit** (`Phase X.Y: …`), tests + `npm run smoke` green
  before committing, tick the box in `docs/TASKS.md`, add a `docs/DECISIONS.md`
  line when a real choice was made.
- Commit message trailer: `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`.

---

## Blocked-on-human items (need the owner) — see `docs/LAUNCH-CHECKLIST.md`

| # | What | What's needed | Verify |
|---|---|---|---|
| 4.2 | R2 live | `R2_ACCESS_KEY_ID` + `R2_SECRET_ACCESS_KEY` (endpoint/account/bucket already set) | `npm run smoke:r2` |
| 6.1 | Live SDXL | ≥12 GB GPU + NVIDIA Container Toolkit; `docker build` image-worker | submit an `sdxl-1.0` job |
| 6.2 | Live Google | `GOOGLE_CLIENT_ID` + `GOOGLE_CLIENT_SECRET` + `SESSION_SECRET` | `/api/auth/google/start` |
| 6.7 | Prod deploy | VPS + domain + TLS (host web+dispatcher+Postgres, R2 live) | external job succeeds |
| 6.8 / 8.9 | Stopwatch | a real person timed | <60 s customer / <5 min provider |

**R2 note:** the owner provided the bucket URL
`https://bebf9beabde1bbe7d8c8601aabdbdb6e.r2.cloudflarestorage.com/nodera`.
That gives account ID + endpoint + bucket (all set in `.env`). It is **not** a
credential — R2 still needs an API token's Access Key ID + Secret
(Cloudflare → R2 → Manage R2 API Tokens → Object Read & Write on `nodera`).
