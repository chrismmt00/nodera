# Nodera — User Stories (v1)

Stories are grouped by persona. Each has an ID, a phase reference to `docs/BLUEPRINT.md` §13, and acceptance criteria where the behavior is easy to get subtly wrong. The recurring theme is deliberate: **every story removes effort from the user's side of the table.** If a story would add a step, a form, or a config file, it doesn't belong here.

Personas:

- **Casey** — non-developer customer. Runs AI from the website. Will never read docs.
- **Dev** — developer customer. Integrates the API into an app or automation workflow.
- **Pat** — provider. Owns a gaming PC with a good GPU. Not technical. Wants passive earnings.
- **Op** — the operator/founder running the platform.

---

## Casey — non-developer customer

**C1. One-click start** *(Phase 6)*
As Casey, I want to sign in with my Google account and immediately land somewhere I can run AI, so that I never fill out a form or verify an email.
Done means: from clicking "Sign in with Google" to seeing the playground is one redirect; a workspace and API key already exist; a model is pre-selected and a sample prompt is pre-filled; first result achievable in under 60 seconds total.

**C2. Browse models in plain language** *(Phase 7)*
As Casey, I want a gallery that tells me what each model is good for in normal words ("writes text — good for emails, summaries, descriptions"), so that I can pick without knowing what "8B parameters" means.

**C3. Run from a form** *(Phase 7)*
As Casey, I want to fill in a simple form and press Run, so that I never see JSON.
Done means: the form is generated from the model's parameters with sensible defaults; only the prompt is required.

**C4. Watch it happen** *(Phase 6–7)*
As Casey, I want live, human-readable status while my job runs ("Waiting for an available machine…", "Running…", "Done"), so that I trust something is happening.
Done means: status updates without refreshing the page; raw states like `queued` are never shown alone.

**C5. See results properly** *(Phase 7)*
As Casey, I want images shown as images and text shown as text, with a download button, so that I never open a raw file to see what I made.

**C6. Understand failures** *(Phase 7)*
As Casey, I want errors in plain sentences with a Retry button ("This took too long and was stopped — try again"), so that a failure doesn't end my session.
Done means: no stack traces, no error codes without words; retry re-submits the same input as a new job.

**C7. Do it again** *(Phase 7)*
As Casey, I want a re-run button on any past job, so that repeating yesterday's work takes one click.

**C8. Use my phone** *(Phase 7)*
As Casey, I want the whole flow to work on my phone, so that checking a job doesn't require my laptop.

**C9. Graduate to automation** *(Phase 7)*
As Casey, I want to hand my developer teammate a code snippet for the exact job I just ran, so that "automate this" is a copy-paste, not a project.
Done means: every playground run shows working curl and Node.js snippets that reproduce it, with the API key insertable in one click.

---

## Dev — developer customer

**D1. Key without asking** *(Phase 6)*
As Dev, I want an API key that already exists when I sign up, so that "getting access" is zero steps.

**D2. First call in a minute** *(Phase 6)*
As Dev, I want a quickstart whose first curl command works verbatim, so that I trust the rest of the docs.
Done means: copy, paste API key, run, get a job_id — nothing else required.

**D3. Fire and forget** *(Phase 1)*
As Dev, I want POST /v1/jobs to return a job_id instantly no matter how busy the network is, so that my app never blocks on AI.
Done means: response under a second even when all providers are busy; the job queues, never rejects for capacity.

**D4. Safe retries** *(Phase 1)*
As Dev, I want to send an Idempotency-Key so that my workflow engine's automatic retries never create duplicate jobs or duplicate charges.
Done means: replay returns the original job with the same job_id.

**D5. Get told, don't ask** *(Phase 5)*
As Dev, I want a webhook when my job finishes, so that I don't write polling loops.
Done means: signed payload; my paused workflow can resume from the job_id in it; retries with backoff if my endpoint is down.

**D6. Verify it's really Nodera** *(Phase 5)*
As Dev, I want to verify the webhook signature with a documented snippet, so that no one can spoof job results into my system.

**D7. Poll as a fallback** *(Phase 1)*
As Dev, I want GET /v1/jobs/:id to always reflect current truth, so that I can recover even if my webhook receiver was down all day.

