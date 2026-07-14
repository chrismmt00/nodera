// Worker contract v2 (docs/BLUEPRINT.md §8). The provider agent mounts a job
// dir at /job: input.json goes in, out/{logs.txt, meta.json, result.json,
// output.png} come back. These utils are the only code that touches that
// layout, shared by the agent and its tests.
const fs = require("node:fs");
const path = require("node:path");

const USAGE_INTS = ["tokens_in", "tokens_out", "images", "duration_ms"];

// Creates the job dir with input.json and an empty out/ for the worker.
function writeJobInput(jobDir, payload) {
  fs.mkdirSync(path.join(jobDir, "out"), { recursive: true });
  fs.writeFileSync(path.join(jobDir, "input.json"), JSON.stringify(payload, null, 2));
}

function invalid(error) {
  return { ok: false, error };
}

// Reads and validates a finished worker's out/ dir.
// Returns { ok: true, meta, usage, logs, files } or { ok: false, error }.
// `files` lists every out/ file except meta.json and logs.txt — the
// artifacts the worker produced (result.json, output.png, ...).
function readWorkerOutput(jobDir) {
  const outDir = path.join(jobDir, "out");
  if (!fs.existsSync(outDir)) return invalid("worker produced no out/ directory");

  const metaPath = path.join(outDir, "meta.json");
  if (!fs.existsSync(metaPath)) return invalid("meta.json missing");
  let meta;
  try {
    meta = JSON.parse(fs.readFileSync(metaPath, "utf8"));
  } catch {
    return invalid("meta.json is not valid JSON");
  }
  if (meta === null || typeof meta !== "object" || Array.isArray(meta)) {
    return invalid("meta.json must be a JSON object");
  }

  const usage = meta.usage;
  if (usage === null || typeof usage !== "object" || Array.isArray(usage)) {
    return invalid("meta.json is missing its usage block");
  }
  for (const field of USAGE_INTS) {
    if (!Number.isInteger(usage[field]) || usage[field] < 0) {
      return invalid(`usage.${field} must be a non-negative integer`);
    }
  }
  if (typeof usage.model_slug !== "string" || !usage.model_slug) {
    return invalid("usage.model_slug must be a string");
  }

  let logs = null;
  const logsPath = path.join(outDir, "logs.txt");
  if (fs.existsSync(logsPath)) logs = fs.readFileSync(logsPath, "utf8");

  const files = [];
  for (const name of fs.readdirSync(outDir)) {
    if (name === "meta.json" || name === "logs.txt") continue;
    const filePath = path.join(outDir, name);
    const stat = fs.statSync(filePath);
    if (stat.isFile()) files.push({ name, path: filePath, sizeBytes: stat.size });
  }

  return { ok: true, meta, usage, logs, files };
}

module.exports = { writeJobInput, readWorkerOutput };
