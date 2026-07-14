# Nodera Rebuild Blueprint (v2)

This replaces the original handoff notes as the source of truth. It keeps everything from v1 that was good, folds in every decision made during the replanning conversation, and reorders the build so the fixes are baked in from the first migration instead of retrofitted.

## 1. What Nodera is (locked definition)

Nodera is serverless AI inference for workflow and automation builders, powered by independent provider hardware.

A customer's workflow hits an AI step, submits a job to Nodera's API with a model chosen from Nodera's curated menu, and pays per job — never per GPU-hour, never thinking about hardware. Customization happens at the prompt level: businesses bring their own system prompts, instructions, and examples inside the job input, while the model weights themselves are standardized across all providers.

On the other side, providers install a dead-simple agent ("big green Start Earning button" is the long-term bar), which pre-downloads the menu models and executes jobs inside approved Docker worker containers.

Positioning in one line: **Replicate, but powered by community hardware and built for workflow builders.**

Nodera is a standalone, self-serve product. The MVP is done when a stranger can sign up, get an API key, integrate from the public docs alone, and get real AI output back through a provider machine that isn't yours — end to end, reliably, without ever talking to you.

## 2. What changed from the v1 notes

These are decisions, not suggestions. They were all agreed during replanning:

1. **Prisma is the database layer.** No raw pg, no mixing. Schema and migrations live in `packages/db`.
2. **Runs get a real `assigned` status.** The old "status=running with startedAt=null means assigned" hack is dead. Fresh schema, honest enum.
3. **Model menu instead of free-form job types.** Jobs reference a model slug from a `models` table. Providers pre-pull menu models at install. No custom weights in v1.
4. **Metering from day one.** Every run records usage (tokens in/out, images, duration, model). Billing is deferred; measurement is not.
5. **Idempotency keys on job creation.** Workflow engines retry HTTP calls. `Idempotency-Key` header, unique per workspace, returns the original job on replay.
6. **Webhook signing + SSRF guard.** HMAC signature header with a per-workspace secret; block private/internal IP ranges on delivery.
7. **`pending/` upload prefix in R2.** Providers upload to `pending/...`; an accepted report copies to the permanent key; lifecycle rules only ever delete stale `pending/` objects. Referenced customer data is never at risk from a lifecycle policy.
8. **Execution deadlines from day one.** Every model has a max runtime. The run gets `deadline_at`, the provider agent kills overrunning containers, and the dispatcher expires runs past deadline even when the provider is still heartbeating. This closes the hung-worker hole the v1 notes flagged.
9. **Workspace tenant model in the first migration.** workspace → API keys → jobs → artifacts. Every customer endpoint is workspace-scoped from the start.
10. **Schema supports multiple runs per job compared against each other.** This is the hook for future output verification / anti-cheating. Not built in v1, but never blocked by the schema.
11. **A `tier` column on jobs and a `trust_tier` on providers.** Only one tier is active in v1, but reliability tiers ("best effort" vs "priority") are the future pricing model, so the columns exist now.
12. **Git remote from the very first commit.** Push at the end of every session. Corruption can never again cost more than a day.

## 3. Architecture (unchanged shape, five pieces)

- **Control plane** — `apps/web`, Next.js App Router. Auth, job CRUD, provider registration/heartbeat/poll/report, artifact authorization, webhook creation, DB access. Never executes jobs.
- **Dispatcher** — `apps/dispatcher`, standalone long-running Node service. Assigns queued jobs to compatible providers, enforces deadlines and retries, drives webhook delivery. Never inside a serverless route.
- **Provider agent** — `apps/provider-agent`, standalone Node app on the provider's machine. Registers, heartbeats, polls for its own assigned runs, runs Docker workers, uploads artifacts, reports results. Long-term this becomes the consumer desktop app, so design it for auto-register, auto-update, and graceful pause/resume from the start even if v1 is still a terminal app.
- **Workers** — `workers/llm-worker` (Ollama-backed) and `workers/image-worker` (Diffusers/SDXL). One image per modality; the model slug is passed in the input.
- **Storage** — `packages/storage`, local backend for dev, R2 for production, presigned direct uploads for large artifacts.

