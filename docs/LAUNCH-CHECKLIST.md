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
