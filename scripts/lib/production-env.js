const PLACEHOLDER = /(change[-_ ]?me|replace[-_ ]?me|your[-_ ]|example)/i;

function validateProductionEnv(service, env = process.env) {
  if (!new Set(["web", "dispatcher", "migrate"]).has(service)) {
    throw new Error(`Unknown production service '${service}'`);
  }

  const errors = [];
  const required = (name) => {
    const value = env[name]?.trim();
    if (!value || PLACEHOLDER.test(value)) {
      errors.push(`${name} must be set to a non-placeholder value`);
      return null;
    }
    return value;
  };
  const secret = (name, minLength = 32) => {
    const value = required(name);
    if (value && value.length < minLength) errors.push(`${name} must be at least ${minLength} characters`);
    return value;
  };
  const url = (name, protocols) => {
    const value = required(name);
    if (!value) return null;
    try {
      const parsed = new URL(value);
      if (!protocols.includes(parsed.protocol)) {
        errors.push(`${name} must use ${protocols.join(" or ")}`);
        return null;
      }
      return parsed;
    } catch {
      errors.push(`${name} must be a valid URL`);
      return null;
    }
  };

  if (env.NODE_ENV !== "production") errors.push("NODE_ENV must be production");

  const databaseUrl = url("DATABASE_URL", ["postgresql:", "postgres:"]);
  if (databaseUrl && (!databaseUrl.username || !databaseUrl.password)) {
    errors.push("DATABASE_URL must include database credentials");
  }

  if (service === "web") {
    const appUrl = url("APP_URL", ["https:"]);
    if (
      appUrl &&
      (appUrl.username || appUrl.password || appUrl.pathname !== "/" || appUrl.search || appUrl.hash)
    ) {
      errors.push("APP_URL must be a clean public origin");
    }

    if (env.ALLOW_DEV_LOGIN === "1") errors.push("ALLOW_DEV_LOGIN must not be enabled in production");
    if (env.STORAGE_BACKEND !== "r2") errors.push("STORAGE_BACKEND must be r2 in production");

    secret("SESSION_SECRET");
    secret("PROVIDER_ENROLL_SECRET");
    required("GOOGLE_CLIENT_ID");
    secret("GOOGLE_CLIENT_SECRET", 16);
    required("R2_ACCOUNT_ID");
    required("R2_BUCKET");
    required("R2_ACCESS_KEY_ID");
    secret("R2_SECRET_ACCESS_KEY", 16);
    url("R2_ENDPOINT", ["https:"]);
  }

  if (errors.length > 0) {
    throw new Error(`Invalid production environment:\n- ${errors.join("\n- ")}`);
  }
}

module.exports = { validateProductionEnv };
