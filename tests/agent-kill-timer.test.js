// Task 3.4: a forced-hang worker is killed at the model's max runtime, the
// container is removed, the job dir is cleaned, and the failure reports as
// deadline_exceeded (which the report endpoint turns into a retry — 1.7).
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { execFile } = require("node:child_process");
const { promisify } = require("node:util");
const { runJob } = require("../apps/provider-agent/src/docker-runner.js");
const { startMockOllama } = require("./helpers/mock-ollama.js");
const { createLogger } = require("@nodera/shared");

const execFileAsync = promisify(execFile);
const DOCKER = process.env.DOCKER_BIN || "docker";
const MOCK_PORT = 3912;

test("hung worker is killed at max runtime and cleaned up", async (t) => {
  // Ollama that never answers in time forces the worker to hang.
  const mock = await startMockOllama({ port: MOCK_PORT, delayMs: 120000 });
  t.after(() => mock.stop());

  const jobsDir = fs.mkdtempSync(path.join(os.tmpdir(), "nodera-hang-"));
  const runId = `run_hang_${Date.now()}`;
  process.env.OLLAMA_URL = `http://host.docker.internal:${MOCK_PORT}`;
  t.after(() => delete process.env.OLLAMA_URL);

  const started = Date.now();
  const result = await runJob({
    run: {
      run_id: runId,
      job_id: "job_hang",
      model: "llama-3.1-8b",
      input: { prompt: "hang forever", max_tokens: 16 },
    },
    model: {
      slug: "llama-3.1-8b",
      workerImage: "nodera/llm-worker",
      runtimeRef: "mock-model",
      maxRuntimeS: 4,
    },
    jobsDir,
    log: createLogger("test"),
  });
  const elapsed = Date.now() - started;

  assert.equal(result.status, "failed");
  assert.equal(result.error.code, "deadline_exceeded");
  assert.match(result.error.message, /took too long/);
  // Killed at ~4s, not after the worker's own 120s hang.
  assert.ok(elapsed >= 3500 && elapsed < 30000, `kill happened after ${elapsed}ms`);

  // Container is gone.
  const { stdout } = await execFileAsync(DOCKER, [
    "ps", "-a", "--filter", `name=nodera-run-${runId}`, "--format", "{{.Names}}",
  ]);
  assert.equal(stdout.trim(), "", "container should be removed");

  // Job dir is cleaned.
  assert.ok(!fs.existsSync(path.join(jobsDir, runId)), "job dir should be cleaned up");
});