Repo layout carries over from the v1 notes (`apps/`, `workers/`, `packages/shared`, `packages/db`, `packages/storage`, `docs/`).

## 4. The model menu

A `models` table is the product catalog:

| field | notes |
|---|---|
| slug | e.g. `llama-3.1-8b`, `sdxl-1.0` — what jobs reference |
| modality | `llm` or `image` |
| worker_image | `nodera/llm-worker`, `nodera/image-worker` |
| runtime_ref | e.g. Ollama model tag or HF model id the worker loads |
| min_vram_gb | drives capability matching |
| max_runtime_s | drives run deadlines |
| active | menu on/off switch |

V1 menu, decided now so nothing blocks Phase 3: **`llama-3.1-8b`** (via Ollama) for text and **`sdxl-1.0`** (via Diffusers) for images. Both fit comfortably on consumer gaming GPUs, both are proven defaults. Expand the menu only after real users ask for something specific.

Provider agents read the menu at registration and pre-pull the required weights. Capability matching becomes: provider advertises which model slugs it has ready + its VRAM + concurrency.

## 5. Database schema (first migration, Prisma)

- **workspaces**: id, name, webhook_secret, created_at
- **api_keys**: id, workspace_id, key_hash, label, created_at, revoked_at
- **providers**: id, name, token_hash, status, trust_tier, concurrency, capabilities (JSONB: model slugs, gpu model, vram_gb), last_heartbeat_at, created_at
- **models**: as in section 4
- **jobs**: id, workspace_id, model_slug, tier, input (JSONB), status (`queued | assigned | running | succeeded | failed | canceled`), attempts, max_attempts (default 3), idempotency_key (unique with workspace_id, nullable), webhook_url, created_at, finalized_at
- **runs**: id, job_id, provider_id, attempt, status (`assigned | running | succeeded | failed | expired`), assigned_at, started_at, ended_at, deadline_at, exit_code, error, usage (JSONB: tokens_in, tokens_out, images, duration_ms, model_slug)
- **artifacts**: id, run_id, name (sanitized), mime, size_bytes, backend (`local | r2`), object_key, inline (bool)
- **webhook_deliveries**: id, job_id, url, status (`pending | delivering | succeeded | failed`), attempts, next_attempt_at, last_error, created_at

Notes: jobs never point at artifacts directly — artifacts belong to runs, and job output references the winning run (unchanged from v1). The unique index on (workspace_id, idempotency_key) is what makes replays safe.

## 6. Job and run lifecycle

Job: `queued → assigned → running → succeeded | failed` (plus `canceled` reserved).

Run: `assigned → running → succeeded | failed | expired`.

Rules carried over and tightened:

- Dispatcher assigns in a transaction: job `queued→assigned`, attempts+1, run created with status `assigned`.
- Provider poll returns only that provider's `assigned` runs. Claim is atomic: `UPDATE runs SET status='running', started_at=NOW(), deadline_at=NOW() + model.max_runtime_s WHERE id=? AND provider_id=? AND status='assigned' RETURNING *`. Job goes `running`.
- Provider agent enforces its own kill timer at max_runtime and force-removes the container.
- Dispatcher expires any running run past `deadline_at` regardless of heartbeats, and fails runs whose provider goes offline (no heartbeat for PROVIDER_OFFLINE_AFTER_MS). Expired/failed runs requeue the job until max_attempts, then the job fails.
- Reports are idempotent: same final report again → 200 no-op; conflicting final state → 409.
- No job is ever discarded because capacity is full; the queue drains oldest-first per compatible provider slot.

## 7. Public API surface

Customer (auth: `x-api-key`):

- `POST /v1/jobs` (accepts `Idempotency-Key` header)
- `GET /v1/jobs`
- `GET /v1/jobs/:id`
- `GET /v1/jobs/:id/artifacts/:name` (streams, never buffers whole file)
- `GET /v1/models` (the public menu — new, tiny, makes the playground and docs work)

Provider (auth: `x-provider-token`; identity always derived from token, never from body):

- `POST /v1/providers/register` (guarded by PROVIDER_ENROLL_SECRET)
- `POST /v1/providers/heartbeat`
- `POST /v1/providers/poll`
- `POST /v1/providers/report`
- `POST /v1/providers/artifacts/upload-url`

