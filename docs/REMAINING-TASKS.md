# Nodera — Remaining Work (leftover phases)

_Handoff companion to `docs/HANDOFF-STATUS.md`. Updated 2026-07-17._

Everything left to reach v1 "production-ready" (Gate 8 + Gate 9). Work in
order, one task per commit, tests + `npm run smoke` green before each commit,
tick the box in `docs/TASKS.md`. Items marked **[~] blocked-on-human** should be
built as far as possible and the live step recorded in
`docs/LAUNCH-CHECKLIST.md` — never faked.

The `docs/TASKS.md` acceptance criteria are the contract; this file adds the
plan, the gotchas, and where the code goes.

---

## Phase 6 — remainder (public readiness)

All buildable Phase 6 work is implemented. Live SDXL remains grouped with the
Phase 6.1 hardware block; 6.7 awaits external infrastructure, and 6.8 awaits an
unassisted real-person stopwatch. The next buildable task is 7.1.

### 6.7 Production deploy — **[~] blocked-on-human**
- Complete in repo: fail-fast production env validation; standalone web,
  dispatcher, and one-shot migration images; private Postgres; migration and
  health gates; non-root/capability-dropped services; bounded logs; production
  env template; deployment runbook and automated Compose validation.
- Verified locally: clean Postgres volume → all migrations → healthy web and
  dispatcher; `/docs` returned 200. The production stack uses an isolated
  Compose project and never shares the dev database volume.
- Still external: VPS, domain/TLS reverse proxy, live R2 and OAuth credentials,
  internet-connected provider, and the acceptance job from an external key.
  Exact owner steps are in `docs/LAUNCH-CHECKLIST.md` §4.

### 6.8 Stopwatch — **[~] blocked-on-human**
- Complete in repo: `npm run --silent onboarding:report` derives the earliest
  `users.created_at` → earliest succeeded `jobs.finalized_at` per workspace,
  reports strict under-60 results and aggregate median/counts, and emits no
  emails, prompts, or credentials. Failed jobs and later successes are ignored.
- Verified: integration coverage proves multi-user workspaces, pending users,
  and the exact 60-second boundary. The current dev workspace measures 35.298s,
  but that is not an unassisted human acceptance run.
- Still human: have a real new user complete signup → first succeeded job
  without coaching, then verify the report row is under 60 seconds. Exact steps
  are in `docs/LAUNCH-CHECKLIST.md` §5.

**GATE 6:** Scope success criteria 1 & 2 pass; throttling holds. (Criteria 1
[<60 s] and the production bits depend on 6.7/6.8 human steps.)

---

## Phase 7 — Customer front end (the web app)

Wire the **existing `apps/web/src/components/NoderaApp.js` mock** to the real
/v1 API. Do NOT rebuild it — split it into components/routes, keep its styles
and interaction patterns, replace simulated state with real calls (reuse
`src/components/ui.js` and `src/lib/client/api.js` started in 6.3). Delete
simulation code per screen as it goes live. Every page needs loading/empty/
error states and must work on mobile; never show a raw enum alone
(use `humanStatus()`).

- **7.1 Model gallery** — plain-language cards; form generated from
  `GET /v1/models` params. Acceptance: adding a menu model in the DB adds a
  working gallery page with zero code changes (the playground form-generator
  from 6.3 already does param→form; generalize it).
- **7.2 Jobs dashboard** — live statuses (human-readable), newest first, updates
  without manual refresh (poll `GET /v1/jobs`).
- **7.3 Job detail** — input shown, output rendered (image as image, text as
  text), artifact downloads, plain-language error + Retry (re-submit same input
  as a new job), re-run. Cover succeeded and failed for both modalities.
- **7.4 Snippet generator** — after any UI run, show working **curl + Node**
  reproducing that exact job, API key insertable in one click. NOTE the
  hashed-key tension: the auto-provisioned key's plaintext isn't stored; plan to
  let the user reveal/create a key (ties to 6.4) or reference an env var in the
  snippet. Acceptance: pasted snippet runs against production.
- **7.5 Usage page** — jobs, tokens, images, compute time from metering
  (`run.usage`); numbers reconcile with run rows.
- **7.6 UX pass** — loading/empty/error on every page; mobile; no raw enum.

**GATE 7:** a non-developer signs up, runs both models, downloads results,
copies a snippet — without opening the docs.

---

## Phase 8 — Provider experience + observability

Turn the terminal agent toward the consumer product.

- **8.1 One-command install** — `npx nodera-provider` or an installer script;
  prerequisite checks (Docker, GPU drivers) explained in plain language, never
  fails silently.
- **8.2 GPU auto-detect** — detect model + VRAM, auto-build capabilities; no
  hardware questions. (`nvidia-smi --query-gpu=name,memory.total --format=csv`
  works on this box.)
- **8.3 Claim-code linking** — implement the **reserved** endpoints in
  `docs/api.md`: `POST /v1/providers/link/start` → `{ code, link_token }`;
  agent polls `POST /v1/providers/link/poll` with `link_token` until the
  signed-in user enters the code on a `/link` web page; agent receives its
  token. The enroll secret becomes internal. This is the first NEW /v1 surface
  since Phase 1 — it's already specified in api.md, so implement it exactly.
- **8.4 Model pre-pull + progress** — background download with visible progress;
  heartbeat reports `models_ready`; jobs flow only after readiness (the agent
  already sends `models_ready`; make it real pre-pull, not "assume ready").
