const fs = require("node:fs");
const path = require("node:path");

// Loads KEY=VALUE pairs from a .env file into process.env without overriding
// values already present. No dependency; used by CLI config, scripts, and
// the standalone services so every process sees the same environment.
function loadEnv(dir) {
  const envPath = path.join(dir, ".env");
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const m = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/.exec(line);
    if (!m || line.trim().startsWith("#")) continue;
    if (process.env[m[1]] === undefined) {
      process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
    }
  }
}

module.exports = { loadEnv };
