# Launch Checklist — human actions required

Everything the code is ready for but only a human with accounts/credentials
can finish. Each item lists exact steps and the command that verifies it.

## 1. Cloudflare R2 bucket (task 4.2)

The R2 storage backend and its smoke test are implemented and ready.

Provided by owner (already in `.env`):
- ✅ `R2_ACCOUNT_ID=bebf9beabde1bbe7d8c8601aabdbdb6e`
- ✅ `R2_BUCKET=nodera`
- ✅ `R2_ENDPOINT=https://bebf9beabde1bbe7d8c8601aabdbdb6e.r2.cloudflarestorage.com`

**Still needed — the API-token credential pair (the bucket URL is not a credential):**

1. Cloudflare dashboard → R2 → **Manage R2 API Tokens** → **Create API Token**.
   - Permission: **Object Read & Write**
   - Scope it to the `nodera` bucket.
2. Copy the two values it shows **once** into `.env`:
   ```
   R2_ACCESS_KEY_ID=<Access Key ID>
   R2_SECRET_ACCESS_KEY=<Secret Access Key>
   ```
3. Add a lifecycle rule on the `nodera` bucket: delete objects under prefix
   `pending/` older than 2 days (blueprint §9).
4. Verify: `npm run smoke:r2` → must print `R2 SMOKE PASS`.

Until those two values are set, dev and tests run fully on `STORAGE_BACKEND=local`.

## 2. Live SDXL image generation (task 6.1)

The image worker (`workers/image-worker`, SDXL via Diffusers) and its
Dockerfile are complete, and the agent passes `--gpus all` for image models.
The artifact pipeline it feeds (presigned upload → pending→permanent promote →
streaming download) is already proven end-to-end by the Phase 4 tests.

A live generation run needs a provider host with:
1. An NVIDIA GPU with **≥ 12 GB VRAM** (the menu's `sdxl-1.0` `min_vram_gb`).
   The current dev machine's RTX 2080 has 8 GB; the worker will fall back to
   CPU offload there but it is impractically slow — use a ≥12 GB card.
2. The **NVIDIA Container Toolkit** installed so Docker `--gpus all` works.
3. Build the image (downloads ~7 GB of weights at build time):
   ```
   docker build -t nodera/image-worker workers/image-worker
   ```
4. Verify: submit an `sdxl-1.0` job through the API with that provider online;
   `GET /v1/jobs/:id` returns an `output.png` artifact you can download.

Text (`llama-3.1-8b`) generation is fully live and covered by `npm run smoke`.

## 3. Google OAuth sign-in (task 6.2)

The full OAuth2 flow, auto-provisioning, and session are built. Live Google
sign-in needs an OAuth client; the dev-login path (`POST /api/auth/dev-login`,
non-production only) exercises the same provisioning + session code today.

1. Google Cloud Console → APIs & Services → **Credentials** → Create OAuth
   client ID → **Web application**.
2. Authorized redirect URI: `<APP_URL>/api/auth/google/callback`
   (e.g. `http://localhost:3000/api/auth/google/callback` for dev, and the
   production URL once deployed).
3. Put the values in `.env`:
   ```
   GOOGLE_CLIENT_ID=<client id>
   GOOGLE_CLIENT_SECRET=<client secret>
   SESSION_SECRET=<any long random string>
   ```
4. Verify: open `<APP_URL>/api/auth/google/start`, sign in, and you land in
   `/playground` with a workspace + API key already created.

## 4. External production launch (task 6.7)

The production images, Compose topology, migrations, health gates, and secure
environment validation are implemented and locally verified. The remaining
steps require owner-controlled infrastructure and credentials:

1. Provision a Linux host with Docker Engine and Compose v2. Point the chosen
   domain at it, but do not expose Postgres or the dispatcher health port.
2. Copy `deploy/.env.example` to `deploy/.env` on the host and replace every
   placeholder. Use the R2 credentials from §1 and Google OAuth credentials
   from §3. Set `APP_URL` to the final HTTPS origin and register its callback:
   `<APP_URL>/api/auth/google/callback`.
3. Follow `docs/RUNBOOK.md` → **Production deployment** to validate, build,
   migrate, and start the stack.
4. Configure a TLS reverse proxy from the public origin to
   `http://127.0.0.1:3000`. Confirm the public `/healthz` and `/docs` return 200.
5. Configure an internet-connected provider with
   `API_BASE_URL=<APP_URL>/api/v1`, approve it, and confirm its heartbeat and
   polling remain healthy from outside the host network.
6. Create a fresh external customer key, submit a real job using only `/docs`,
   and verify it reaches `succeeded` with downloadable output. This final run
   is the Phase 6.7 acceptance test.

## 5. Customer onboarding stopwatch (task 6.8)

The database-backed measurement and JSON report are implemented. Final
acceptance requires a real person who has not been coached through the flow:

1. Keep an approved, ready LLM provider online so queue wait measures the real
   product path rather than a known outage.
2. Ask a new user to start at the landing page, sign in, and run the pre-filled
   text job without verbal guidance. Do not use an existing workspace.
3. After the job succeeds, run:
   ```bash
   npm run --silent onboarding:report
   ```
4. Find the newest workspace row and confirm `target_result` is
   `under_target` and `seconds_to_first_success` is below 60.
5. Record the observed value and date in `docs/HANDOFF-STATUS.md`. If it misses,
   keep task 6.8 open and fix the onboarding flow before repeating with another
   new user.

The existing dev measurement of 35.298s validates instrumentation only; it is
not the unassisted human acceptance result.
