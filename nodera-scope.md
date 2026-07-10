# Nodera — Project Scope (v1)

This is the contract for what v1 is and is not. The build details live in `docs/BLUEPRINT.md`; the why lives in `docs/VISION.md`. When an idea appears mid-build, it is checked against this document first. AI assistants read this file every session.

## Objective

Ship a production-deployed, self-serve version of Nodera where real strangers — customers and providers — can onboard and use the network without the founder's involvement.

## In scope (v1 deliverables)

1. **Control plane** — Next.js API + web app: auth, jobs, providers, artifacts, webhooks (Blueprint §3, §7).
2. **Dispatcher** — standalone service: assignment, retries, deadlines, webhook delivery (§3, §6, §10).
3. **Provider agent** — one-command install, GPU auto-detect, claim-code linking, Docker worker execution, kill timers, artifact upload, pause/resume, earnings display (§3, §8, §11, §17).
4. **Two worker images, two menu models** — `llama-3.1-8b` via Ollama, `sdxl-1.0` via Diffusers (§4, §8).
5. **Storage** — local backend for dev, Cloudflare R2 for production, presigned direct uploads, pending→permanent flow, streaming downloads (§9).
6. **Webhooks** — queued, retried, HMAC-signed, SSRF-guarded (§10).
7. **Customer web app** — one-click OAuth signup with auto-provisioned workspace/key, model gallery, playground, live jobs dashboard, job detail with rendered output, code snippet generator, API keys page, usage page (§13 Phase 6–7, §16).
8. **Public docs** — quickstart, per-endpoint curl examples, webhook verification snippet.
9. **Abuse basics** — per-key rate limits, input size limits, invite-only or quota-limited launch.
10. **Metering** — usage recorded on every run (tokens, images, duration, model). Recorded, not billed.
11. **Production deployment** — control plane + dispatcher + Postgres hosted, R2 live, real domain, TLS.
12. **Testing & ops** — smoke script, the five critical integration tests, seed script, runbook (§15).

## Out of scope (v1)

Billing/payments and provider payouts (metering only) · marketplace bidding or dynamic pricing · trust/reputation scoring (column reserved) · output verification / canary jobs (schema-ready only) · custom or fine-tuned model uploads · streaming/chat-style responses · warm worker pools · geographic routing · multiple reliability tiers (column reserved) · hosting, database, or storage products · native non-Docker provider runtime · Windows-polished provider app · marketing site beyond a landing page.

Full list and reasoning: Blueprint §14.

## Success criteria (v1 is done when all are true)

1. A brand-new customer goes landing page → completed AI result in **under 60 seconds** (measured).
2. A developer completes an API job using **only the public docs**.
3. A non-technical provider goes install → registered-and-pulling-models in **under 5 minutes**, unassisted (measured).
4. A non-developer runs both models from the browser and downloads results **without opening the docs**.
5. Every phase gate in Blueprint §13 has passed, including the multi-provider, kill-a-provider, and hung-worker tests.
6. Jobs survive provider failure: requeued, retried, completed elsewhere, attempts tracked — demonstrated, not assumed.
7. The system is deployed in production and has run for a sustained period with real (even if small) usage without manual babysitting.

## Constraints

- Stack is fixed: JavaScript (no TypeScript), Next.js App Router, Node.js, PostgreSQL via Prisma, Docker, Cloudflare R2 (Blueprint §2).
- Solo founder building with AI assistants — the discipline rules in Blueprint §15 are mandatory, not advisory.
- Phases are sequential; a phase begins only after the previous gate passes.
- Onboarding step counts (3 customer steps, 3 provider steps) are budgets — see Blueprint §17.

## Assumptions and known risks

- Early providers are personally known and manually approved; provider trust/verification is deliberately deferred.
- Chicken-and-egg demand risk is accepted for v1; first-customer channels are an open question (Blueprint §18).
- Docker + GPU drivers remain provider prerequisites in v1; Windows friction is a known limitation, flagged for later.
- Anonymous abuse is mitigated by OAuth signup + limits, not solved; billing later closes the gap.

## Change control

Adding anything to "In scope" requires: (1) a written reason, (2) an edit to this document, (3) an entry in `docs/DECISIONS.md`. If a new idea doesn't justify those three steps, it isn't justified at all — it goes to the post-v1 list. Removing scope is always allowed and only requires a DECISIONS.md entry.
