// Runs one job in a hardened worker container (docs/BLUEPRINT.md §11):
// allowlisted image only, /job is the only mount, non-root, no privileged,
// dropped capabilities, cpu/ram/pids caps, read-only root fs. The model's
// max runtime is enforced by an agent-side kill timer (3.4).
const fs = require("node:fs");
const path = require("node:path");
const { spawn } = require("node:child_process");
const { writeJobInput, readWorkerOutput, MODELS } = require("@nodera/shared");

const DOCKER = process.env.DOCKER_BIN || "docker";

// The only images the agent will ever run (§11 allowlist).
function imageAllowlist(menu) {
  return new Set(menu.map((m) => m.workerImage));
}

// Pure so tests can assert the flags without Docker.
function buildDockerArgs({ containerName, jobDir, image, env = {} }) {
  const args = [
    "run",
    "--rm",
    "--name", containerName,
    // /job is the only mount — never the docker socket, never host paths.
    "-v", `${jobDir}:/job`,
    "--cap-drop", "ALL",
    "--security-opt", "no-new-privileges",
    "--read-only",
    "--tmpfs", "/tmp",
    "--memory", process.env.AGENT_WORKER_MEMORY || "2g",
    "--cpus", process.env.AGENT_WORKER_CPUS || "2",
    "--pids-limit", "256",
    // Workers reach the provider host's model server and nothing of ours.
    "--add-host", "host.docker.internal:host-gateway",
  ];
  for (const [key, value] of Object.entries(env)) {
    args.push("-e", `${key}=${value}`);
  }
  args.push(image);
  return args;
}

// Executes the run. Returns
//   { status: "succeeded", usage, files, logs } or
//   { status: "failed", error: { code, message }, logs }.
async function runJob({ run, model, jobsDir, log, menu = MODELS }) {
  if (!model || !model.workerImage) {
    return {
      status: "failed",
      error: { code: "model_unavailable", message: "This machine cannot run that model." },
    };
  }
  const allow = imageAllowlist(menu);
  if (!allow.has(model.workerImage)) {
    return {
      status: "failed",
      error: { code: "image_not_allowed", message: "Worker image is not on the allowlist." },
    };
  }

  const jobDir = path.join(jobsDir, run.run_id);
  const containerName = `nodera-run-${run.run_id.replace(/[^A-Za-z0-9_.-]/g, "")}`;
  writeJobInput(jobDir, {
    job_id: run.job_id,
    model: run.model,
    runtime_ref: model.runtimeRef,
    input: run.input,
  });

  const args = buildDockerArgs({
    containerName,
    jobDir,
    image: model.workerImage,
    env: { OLLAMA_URL: process.env.OLLAMA_URL || "http://host.docker.internal:11434" },
  });

  const maxRuntimeMs = model.maxRuntimeS * 1000;
  log.info("worker starting", { runId: run.run_id, image: model.workerImage, maxRuntimeMs });

  const outcome = await new Promise((resolve) => {
    const child = spawn(DOCKER, args, { stdio: ["ignore", "pipe", "pipe"] });
    const chunks = [];
    child.stdout.on("data", (c) => chunks.push(c));
    child.stderr.on("data", (c) => chunks.push(c));

    let timedOut = false;
    const killer = setTimeout(() => {
      timedOut = true;
      log.warn("kill timer fired — removing container", { runId: run.run_id });
      spawn(DOCKER, ["rm", "-f", containerName], { stdio: "ignore" });
    }, maxRuntimeMs);

    child.on("exit", (code) => {
      clearTimeout(killer);
      resolve({ code, timedOut, dockerOutput: Buffer.concat(chunks).toString() });
    });
    child.on("error", (err) => {
      clearTimeout(killer);
      resolve({ code: -1, timedOut: false, dockerOutput: err.message });
    });
  });

  try {
    if (outcome.timedOut) {
      return {
        status: "failed",
        error: {
          code: "deadline_exceeded",
          message: "This took too long and was stopped — try again.",
        },
      };
    }
    if (outcome.code !== 0) {
      log.warn("worker exited non-zero", { runId: run.run_id, code: outcome.code });
      return {
        status: "failed",
        exitCode: outcome.code,
        error: { code: "worker_error", message: "The worker failed while running this job." },
        logs: outcome.dockerOutput.slice(-2000),
      };
    }
    const output = readWorkerOutput(jobDir);
    if (!output.ok) {
      log.warn("worker output invalid", { runId: run.run_id, reason: output.error });
      return {
        status: "failed",
        error: { code: "worker_error", message: "The worker produced invalid output." },
      };
    }
    // Read artifact bytes before the job dir is cleaned up.
    const files = output.files.map((f) => ({
      name: f.name,
      sizeBytes: f.sizeBytes,
      buffer: fs.readFileSync(f.path),
    }));
    return { status: "succeeded", usage: output.usage, files, logs: output.logs };
  } finally {
    if (process.env.AGENT_KEEP_JOB_DIRS !== "1") {
      fs.rmSync(jobDir, { recursive: true, force: true });
    }
  }
}

module.exports = { runJob, buildDockerArgs, imageAllowlist };
