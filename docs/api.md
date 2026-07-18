# Nodera API Contract (v1)

This document is written BEFORE the code and is binding. The control plane implements it, the provider agent and customer dashboard consume it, and the docs site publishes from it. Changes require editing this file first and a `docs/DECISIONS.md` entry.

## Conventions

- Base URL: `https://api.nodera.example/v1` (dev: `http://localhost:3000/api/v1`)
- All bodies are JSON. All timestamps are ISO 8601 UTC.
- Customer auth: `x-api-key: <key>` · Provider auth: `x-provider-token: <token>`
- IDs are prefixed strings: `job_...`, `run_...`, `prov_...`, `ws_...`.

**Error shape (every non-2xx):**

```json
{ "error": { "code": "model_not_found", "message": "No active model with slug 'sdxl-2'." } }
```

Error codes: `unauthorized`, `forbidden`, `not_found`, `validation_failed`, `model_not_found`, `input_too_large`, `idempotency_conflict`, `rate_limited`, `artifact_limits_exceeded`, `artifact_missing`, `report_conflict`, `internal`.

**Rate limiting:** 429 with `Retry-After: <seconds>` and code `rate_limited`.

**List pagination:** `?limit=` (default 20, max 100) and `?cursor=` (opaque, from previous response's `next_cursor`; null when done).

---

## Customer endpoints

### POST /v1/jobs — create a job

Headers: `x-api-key`, optional `Idempotency-Key: <string ≤128 chars>`.

Request:

```json
{
  "model": "llama-3.1-8b",
  "input": { "prompt": "Write a follow-up email for this lead.", "max_tokens": 400 },
  "webhook_url": "https://customer.app/nodera/callback"
}
```

`input` fields are model-specific (see GET /v1/models). `webhook_url` optional, must be https in production.

Response `201`:

```json
{ "job_id": "job_abc123", "status": "queued", "model": "llama-3.1-8b", "created_at": "2026-07-10T15:00:00Z" }
```

Rules: returns in under a second regardless of queue depth; never rejects for lack of capacity. Replaying the same `Idempotency-Key` in the same workspace returns the ORIGINAL job with `200` (not 201). Same key with a different body → `409 idempotency_conflict`. Errors: `model_not_found`, `input_too_large`, `validation_failed`, `rate_limited`.

### GET /v1/jobs — list jobs

`200`:

```json
{ "jobs": [ { "job_id": "job_abc123", "status": "succeeded", "model": "llama-3.1-8b", "created_at": "...", "finalized_at": "..." } ], "next_cursor": null }
```

Newest first. Only the caller's workspace, always.

### GET /v1/jobs/:id — job detail

`200`:

```json
{
  "job_id": "job_abc123",
  "status": "succeeded",
  "model": "llama-3.1-8b",
  "input": { "prompt": "Write a follow-up email for this lead.", "max_tokens": 400 },
  "created_at": "...",
  "finalized_at": "...",
  "attempts": 1,
  "run": { "run_id": "run_def456", "provider": "prov_x", "started_at": "...", "ended_at": "...",
           "usage": { "tokens_in": 52, "tokens_out": 311, "images": 0, "duration_ms": 8400, "model_slug": "llama-3.1-8b" } },
  "output": { "text": "..." },
  "artifacts": [ { "name": "result.json", "mime": "application/json", "size_bytes": 1420 } ],
  "error": null
}
```

`input` is the original same-workspace job input. `run` is the winning/final run only. `output` is the small inline result when applicable; large outputs are artifacts. On `failed`: `error` is `{ "code": "...", "message": "..." }` (plain-language message).

### GET /v1/jobs/:id/artifacts/:name — download artifact

Streams the artifact bytes with correct `Content-Type` and `Content-Length`. Never buffers the whole file in memory. Workspace ownership checked. `404 not_found` if the job or artifact isn't the caller's.

### GET /v1/models — the menu

`200`:

```json
{ "models": [
  { "slug": "llama-3.1-8b", "modality": "llm", "description": "Fast general text model — emails, summaries, descriptions.",
    "params": { "prompt": { "type": "string", "required": true, "max_bytes": 32768 },
                 "max_tokens": { "type": "integer", "default": 512, "max": 2048 } },
    "max_runtime_s": 120 },
  { "slug": "sdxl-1.0", "modality": "image", "description": "High-quality image generation from a text prompt.",
    "params": { "prompt": { "type": "string", "required": true, "max_bytes": 4096 },
                 "width": { "type": "integer", "default": 1024 }, "height": { "type": "integer", "default": 1024 } },
    "max_runtime_s": 300 }
] }
```

`params` drives both API validation and the web app's auto-generated forms — one definition, two uses.

---

## Provider endpoints

Provider identity ALWAYS comes from `x-provider-token`. No endpoint accepts a provider ID in the body.

### POST /v1/providers/register

Body: `{ "enroll_secret": "...", "name": "pats-gaming-pc", "capabilities": { "models": ["llama-3.1-8b","sdxl-1.0"], "gpu": { "model": "RTX 4090", "vram_gb": 24 }, "concurrency": 1 } }`
`201`: `{ "provider_id": "prov_x", "provider_token": "npt_..." }` — the only time the token is returned. Invalid secret → `403 forbidden`.
*(Phase 8 replaces the user-facing flow with device-link claim codes — reserved endpoints: `POST /v1/providers/link/start` → `{ code, link_token }`; agent polls `POST /v1/providers/link/poll` with `link_token` until the signed-in user enters the code on the website, then receives `{ provider_id, provider_token }`. Specified fully in Phase 8; do not implement earlier.)*

### POST /v1/providers/heartbeat

Body: `{ "active_runs": 1, "models_ready": ["llama-3.1-8b"] }` → `200 { "ok": true }`. Sent every 30s. Updates `last_heartbeat_at` and readiness.

### POST /v1/providers/poll

Body: `{}` → `200`:

```json
{ "run": { "run_id": "run_def456", "job_id": "job_abc123", "model": "llama-3.1-8b",
            "input": { "prompt": "..." }, "deadline_at": "2026-07-10T15:05:00Z" } }
```

or `{ "run": null }` when nothing is assigned. Claiming is atomic server-side: the run flips assigned→running with `started_at` set; a run is returned to exactly one poll, ever. Only runs assigned to THIS provider are visible.

### POST /v1/providers/artifacts/upload-url

Body: `{ "run_id": "run_def456", "name": "output.png", "mime": "image/png", "size_bytes": 1234567 }`
`200`: `{ "upload_url": "https://...", "method": "PUT", "headers": { "Content-Type": "image/png" }, "expires_at": "..." }`
Rules: run must belong to this provider and be running; key is server-derived under `pending/`; URL TTL 300s; content-type is part of the signature. Errors: `forbidden`, `artifact_limits_exceeded`, `validation_failed`.

### POST /v1/providers/report

Body (success with small inline artifact):

```json
{ "run_id": "run_def456", "status": "succeeded", "exit_code": 0,
  "usage": { "tokens_in": 52, "tokens_out": 311, "images": 0, "duration_ms": 8400, "model_slug": "llama-3.1-8b" },
  "artifacts": [ { "name": "result.json", "mime": "application/json", "size_bytes": 1420, "inline_base64": "..." } ] }
```

Large artifacts: same entry without `inline_base64` (must have been uploaded via presigned URL; server HEAD-verifies existence and size, then copies pending→permanent).
Failure: `{ "run_id": "...", "status": "failed", "exit_code": 1, "error": { "code": "worker_error", "message": "..." } }`
Responses: `200` finalized · duplicate identical final report → `200` no-op · conflicting final state → `409 report_conflict` · missing uploaded object after retries → `400 artifact_missing`.

---

## Webhooks (Nodera → customer)

Delivered on final job states. POST to the job's `webhook_url`:

Headers: `Content-Type: application/json`, `X-Nodera-Signature: sha256=<hex hmac of raw body>`, `X-Nodera-Timestamp: <unix seconds>` (HMAC key = workspace webhook secret; receivers should reject timestamps older than 5 minutes).

Body:

```json
{ "event": "job.succeeded", "job": { "id": "job_abc123", "status": "succeeded", "model": "llama-3.1-8b" },
  "run": { "id": "run_def456" }, "sent_at": "2026-07-10T15:00:42Z" }
```

Events: `job.succeeded`, `job.failed`. Any 2xx from the receiver counts as delivered; anything else retries per blueprint §10. Webhook outcome never changes job status.

## Verification snippet (published in docs)

```js
const crypto = require("crypto");
function verifyNodera(rawBody, signatureHeader, timestampHeader, secret) {
  if (Math.abs(Date.now() / 1000 - Number(timestampHeader)) > 300) return false;
  const expected = "sha256=" + crypto.createHmac("sha256", secret).update(rawBody).digest("hex");
  return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signatureHeader));
}
```
