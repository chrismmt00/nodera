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
