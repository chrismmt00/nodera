// Nodera LLM worker (docs/BLUEPRINT.md §8). Reads /job/input.json, generates
// with the host's Ollama server, writes /job/out/{result.json, meta.json,
// logs.txt}. Exits non-zero on any failure — the provider agent turns that
// into a failed run.
const fs = require("node:fs");
const path = require("node:path");

const JOB_DIR = process.env.JOB_DIR || "/job";
const OUT_DIR = path.join(JOB_DIR, "out");
const OLLAMA_URL = process.env.OLLAMA_URL || "http://host.docker.internal:11434";

const logLines = [];
function log(line) {
  logLines.push(`${new Date().toISOString()} ${line}`);
}

function flushLogs() {
  try {
    fs.mkdirSync(OUT_DIR, { recursive: true });
    fs.writeFileSync(path.join(OUT_DIR, "logs.txt"), logLines.join("\n") + "\n");
  } catch (err) {
    console.error(`could not write logs.txt: ${err.message}`);
  }
}

async function main() {
  const started = Date.now();
  const input = JSON.parse(fs.readFileSync(path.join(JOB_DIR, "input.json"), "utf8"));
  const prompt = input.input?.prompt;
  const maxTokens = input.input?.max_tokens ?? 512;
  const runtimeRef = input.runtime_ref;
  if (typeof prompt !== "string" || !runtimeRef) {
    throw new Error("input.json needs input.prompt and runtime_ref");
  }
  log(`generating with ${runtimeRef} (max_tokens=${maxTokens})`);

  const res = await fetch(`${OLLAMA_URL}/api/generate`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      model: runtimeRef,
      prompt,
      stream: false,
      options: { num_predict: maxTokens },
    }),
  });
  if (!res.ok) {
    throw new Error(`ollama responded ${res.status}: ${(await res.text()).slice(0, 300)}`);
  }
  const data = await res.json();
  if (typeof data.response !== "string") {
    throw new Error("ollama returned no text");
  }

  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(path.join(OUT_DIR, "result.json"), JSON.stringify({ text: data.response }));
  const usage = {
    tokens_in: data.prompt_eval_count ?? 0,
    tokens_out: data.eval_count ?? 0,
    images: 0,
    duration_ms: Date.now() - started,
    model_slug: input.model,
  };
  fs.writeFileSync(path.join(OUT_DIR, "meta.json"), JSON.stringify({ usage }));
  log(`done: ${usage.tokens_in} tokens in, ${usage.tokens_out} tokens out, ${usage.duration_ms}ms`);
}

main()
  .then(() => {
    flushLogs();
    process.exit(0);
  })
  .catch((err) => {
    log(`ERROR: ${err.message}`);
    flushLogs();
    console.error(err.message);
    process.exit(1);
  });
