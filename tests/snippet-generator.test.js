// Task 7.4: UI job snippets reproduce the same model/input through /v1.
const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const { spawnSync } = require("node:child_process");
const { BASE, API, destroyWorkspaceFixture, prisma } = require("./helpers/api.js");

let userEmail;

test.after(async () => {
  if (userEmail) {
    const user = await prisma.user.findUnique({ where: { email: userEmail }, include: { workspace: true } });
    if (user) {
      await prisma.user.deleteMany({ where: { workspaceId: user.workspaceId } });
      await destroyWorkspaceFixture(user.workspace);
    }
  }
  await prisma.$disconnect();
});

test("curl and Node snippets recreate an exact UI job payload", async () => {
  userEmail = `snippet-${Date.now()}@nodera.local`;
  const login = await fetch(`${BASE}/api/auth/dev-login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: userEmail }),
  });
  assert.equal(login.status, 200);
  const cookie = login.headers.get("set-cookie").split(";")[0];

  const keyResponse = await fetch(`${BASE}/api/account/keys`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie, origin: BASE },
    body: JSON.stringify({ label: "snippet integration" }),
  });
  assert.equal(keyResponse.status, 201);
  const { plaintext: apiKey } = await keyResponse.json();

  const original = await fetch(`${API}/jobs`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({
      model: "sdxl-1.0",
      input: { prompt: "snippet exact payload", width: 1024, height: 1024 },
    }),
  });
  assert.equal(original.status, 201);
  const originalBody = await original.json();
  const detail = await (await fetch(`${API}/jobs/${originalBody.job_id}`, { headers: { cookie } })).json();

  const page = await fetch(`${BASE}/jobs/${originalBody.job_id}`, { headers: { cookie } });
  assert.equal(page.status, 200);
  assert.match(await page.text(), /Loading job/);

  const helperPath = path.join(__dirname, "..", "apps", "web", "src", "lib", "client", "job-snippets.js");
  const snippets = await import(pathToFileURL(helperPath).href);
  assert.deepEqual(snippets.jobSnippetBody(detail), {
    model: "sdxl-1.0",
    input: { prompt: "snippet exact payload", width: 1024, height: 1024 },
  });

  const curlArgs = snippets.curlSnippetArguments(detail, { baseUrl: API, apiKey });
  const curlCommand = process.platform === "win32" ? "curl.exe" : "curl";
  const curlRun = spawnSync(curlCommand, curlArgs, { encoding: "utf8" });
  assert.equal(curlRun.status, 0, curlRun.stderr);
  const curlCreated = JSON.parse(curlRun.stdout);
  const curlDetail = await (await fetch(`${API}/jobs/${curlCreated.job_id}`, { headers: { cookie } })).json();
  assert.deepEqual(curlDetail.input, detail.input);
  assert.equal(curlDetail.model, detail.model);

  const nodeSnippet = snippets.formatJobNodeSnippet(detail, { baseUrl: API, apiKey });
  assert.match(nodeSnippet, /const API_KEY = "nod_/);
  assert.match(nodeSnippet, /snippet exact payload/);
  const nodeRun = spawnSync(process.execPath, ["-e", nodeSnippet], { encoding: "utf8" });
  assert.equal(nodeRun.status, 0, nodeRun.stderr);
  const nodeCreated = JSON.parse(nodeRun.stdout);
  const nodeDetail = await (await fetch(`${API}/jobs/${nodeCreated.job_id}`, { headers: { cookie } })).json();
  assert.deepEqual(nodeDetail.input, detail.input);
  assert.equal(nodeDetail.model, detail.model);

  const envNodeSnippet = snippets.formatJobNodeSnippet(detail, { baseUrl: API });
  assert.match(envNodeSnippet, /process\.env\.NODERA_API_KEY/);
  const envNodeRun = spawnSync(process.execPath, ["-e", envNodeSnippet], {
    encoding: "utf8",
    env: { ...process.env, NODERA_API_KEY: apiKey },
  });
  assert.equal(envNodeRun.status, 0, envNodeRun.stderr);
});
