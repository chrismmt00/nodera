"use client";

// Browser-side wrapper over the public /v1 API. Same-origin, so the session
// cookie authorizes every call — the dashboard never handles the API key
// (DECISIONS 017). Returns parsed JSON; throws an Error carrying the contract
// { code, message } on non-2xx.
const BASE = "/api/v1";

async function call(path, { method = "GET", body, headers = {}, signal } = {}) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { ...(body ? { "content-type": "application/json" } : {}), ...headers },
    body: body ? JSON.stringify(body) : undefined,
    credentials: "same-origin",
    signal,
  });
  if (res.status === 204) return null;
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data?.error?.message || `Request failed (${res.status})`);
    err.code = data?.error?.code || "internal";
    err.status = res.status;
    if (res.headers.get("retry-after")) err.retryAfter = Number(res.headers.get("retry-after"));
    throw err;
  }
  return data;
}

export const api = {
  models: () => call("/models"),
  createJob: (body, options = {}) => call("/jobs", { ...options, method: "POST", body }),
  job: (id, options = {}) => call(`/jobs/${id}`, options),
  jobs: (params = "") => call(`/jobs${params}`),
};

async function authCall(path, options = {}) {
  const res = await fetch(path, { credentials: "same-origin", ...options });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data?.error?.message || `Request failed (${res.status})`);
    err.code = data?.error?.code || "internal";
    err.status = res.status;
    throw err;
  }
  return data;
}

export const account = {
  keys: () => authCall("/api/account/keys"),
  createKey: (label) =>
    authCall("/api/account/keys", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ label }),
    }),
  revokeKey: (id) =>
    authCall(`/api/account/keys/${encodeURIComponent(id)}`, { method: "DELETE" }),
};

export async function whoAmI() {
  return authCall("/api/auth/me");
}

export async function devLogin(email) {
  return authCall("/api/auth/dev-login", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email }),
  });
}

export async function logout() {
  await authCall("/api/auth/logout", { method: "POST" });
}