Dispatcher talks to Postgres directly; no public surface.

## 8. Worker contract (v2)

Mount: job working dir → `/job`.

Input: `/job/input.json` — includes model slug, prompt/params, and job metadata.

Outputs:
- `/job/out/logs.txt`
- `/job/out/meta.json` — must include a `usage` block: `{ tokens_in, tokens_out, images, duration_ms, model_slug }` (zeros where not applicable)
- LLM: `/job/out/result.json`
- Image: `/job/out/output.png` + `/job/out/result.json`

The provider agent maps model slug → worker image via the menu, not via hardcoded job types.

## 9. Artifacts and storage

- Inline threshold: `INLINE_ARTIFACT_MAX_BYTES=262144` (256 KB) as base64 in the report.
- Limits: `MAX_ARTIFACTS_PER_RUN=10`, `MAX_ARTIFACT_TOTAL_BYTES=52428800` (50 MB).
- Large flow: provider requests upload URL (body: run_id, name, mime, size_bytes only) → control plane verifies run ownership → derives key `pending/jobs/<jobId>/runs/<runId>/<sanitizedName>` → returns presigned PUT (TTL `R2_UPLOAD_URL_TTL_S=300`, content-type signed) → provider PUTs → report metadata → control plane HEADs the object (retries at 100ms/300ms, then 400), verifies ContentLength == size_bytes → **copies to permanent key `jobs/<jobId>/runs/<runId>/<name>`** → finalizes.
- R2 lifecycle rule deletes `pending/*` older than ~2 days. Permanent keys are only ever deleted by explicit retention policy (document a customer-facing retention period; never silently delete referenced data).
- Providers never hold long-lived R2 credentials. Presigned URLs are short-lived and key-scoped but not guaranteed single-use — never describe them as single-use.
- Storage abstraction: `putBuffer`, `headObject`, `getReadStream`, `copyObject` (new, for pending→permanent), backends `local | r2` via `STORAGE_BACKEND`.

## 10. Webhooks

- Final job state → create `webhook_deliveries` row; dispatcher loop delivers async.
- Retries: `WEBHOOK_MAX_ATTEMPTS=5`, backoff `60,300,900,3600,21600` seconds, timeout 10s, batch 10 per tick.
- **Signing**: `X-Nodera-Signature: sha256=HMAC(workspace.webhook_secret, raw_body)` plus a timestamp header to prevent replay. Document verification snippet for customers.
- **SSRF guard**: resolve the webhook host and refuse private/loopback/link-local ranges before sending.
- Webhook failure never changes job status; `GET /v1/jobs/:id` is always the fallback.
- Local harness carries over: `webhook-receiver.js`, `npm run webhook:listen`, `WEBHOOK_PORT=8787`, `WEBHOOK_FAILS_BEFORE_SUCCESS=2` to exercise retries.

## 11. Docker / provider security baseline (v1)

Only Nodera-controlled worker images, structured inputs, no arbitrary customer containers or shell commands. For every job container: no `--privileged`, no docker.sock mount, mount only the job dir, non-root user, dropped capabilities, CPU/RAM limits, no or restricted network (Ollama needs local access to the model server — scope it), execution timeout, working-dir cleanup. Image allowlist enforced by the agent. gVisor/Kata/Firecracker are future work, only needed if arbitrary code ever ships.

For local multi-provider testing, run multiple agent processes on the host with distinct NODE_NAME/PROVIDER_TOKEN values — do not Dockerize agents and mount the Docker socket.

**Open flag for later**: real providers are gamers on Windows, and Docker Desktop is heavy friction for non-technical users. V1 develops on Linux/WSL; the consumer provider app may eventually need a non-Docker execution path (e.g., bundled Ollama) on Windows. Don't solve now, don't forget.

## 12. Environment defaults (carried over + new)

