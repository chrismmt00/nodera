# Nodera Build Tasks

One task = one AI session = one commit. Do them in order. Check the box only when the task's Definition of Done (AGENTS.md) is fully met. Phase gates are copied from `docs/BLUEPRINT.md` §13 and must pass before the next phase starts.

## Phase 0 — Foundation

- [ ] **0.1 Repo scaffold + remote.** Monorepo layout per blueprint §3/§6, root package.json with workspaces, .gitignore, .env.example, README stub. Git init, remote added, first push. ✓ when: `git push` succeeds and the layout matches the blueprint.
- [ ] **0.2 Dev Postgres.** docker-compose.yml with Postgres, healthcheck, volume. ✓ when: `docker compose up -d` yields a connectable DB using .env.example values.
- [ ] **0.3 Prisma schema.** All tables from blueprint §5 in packages/db, first migration. ✓ when: `npx prisma migrate dev` runs clean twice (idempotent) and every §5 field exists.
- [ ] **0.4 Seed script.** `npm run seed`: one workspace, one API key (print the plaintext once), both menu models. ✓ when: rerunning seed doesn't duplicate rows.
- [ ] **0.5 Docs in repo.** Copy VISION, SCOPE, BLUEPRINT, USER-STORIES, api.md, TASKS, DECISIONS into docs/; AGENTS.md at root; CLAUDE.md containing "Read AGENTS.md". ✓ when: all present, committed, pushed.

**GATE 0:** migrate + seed clean from a fresh clone by following README only.

## Phase 1 — Core API with fake execution

- [ ] **1.1 Error + auth plumbing.** Shared error helper producing the api.md shape; `x-api-key` and `x-provider-token` middlewares (hashed lookup). ✓ when: bad/missing keys return `401 unauthorized` in the exact contract shape.
- [ ] **1.2 POST /v1/jobs + Idempotency-Key.** Validation against the model's params, job creation. ✓ when: contract examples work verbatim; replay returns original job (200); same key + different body → 409; test written.
- [ ] **1.3 GET /v1/jobs/:id and GET /v1/jobs.** Detail with run/usage/output/artifacts fields; paginated list. ✓ when: responses match api.md field-for-field; cross-workspace access is 404; test written.
- [ ] **1.4 GET /v1/models.** Menu from DB including params schema. ✓ when: response drives 1.2's validation (single source).
- [ ] **1.5 Provider register + heartbeat.** Enroll secret, token issuance (hash stored), heartbeat updates. ✓ when: register returns token once; wrong secret → 403.
- [ ] **1.6 Poll with atomic claim.** ✓ when: two concurrent polls for one assigned run — exactly one receives it (concurrency test written and passing).
- [ ] **1.7 Report endpoint.** Finalize run+job, record usage, idempotent no-op on duplicate, 409 on conflict. ✓ when: all three report tests pass.
- [ ] **1.8 Fake provider + smoke.js.** Script registers a fake provider, polls, reports success; `npm run smoke` drives job → succeeded and asserts usage recorded. ✓ when: smoke passes from clean seed. (Note: Phase 1 has no dispatcher yet — smoke may assign directly in DB; replaced in 2.x.)

**GATE 1:** smoke green; idempotency, atomic-claim, and duplicate-report tests green.

## Phase 2 — Dispatcher, retries, deadlines

- [ ] **2.1 Dispatcher skeleton.** apps/dispatcher loop on DISPATCH_INTERVAL_MS with clean shutdown. ✓ when: runs alongside dev stack, logs each tick.
- [ ] **2.2 Matching + assignment transaction.** Oldest queued job × online provider with model ready + free slot; assign in one transaction (job→assigned, attempts+1, run created). ✓ when: smoke now passes with the real dispatcher doing assignment.
- [ ] **2.3 Offline-provider requeue.** No heartbeat past PROVIDER_OFFLINE_AFTER_MS → fail its unfinished runs, requeue jobs. ✓ when: test simulating dead provider passes.
- [ ] **2.4 Deadline expiry.** Runs past deadline_at → expired, job requeued, regardless of heartbeats. ✓ when: never-finishing-run test passes.
- [ ] **2.5 Attempts cap.** attempts ≥ max_attempts → job failed with plain-language error. ✓ when: third failure finalizes the job; test written.
- [ ] **2.6 Multi-provider test script.** Two fake providers, concurrency 1, 20 jobs. ✓ when: max 2 concurrent, both providers used, no double-claims, queue drains — scripted assertion, not eyeballing.