- **8.5 Pause/resume + auto-update** — pause completes/hands back the current
  job, accepts nothing new (the agent's graceful `stop()` is the seed).
- **8.6 Earnings/usage view** — completed jobs + metered usage, **labeled
  estimates, no fake payouts**.
- **8.7 Status view + approval** — queue depth, providers online, median wait;
  **manual provider approval on the web side** (the `providers.status` enum
  already has `pending|approved|disabled`, and the dispatcher already only
  assigns to `approved` — build the operator UI + a page to approve; unapproved
  providers register but receive no runs, which is already enforced).
- **8.8 Clean uninstall** — remove containers, models, job dirs; verify disk
  before/after.
- **8.9 Stopwatch** — non-technical friend install→registered-and-pulling <5 min
  (**[~] human**).

**GATE 8:** Scope success criteria 3–7 pass. v1 is "done" (pre-hardening).

---

## Phase 9 — Production hardening + scale proof (added; DECISIONS 023)

The stress/scale layer. Parts that need no real models can run after Phase 5;
the gate closes after Phase 8. Load scripts use **plain Node** (no
k6/autocannon). Reuse `scripts/lib/fake-provider.js` — it already supports
configurable concurrency, simulated runtimes, and a `failEvery` failure rate.

- **9.1 Load harness** — `scripts/load/`: job-burst generator (count/rate/model
  mix) + N fake providers; machine-readable report (throughput, queue-wait
  p50/p95, assignment latency, POST /v1/jobs p50/p95).
- **9.2 Burst test** — 1,000 jobs in <60 s vs 10 fake providers; queue drains,
  zero double-claims, zero lost/stuck, POST p95 < 1 s at max depth (the api.md
  promise). Record numbers in `docs/RUNBOOK.md`.
- **9.3 Concurrency abuse** — 50 simultaneous polls per run → one winner (the
  atomic-claim design already guarantees this — prove it under load); same
  Idempotency-Key ×20 concurrent → one job; concurrent conflicting reports →
  one 200, rest 409.
- **9.4 Soak** — 30 min sustained load; RSS bounded on all three services;
  dispatcher tick stays flat as the jobs table grows to tens of thousands; no
  handle/connection leaks. (Watch the `groupBy` in the tick and the queue scan
  — they rely on the indexes added in the schema; verify with `EXPLAIN` if tick
  time creeps.)
- **9.5 Chaos** — kill dispatcher mid-assignment + restart → no stuck jobs (the
  `delivering`/assignment guards already recover; prove it); kill a provider
  mid-job under load → requeue to survivors with attempts+1; restart Postgres
  mid-load → services reconnect and drain.
- **9.6 Rate-limit under load** — one key at 10× its limit while others run
  normally → 429 + Retry-After, others' p95 unaffected, queue intact.
  (Builds directly on 6.5.)
- **9.7 Webhook backlog** — 500 pending vs a slow/failing receiver; backoff
  holds, no starvation, terminal failures marked, job status never affected.
  (The delivery worker's `delivering` lease + batch cap are built for this.)
- **9.8 Artifact stress** — 20 concurrent >5 MB streaming downloads with a
  bounded-memory assertion; parallel upload-url requests respect
  `MAX_ARTIFACTS_PER_RUN` / `MAX_ARTIFACT_TOTAL_BYTES` exactly.
- **9.9 Security audit pass** — scripted: no secret/key/token in any log or
  fixture; keys/tokens verifiably hashed; SSRF guard blocks
  169.254.169.254 / localhost / private ranges / DNS-rebind (the guard already
  pins addresses — fuzz it); every customer route returns 404 for foreign-
  workspace resources (fuzz all endpoints); `npm audit` triaged in DECISIONS.
- **9.10 Ops readiness** — `docs/RUNBOOK.md` gains: deploy, migrate, rollback,
  Postgres backup + a **performed** restore drill, log locations, health checks,
  "provider stuck / queue stuck / webhook backlog" triage. Acceptance: a fresh
  clone following only README + RUNBOOK reaches green smoke + green 9.2.

**GATE 9:** burst, soak, chaos, security all green from a clean clone; every
remaining `[~]` item has exact LAUNCH-CHECKLIST instructions. **Gate 8 + Gate 9
= production-ready.**

---

## Cross-cutting production baseline (fold in as you go, not at the end)

- `/healthz` exists (web + dispatcher). Keep it truthful.
- Graceful shutdown everywhere (built for dispatcher + agent; keep it).
- Structured JSON logs with request/job/run ids, **never** secrets/keys/full
  prompts (the logger redacts credential-named fields; don't rely on that
  alone).
- Indexes for every hot path exist in `schema.prisma` (queue scan, provider
  poll, deadline expiry, webhook due-scan, workspace job lists) — re-check when
  adding queries.
- Every list endpoint paginated; every input capped; every error in the
  contract shape.

---

## Known open threads to resolve along the way

1. **Webhook signing-secret delivery:** `docs/api.md` defines a per-workspace
   secret for verifying signed deliveries, but neither `/v1` nor the account UI
   exposes or rotates it. Resolve this through a session-only account flow
   without extending the public contract unless `docs/api.md` changes first.
2. **Windows provider path (blueprint §11 flag):** Docker Desktop is friction
   for non-technical providers; a native (bundled-Ollama) path may be needed
   for the consumer app. Not v1-blocking; don't forget.
3. **`docs/TASKS.md` line 24** still says Phase 1 smoke "may assign directly in
   DB" — smoke was upgraded to the real dispatcher+agent in 2.2/3.5; the note is
   stale but harmless.