```
DISPATCH_INTERVAL_MS=1000
PROVIDER_OFFLINE_AFTER_MS=120000
JOB_MAX_ATTEMPTS=3
INLINE_ARTIFACT_MAX_BYTES=262144
MAX_ARTIFACTS_PER_RUN=10
MAX_ARTIFACT_TOTAL_BYTES=52428800
WEBHOOK_MAX_ATTEMPTS=5
WEBHOOK_BACKOFF_S=60,300,900,3600,21600
WEBHOOK_TIMEOUT_MS=10000
WEBHOOK_BATCH_SIZE=10
WEBHOOK_PORT=8787
STORAGE_BACKEND=local|r2
STORAGE_ROOT=storage
R2_ACCOUNT_ID / R2_BUCKET / R2_ACCESS_KEY_ID / R2_SECRET_ACCESS_KEY / R2_ENDPOINT / R2_REGION=auto
R2_UPLOAD_URL_TTL_S=300
PROVIDER_ENROLL_SECRET=...
```

`RUN_STALE_AFTER_MS` is replaced by per-run `deadline_at` derived from the model's `max_runtime_s`.

## 13. Build phases

Each phase has a "done when" gate. Do not start the next phase before the gate passes.

**Phase 0 — Foundation.** Monorepo scaffold, git remote + first push, docker-compose (Postgres), Prisma schema with the full section-5 tables, seed script (one workspace, one API key, the two menu models). Done when: `prisma migrate dev` runs clean and the seed exists.

**Phase 1 — Core API with fake execution.** Job create/get with idempotency, provider register/heartbeat/poll/report, atomic claim, a fake in-process "provider" that reports dummy success. Done when: POST a job → it reaches `succeeded` with a run, usage recorded, duplicate POST with same Idempotency-Key returns the same job, duplicate report is a no-op.

**Phase 2 — Dispatcher, retries, deadlines.** Standalone dispatcher loop, capability/concurrency matching, requeue on provider-offline and on deadline expiry, attempt limits. Done when: two provider agents (fake execution) with concurrency 1 drain 20 jobs — only 2 concurrent, distributed across both, no double-claims; killing one agent mid-job requeues the job to the other with attempts incremented; a deliberately never-finishing run expires at deadline and retries.

