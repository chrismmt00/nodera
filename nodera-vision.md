# Nodera — What It Is and Where It's Going

## One line

Nodera lets anyone run AI jobs without owning hardware, and lets anyone with a good computer earn money running them.

## The problem

AI is becoming a normal ingredient in apps, workflows, and businesses — but the compute behind it is either expensive, complicated, or both. Big cloud providers make you pick regions, instance types, and quotas before you've generated a single word. Meanwhile, millions of powerful gaming PCs and workstations sit idle most of the day.

Two groups are stuck:

- **Builders and businesses** who just want "run this AI task, tell me when it's done" without becoming infrastructure engineers or paying datacenter prices.
- **Hardware owners** who have serious GPUs doing nothing and no simple way to earn from them.

## What Nodera is

Nodera is a serverless AI compute network powered by independent providers.

**For customers:** you send a job — "generate this text," "create this image" — to a simple API or run it right from the website. You pick a model from Nodera's curated menu, pay per job, and get notified when it's done. No servers, no GPUs, no instance types. Your prompts and settings are your secret sauce; the hardware is invisible.

**For providers:** you install one small app, link your machine with a short code, and your computer starts earning by running AI jobs inside safe, isolated containers that Nodera controls. Think of it like the simplicity of crypto mining apps — press start, watch earnings — but the work is useful AI compute.

**In the middle:** Nodera is the control plane. It queues jobs, matches each one to a capable machine, runs it safely, stores the output, retries automatically when a machine flakes, and delivers the result. Customers never talk to providers; both sides only ever talk to Nodera.

## What makes it different

- **Pay per job, not per machine.** Competitors rent you a GPU by the hour. Nodera sells the outcome: one job, one price.
- **Faster to start than any cloud.** A new customer goes from the landing page to their first real AI result in under 60 seconds — no credit card, no quota requests, no setup screens. A new provider goes from "I'll try it" to registered and downloading models in under 5 minutes.
- **Easy on both sides, by design.** A non-developer can use Nodera entirely through the website. A developer gets a clean API with copy-paste examples. A provider never touches a config file.
- **Built for async work.** Bulk text generation, image pipelines, overnight processing, AI steps inside automation workflows — the jobs where a short wait is fine and a low price matters.

## The goal

**Near term (the MVP):** a stranger can sign up, run a real AI job on a stranger's machine, and get the result — reliably, end to end, without ever talking to us. Two models on the menu (one text, one image), a web app anyone can use, an API developers enjoy, and a provider app a non-technical friend can install alone.

**Long term:** a marketplace where thousands of independent machines form a dependable compute network — more models, reliability tiers, provider earnings and payouts, verified trusted hardware for privacy-sensitive customers, and eventually compute services beyond AI. Providers earn the majority of every job; Nodera takes a platform cut.

## The principles we won't trade away

1. **Fewer steps always wins.** Every added onboarding step needs a written reason.
2. **Never lose a job.** Queued means it will run; machine failures are Nodera's problem, not the customer's.
3. **Honest speed claims.** We're the fastest to *get started*, not the fastest per-request — and we say so.
4. **Safety before openness.** Only Nodera-approved workloads run on provider machines until stronger sandboxing exists.
5. **Reliability before features.** Nothing new ships on top of a core that hasn't proven itself.
