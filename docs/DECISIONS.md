# Nodera Decision Log

Why things are the way they are. Newest at the bottom. Format: number, date, decision, reason. Add an entry whenever a meaningful choice is made or reversed — especially before overriding anything below. AI assistants: if you think a decision here is wrong, say so and wait; never silently contradict it.

**001 — 2026-07-10 — JavaScript, not TypeScript.** Founder preference and consistency across the whole monorepo; reduces AI drift toward mixed codebases.

**002 — 2026-07-10 — Prisma is the only database layer.** The v1 notes were ambiguous between raw `pg` and Prisma; rebuilding from zero, one schema + migrations in one place wins. No raw SQL.

**003 — 2026-07-10 — Runs have a real `assigned` status.** Replaces the old "running with startedAt=null means assigned" hack. Fresh schema makes honesty free.

**004 — 2026-07-10 — Curated model menu; no custom weights in v1.** Jobs reference a `models` table slug. Providers pre-pull menu models. Customer differentiation lives in prompts, not weights. Custom/fine-tuned models are a future trusted-tier feature.

**005 — 2026-07-10 — V1 menu: `llama-3.1-8b` (Ollama) and `sdxl-1.0` (Diffusers).** Both fit consumer GPUs; proven defaults. Expand only on real user demand.

**006 — 2026-07-10 — Metering recorded from day one; billing deferred.** Every run stores tokens/images/duration/model. Pricing and payouts are impossible to retrofit without this.

**007 — 2026-07-10 — Idempotency-Key on job creation.** Workflow engines retry HTTP; duplicate jobs (later: duplicate charges) are unacceptable. Unique per workspace; replay returns the original job.

**008 — 2026-07-10 — Webhooks are HMAC-signed and SSRF-guarded.** Receivers must be able to verify authenticity; Nodera must not be usable to probe private networks.

**009 — 2026-07-10 — Provider uploads land in `pending/`, promoted on accepted report.** Lifecycle cleanup can then only ever delete unpromoted objects; referenced customer artifacts are never at risk.

**010 — 2026-07-10 — Per-run execution deadlines replace the stale-run rule.** `deadline_at` = started_at + model max runtime; agent kills at the limit; dispatcher expires past-deadline runs even when the provider still heartbeats. Closes the hung-worker hole.

**011 — 2026-07-10 — Workspace tenancy in the first migration.** workspace → API keys → jobs → artifacts; every customer route scoped from day one.

**012 — 2026-07-10 — Schema allows multiple comparable runs per job.** Reserved hook for future output verification / anti-cheating (canary jobs, cross-provider comparison). Not built in v1.

**013 — 2026-07-10 — `tier` (jobs) and `trust_tier` (providers) columns reserved.** Future reliability tiers are the intended pricing model; only one tier active in v1.

**014 — 2026-07-10 — Nodera is a standalone self-serve product.** The planned integration with a partner workflow platform was removed. MVP bar: a stranger onboards and succeeds using only the public docs/UI.

**015 — 2026-07-10 — Positioning: pay-per-job serverless inference; onboarding speed is the wedge.** "Faster than AWS" always means setup speed, never per-request latency. Marketing claim: first result in 60 seconds, no credit card, no quotas.

**016 — 2026-07-10 — Onboarding step budgets: customer 3 steps / under 60s; provider 3 steps / under 5 min.** One-click OAuth with auto-provisioned workspace + API key; device-link claim codes instead of token copy-paste. Any added step requires a written reason here.

**017 — 2026-07-10 — The dashboard consumes the public API.** No parallel backdoor routes. If the UI feels bad, the API gets fixed.

**018 — 2026-07-10 — Only Nodera-approved worker images in v1.** No arbitrary customer containers, code, or shell commands. Container hardening per blueprint §11; stronger sandboxing (gVisor/Kata/Firecracker) only if arbitrary code ever ships.

**019 — 2026-07-10 — Launch is abuse-limited.** OAuth signup plus conservative per-key rate limits and input caps; invite-only or small quotas until billing exists. Anonymous free GPU compute is an abuse magnet.