**Phase 3 — Docker execution + real LLM.** Worker contract, provider agent runs containers, agent-side kill timer, metering captured from meta.json. Build the Ollama-backed LLM worker for real (it's the easier real model) and keep the image worker as a stub. Done when: a real prompt through a real model returns real text end to end, and a worker forced to hang is killed at max runtime and retried.

**Phase 4 — Artifacts + R2.** Storage abstraction, presigned upload endpoint, pending→permanent copy, HEAD verification, streaming download route, local backend regression tests, R2 smoke test. Done when: a >256KB artifact goes provider→R2→customer download without ever passing through the control plane's memory in full, and orphaned pending objects are demonstrably separable from permanent ones.

**Phase 5 — Webhooks.** Delivery queue, backoff, HMAC signing, SSRF guard, local receiver harness proving fail-twice-then-succeed. Done when: a job completion produces a signed webhook that survives two induced failures and the signature verifies with the documented snippet.

**Phase 6 — Real image model + public readiness.** SDXL worker for real. Then everything that makes Nodera usable by strangers: one-click OAuth signup (Google, optionally GitHub — no email-verification dance) that **auto-provisions** a workspace and a first API key and lands the new user directly in the playground with a prompt pre-filled, a minimal account page to view/create/revoke API keys and recent jobs, public docs (quickstart + per-endpoint curl examples + webhook verification snippet), per-key rate limiting and input size limits (max prompt bytes, max jobs per minute — pick conservative numbers), and production deployment (VPS or similar for control plane + dispatcher + Postgres, R2 live, real domain + TLS). Done when: a brand-new user gets from the landing page to a completed AI result in **under 60 seconds** (time it for real), completes an API job using only the docs, and a key hammering the API gets throttled, not a crashed queue.

**Phase 7 — Customer front end (the web app).** The full customer web experience, built on the same public API (no private backdoor routes — if the UI feels slow or clunky, the API is slow or clunky, and you fix it there). Pages: a **model gallery** (each menu model with a plain-language description, an input form generated from its params, and a Run button — the playground grows into this), a **jobs dashboard** (live statuses, newest first), a **job detail page** (input shown, output rendered properly — text displayed as text, images displayed as images — artifact downloads, plain-language errors, a re-run button), a **code snippet generator** (after any UI run, show the exact curl and Node.js code for that same job — this is the bridge that converts UI users into API users), an **API keys page**, and a **usage page** driven by the metering data. UX standards for every page: human-readable statuses ("Waiting for an available machine…" alongside `queued`), loading and empty states everywhere, errors in sentences not stack traces, and it works on a phone. Done when: a non-developer can sign up, run both models from the browser, view and download their results, and copy the code snippet to automate it — without ever opening the docs.

**Phase 8 — Provider experience + observability.** Turn the agent toward the consumer product. Onboarding: one-command install (`npx nodera-provider` or a single installer script) that auto-detects GPU model and VRAM (never ask a human what the machine can answer), then **device-link claim codes** instead of token copy-paste — the agent prints "go to nodera.com/link and enter 7F3-K2M", the provider enters it while signed in, and the agent receives its token automatically (TV-app activation flow; the enrollment secret becomes an internal detail, not a user-facing step). Menu models pre-pull in the background with visible progress while registration is already done. Plus: pause/resume, basic earnings/usage display (from metering), auto-update. Add a status view: queue depth, providers online, median wait. Manual approval of the first 10 providers happens on the website side — approval friction lives with you, never in the installer. Done when: a non-technical friend goes from "decided to try it" to registered-and-pulling-models in **under 5 minutes** without you touching their machine.

## 14. Explicitly NOT in v1

Billing execution and payments (metering only), provider payouts, the 80/20 split mechanics, marketplace bidding or dynamic pricing, trust/reputation scoring (column reserved), output verification/canary jobs (schema-ready only), custom/fine-tuned model uploads, streaming token responses or chat-style latency, warm worker pools (Ollama's in-memory model cache is the v1 mitigation), geographic routing, priority queues beyond the reserved tier column, hosting/DB/storage products, consumer image-generation website, marketing site before Phase 6.

## 15. Building-with-AI playbook

This project is being built with AI coding assistants. AI's failure mode is not bad code — it is drift: unrequested refactors, swapped libraries, invented endpoints, and silent breakage discovered three tasks later. These rules are the defense. They are not optional.

### Repo-resident specs

- This blueprint lives at `docs/BLUEPRINT.md`. It is the source of truth. Every AI session starts by reading it (or the relevant section).
- A rules file at the repo root (`CLAUDE.md` / `AGENTS.md`) that the AI reads every session. Contents:
  1. JavaScript only. Never introduce TypeScript, .ts files, or type annotations.
  2. Prisma is the only database layer. Never write raw SQL outside Prisma, never edit an already-applied migration — create a new one.
  3. No new dependencies without explicitly asking first.
  4. The only public `/v1` API endpoints are the ones in blueprint section 7. The dashboard calls those same endpoints (session-authed wrapper is fine); never invent parallel backdoor routes that duplicate API logic.
  5. All API errors use the shape `{ "error": { "code": "...", "message": "..." } }`.
  6. UI work follows the shared components and styles already in `apps/web` — no new UI libraries, fonts, or one-off styles per page. Every page has loading, empty, and error states.
  7. Provider identity always comes from the token; never from a request body. API keys and provider tokens are stored hashed. Secrets are never logged.
  8. Every task ends with `npm run smoke` passing and a git commit.
  9. When the blueprint and an idea conflict, follow the blueprint and flag the conflict — do not silently improvise.
- `docs/api.md` defines every endpoint with a request/response example **before** it is implemented, so the control plane, agent, and dispatcher are written against the same contract.

### Task discipline

- One task per session: one endpoint, one loop, one worker. Each task has written acceptance criteria taken from the phase's "done when" gate.
- Never ask the AI to "build Phase 2." Ask it to "implement the atomic run claim per blueprint section 6, then write the double-claim test."
- Sequential phases. Do not scaffold everything at once, even when the AI offers to.

### Testing strategy (the safety net)

- `scripts/smoke.js`, built in Phase 1 and run after every change forever: boots against the dev stack, submits a job, drives a fake provider, asserts the full lifecycle (queued → assigned → running → succeeded), asserts usage was recorded.
- Integration tests written **with** the feature, not after, for the five highest-risk behaviors:
  1. Atomic claim — two concurrent claims on one run produce exactly one winner.
  2. Idempotency — replaying POST /v1/jobs with the same Idempotency-Key returns the original job, creates nothing.
  3. Duplicate report — same final report twice → 200 no-op; conflicting final state → 409.
  4. Deadline expiry — a never-finishing run expires and the job requeues with attempts+1.
  5. Webhook signature — the documented verification snippet validates a real delivery.
- Rule of thumb: if the AI wrote a behavior the smoke test can't see, the AI also writes the test that can.

### Verification loop and git discipline

- After every AI change: run migrations, run smoke, skim the diff. Look specifically for: deleted code, changed dependencies, schema/migration edits, new files you didn't ask for.
- Commit per task with a message referencing the blueprint section. Push every session. Never allow a force-push.
- Never stack a second unverified change on top of a first.

## 16. Developer experience / user-friendliness checklist

What "very user friendly" means for each audience, and where it's covered:

- **Non-developer customers (the web app is their product):** sign up, browse the model gallery, run a model from a form, watch live status, see and download output, re-run — all in the browser, never touching the docs (Phase 7). Human-readable statuses, plain-language errors, mobile-friendly.
- **Customer developers (Stripe-easy):** self-serve signup and API key management (Phase 6), the code snippet generator that turns any UI run into working curl/Node code (Phase 7), consistent error shape (section 15 rules), public docs with a quickstart and a copy-paste curl example per endpoint, `GET /v1/models` so the menu is discoverable, webhook signature verification snippet in the docs, `GET /v1/jobs/:id` polling as the documented fallback, rate-limit responses that say the limit and when to retry (429 + Retry-After).
- **Providers (miner-easy):** guided setup and auto model pre-pull (Phase 8), pause/resume, earnings/usage display from metering, personally onboarded first 10 providers, status view showing the network is alive.
- **You, the builder:** `docker-compose up` gives Postgres; one command (`npm run dev:all`) boots control plane + dispatcher + a dev provider agent; `.env.example` is always current; seed script creates a workspace, API key, and menu models; `npm run smoke` proves the world still works; `docs/RUNBOOK.md` records how to run and reset everything so no knowledge lives only in your head.

## 17. Onboarding flows (the speed advantage)

Nodera's positioning against big cloud is time-to-first-result. These flows are product requirements with hard targets, and the step counts are budgets: a change that adds a step to either flow needs a written reason.

**Customer flow — target under 60 seconds, 3 steps:**

1. Click "Sign in with Google" on the landing page.
2. Land in the playground — workspace and first API key already auto-provisioned, a model pre-selected, a prompt pre-filled.
3. Press Run. Watch live status. See the result.

No email verification wall, no credit card, no workspace-creation form, no "generate your first key" screen, no region or instance selection. The API key exists before the user knows to ask for it; the snippet generator (Phase 7) shows it in copy-paste code the moment they want to automate.

**Provider flow — target under 5 minutes, 3 steps (plus background model download):**

1. Run one install command (or one installer).
2. Agent auto-detects GPU/VRAM and prints a claim code; provider enters it at nodera.com/link while signed in.
3. Agent is registered and starts pre-pulling menu models in the background with visible progress; jobs begin flowing when models are ready.

No token copy-paste, no config file editing, no hardware questionnaire. Docker and GPU drivers remain the honest prerequisites in v1 (checked and explained clearly by the installer, with links) — eliminating them is the Windows/native-runtime question already flagged in section 11.

**Measure it:** record signup→first-succeeded-job time per new workspace, and install→registered time per provider. If the median creeps up, onboarding regressed — treat it like a failing test.

## 18. Open questions to answer along the way

1. Where the first customers come from — with no built-in integration partner, plan this deliberately: workflow-automation communities (n8n, Make, Zapier users), indie hacker channels, or a published n8n community node once the API is stable. Decide before Phase 6 ships so launch isn't to an empty room.
2. Where the control plane + dispatcher run in production (any small VPS works for v1).
3. Customer-facing artifact retention period (pick a number, document it — e.g. 30 days).
4. Windows provider strategy (section 11 flag) — decide when Phase 7 starts.
5. Free tier vs. invite-only at launch — strangers + free GPU compute attracts abuse; a small free quota or manual approval of early signups is the cheap defense until billing exists.
