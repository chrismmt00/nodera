# Nodera — Handoff Status (what's been built)

_Snapshot for the next engineer/AI picking this up. Updated 2026-07-18._

This is the ground truth of where the build stands. The authoritative
checkbox list is `docs/TASKS.md`; this doc adds the context, gotchas, and
"why" that checkboxes can't carry. Remaining work is in
`docs/REMAINING-TASKS.md`.

---

## TL;DR

- **Phases 0–5 are complete and their gates pass.** Phase 7 is in progress.
- **85 integration tests pass** (`npm test`), plus `npm run smoke` (real
  end-to-end AI), `npm run test:multi` (multi-provider drain).
- The system runs a **real** job end to end: customer API → dispatcher →
  provider agent → hardened Docker worker → local Ollama (`llama3.1:8b` on GPU)
  → metered result → webhook. Verified live.
- Everything buildable is committed through **Phase 6.8**; external production
  and real-person acceptance tests remain owner-blocked.
- **Phase 6.3 (playground) is implemented and verified** with a live LLM run,
  both model request paths, desktop/mobile checks, and browser console review.
- **Phase 6.4 (account + keys) is implemented and verified:** session-only key
  management, recent jobs through `/v1`, reveal-once creation, and immediate
  revocation are covered by integration and browser checks.
- **Phase 6.5 (abuse limits) is implemented and verified:** database-backed
  per-key/session throttling, contract `429` responses, and bounded request
  parsing protect the queue and work across control-plane instances.
- **Phase 6.6 (public docs) is implemented and verified:** `/docs` publishes
  the quickstart, every v1 endpoint, error guidance, and exact webhook
  verification code with local/production and Bash/PowerShell variants.
- **Phase 6.7 (production deploy) is packaged and locally verified:** separate
  production images, private Postgres, automatic migrations, health gates,
  fail-fast env validation, and container hardening are ready for a host.
- **Phase 6.8 (customer stopwatch) is instrumented and verified:** a read-only
  Prisma report measures signup to first succeeded job per workspace without
  exposing user or job content. The dev row is 35.298s; human acceptance waits.
- **Phase 7.1 (model gallery) is implemented and verified:** `/models` shows
  API-driven model cards and uses the same generated composer as the playground;
  adding an active DB model is covered by integration test with no frontend
  code change.
- **Phase 7.2 (jobs dashboard) is implemented and verified:** `/jobs` polls the
  public jobs list, shows newest-first activity with human-readable statuses,
  and reuses the same compact component on the account page.
- **Phase 7.3 (job detail) is implemented and verified:** `/jobs/:id` shows
  original input, rendered text/image output, downloads, run metadata, plain
  errors, Retry, and Re-run through the public `/v1` API.
- **Phase 7.4 (snippet generator) is implemented and verified:** UI run results
  and job details show exact curl/Node.js snippets with env-var keys by default
  and reveal-once key insertion on demand.
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
| 6.4 Account + keys | ✅ | session-only view/create/revoke, reveal-once plaintext, recent jobs through `/v1`, immediate revocation |
| 6.5 Abuse limits | ✅ | atomic Postgres fixed windows, 60 requests/minute, 64 KiB job-body cap, model prompt caps |
| 6.6 Public docs | ✅ | responsive `/docs`, executable quickstart, all customer/provider endpoints, webhook verification |
| 6.7 Production deploy | `[~]` | deploy package verified locally; VPS/domain/TLS/live credentials and external job remain owner-blocked |
| 6.8 Customer stopwatch | `[~]` | measurement/report tested; dev row 35.298s; unassisted real-person run remains owner-blocked |
| 7.1 Model gallery | ✅ | `/models` cards + shared generated composer from `GET /v1/models`; DB-added model integration test |
| 7.2 Jobs dashboard | ✅ | `/jobs` newest-first polling list, human statuses, responsive summary, account recent-jobs reuse |
| 7.3 Job detail | complete | `/jobs/:id` detail, original input, text/image rendering, downloads, Retry/Re-run |
| 7.4 Snippet generator | complete | exact curl/Node snippets from UI jobs, env-var default, reveal-once key insertion |

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

## Phase 6.4 verification

- `/account` reuses the product shell, sign-in card, status primitives, and
  responsive styling from the existing customer UI.
- Key management lives under session-only `/api/account/*` routes, leaving the
  public `/v1` contract unchanged. List and revoke responses contain metadata
  only; create returns the generated plaintext once and stores only its hash.
- Recent activity comes from session-authenticated `GET /v1/jobs`, preserving
  the dashboard-uses-public-API rule.