**020 — 2026-07-10 — Image generation and batch LLM work are the target workloads; interactive chat is not.** The queue→assign→container architecture suits async jobs; streaming/chat latency is a different product and out of scope.

**021 — 2026-07-10 — Doc set is capped at eight.** VISION, SCOPE, BLUEPRINT, USER-STORIES, api.md, TASKS, DECISIONS, AGENTS (+ pointer CLAUDE.md, + RUNBOOK written during Phase 0–1 as commands stabilize). No duplicate-topic docs; duplication drifts and poisons AI context.

**022 — 2026-07-14 — Dev Postgres maps host port 5433.** The primary dev machine runs a native PostgreSQL on 5432; the compose container binds 5433 to avoid the conflict. `.env.example` DATABASE_URL points at 5433. Container-internal port stays 5432.

**023 — 2026-07-14 — Phase 9 (production hardening + scale proof) added to TASKS.md.** v1 gates prove functional correctness but nothing about behavior under load. Phase 9 adds a load harness, burst/soak/chaos/rate-limit/webhook-backlog/artifact-stress tests, a scripted security audit, and RUNBOOK-driven ops readiness. Production-ready = Gate 8 + Gate 9. Owner-authorized deviations recorded here: docs were MOVED (not copied) into docs/ for task 0.5 to keep a single source per 021, and multi-task AI sessions are authorized for this build effort while retaining one-task-one-commit discipline.

**024 — 2026-07-14 — Prisma 7 toolchain: prisma-client-js generator + @prisma/adapter-pg.** Prisma 7 removed schema-file datasource URLs and requires a driver adapter at runtime; @prisma/adapter-pg is the official Postgres adapter and counts as part of the approved Prisma dependency, not a new one. The classic `prisma-client-js` generator is used because the new `prisma-client` generator emits TypeScript (violates rule 1). Connection config lives in prisma.config.js (root), which also loads .env for CLI commands. Models table carries `description` and `params` columns beyond blueprint §4's list because docs/api.md GET /v1/models returns them and task 1.4 requires params to live in the DB as the single validation source.

**025 — 2026-07-14 — v1 agent gets its model mapping from the shared menu module, not the network.** docs/api.md's GET /v1/models is customer-authed and omits worker_image/runtime_ref, so providers have no contract channel for menu discovery. Rather than widen the contract (rule 4), the dev agent reads slug→worker_image/runtime_ref from @nodera/shared menu.js — the same single source the seed uses. Networked menu delivery becomes part of the Phase 8 claim-code/link flow, where the contract already reserves room.

**027 — 2026-07-15 — Auth is hand-rolled: Google OAuth2 code flow + signed-cookie sessions, no auth library.** Next 16 is very new and next-auth's compatibility is unproven; the OAuth2 authorization-code flow is a well-defined HTTP exchange we implement directly with fetch, and sessions are a signed (HMAC/SESSION_SECRET) cookie carrying userId+workspaceId — no session table, no new dependency. A `users` table (email→workspace) was added by migration. The `/v1` customer auth resolver (`requireWorkspace`) accepts EITHER x-api-key OR the session cookie — the same endpoints, session-authed (rule 4 / DECISIONS 017), never a parallel route. A dev-login route (non-production) provisions/reuses a workspace without Google so the flow is testable; live Google needs only OAuth client credentials.

**026 — 2026-07-14 — Gate 4 passed with a documented exception.** Every Gate 4 behavior (upload-url, presigned PUT, HEAD verify, size check, pending→permanent promotion, >5MB streaming download, tenancy 404s) is implemented and test-green on the local backend, and the >256KB provider→storage→customer flow is demonstrated end-to-end. The only unmet criterion is running the same suite against a live R2 bucket, which needs credentials only the owner can create (LAUNCH-CHECKLIST §1; `npm run smoke:r2` is ready). Per the owner's build authorization, a gate may pass when every unmet criterion is an unavailable external resource.

