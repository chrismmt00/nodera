export { API_BASES } from "../client/api-bases.js";

export const QUICKSTART_BODY = {
  model: "llama-3.1-8b",
  input: {
    prompt: "Write a concise welcome email for a new customer.",
    max_tokens: 128,
  },
};

export const CUSTOMER_ENDPOINTS = [
  {
    id: "create-job",
    method: "POST",
    path: "/jobs",
    title: "Create a job",
    description: "Queue an asynchronous model run and receive a job ID immediately.",
    auth: "api_key",
    body: QUICKSTART_BODY,
    response: {
      job_id: "job_abc123",
      status: "queued",
      model: "llama-3.1-8b",
      created_at: "2026-07-10T15:00:00Z",
    },
    note: "Optional Idempotency-Key headers are scoped to the workspace and may contain up to 128 characters.",
  },
  {
    id: "list-jobs",
    method: "GET",
    path: "/jobs",
    examplePath: "/jobs?limit=20",
    title: "List jobs",
    description: "Read the newest jobs in the authenticated workspace with cursor pagination.",
    auth: "api_key",
    response: {
      jobs: [
        {
          job_id: "job_abc123",
          status: "succeeded",
          model: "llama-3.1-8b",
          created_at: "2026-07-10T15:00:00Z",
          finalized_at: "2026-07-10T15:00:42Z",
        },
      ],
      next_cursor: null,
    },
    note: "limit defaults to 20 and may be at most 100. Pass next_cursor back as cursor for the next page.",
  },
  {
    id: "job-detail",
    method: "GET",
    path: "/jobs/:id",
    examplePath: "/jobs/YOUR_JOB_ID",
    title: "Get job detail",
    description: "Poll current status, then read the final output, usage, artifacts, or plain-language error.",
    auth: "api_key",
    response: {
      job_id: "job_abc123",
      status: "succeeded",
      model: "llama-3.1-8b",
      input: QUICKSTART_BODY.input,
      created_at: "2026-07-10T15:00:00Z",
      finalized_at: "2026-07-10T15:00:42Z",
      attempts: 1,
      run: {
        run_id: "run_def456",
        provider: "prov_x",
        started_at: "2026-07-10T15:00:03Z",
        ended_at: "2026-07-10T15:00:42Z",
        usage: { tokens_in: 12, tokens_out: 64, images: 0, duration_ms: 39000, model_slug: "llama-3.1-8b" },
      },
      output: { text: "Welcome to the team..." },
      artifacts: [],
      error: null,
    },
  },
  {
    id: "download-artifact",
    method: "GET",
    path: "/jobs/:id/artifacts/:name",
    examplePath: "/jobs/YOUR_JOB_ID/artifacts/result.json",
    title: "Download an artifact",
    description: "Stream one artifact with its recorded content type and length.",
    auth: "api_key",
    outputFile: "result.json",
    response: "Binary response with Content-Type and Content-Length headers.",
    note: "Foreign or unknown jobs and artifacts return 404 without revealing workspace ownership.",
  },
  {
    id: "list-models",
    method: "GET",
    path: "/models",
    title: "List models",
    description: "Discover active models and the input schema enforced by job creation.",
    auth: "api_key",
    response: {
      models: [
        {
          slug: "llama-3.1-8b",
          modality: "llm",
          description: "Fast general text model - emails, summaries, descriptions.",
          params: {
            prompt: { type: "string", required: true, max_bytes: 32768 },
            max_tokens: { type: "integer", default: 512, max: 2048 },
          },
          max_runtime_s: 120,
        },
      ],
    },
  },
];

