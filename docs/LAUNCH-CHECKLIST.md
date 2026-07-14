# Launch Checklist — human actions required

Everything the code is ready for but only a human with accounts/credentials
can finish. Each item lists exact steps and the command that verifies it.

## 1. Cloudflare R2 bucket (task 4.2)

The R2 storage backend and its smoke test are implemented; they need a real
bucket and credentials.

1. Cloudflare dashboard → R2 → Create bucket (e.g. `nodera-artifacts`).
2. R2 → Manage R2 API Tokens → Create API Token with Object Read & Write on
   that bucket.
3. Add a lifecycle rule on the bucket: delete objects under prefix `pending/`
   older than 2 days (blueprint §9).
4. Fill in `.env`:
   ```
   R2_ACCOUNT_ID=<account id>
   R2_BUCKET=nodera-artifacts
   R2_ACCESS_KEY_ID=<token key id>
   R2_SECRET_ACCESS_KEY=<token secret>
   R2_ENDPOINT=https://<account id>.r2.cloudflarestorage.com
   ```
5. Verify: `npm run smoke:r2` → must print `R2 SMOKE PASS`.

Until then, dev and tests run fully on `STORAGE_BACKEND=local`.
