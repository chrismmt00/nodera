import { getStorage } from "@nodera/storage";

// Local-backend stand-in for R2 presigned PUTs. The token is HMAC-signed and
// TTL'd by createUploadTarget; this route only honors valid tokens and only
// exists when the local backend is active. Not part of the public /v1 API —
// it plays the role of the R2 upload domain in dev.
export async function PUT(request) {
  const storage = getStorage();
  if (storage.backendName !== "local") {
    return Response.json({ error: "not available" }, { status: 404 });
  }
  const token = new URL(request.url).searchParams.get("token");
  const claims = storage.verifyUploadToken(token);
  if (!claims) {
    return Response.json({ error: "invalid or expired upload token" }, { status: 403 });
  }
  if ((request.headers.get("content-type") || "") !== claims.contentType) {
    return Response.json({ error: "content-type does not match the signed upload" }, { status: 400 });
  }
  const body = Buffer.from(await request.arrayBuffer());
  const maxTotal = parseInt(process.env.MAX_ARTIFACT_TOTAL_BYTES || "52428800", 10);
  if (body.length > maxTotal) {
    return Response.json({ error: "upload too large" }, { status: 413 });
  }
  await storage.putBuffer(claims.key, body, { contentType: claims.contentType });
  return Response.json({ ok: true });
}
