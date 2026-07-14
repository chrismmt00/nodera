// Local filesystem backend (dev). Object keys map to files under
// STORAGE_ROOT; presigned uploads are emulated with an HMAC-signed PUT URL
// served by the control plane (the R2 backend returns real presigned URLs).
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const KEY_RE = /^[A-Za-z0-9][A-Za-z0-9/._-]*$/;

function assertSafeKey(key) {
  if (!KEY_RE.test(key) || key.includes("..")) {
    throw new Error(`unsafe object key: ${key}`);
  }
}

function createLocalBackend() {
  const root = path.resolve(process.env.STORAGE_ROOT || "storage");
  const signingSecret = process.env.STORAGE_SIGNING_SECRET || "";

  function filePath(key) {
    assertSafeKey(key);
    return path.join(root, key);
  }

  function sign(payload) {
    return crypto.createHmac("sha256", signingSecret).update(payload).digest("base64url");
  }

  return {
    backendName: "local",

    async putBuffer(key, buffer, { contentType } = {}) {
      const file = filePath(key);
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, buffer);
      // Content type is recorded by the artifact row; the filesystem doesn't
      // carry it.
      void contentType;
    },

    async headObject(key) {
      try {
        const stat = fs.statSync(filePath(key));
        return stat.isFile() ? { size: stat.size } : null;
      } catch {
        return null;
      }
    },

    getReadStream(key) {
      return fs.createReadStream(filePath(key));
    },

    async getBuffer(key, maxBytes) {
      const head = await this.headObject(key);
      if (!head || (maxBytes !== undefined && head.size > maxBytes)) return null;
      return fs.readFileSync(filePath(key));
    },

    async copyObject(srcKey, dstKey) {
      const dst = filePath(dstKey);
      fs.mkdirSync(path.dirname(dst), { recursive: true });
      fs.copyFileSync(filePath(srcKey), dst);
    },

    // Emulated presign: HMAC token over key/contentType/size/expiry, honored
    // by the control plane's internal upload route.
    async createUploadTarget({ key, contentType, sizeBytes, expiresS }) {
      assertSafeKey(key);
      if (!signingSecret) {
        throw new Error("STORAGE_SIGNING_SECRET must be set for local upload URLs");
      }
      const payload = Buffer.from(
        JSON.stringify({
          key,
          ct: contentType,
          size: sizeBytes,
          exp: Math.floor(Date.now() / 1000) + expiresS,
        })
      ).toString("base64url");
      const token = `${payload}.${sign(payload)}`;
      const base = process.env.APP_URL || "http://localhost:3000";
      return {
        url: `${base}/internal/storage/upload?token=${token}`,
        method: "PUT",
        headers: { "Content-Type": contentType },
        expiresAt: new Date(Date.now() + expiresS * 1000),
      };
    },

    // Verifies an upload token; returns { key, contentType, sizeBytes } or null.
    verifyUploadToken(token) {
      const [payload, mac] = String(token).split(".");
      if (!payload || !mac || !signingSecret) return null;
      const expected = sign(payload);
      const macBuf = Buffer.from(mac);
      const expBuf = Buffer.from(expected);
      if (macBuf.length !== expBuf.length || !crypto.timingSafeEqual(macBuf, expBuf)) return null;
      let claims;
      try {
        claims = JSON.parse(Buffer.from(payload, "base64url").toString());
      } catch {
        return null;
      }
      if (claims.exp < Math.floor(Date.now() / 1000)) return null;
      return { key: claims.key, contentType: claims.ct, sizeBytes: claims.size };
    },
  };
}

module.exports = { createLocalBackend, assertSafeKey };