export const PROVIDER_ENDPOINTS = [
  {
    id: "register-provider",
    method: "POST",
    path: "/providers/register",
    title: "Register a provider",
    description: "Exchange an operator-issued enrollment secret for a provider identity and one-time token.",
    auth: "none",
    body: {
      enroll_secret: "YOUR_ENROLL_SECRET",
      name: "studio-gpu-01",
      capabilities: {
        models: ["llama-3.1-8b", "sdxl-1.0"],
        gpu: { model: "RTX 4090", vram_gb: 24 },
        concurrency: 1,
      },
    },
    response: { provider_id: "prov_x", provider_token: "npt_RETURNED_ONCE" },
    note: "Store the returned token securely. Nodera stores only its hash and cannot reveal it later.",
  },
  {
    id: "provider-heartbeat",
    method: "POST",
    path: "/providers/heartbeat",
    title: "Send a heartbeat",
    description: "Report liveness, active work, and models ready for assignment.",
    auth: "provider",
    body: { active_runs: 0, models_ready: ["llama-3.1-8b"] },
    response: { ok: true },
  },
  {
    id: "provider-poll",
    method: "POST",
    path: "/providers/poll",
    title: "Poll for a run",
    description: "Atomically claim the oldest run assigned to this provider, or receive null.",
    auth: "provider",
    body: {},
    response: {
      run: {
        run_id: "run_def456",
        job_id: "job_abc123",
        model: "llama-3.1-8b",
        input: { prompt: "Write a welcome email." },
        deadline_at: "2026-07-10T15:05:00Z",
      },
    },
  },
  {
    id: "provider-upload-url",
    method: "POST",
    path: "/providers/artifacts/upload-url",
    title: "Create an artifact upload URL",
    description: "Authorize a direct pending-object upload for a running run.",
    auth: "provider",
    body: { run_id: "YOUR_RUN_ID", name: "output.png", mime: "image/png", size_bytes: 1234567 },
    response: {
      upload_url: "https://storage.example/presigned-target",
      method: "PUT",
      headers: { "Content-Type": "image/png" },
      expires_at: "2026-07-10T15:05:00Z",
    },
    note: "PUT the bytes directly to upload_url with the returned headers before reporting success.",
  },
  {
    id: "provider-report",
    method: "POST",
    path: "/providers/report",
    title: "Report a run result",
    description: "Finalize a run with metering and artifacts, or report a retryable failure.",
    auth: "provider",
    body: {
      run_id: "YOUR_RUN_ID",
      status: "succeeded",
      exit_code: 0,
      usage: { tokens_in: 12, tokens_out: 64, images: 0, duration_ms: 39000, model_slug: "llama-3.1-8b" },
      artifacts: [],
    },
    response: { ok: true },
    note: "An identical duplicate report is a 200 no-op. A conflicting final report returns 409 report_conflict.",
  },
];

export const ALL_ENDPOINTS = [...CUSTOMER_ENDPOINTS, ...PROVIDER_ENDPOINTS];

export const WEBHOOK_VERIFY_SNIPPET = `const crypto = require("crypto");
function verifyNodera(rawBody, signatureHeader, timestampHeader, secret) {
  if (Math.abs(Date.now() / 1000 - Number(timestampHeader)) > 300) return false;
  const expected = "sha256=" + crypto.createHmac("sha256", secret).update(rawBody).digest("hex");
  return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signatureHeader));
}`;

export const ERROR_CODES = [
  "unauthorized",
  "forbidden",
  "not_found",
  "validation_failed",
  "model_not_found",
  "input_too_large",
  "idempotency_conflict",
  "rate_limited",
  "artifact_limits_exceeded",
  "artifact_missing",
  "report_conflict",
  "internal",
];

export function curlArguments(endpoint, baseUrl, credentials = {}) {
  const apiKey = credentials.apiKey || "YOUR_API_KEY";
  const providerToken = credentials.providerToken || "YOUR_PROVIDER_TOKEN";
  const args = [
    "--silent",
    "--show-error",
    "--request",
    endpoint.method,
    `${baseUrl}${endpoint.examplePath || endpoint.path}`,
  ];
  if (endpoint.auth === "api_key") args.push("--header", `x-api-key: ${apiKey}`);
  if (endpoint.auth === "provider") args.push("--header", `x-provider-token: ${providerToken}`);
  if (endpoint.body !== undefined) {
    args.push("--header", "content-type: application/json", "--data-raw", JSON.stringify(endpoint.body));
  }
  if (endpoint.outputFile) args.push("--output", endpoint.outputFile);
  return args;
}

export function formatCurl(endpoint, baseUrl, shell = "bash") {
  const executable = shell === "powershell" ? "curl.exe" : "curl";
  const continuation = shell === "powershell" ? " `" : " \\";
  const args = curlArguments(endpoint, baseUrl);
  const lines = [];
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    const previous = args[index - 1];
    if (index === 0) {
      lines.push(`${executable} ${arg}`);
      continue;
    }
    const isValue = ["--request", "--header", "--data-raw", "--output"].includes(previous);
    if (isValue) {
      const quote = previous === "--data-raw" ? "'" : '"';
      lines[lines.length - 1] += ` ${quote}${arg}${quote}`;
    } else {
      lines.push(`  ${arg}`);
    }
  }
  return lines.map((line, index) => (index < lines.length - 1 ? `${line}${continuation}` : line)).join("\n");
}
