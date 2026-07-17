// Task 7.2: jobs dashboard is backed by polling GET /v1/jobs.
const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
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

test("jobs dashboard page uses newest-first public jobs data that changes on poll", async () => {
  const page = await fetch(`${BASE}/jobs`);
  assert.equal(page.status, 200);
  assert.match(await page.text(), /Loading jobs/);

  userEmail = `jobs-dashboard-${Date.now()}@nodera.local`;
  const login = await fetch(`${BASE}/api/auth/dev-login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: userEmail }),
  });
  assert.equal(login.status, 200);
  const cookie = login.headers.get("set-cookie").split(";")[0];

  const first = await createJob(cookie, "first dashboard job");
  await new Promise((resolve) => setTimeout(resolve, 25));
  const second = await createJob(cookie, "second dashboard job");

  const firstList = await fetch(`${API}/jobs?limit=10`, { headers: { cookie } });
  assert.equal(firstList.status, 200);
  const { jobs } = await firstList.json();
  assert.deepEqual(jobs.slice(0, 2).map((job) => job.job_id), [second.job_id, first.job_id]);
  assert.deepEqual(jobs.slice(0, 2).map((job) => job.status), ["queued", "queued"]);

  await prisma.job.update({ where: { id: first.job_id }, data: { status: "running" } });
  const refreshed = await fetch(`${API}/jobs?limit=10`, { headers: { cookie } });
  assert.equal(refreshed.status, 200);
  const updatedJobs = (await refreshed.json()).jobs;
  const updatedFirst = updatedJobs.find((job) => job.job_id === first.job_id);
  assert.equal(updatedFirst.status, "running");

  const helperPath = path.join(__dirname, "..", "apps", "web", "src", "lib", "client", "jobs-view.js");
  const view = await import(pathToFileURL(helperPath).href);
  assert.equal(view.isLiveJob(updatedFirst), true);
  assert.deepEqual(view.summarizeJobs(updatedJobs.slice(0, 2)), { live: 2, done: 0, failed: 0 });
});

async function createJob(cookie, prompt) {
  const response = await fetch(`${API}/jobs`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({ model: "llama-3.1-8b", input: { prompt } }),
  });
  assert.equal(response.status, 201);
  return response.json();
}