- `tests/account-keys.test.js` proves session and same-origin enforcement,
  hash-only persistence, workspace isolation, idempotent revocation, and an
  immediate `401` from `/v1` after revocation.
- Desktop and 390px mobile browser checks found no horizontal overflow or
  off-screen controls; create/reveal/two-step-revoke states completed with no
  console errors.

---

## Phase 6.5 verification

- `POST /v1/jobs` uses an atomic Prisma upsert into `rate_limit_windows`.
  API-key callers are isolated by key ID; dashboard callers are isolated by
  workspace session. No key plaintext or hash is stored in the counter.
- The runtime defaults are 60 authenticated job POSTs per minute and a 65,536
  byte whole-request cap, configurable with `RATE_LIMIT_JOBS_PER_MIN` and
  `MAX_JOB_REQUEST_BYTES`. Model-specific prompt byte limits still apply.
- Rejected bursts return the contract error shape with code `rate_limited`,
  status `429`, and an integer `Retry-After` for the current fixed window.
- JSON is read from the request stream with a hard byte ceiling, including when
  `Content-Length` is absent. Oversized bodies never create queue rows.
- `tests/rate-limits.test.js` concurrently hammers API-key and session callers,
  proves exact accepted counts and credential isolation, and confirms every
  accepted row remains a valid queued job. All 85 integration tests pass.

---

## Phase 6.6 verification

- `/docs` is a statically generated public page linked from the landing page
  and shared product navigation. Its responsive layout reuses the existing
  shell, controls, colors, and typography.
- One structured JavaScript reference drives the visible examples and the
  executable test. It covers all five customer endpoints and all five provider
  endpoints from `docs/api.md`, with local/production URLs and Bash/PowerShell
  commands.
- The webhook section reproduces the contract verification code exactly and
  explains that `NODERA_WEBHOOK_SECRET` is the workspace signing secret, never
  the API key. Self-service secret delivery is not yet defined by the public
  contract and remains an explicit follow-up rather than an invented endpoint.
- `tests/public-docs.test.js` provisions a fresh workspace and API key, executes
  the published quickstart payload through real `curl`, and retrieves the
  resulting queued job. The complete suite passes 83/83.
- Desktop and 390px mobile layout checks found no page overflow or clipped
  controls; environment/shell switching and copy feedback work with no browser
  console errors.

---

## Phase 6.7 verification

- `deploy/Dockerfile` produces separate standalone web, dispatcher, and
  one-shot migration targets. Runtime services use the slim Node base and do
  not carry Prisma CLI or front-end build dependencies unnecessarily.
- `deploy/compose.yml` keeps Postgres private, runs migrations before either
  service starts, gates both services on health, binds web to loopback for a
  future TLS reverse proxy, rotates logs, runs as `node`, drops all Linux
  capabilities, and enables `no-new-privileges`.
- Production startup rejects HTTP app origins, dev-login, local storage,
  missing/placeholder secrets, malformed database URLs, and non-HTTPS R2
  endpoints before serving traffic. Test credentials are generated at runtime.
- Local production validation used a fresh isolated volume: Postgres became
  healthy, all three migrations applied, web and dispatcher started, and
  `/healthz` plus `/docs` returned 200. The validation stack and volume were
  removed afterward without touching dev data.
- `tests/production-deploy.test.js` covers the environment contract and renders
  the Compose topology. The external acceptance job remains blocked only on
  owner-supplied infrastructure and credentials.

---

## Phase 6.8 verification

- `npm run --silent onboarding:report` emits machine-readable JSON derived by
  Prisma from the earliest user creation and earliest succeeded job per
  workspace. No schema or duplicate timing state was added.
- Each row contains only workspace ID, timestamps, elapsed seconds, and target
  result. The report excludes emails, names, job inputs, and credentials.
- Failed jobs do not count, later successful jobs cannot replace the first,
  multi-user workspaces start at the earliest signup, and exactly 60.000s does
  not satisfy the strict "under 60" target.
- `tests/onboarding-report.test.js` covers the derivation and the user-facing
  command. The full suite passes 83/83.
- The current dev workspace reports 35.298s. This proves instrumentation but is
  deliberately not presented as the required unassisted real-person result.

---

## Phase 7.1 verification

- `/models` is a real route in the shared product shell, with loading, sign-in,
  error, empty, desktop, and mobile states.
- Cards are generated from session-authenticated `GET /v1/models` only:
  modality, plain-language description, params, and max runtime all come from
  the public menu contract.
- The playground and gallery share one generated `JobComposer` plus
  `model-form.js` helper for labels, defaults, required-field validation, and
  typed JSON input. Required params render before optional params; optional
  fields stay under the existing Options control.
