const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { newId, buildCustomerOnboardingReport } = require("@nodera/db");
const { createWorkspaceFixture, destroyWorkspaceFixture, prisma } = require("./helpers/api.js");

const fixtures = [];
const emails = [];

test.before(async () => {
  const definitions = [
    { key: "under", signupAt: new Date("2026-01-01T00:00:00.000Z") },
    { key: "boundary", signupAt: new Date("2026-01-01T00:05:00.000Z") },
    { key: "pending", signupAt: new Date("2026-01-01T00:10:00.000Z") },
  ];

  for (const definition of definitions) {
    const fixture = await createWorkspaceFixture();
    const email = `${newId("mail")}@example.test`;
    await prisma.user.create({
      data: {
        id: newId("user"),
        email,
        provider: "test",
        workspaceId: fixture.workspace.id,
        createdAt: definition.signupAt,
      },
    });
    fixtures.push({ ...fixture, ...definition });
    emails.push(email);
  }

  const under = fixtures.find((fixture) => fixture.key === "under");
  await createJob(under, "succeeded", new Date(under.signupAt.getTime() + 42_500));

  const boundary = fixtures.find((fixture) => fixture.key === "boundary");
  await prisma.user.create({
    data: {
      id: newId("user"),
      email: `${newId("mail")}@example.test`,
      provider: "test",
      workspaceId: boundary.workspace.id,
      createdAt: new Date(boundary.signupAt.getTime() + 15_000),
    },
  });
  await createJob(boundary, "failed", new Date(boundary.signupAt.getTime() + 10_000));
  await createJob(boundary, "succeeded", new Date(boundary.signupAt.getTime() + 90_000));
  await createJob(boundary, "succeeded", new Date(boundary.signupAt.getTime() + 60_000));

  const pending = fixtures.find((fixture) => fixture.key === "pending");
  await createJob(pending, "failed", new Date(pending.signupAt.getTime() + 20_000));
});

test.after(async () => {
  for (const fixture of fixtures) await destroyWorkspaceFixture(fixture.workspace);
});

test("report measures earliest signup to earliest succeeded job with a strict 60-second target", async () => {
  const report = await buildCustomerOnboardingReport(prisma, {
    generatedAt: new Date("2026-01-02T00:00:00.000Z"),
  });
  const rows = new Map(report.workspaces.map((row) => [row.workspace_id, row]));
  const under = rows.get(fixtures.find((fixture) => fixture.key === "under").workspace.id);
  const boundary = rows.get(fixtures.find((fixture) => fixture.key === "boundary").workspace.id);
  const pending = rows.get(fixtures.find((fixture) => fixture.key === "pending").workspace.id);

  assert.equal(under.seconds_to_first_success, 42.5);
  assert.equal(under.target_result, "under_target");
  assert.equal(boundary.seconds_to_first_success, 60);
  assert.equal(boundary.target_result, "at_or_over_target");
  assert.equal(pending.seconds_to_first_success, null);
  assert.equal(pending.target_result, "pending");
  assert.ok(report.summary.total_workspaces >= 3);
  assert.ok(report.summary.completed >= 2);
  assert.equal(JSON.stringify(report).includes(emails[0]), false);
});

test("onboarding report command emits machine-readable JSON without user emails", () => {
  const command = process.platform === "win32" ? process.env.ComSpec : "npm";
  const args =
    process.platform === "win32"
      ? ["/d", "/s", "/c", "npm run --silent onboarding:report"]
      : ["run", "--silent", "onboarding:report"];
  const result = spawnSync(command, args, {
    cwd: path.join(__dirname, ".."),
    env: process.env,
    encoding: "utf8",
  });

  assert.equal(result.status, 0, result.stderr);
  const report = JSON.parse(result.stdout);
  assert.equal(report.target_seconds, 60);
  assert.ok(report.workspaces.some((row) => row.workspace_id === fixtures[0].workspace.id));
  for (const email of emails) assert.equal(result.stdout.includes(email), false);
});

async function createJob(fixture, status, finalizedAt) {
  await prisma.job.create({
    data: {
      id: newId("job"),
      workspaceId: fixture.workspace.id,
      modelSlug: "llama-3.1-8b",
      input: { prompt: newId("measurement") },
      status,
      finalizedAt,
    },
  });
}
