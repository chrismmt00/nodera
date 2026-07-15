// Task 3.3: hardened Docker runner — security flags asserted from the args
// builder AND from docker inspect on a live container.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { execFile } = require("node:child_process");
const { promisify } = require("node:util");
const { buildDockerArgs, runJob, imageAllowlist } = require("../apps/provider-agent/src/docker-runner.js");
const { startMockOllama } = require("./helpers/mock-ollama.js");
const { createLogger } = require("@nodera/shared");

const execFileAsync = promisify(execFile);
const DOCKER = process.env.DOCKER_BIN || "docker";
const MOCK_PORT = 3911;

test("buildDockerArgs: hardened, /job is the only mount, no privileged", () => {
  const args = buildDockerArgs({
    containerName: "nodera-run-x",
    jobDir: "C:/jobs/run_x",
    image: "nodera/llm-worker",
    env: { OLLAMA_URL: "http://host.docker.internal:11434" },
  });
  const joined = args.join(" ");
  assert.ok(!joined.includes("--privileged"), "must never run privileged");
  assert.ok(!joined.includes("docker.sock"), "must never mount the docker socket");
  assert.ok(joined.includes("--cap-drop ALL"));
  assert.ok(joined.includes("--security-opt no-new-privileges"));
  assert.ok(joined.includes("--read-only"));
  assert.ok(joined.includes("--pids-limit 256"));
  assert.ok(joined.includes("--memory"));
  assert.ok(joined.includes("--cpus"));
  assert.equal(args.filter((a) => a === "-v").length, 1, "exactly one mount");
  assert.ok(joined.includes("C:/jobs/run_x:/job"));
  assert.equal(args[args.length - 1], "nodera/llm-worker");
});

test("buildDockerArgs: image models get --gpus all, llm models do not", () => {
  const imageArgs = buildDockerArgs({
    containerName: "nodera-run-img",
    jobDir: "/jobs/img",
    image: "nodera/image-worker",
    gpu: true,
    memory: "12g",
  }).join(" ");
  assert.ok(imageArgs.includes("--gpus all"), "image worker must request the GPU");
  assert.ok(imageArgs.includes("--memory 12g"));
  assert.ok(!imageArgs.includes("--privileged"), "GPU passthrough is not privileged mode");

  const llmArgs = buildDockerArgs({
    containerName: "nodera-run-llm",
    jobDir: "/jobs/llm",
    image: "nodera/llm-worker",
  }).join(" ");
  assert.ok(!llmArgs.includes("--gpus"), "llm worker must not request the GPU");
});

test("image allowlist blocks non-menu images", async () => {
  const menu = [{ slug: "llama-3.1-8b", workerImage: "nodera/llm-worker" }];
  assert.deepEqual([...imageAllowlist(menu)], ["nodera/llm-worker"]);
  const result = await runJob({
    run: { run_id: "run_evil", job_id: "job_x", model: "x", input: {} },
    model: { slug: "x", workerImage: "evil/image", runtimeRef: "x", maxRuntimeS: 10 },
    jobsDir: fs.mkdtempSync(path.join(os.tmpdir(), "nodera-allow-")),
    log: createLogger("test"),
    menu,
  });
  assert.equal(result.status, "failed");
  assert.equal(result.error.code, "image_not_allowed");
});

test("live container: docker inspect confirms the §11 baseline; run succeeds", async (t) => {
  const mock = await startMockOllama({ port: MOCK_PORT, delayMs: 4000, text: "inspected" });
  t.after(() => mock.stop());

  const jobsDir = fs.mkdtempSync(path.join(os.tmpdir(), "nodera-inspect-"));
  const runId = `run_inspect_${Date.now()}`;
  process.env.OLLAMA_URL = `http://host.docker.internal:${MOCK_PORT}`;
  t.after(() => delete process.env.OLLAMA_URL);

  const resultPromise = runJob({
    run: {
      run_id: runId,
      job_id: "job_inspect",
      model: "llama-3.1-8b",
      input: { prompt: "inspect me", max_tokens: 16 },
    },
    model: {
      slug: "llama-3.1-8b",
      workerImage: "nodera/llm-worker",
      runtimeRef: "mock-model",
      maxRuntimeS: 60,
    },
    jobsDir,
    log: createLogger("test"),
  });

  // The mock's 4s delay keeps the container alive long enough to inspect it.
  let inspect = null;
  const deadline = Date.now() + 20000;
  while (Date.now() < deadline && !inspect) {
    try {
      const { stdout } = await execFileAsync(DOCKER, ["inspect", `nodera-run-${runId}`]);
      inspect = JSON.parse(stdout)[0];
    } catch {
      await new Promise((r) => setTimeout(r, 200));
    }
  }
  assert.ok(inspect, "container never became inspectable");

  const hc = inspect.HostConfig;
  assert.equal(hc.Privileged, false, "privileged must be false");
  assert.deepEqual(hc.CapDrop, ["ALL"], "all capabilities dropped");
  assert.ok(hc.SecurityOpt.includes("no-new-privileges"));
  assert.equal(hc.ReadonlyRootfs, true);
  assert.ok(hc.Memory > 0, "memory capped");
  assert.ok(hc.NanoCpus > 0, "cpus capped");
  assert.equal(hc.PidsLimit, 256);
  assert.equal(inspect.Mounts.length, 1, "exactly one mount");
  assert.equal(inspect.Mounts[0].Destination, "/job");
  assert.ok(!JSON.stringify(inspect.Mounts).includes("docker.sock"));
  assert.equal(inspect.Config.User, "node", "runs as non-root");

  const result = await resultPromise;
  assert.equal(result.status, "succeeded");
  assert.equal(result.usage.tokens_out, 13);
  assert.ok(result.files.some((f) => f.name === "result.json"));
  // 3.4 territory but cheap to check here: job dir cleaned after the run.
  assert.ok(!fs.existsSync(path.join(jobsDir, runId)), "job dir should be cleaned up");
});
