// The provider agent: registers (or reuses a saved identity), heartbeats,
// polls for its runs, executes them in worker containers, reports results.
// Designed from the start for auto-register and graceful pause/stop
// (docs/BLUEPRINT.md §3).
const fs = require("node:fs");
const path = require("node:path");
const { createLogger, MODELS } = require("@nodera/shared");
const { runJob } = require("./docker-runner.js");

const MIME_BY_EXT = {
  ".json": "application/json",
  ".png": "image/png",
  ".txt": "text/plain",
};

function mimeFor(name) {
  return MIME_BY_EXT[path.extname(name).toLowerCase()] || "application/octet-stream";
}

class ProviderAgent {
  constructor(options = {}) {
    this.api = options.api || process.env.API_BASE_URL || "http://localhost:3000/api/v1";
    this.name = options.name || process.env.NODE_NAME || "dev-agent";
    this.concurrency = options.concurrency ?? parseInt(process.env.AGENT_CONCURRENCY || "1", 10);
    this.jobsDir = options.jobsDir || process.env.AGENT_JOBS_DIR || path.resolve("agent-jobs");
    this.stateFile =
      options.stateFile || process.env.AGENT_STATE_FILE || path.resolve(".nodera-agent.json");
    this.pollMs = options.pollMs ?? parseInt(process.env.AGENT_POLL_MS || "1000", 10);
    this.heartbeatMs =
      options.heartbeatMs ?? parseInt(process.env.AGENT_HEARTBEAT_MS || "30000", 10);
    this.menu = options.menu || MODELS;
    // v1: every menu model whose worker image exists locally counts as ready;
    // real pre-pull with progress arrives in Phase 8.
    this.modelsReady = options.modelsReady || this.menu.map((m) => m.slug);
    this.log = createLogger("provider-agent");
    this.token = null;
    this.providerId = null;
    this.running = false;
    this.activeRuns = 0;
    this._timers = [];
    this._pending = new Set();
  }

  _headers() {
    return { "content-type": "application/json", "x-provider-token": this.token };
  }

  async ensureIdentity() {
    if (process.env.PROVIDER_TOKEN) {
      this.token = process.env.PROVIDER_TOKEN;
      this.providerId = process.env.PROVIDER_ID || null;
      return;
    }
    if (fs.existsSync(this.stateFile)) {
      const saved = JSON.parse(fs.readFileSync(this.stateFile, "utf8"));
      if (saved.provider_token) {
        this.token = saved.provider_token;
        this.providerId = saved.provider_id;
        this.log.info("reusing saved identity", { providerId: this.providerId });
        return;
      }
    }
    const res = await fetch(`${this.api}/providers/register`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        enroll_secret: process.env.PROVIDER_ENROLL_SECRET,
        name: this.name,
        capabilities: {
          models: this.menu.map((m) => m.slug),
          gpu: { model: process.env.AGENT_GPU_MODEL || "unknown", vram_gb: 0 },
          concurrency: this.concurrency,
        },
      }),
    });
    if (res.status !== 201) {
      throw new Error(`register failed: ${res.status} ${await res.text()}`);
    }
    const body = await res.json();
    this.token = body.provider_token;
    this.providerId = body.provider_id;
    fs.writeFileSync(
      this.stateFile,
      JSON.stringify({ provider_id: this.providerId, provider_token: this.token })
    );
    this.log.info("registered", { providerId: this.providerId });
  }

  async heartbeat() {
    try {
      await fetch(`${this.api}/providers/heartbeat`, {
        method: "POST",
        headers: this._headers(),
        body: JSON.stringify({ active_runs: this.activeRuns, models_ready: this.modelsReady }),
      });
    } catch (err) {
      this.log.warn("heartbeat failed", { error: err.message });
    }
  }

  async start() {
    await this.ensureIdentity();
    fs.mkdirSync(this.jobsDir, { recursive: true });
    await this.heartbeat();
    this.running = true;
    this._timers.push(setInterval(() => this.heartbeat(), this.heartbeatMs));
    this._pollLoop();
    this.log.info("agent started", {
      providerId: this.providerId,
      concurrency: this.concurrency,
      modelsReady: this.modelsReady.join(","),
    });
  }

  async _pollLoop() {
    while (this.running) {
      if (this.activeRuns < this.concurrency) {
        try {
          const res = await fetch(`${this.api}/providers/poll`, {
            method: "POST",
            headers: this._headers(),
            body: JSON.stringify({}),
          });
          if (res.status === 200) {
            const body = await res.json();
            if (body.run) {
              this._execute(body.run);
              continue;
            }
          }
        } catch (err) {
          this.log.warn("poll failed", { error: err.message });
        }
      }
      await new Promise((r) => setTimeout(r, this.pollMs));
    }
  }

  _execute(run) {
    this.activeRuns += 1;
    const done = (async () => {
      const model = this.menu.find((m) => m.slug === run.model);
      const result = await runJob({
        run,
        model,
        jobsDir: this.jobsDir,
        log: this.log,
        menu: this.menu,
      });
      await this._report(run, result);
    })().catch((err) => {
      this.log.error("run execution crashed", { runId: run.run_id, error: err.message });
    });
    done.finally(() => {
      this.activeRuns -= 1;
      this._pending.delete(done);
    });
    this._pending.add(done);
  }

  async _report(run, result) {
    const inlineMax = parseInt(process.env.INLINE_ARTIFACT_MAX_BYTES || "262144", 10);
    let body;
    if (result.status === "succeeded") {
      const artifacts = [];
      for (const file of result.files) {
        if (file.sizeBytes > inlineMax) {
          // Large artifacts need presigned uploads — Phase 4.
          this.log.warn("artifact exceeds inline limit — skipped until Phase 4", {
            runId: run.run_id,
            name: file.name,
            sizeBytes: file.sizeBytes,
          });
          continue;
        }
        artifacts.push({
          name: file.name,
          mime: mimeFor(file.name),
          size_bytes: file.sizeBytes,
          inline_base64: file.buffer.toString("base64"),
        });
      }
      body = {
        run_id: run.run_id,
        status: "succeeded",
        exit_code: 0,
        usage: result.usage,
        artifacts,
      };
    } else {
      body = {
        run_id: run.run_id,
        status: "failed",
        exit_code: result.exitCode ?? 1,
        error: result.error,
      };
    }
    const res = await fetch(`${this.api}/providers/report`, {
      method: "POST",
      headers: this._headers(),
      body: JSON.stringify(body),
    });
    if (res.status !== 200) {
      this.log.error("report rejected", { runId: run.run_id, status: res.status, body: await res.text() });
    } else {
      this.log.info("run reported", { runId: run.run_id, status: result.status });
    }
  }

  // Graceful: stop taking work, finish in-flight runs, then return.
  async stop() {
    this.running = false;
    for (const t of this._timers) clearInterval(t);
    await Promise.allSettled([...this._pending]);
    this.log.info("agent stopped", { providerId: this.providerId });
  }
}

module.exports = { ProviderAgent };
