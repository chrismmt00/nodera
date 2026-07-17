const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const { randomBytes } = require("node:crypto");
const { spawnSync } = require("node:child_process");
const { validateProductionEnv } = require("../scripts/lib/production-env.js");

function productionWebEnv(overrides = {}) {
  const databasePassword = randomBytes(24).toString("hex");
  return {
    NODE_ENV: "production",
    DATABASE_URL: `postgresql://nodera:${databasePassword}@postgres:5432/nodera`,
    APP_URL: "https://app.nodera.test",
    ALLOW_DEV_LOGIN: "0",
    SESSION_SECRET: randomBytes(32).toString("hex"),
    PROVIDER_ENROLL_SECRET: randomBytes(32).toString("hex"),
    GOOGLE_CLIENT_ID: "google-client-id.apps.test",
    GOOGLE_CLIENT_SECRET: randomBytes(24).toString("hex"),
    STORAGE_BACKEND: "r2",
    R2_ACCOUNT_ID: randomBytes(16).toString("hex"),
    R2_BUCKET: "nodera",
    R2_ACCESS_KEY_ID: randomBytes(16).toString("hex"),
    R2_SECRET_ACCESS_KEY: randomBytes(24).toString("hex"),
    R2_ENDPOINT: "https://account-id.r2.cloudflarestorage.com",
    ...overrides,
  };
}

test("production web configuration accepts the complete secure contract", () => {
  assert.doesNotThrow(() => validateProductionEnv("web", productionWebEnv()));
});

test("production web configuration rejects unsafe modes and placeholder secrets", () => {
  const unsafe = productionWebEnv({
    APP_URL: "http://localhost:3000",
    ALLOW_DEV_LOGIN: "1",
    STORAGE_BACKEND: "local",
    SESSION_SECRET: "replace-me",
    R2_ENDPOINT: "http://r2.invalid",
  });

  assert.throws(
    () => validateProductionEnv("web", unsafe),
    (err) => {
      assert.match(err.message, /APP_URL must use https:/);
      assert.match(err.message, /ALLOW_DEV_LOGIN/);
      assert.match(err.message, /STORAGE_BACKEND must be r2/);
      assert.match(err.message, /SESSION_SECRET/);
      assert.match(err.message, /R2_ENDPOINT must use https:/);
      assert.doesNotMatch(err.message, /replace-me/);
      return true;
    }
  );
});

test("dispatcher and migration require only production mode and credentialed Postgres", () => {
  const databasePassword = randomBytes(24).toString("hex");
  const env = {
    NODE_ENV: "production",
    DATABASE_URL: `postgresql://nodera:${databasePassword}@postgres:5432/nodera`,
  };
  assert.doesNotThrow(() => validateProductionEnv("dispatcher", env));
  assert.doesNotThrow(() => validateProductionEnv("migrate", env));
  assert.throws(
    () => validateProductionEnv("dispatcher", { ...env, DATABASE_URL: "postgresql://postgres/nodera" }),
    /DATABASE_URL must include database credentials/
  );
});

test("production Compose topology renders with the complete environment contract", () => {
  const env = productionWebEnv({
    POSTGRES_PASSWORD: randomBytes(24).toString("hex"),
  });
  const docker = process.env.DOCKER_BIN || "docker";
  const result = spawnSync(
    docker,
    ["compose", "-f", path.join("deploy", "compose.yml"), "config", "--quiet"],
    { cwd: path.join(__dirname, ".."), env: { ...process.env, ...env }, encoding: "utf8" }
  );

  assert.equal(result.status, 0, result.stderr || result.stdout);
});
