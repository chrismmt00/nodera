// Storage abstraction (docs/BLUEPRINT.md §9): putBuffer / headObject /
// getReadStream / getBuffer / copyObject / createUploadTarget, with
// local | r2 backends selected by STORAGE_BACKEND.
const { createLocalBackend } = require("./local.js");

let instance = null;

function createStorage() {
  const backend = process.env.STORAGE_BACKEND || "local";
  if (backend === "local") return createLocalBackend();
  if (backend === "r2") {
    const { createR2Backend } = require("./r2.js");
    return createR2Backend();
  }
  throw new Error(`Unknown STORAGE_BACKEND '${backend}' (expected local or r2)`);
}

// Lazy singleton — env is read once at first use.
function getStorage() {
  if (!instance) instance = createStorage();
  return instance;
}

function pendingKey(jobId, runId, name) {
  return `pending/jobs/${jobId}/runs/${runId}/${name}`;
}

function permanentKey(jobId, runId, name) {
  return `jobs/${jobId}/runs/${runId}/${name}`;
}

module.exports = { createStorage, getStorage, pendingKey, permanentKey };