**D8. Discover the menu** *(Phase 6)*
As Dev, I want GET /v1/models to list every model with its parameters, so that my integration can populate options without hardcoding.

**D9. Fetch outputs** *(Phase 4)*
As Dev, I want to download artifacts through the API with my key, so that my app can grab a generated image directly.

**D10. Errors I can handle in code** *(Phase 1)*
As Dev, I want every error in one consistent shape with a machine-readable code, so that my error handling is a switch statement, not string matching.

**D11. Fair throttling** *(Phase 6)*
As Dev, I want 429 responses with Retry-After when I exceed my rate limit, so that my client can back off automatically instead of guessing.

---

## Pat — provider

**P1. One-command install** *(Phase 8)*
As Pat, I want to install the provider app with a single command or installer, so that setup never involves editing files.
Done means: installer checks prerequisites (Docker, drivers) and explains any missing one in plain language with a link — it never fails silently.

**P2. My machine introduces itself** *(Phase 8)*
As Pat, I want the app to detect my GPU and VRAM automatically, so that I'm never asked hardware questions I can't answer.

**P3. Link with a code, like a TV app** *(Phase 8)*
As Pat, I want the app to show a short code I type into the website, so that connecting my machine never involves copying tokens or secrets.
Done means: code entry while signed in registers the machine; the agent receives its credentials automatically; total linking time under a minute.

**P4. See the models arrive** *(Phase 8)*
As Pat, I want a progress bar while models download, so that I know the app is working and roughly when I'll start earning.

**P5. One switch** *(Phase 8)*
As Pat, I want a clear start/pause control, so that I can reclaim my PC for gaming instantly and resume earning later.
Done means: pause finishes or cleanly hands back the current job and accepts no new ones; no job is left half-claimed.

**P6. Watch earnings tick** *(Phase 8)*
As Pat, I want to see jobs completed and usage/earnings accumulate, so that I can tell in one glance whether this is worth it.
(V1 shows metered usage and estimated value; real payouts are post-v1 and labeled as such — never fake numbers.)

**P7. Only safe work** *(Phase 3, §11)*
As Pat, I want my machine to run only Nodera-approved, isolated containers with no access to my files, so that earning never puts my computer at risk.
Done means: allowlisted images only; job dir is the only mount; non-root; no privileged mode; resources capped.

**P8. Never stuck** *(Phase 3)*
As Pat, I want stuck jobs killed automatically at their time limit, so that a bad job can't occupy my GPU forever.

**P9. Honest status** *(Phase 8)*
As Pat, I want to see whether my machine is online, idle, or running a job — from the website too — so that I never wonder if it's actually working while I'm away.

**P10. Clean exit** *(Phase 8)*
As Pat, I want uninstalling to remove containers, models, and job files, so that trying Nodera costs nothing if I leave.

---

## Op — operator/founder

**O1. Gatekeep early providers** *(Phase 8)*
As Op, I want to manually approve new providers from the web side, so that untrusted hardware can't join before verification exists — without adding any step to Pat's installer.

**O2. See the network breathe** *(Phase 8)*
As Op, I want queue depth, providers online, and median wait time on one screen, so that I can answer "is it healthy?" in five seconds.

**O3. Prove the world still works** *(Phase 1 onward)*
As Op, I want one command (`npm run smoke`) that exercises the full job lifecycle, so that every AI-built change is verified in minutes.

**O4. Rebuild from nothing** *(Phase 0)*
As Op, I want one command to boot the dev stack and one to seed it, so that a corrupted environment costs minutes, not the project.

**O5. Trace any job** *(Phase 2–3)*
As Op, I want to follow one job through every status, run, provider, and log, so that "my job is stuck" is debuggable from data, not guesswork.

---

## Coverage check

Ease-of-use commitments → stories: 60-second customer onboarding (C1, D1, D2) · 5-minute provider onboarding (P1–P4) · no-docs web experience (C2–C8) · no-config provider experience (P1–P3, P5) · UI-to-API bridge (C9) · never lose a job (D3, D4, P8, O5) · both sides always know what's happening (C4, P9, O2).