**GATE 2:** 2.6 passes; kill-a-provider-mid-job requeues to the other with attempts incremented.

## Phase 3 — Docker execution + real LLM

- [ ] **3.1 Worker contract utils.** packages/shared: write input.json, read out/ (logs, meta with usage block, result). ✓ when: unit tests cover happy path and malformed meta.
- [ ] **3.2 LLM worker (real).** workers/llm-worker: Ollama-backed, reads /job/input.json, writes result + usage. ✓ when: container run manually against a prompt produces real text and valid meta.json.
- [ ] **3.3 Agent Docker runner.** Provider agent creates job dir, runs allowlisted image with only /job mounted, non-root, no privileged, resource caps per blueprint §11. ✓ when: security flags verified in the docker inspect output, asserted in a test.
- [ ] **3.4 Kill timer + cleanup.** Agent kills container at model max_runtime, reports failed(timeout), cleans job dirs. ✓ when: forced-hang worker is killed and job retries (ties to 2.4).
- [ ] **3.5 Metering wired through.** usage from meta.json → report → run row → GET /v1/jobs/:id. ✓ when: smoke asserts real token counts, not zeros.

**GATE 3:** real prompt → real text end-to-end; hang test green.

## Phase 4 — Artifacts + R2

- [ ] **4.1 Storage abstraction + local backend.** putBuffer/headObject/getReadStream/copyObject; inline (≤256KB) artifacts stored via it. ✓ when: local regression test green.
- [ ] **4.2 R2 backend.** Same interface, env-configured. ✓ when: R2 smoke (put/head/stream/copy) green against a real bucket.
- [ ] **4.3 Upload-url endpoint.** Ownership check, server-derived pending/ key, TTL, content-type in signature, limits. ✓ when: contract examples work; foreign run → 403; over-limit → contract error.
- [ ] **4.4 Report verification + promote.** HEAD with 100/300ms retries, size check, pending→permanent copy, artifact rows. ✓ when: missing-object → 400 artifact_missing; size mismatch rejected; tests written.
- [ ] **4.5 Streaming download route.** ✓ when: >5MB artifact streams (verified via memory/chunk assertion), correct headers, cross-workspace → 404.

**GATE 4:** >256KB artifact flows provider→R2→customer download; pending vs permanent separation demonstrated.

## Phase 5 — Webhooks

- [ ] **5.1 Enqueue on final state.** webhook_deliveries row created when a job with webhook_url finalizes. ✓ when: exactly one row per finalization (idempotent with duplicate reports).
- [ ] **5.2 Delivery worker.** Batch per tick, timeout, backoff schedule, terminal failed state. ✓ when: schedule followed exactly in a clock-controlled test.
- [ ] **5.3 Signing + SSRF guard.** HMAC + timestamp headers; resolve host, refuse private/loopback/link-local. ✓ when: signature verifies with the api.md snippet; `http://169.254.169.254` and `http://localhost` are refused (test).
- [ ] **5.4 Receiver harness.** scripts/webhook-receiver.js honoring WEBHOOK_FAILS_BEFORE_SUCCESS. ✓ when: fail-twice-then-succeed observed end-to-end with correct retry gaps.

**GATE 5:** signed webhook survives two induced failures; signature verifies.

## Phase 6 — Real image model + public readiness

