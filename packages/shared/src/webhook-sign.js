const crypto = require("node:crypto");

// X-Nodera-Signature: sha256=HMAC(workspace.webhook_secret, raw_body).
// Must stay byte-compatible with the customer verification snippet in
// docs/api.md.
function signWebhook(secret, rawBody) {
  return "sha256=" + crypto.createHmac("sha256", secret).update(rawBody).digest("hex");
}

module.exports = { signWebhook };
