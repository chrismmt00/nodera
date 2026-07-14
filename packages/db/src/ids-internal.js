const crypto = require("node:crypto");

// IDs are prefixed strings per docs/api.md conventions: job_..., run_..., ws_...
function newId(prefix) {
  return `${prefix}_${crypto.randomBytes(12).toString("base64url")}`;
}

// API keys and provider tokens are high-entropy random strings, so a plain
// SHA-256 lookup hash is sufficient (no salt/KDF needed) and allows unique-index lookups.
function sha256(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

// key = plaintext returned to the caller exactly once; only the hash is stored.
function newSecret(prefix) {
  const plaintext = `${prefix}_${crypto.randomBytes(24).toString("base64url")}`;
  return { plaintext, hash: sha256(plaintext) };
}

module.exports = { newId, sha256, newSecret };
