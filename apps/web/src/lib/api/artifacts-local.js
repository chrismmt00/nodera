import fs from "node:fs";
import path from "node:path";
import { createLogger } from "@nodera/shared";

// Phase-1 local artifact bytes on disk. Replaced by packages/storage in 4.1;
// key layout already matches the permanent scheme from docs/BLUEPRINT.md §9.
const log = createLogger("web");

// Launchers (scripts/dev-web.js etc.) resolve STORAGE_ROOT to an absolute
// path; a bare relative default only happens in ad-hoc processes.
function storageRoot() {
  return path.resolve(process.env.STORAGE_ROOT || "storage");
}

export function permanentKey(jobId, runId, name) {
  return `jobs/${jobId}/runs/${runId}/${name}`;
}

export function writeLocalArtifact(objectKey, buffer) {
  const file = path.join(storageRoot(), objectKey);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, buffer);
}

// Returns the parsed JSON of a small inline artifact, or null when it cannot
// be read — the artifact download route is the reliable path, output is a
// convenience.
export function readInlineJson(objectKey, maxBytes) {
  try {
    const file = path.join(storageRoot(), objectKey);
    const stat = fs.statSync(file);
    if (stat.size > maxBytes) return null;
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch (err) {
    log.warn("inline artifact unreadable", { objectKey, error: err.message });
    return null;
  }
}
