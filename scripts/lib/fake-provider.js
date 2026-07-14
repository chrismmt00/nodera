// A fake provider agent driven entirely through the public API: register,
// heartbeat, poll, "execute", report. Used by smoke, the multi-provider
// test (2.6), and the load harness (9.1).
class FakeProvider {
  constructor({
    api,
    name,
    models = ["llama-3.1-8b"],
    concurrency = 1,
    enrollSecret = process.env.PROVIDER_ENROLL_SECRET,
    simulateMs = 200,
    failEvery = 0, // every Nth run reports failure; 0 = never
    pollMs = 250,
    heartbeatMs = 5000,
  }) {
    this.api = api;
    this.name = name;
    this.models = models;
    this.concurrency = concurrency;
    this.enrollSecret = enrollSecret;
    this.simulateMs = simulateMs;
    this.failEvery = failEvery;
    this.pollMs = pollMs;
    this.heartbeatMs = heartbeatMs;
    this.token = null;
    this.providerId = null;
    this.running = false;
    this.activeRuns = 0;
    this.stats = { claimedRunIds: [], reports: 0, failures: 0, maxConcurrent: 0 };
    this._timers = [];
    this._pending = new Set();
  }

  async register() {
    const res = await fetch(`${this.api}/providers/register`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        enroll_secret: this.enrollSecret,
        name: this.name,
        capabilities: {
          models: this.models,
          gpu: { model: "Fake GPU", vram_gb: 24 },
          concurrency: this.concurrency,
        },
      }),
    });
    if (res.status !== 201) {
      throw new Error(`fake provider register failed: ${res.status} ${await res.text()}`);
    }
    const body = await res.json();
    this.providerId = body.provider_id;
    this.token = body.provider_token;
    return this;
  }

  _headers() {
    return { "content-type": "application/json", "x-provider-token": this.token };
  }

  async heartbeat() {
    await fetch(`${this.api}/providers/heartbeat`, {
      method: "POST",
      headers: this._headers(),
      body: JSON.stringify({ active_runs: this.activeRuns, models_ready: this.models }),
    });
  }

  async start() {
    if (!this.token) await this.register();
    await this.heartbeat();
    this.running = true;
    this._timers.push(setInterval(() => this.heartbeat().catch(() => {}), this.heartbeatMs));
    this._pollLoop();
    return this;
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
          const body = await res.json();
          if (body.run) {
            this._execute(body.run);
            continue; // claim as much as capacity allows before sleeping
          }
        } catch {
          // control plane hiccup — retry next cycle
        }
      }
      await new Promise((r) => setTimeout(r, this.pollMs));
    }
  }

  _execute(run) {
    this.activeRuns += 1;
    this.stats.claimedRunIds.push(run.run_id);
    this.stats.maxConcurrent = Math.max(this.stats.maxConcurrent, this.activeRuns);
    const seq = this.stats.claimedRunIds.length;
    const shouldFail = this.failEvery > 0 && seq % this.failEvery === 0;

    const done = (async () => {
      await new Promise((r) => setTimeout(r, this.simulateMs));
      const text = `Fake output for ${run.job_id} from ${this.name}.`;
      const resultJson = JSON.stringify({ text });
      const body = shouldFail
        ? {
            run_id: run.run_id,
            status: "failed",
            exit_code: 1,
            error: { code: "worker_error", message: "Simulated failure." },
          }
        : {
            run_id: run.run_id,
            status: "succeeded",
            exit_code: 0,
            usage: {
              tokens_in: 10 + (seq % 5),
              tokens_out: 40 + (seq % 7),
              images: 0,
              duration_ms: this.simulateMs,
              model_slug: run.model,
            },
            artifacts: [
              {
                name: "result.json",
                mime: "application/json",
                size_bytes: Buffer.byteLength(resultJson),
                inline_base64: Buffer.from(resultJson).toString("base64"),
              },
            ],
          };
      try {
        const res = await fetch(`${this.api}/providers/report`, {
          method: "POST",
          headers: this._headers(),
          body: JSON.stringify(body),
        });
        if (res.status === 200) {
          this.stats.reports += 1;
          if (shouldFail) this.stats.failures += 1;
        } else {
          console.error(`fake provider report ${res.status}: ${await res.text()}`);
        }
      } finally {
        this.activeRuns -= 1;
      }
    })();
    this._pending.add(done);
    done.finally(() => this._pending.delete(done));
  }

  async stop() {
    this.running = false;
    for (const t of this._timers) clearInterval(t);
    await Promise.allSettled([...this._pending]);
  }
}

module.exports = { FakeProvider };
