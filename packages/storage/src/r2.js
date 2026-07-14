// Cloudflare R2 backend (S3-compatible). Same interface as the local
// backend; presigned PUT URLs are real, short-lived, and content-type-bound
// (docs/BLUEPRINT.md §9).
const {
  S3Client,
  PutObjectCommand,
  HeadObjectCommand,
  GetObjectCommand,
  CopyObjectCommand,
} = require("@aws-sdk/client-s3");
const { getSignedUrl } = require("@aws-sdk/s3-request-presigner");
const { assertSafeKey } = require("./local.js");

function createR2Backend() {
  for (const name of ["R2_BUCKET", "R2_ENDPOINT", "R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY"]) {
    if (!process.env[name]) {
      throw new Error(`STORAGE_BACKEND=r2 requires ${name} to be set`);
    }
  }
  const bucket = process.env.R2_BUCKET;
  const client = new S3Client({
    region: process.env.R2_REGION || "auto",
    endpoint: process.env.R2_ENDPOINT,
    credentials: {
      accessKeyId: process.env.R2_ACCESS_KEY_ID,
      secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
    },
  });

  return {
    backendName: "r2",

    async putBuffer(key, buffer, { contentType } = {}) {
      assertSafeKey(key);
      await client.send(
        new PutObjectCommand({ Bucket: bucket, Key: key, Body: buffer, ContentType: contentType })
      );
    },

    async headObject(key) {
      assertSafeKey(key);
      try {
        const head = await client.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
        return { size: head.ContentLength };
      } catch (err) {
        if (err.$metadata?.httpStatusCode === 404 || err.name === "NotFound") return null;
        throw err;
      }
    },

    getReadStream(key) {
      assertSafeKey(key);
      // Deferred stream: opens on first read so the interface stays sync.
      const { PassThrough } = require("node:stream");
      const out = new PassThrough();
      client
        .send(new GetObjectCommand({ Bucket: bucket, Key: key }))
        .then((res) => res.Body.pipe(out))
        .catch((err) => out.destroy(err));
      return out;
    },

    async getBuffer(key, maxBytes) {
      const head = await this.headObject(key);
      if (!head || (maxBytes !== undefined && head.size > maxBytes)) return null;
      const res = await client.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
      const chunks = [];
      for await (const chunk of res.Body) chunks.push(chunk);
      return Buffer.concat(chunks);
    },

    async copyObject(srcKey, dstKey) {
      assertSafeKey(srcKey);
      assertSafeKey(dstKey);
      await client.send(
        new CopyObjectCommand({
          Bucket: bucket,
          CopySource: `${bucket}/${encodeURIComponent(srcKey).replace(/%2F/g, "/")}`,
          Key: dstKey,
        })
      );
    },

    async createUploadTarget({ key, contentType, sizeBytes, expiresS }) {
      assertSafeKey(key);
      // Content type is part of the signature; providers must send it back.
      const command = new PutObjectCommand({ Bucket: bucket, Key: key, ContentType: contentType });
      const url = await getSignedUrl(client, command, { expiresIn: expiresS });
      void sizeBytes; // size is enforced at report verification (4.4)
      return {
        url,
        method: "PUT",
        headers: { "Content-Type": contentType },
        expiresAt: new Date(Date.now() + expiresS * 1000),
      };
    },
  };
}

module.exports = { createR2Backend };
