// Task 3.1: worker contract utils — happy path and malformed meta.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { writeJobInput, readWorkerOutput } = require("@nodera/shared/src/worker-contract.js");

function tmpJobDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "nodera-job-"));
}

const USAGE = { tokens_in: 10, tokens_out: 50, images: 0, duration_ms: 1200, model_slug: "llama-3.1-8b" };

test("writeJobInput creates input.json and an empty out/", () => {
  const dir = tmpJobDir();
  writeJobInput(dir, { model: "llama-3.1-8b", input: { prompt: "hi" } });
  const written = JSON.parse(fs.readFileSync(path.join(dir, "input.json"), "utf8"));
  assert.equal(written.model, "llama-3.1-8b");
  assert.ok(fs.statSync(path.join(dir, "out")).isDirectory());
});

test("readWorkerOutput happy path: meta, usage, logs, artifact files", () => {
  const dir = tmpJobDir();
  writeJobInput(dir, {});
  const out = path.join(dir, "out");
  fs.writeFileSync(path.join(out, "meta.json"), JSON.stringify({ usage: USAGE, exit: "ok" }));
  fs.writeFileSync(path.join(out, "logs.txt"), "worker log line\n");
  fs.writeFileSync(path.join(out, "result.json"), JSON.stringify({ text: "hello" }));
  fs.writeFileSync(path.join(out, "output.png"), Buffer.from([137, 80, 78, 71]));

  const result = readWorkerOutput(dir);
  assert.equal(result.ok, true);
  assert.deepEqual(result.usage, USAGE);
  assert.equal(result.meta.exit, "ok");
  assert.equal(result.logs, "worker log line\n");
  const names = result.files.map((f) => f.name).sort();
  assert.deepEqual(names, ["output.png", "result.json"]);
  assert.equal(result.files.find((f) => f.name === "output.png").sizeBytes, 4);
});

test("readWorkerOutput rejects every malformed-meta shape", () => {
  const cases = [
    { name: "no out dir", setup: () => {} },
    {
      name: "missing meta.json",
      setup: (out) => fs.mkdirSync(out, { recursive: true }),
    },
    {
      name: "meta not JSON",
      setup: (out) => {
        fs.mkdirSync(out, { recursive: true });
        fs.writeFileSync(path.join(out, "meta.json"), "not json {");
      },
    },
    {
      name: "meta an array",
      setup: (out) => {
        fs.mkdirSync(out, { recursive: true });
        fs.writeFileSync(path.join(out, "meta.json"), "[1,2]");
      },
    },
    {
      name: "usage missing",
      setup: (out) => {
        fs.mkdirSync(out, { recursive: true });
        fs.writeFileSync(path.join(out, "meta.json"), JSON.stringify({}));
      },
    },
    {
      name: "usage field negative",
      setup: (out) => {
        fs.mkdirSync(out, { recursive: true });
        fs.writeFileSync(
          path.join(out, "meta.json"),
          JSON.stringify({ usage: { ...USAGE, tokens_out: -1 } })
        );
      },
    },
    {
      name: "usage field not integer",
      setup: (out) => {
        fs.mkdirSync(out, { recursive: true });
        fs.writeFileSync(
          path.join(out, "meta.json"),
          JSON.stringify({ usage: { ...USAGE, duration_ms: "fast" } })
        );
      },
    },
    {
      name: "model_slug missing",
      setup: (out) => {
        fs.mkdirSync(out, { recursive: true });
        const { model_slug, ...rest } = USAGE;
        fs.writeFileSync(path.join(out, "meta.json"), JSON.stringify({ usage: rest }));
      },
    },
  ];
  for (const c of cases) {
    const dir = tmpJobDir();
    c.setup(path.join(dir, "out"));
    const result = readWorkerOutput(dir);
    assert.equal(result.ok, false, `case '${c.name}' should be rejected`);
    assert.equal(typeof result.error, "string");
  }
});
