# AGENTS.md — Rules for AI Assistants Working on Nodera

Read this file at the start of every session, before writing any code. It applies to every AI tool (Claude, Codex, or other). A `CLAUDE.md` in this repo simply points here — this file is the single source of rules.

## What this project is (30 seconds)

Nodera is a distributed AI compute network: customers submit async AI jobs via API or web app; a dispatcher assigns them to independent provider machines; provider agents run them in approved Docker containers; results come back via artifacts and signed webhooks.

Read before building anything: `docs/VISION.md` (why), `docs/SCOPE.md` (what's in/out), `docs/BLUEPRINT.md` (how — the source of truth), `docs/USER-STORIES.md` (for whom), `docs/api.md` (the API contract), `docs/TASKS.md` (what to do next), `docs/DECISIONS.md` (why things are the way they are).

## Glossary — use these words precisely

- **Workspace** — a customer tenant. Owns API keys and jobs.
- **Job** — a customer's request (one prompt → one result). Statuses: queued, assigned, running, succeeded, failed, canceled.
- **Run** — one execution attempt of a job on one provider. A job can have several runs (retries). Statuses: assigned, running, succeeded, failed, expired.
- **Provider** — a registered machine owned by an independent person, represented by the provider-agent process (NOT the Docker container).
- **Worker** — the Docker container that executes one job.
- **Model** — a menu entry (e.g. `llama-3.1-8b`) mapping to a worker image and runtime reference.
- **Artifact** — a file produced by a run.
- **Dispatcher** — the standalone service that assigns jobs and delivers webhooks. It never executes jobs.

Never say "job" when you mean "run." Retries create new runs, never new jobs.

## Hard rules — violating any of these fails the task

1. **JavaScript only.** Never introduce TypeScript, `.ts` files, or type annotations.
2. **Prisma only** for database access. Never write raw SQL outside Prisma. Never edit an already-applied migration — create a new one.
3. **No new dependencies without asking first.** Propose the package and why; wait for approval.
4. **The public `/v1` API is exactly what `docs/api.md` defines.** Do not add, rename, or remove endpoints or fields. The dashboard calls these same endpoints (session-authed wrapper is fine); never create parallel backdoor routes duplicating API logic. If the contract seems wrong, flag it — don't improvise.
5. **Every API error uses** `{ "error": { "code": "...", "message": "..." } }` with codes from `docs/api.md`.
6. **Security invariants:** provider identity always derives from the provider token, never from a request body. API keys and provider tokens are stored hashed. Secrets never appear in logs, error messages, or test fixtures. Object storage keys are always server-derived.
7. **UI consistency:** reuse the shared components and styles in `apps/web`. No new UI libraries, fonts, or one-off page styles. Every page has loading, empty, and error states.
8. **One task per session,** taken from `docs/TASKS.md`, in order. Do not scaffold ahead. Do not "improve" code outside the task's scope.
9. **Tests ship with the feature.** If you build a behavior the smoke test can't see, you also write the test that can.
10. **When any doc and your idea conflict, the doc wins** — and you state the conflict out loud instead of silently deviating.

## Workflow for every task

1. Read the task and its acceptance criteria in `docs/TASKS.md`; read the blueprint section it references.
2. Implement the smallest change that satisfies the criteria.
3. Write or update the tests named in the criteria.
4. Run: migrations + `npx prisma generate` (if schema changed), `npm test` (if tests exist yet), `npm run smoke`.
5. Check the box in `docs/TASKS.md`. If a decision was made, add a line to `docs/DECISIONS.md`.
6. Commit: `Phase X.Y: <short description>`. One task, one commit.

**Definition of done:** acceptance criteria met + smoke passes + tests pass + docs updated + committed. All five, always.

## Never do

- Force-push, rebase published history, or amend pushed commits.
- Delete or weaken a test to make it pass.
- Mark a TASKS.md item done with a failing smoke test.
- Swallow errors silently (`catch {}`) or stub out failing behavior to "fix later."
- Edit files under `prisma/migrations/` that have been applied.
- Log request bodies that may contain secrets or full prompts.
- Batch multiple tasks into one commit because "they were related."

## Commands (kept current — if these change, update this file in the same commit)

- `docker compose up -d` — Postgres for dev
- `npm run dev:all` — control plane + dispatcher + one dev provider agent
- `npx prisma migrate dev` — apply schema changes; then run `npx prisma generate`
- `npm run seed` — dev workspace, API key, menu models
- `npm run smoke` — full job lifecycle check (must pass before every commit)
- `npm test` — integration tests
- `npm run migrate:deploy` — apply committed migrations in production
- `npm run start:production:web` — validate production config and start the control plane
- `npm run start:production:dispatcher` — validate production config and start the dispatcher
- `npm run onboarding:report` — report signup-to-first-success timing per workspace