**028 — 2026-07-17 — API key management is session-only and reveals plaintext once.** `docs/api.md` intentionally has no public key-management endpoints, so the dashboard manages keys under `/api/account/*` using the signed-in workspace rather than extending `/v1` or allowing API keys to manage other keys. Creation stores only the generated hash and returns plaintext in that single response; list and revoke return metadata only. Recent account activity still comes from session-authenticated `GET /v1/jobs`, preserving decision 017. Future snippets must use an environment variable populated from a reveal-once key instead of relying on persisted plaintext.

**029 — 2026-07-17 — Job creation uses Postgres-backed fixed-window limits.** `POST /v1/jobs` defaults to 60 authenticated requests per minute per API key, while dashboard traffic is keyed by workspace session; both limits are configurable through `RATE_LIMIT_JOBS_PER_MIN`. Counters use IDs, never credentials, and an atomic Prisma upsert so multiple control-plane instances share one source of truth without Redis or a new dependency. Every authenticated attempt counts, including invalid and idempotent requests, so malformed traffic cannot bypass protection. Expired windows are pruned opportunistically. Job JSON is streamed through a 65,536-byte hard cap (`MAX_JOB_REQUEST_BYTES`) before parsing, while model menu `max_bytes` values remain the stricter prompt-specific limits.

**030 — 2026-07-17 — Public API docs use structured, executable examples.** The public `/docs` page and its fresh-key integration test share one JavaScript endpoint reference so commands cannot drift independently. The page covers every customer and provider endpoint in `docs/api.md`, switches between local/production base URLs and Bash/PowerShell syntax, and reproduces the documented webhook verification code exactly. No webhook-secret endpoint was invented: the contract defines the workspace signing secret but does not expose a delivery mechanism, so a session-only account flow remains an explicit follow-up in `docs/REMAINING-TASKS.md`.

**031 — 2026-07-17 — Production deployment is a vendor-neutral, fail-fast Compose bundle.** A single multi-target Dockerfile builds a standalone web image, a minimal dispatcher image, and a one-shot Prisma migration image; Compose owns private Postgres, migration/health ordering, bounded logs, loopback-only web binding, and service hardening. Production startup validates HTTPS origins, R2 mode, database credentials, OAuth configuration, and non-placeholder secrets before serving. Runtime images remain non-root and exclude unrelated workspace dependencies. The bundle is locally proven from an empty isolated volume, while Phase 6.7 remains `[~]` until owner-supplied hosting, domain/TLS, live credentials, and an external job satisfy the contract acceptance test.

**032 — 2026-07-17 — Customer onboarding time is derived, not stored twice.** The Phase 6.8 report uses Prisma to select the earliest `users.created_at` and earliest finalized succeeded job per workspace, then computes the strict under-60-second result at read time. No metric column or migration was added because the authoritative timestamps already exist. The operations report exposes workspace IDs and timing only, never emails, names, prompts, or credentials; exactly 60 seconds does not pass an "under 60" claim. Automated/dev timings validate instrumentation but cannot replace the required unassisted real-person stopwatch.

**033 — 2026-07-17 — Model gallery and playground share one schema-driven composer.** Phase 7.1 keeps `/models` on the public `/v1/models` contract instead of adding a gallery-specific route or slug-specific UI. A small client helper derives labels, defaults, required-field ordering, validation, and typed job input from each model's `params`; both `/playground` and `/models` use the same `JobComposer`. This preserves the dashboard-uses-public-API rule and lets an active DB model appear as a working card/form without a frontend code change.

**034 — 2026-07-17 — Jobs dashboard polls the public jobs list and shares its compact view.** Phase 7.2 uses session-authenticated `GET /v1/jobs` on a short client interval instead of adding websocket infrastructure, a dashboard-only endpoint, or Prisma-backed page data. The list response already carries the contract fields needed for the dashboard: status, model, created_at, finalized_at, and newest-first pagination. The account page reuses the same compact component so recent jobs and the full dashboard cannot drift.

**035 — 2026-07-18 — Job detail exposes original input through the public detail contract.** Phase 7.3 requires the dashboard detail page to show input and let users retry/re-run the same job, while DECISIONS 017 forbids dashboard-only backdoors. `GET /v1/jobs/:id` now returns same-workspace `input`, documented in `docs/api.md`, with existing workspace auth and 404 tenancy behavior. No secret or prompt logging was added.
