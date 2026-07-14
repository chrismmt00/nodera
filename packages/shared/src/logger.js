// Structured JSON-line logger. One line per event, machine-parseable.
// Secrets never reach logs (AGENTS.md rule 6): field names that smell like
// credentials are redacted here as defense in depth — callers must still
// never pass them.
const REDACT = /(token|secret|api[_-]?key|authorization|password|key_hash)/i;

function clean(fields) {
  const out = {};
  for (const [k, v] of Object.entries(fields || {})) {
    out[k] = REDACT.test(k) ? "[redacted]" : v;
  }
  return out;
}

function write(stream, level, service, msg, fields) {
  stream.write(
    JSON.stringify({ ts: new Date().toISOString(), level, service, msg, ...clean(fields) }) + "\n"
  );
}

function createLogger(service, base) {
  const baseFields = base || {};
  return {
    info: (msg, fields) => write(process.stdout, "info", service, msg, { ...baseFields, ...fields }),
    warn: (msg, fields) => write(process.stderr, "warn", service, msg, { ...baseFields, ...fields }),
    error: (msg, fields) =>
      write(process.stderr, "error", service, msg, { ...baseFields, ...fields }),
    child: (fields) => createLogger(service, { ...baseFields, ...fields }),
  };
}

module.exports = { createLogger };