- [ ] **6.1 Image worker (real).** SDXL via Diffusers, writes output.png + usage (images:1). ✓ when: real image end-to-end through the full pipeline.
- [ ] **6.2 OAuth signup + auto-provision.** Google sign-in creates workspace + first API key, redirects into playground. ✓ when: new account → running a pre-filled job without any setup screen.
- [ ] **6.3 Playground v1.** Model select, prompt, Run, live status, rendered result — using public API only. ✓ when: works for both models.
- [ ] **6.4 Keys + account page.** View/create/revoke keys, recent jobs. ✓ when: revoked key → 401 immediately.
- [ ] **6.5 Rate limits + input limits.** Per-key limits, 429 + Retry-After, max prompt bytes enforced at POST /v1/jobs. ✓ when: hammering script gets throttled; queue unharmed.
- [ ] **6.6 Public docs.** Quickstart + per-endpoint examples + webhook verification, published. ✓ when: a fresh key completes the quickstart verbatim.
- [ ] **6.7 Production deploy.** Control plane + dispatcher + Postgres hosted, R2 live, domain + TLS, providers connect over the internet. ✓ when: full job succeeds in production from an external customer key.
- [ ] **6.8 Stopwatch.** Record signup→first-succeeded-job per workspace; test the 60s target with a real person. ✓ when: measured under 60s.

**GATE 6:** Scope success criteria 1, 2 pass; throttling holds.

## Phase 7 — Customer front end

- [ ] **7.1 Model gallery.** Plain-language cards, form generated from GET /v1/models params. ✓ when: adding a menu model in DB adds a working gallery page with zero code changes.
- [ ] **7.2 Jobs dashboard.** Live statuses (human-readable), newest first. ✓ when: status changes appear without manual refresh.
- [ ] **7.3 Job detail.** Input, rendered output (image as image, text as text), artifact downloads, plain-language error + Retry, re-run. ✓ when: covers succeeded and failed jobs for both modalities.
- [ ] **7.4 Snippet generator.** Any UI run → working curl + Node snippets reproducing it. ✓ when: pasted snippet runs successfully against production.
- [ ] **7.5 Usage page.** Jobs, tokens, images, compute time from metering. ✓ when: numbers reconcile with run rows.
- [ ] **7.6 UX pass.** Loading/empty/error states on every page; mobile layout; no raw enum ever shown alone. ✓ when: checklist audited page by page.

**GATE 7:** a non-developer signs up, runs both models, downloads results, copies a snippet — never opening the docs.

## Phase 8 — Provider experience + observability

- [ ] **8.1 One-command install.** npx/installer with prerequisite checks explained in plain language. ✓ when: fresh machine → running agent from one command.
- [ ] **8.2 GPU auto-detect.** Model + VRAM detected, capabilities auto-built. ✓ when: no hardware questions asked.
- [ ] **8.3 Claim-code linking.** link/start + poll endpoints per api.md reserved spec, code-entry page, token delivered to agent. ✓ when: linking under a minute, no copy-paste; enroll secret no longer user-facing.
- [ ] **8.4 Model pre-pull + progress.** Background download with visible progress; heartbeat reports models_ready. ✓ when: jobs flow only after readiness.
- [ ] **8.5 Pause/resume + auto-update.** Pause completes/hands back current job, accepts nothing new. ✓ when: pausing mid-job never strands a run.
- [ ] **8.6 Earnings/usage view.** Completed jobs + metered usage (labeled estimates, no fake payouts). ✓ when: reconciles with run rows.
- [ ] **8.7 Status view + approval.** Queue depth, providers online, median wait; manual provider approval on the web side. ✓ when: unapproved providers register but receive no runs.
- [ ] **8.8 Clean uninstall.** Removes containers, models, job dirs. ✓ when: disk state verified before/after.
- [ ] **8.9 Stopwatch.** Non-technical friend: install→registered-and-pulling in under 5 minutes, unassisted. ✓ when: measured.

**GATE 8:** Scope success criteria 3–7 all pass. v1 is done.
