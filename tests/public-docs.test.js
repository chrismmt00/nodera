// Task 6.6: the published docs cover every v1 endpoint and the same
// quickstart payload shown on the page succeeds with a freshly generated key.
const test = require("node:test");
const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const {
  API,
  BASE,
  createWorkspaceFixture,
  destroyWorkspaceFixture,
  prisma,
} = require("./helpers/api.js");

let fx;
let reference;

test.before(async () => {
  fx = await createWorkspaceFixture();
  const modulePath = path.join(
    __dirname,
    "..",
    "apps",
    "web",
    "src",
    "lib",
    "docs",
    "api-reference.js"
  );
  reference = await import(pathToFileURL(modulePath));
});

test.after(async () => {
  await destroyWorkspaceFixture(fx.workspace);
  await prisma.$disconnect();
});

test("public docs render quickstart, every endpoint, errors, and webhook verification", async () => {
  const response = await fetch(`${BASE}/docs`);
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.match(html, /API documentation/);
  assert.match(html, /Quickstart/);
  assert.match(html, /X-Nodera-Signature/);
  assert.match(html, /crypto\.timingSafeEqual/);
  assert.match(html, /Retry-After/);
  for (const endpoint of reference.ALL_ENDPOINTS) {
    assert.ok(html.includes(endpoint.title), `${endpoint.method} ${endpoint.path} is documented`);
  }
});

test("a fresh key completes the published quickstart payload through curl", async () => {
  const endpoint = reference.CUSTOMER_ENDPOINTS.find((item) => item.id === "create-job");
  const args = reference.curlArguments(endpoint, API, { apiKey: fx.apiKeyPlaintext });
  const command = process.platform === "win32" ? "curl.exe" : "curl";
  const result = spawnSync(command, args, { encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
  const created = JSON.parse(result.stdout);
  assert.match(created.job_id, /^job_/);
  assert.equal(created.status, "queued");

  const detail = await fetch(`${API}/jobs/${created.job_id}`, {
    headers: { "x-api-key": fx.apiKeyPlaintext },
  });
  assert.equal(detail.status, 200);
  assert.equal((await detail.json()).model, reference.QUICKSTART_BODY.model);
});