- `tests/model-gallery.test.js` creates a temporary active Prisma model with a
  new param, confirms the menu exposes it, confirms the generated form helper
  emits and types that field, and creates a job through `/v1/jobs`.
- Browser checks on desktop and 390px mobile found no horizontal overflow; the
  gallery collapses to one column on mobile and keeps the selected composer
  usable.

---

## Phase 7.2 verification

- `/jobs` is a real signed-in route in the shared product shell with loading,
  sign-in, error, empty, desktop, and mobile states.
- The page loads and polls session-authenticated `GET /v1/jobs?limit=20`; it
  does not use a dashboard-only API route or Prisma from the browser.
- Rows render newest-first with human-readable status text from `humanStatus()`,
  live status dots for `queued | assigned | running`, created/finalized times,
  and no raw status enum shown alone.
- `JobsDashboard` is reusable: the account page now uses the same component in
  compact mode for recent jobs.
- `tests/jobs-dashboard.test.js` creates jobs through `/v1/jobs`, proves the
  newest-first order, updates a job status in Prisma, and proves a later public
  jobs poll observes the changed status.
- Browser checks on desktop and 390px mobile found no horizontal overflow; the
  summary cards and job rows collapse cleanly on mobile.

---

## Phase 7.3 verification

- `GET /v1/jobs/:id` now returns the original same-workspace `input`, documented
  in `docs/api.md`, so the dashboard can show and re-run jobs without a
  dashboard-only API route.
- `/jobs/:id` is a signed-in product-shell route with loading, sign-in, error,
  live-polling, desktop, and mobile states. Dashboard rows now link to the
  detail page.
- The detail view renders text output as text, image artifacts as images,
  artifact rows as download links, run metadata, original prompt/JSON input,
  plain-language failed-job errors, and Retry/Re-run buttons that submit the
  same model/input through `POST /v1/jobs`.
- `tests/job-detail-page.test.js` seeds succeeded and failed jobs for both
  `llama-3.1-8b` and `sdxl-1.0`, proves the public detail response includes
  input/output/error/artifacts, downloads a real PNG through the artifact route,
  and verifies the rerun payload creates a new queued job.
- Browser checks on desktop and 390px mobile covered a succeeded image detail
  and a failed text detail. Both showed the expected controls and no horizontal
  overflow.

---

## Phase 7.4 verification

- `SnippetPanel` is reusable and appears after live `JobComposer` results and on
  `/jobs/:id`, so current and past UI runs can become API calls.
- `job-snippets.js` emits the exact `{ model, input }` body as curl arguments,
  a copyable curl command, and a dependency-free Node.js script. Node snippets
  print JSON so terminals and tests can consume the created job response.
- Snippets default to the production base URL and `NODERA_API_KEY`; local base
  URL is available for dev. The "Insert key" action creates a new reveal-once
  session account key and inserts it into the snippet without storing plaintext.
- `tests/snippet-generator.test.js` signs in, creates a reveal-once key, creates
  an image job through `/v1`, then executes both generated curl and Node snippets
  against the local API and confirms the new jobs keep the exact model/input.
- Browser checks on desktop and 390px mobile verified the snippet panel, curl
  and Node tabs, one-click key insertion, and no horizontal overflow.

---

## How to run & verify (Windows dev box)

```bash
npm install                       # postinstall runs `prisma generate`
docker compose up -d              # Postgres on localhost:5433
npx prisma migrate dev            # apply migrations
npm run seed                      # dev workspace + API key (printed once) + models
docker build -t nodera/llm-worker workers/llm-worker
npm test                          # 85 tests (boots the app itself; needs Docker)
npm run --silent onboarding:report # signup→first-success metrics (JSON)
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
- **Run `npx prisma generate` after schema changes.** Prisma 7's
  `migrate dev` applied the Phase 6.5 migration but did not regenerate the
  client; the new model remained undefined until generation ran explicitly.
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
| 6.7 | Prod deploy | VPS + domain + TLS + R2/OAuth credentials; deploy bundle is ready | external job succeeds |
| 6.8 / 8.9 | Stopwatch | a real person timed | <60 s customer / <5 min provider |

**R2 note:** the owner provided the bucket URL
`https://bebf9beabde1bbe7d8c8601aabdbdb6e.r2.cloudflarestorage.com/nodera`.
That gives account ID + endpoint + bucket (all set in `.env`). It is **not** a
credential — R2 still needs an API token's Access Key ID + Secret
(Cloudflare → R2 → Manage R2 API Tokens → Object Read & Write on `nodera`).
