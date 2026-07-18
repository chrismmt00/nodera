import { API_BASES } from "./api-bases.js";

export const API_KEY_ENV = "NODERA_API_KEY";
export const API_KEY_PLACEHOLDER = "YOUR_API_KEY";

export function jobSnippetBody(job) {
  return {
    model: job.model,
    input: job.input || {},
  };
}

export function curlSnippetArguments(job, { baseUrl = API_BASES.production, apiKey } = {}) {
  const key = apiKey || `$${API_KEY_ENV}`;
  return [
    "--silent",
    "--show-error",
    "--request",
    "POST",
    `${baseUrl}/jobs`,
    "--header",
    "content-type: application/json",
    "--header",
    `x-api-key: ${key}`,
    "--data-raw",
    JSON.stringify(jobSnippetBody(job)),
  ];
}

export function formatJobCurlSnippet(job, { baseUrl = API_BASES.production, apiKey } = {}) {
  const apiKeyLine = apiKey
    ? `API_KEY=${quoteForShell(apiKey)}`
    : `API_KEY="\${${API_KEY_ENV}:-${API_KEY_PLACEHOLDER}}"`;
  const body = quoteForShell(JSON.stringify(jobSnippetBody(job)));
  return [
    `API_BASE=${quoteForShell(baseUrl)}`,
    apiKeyLine,
    "",
    "curl --silent --show-error --request POST \\",
    "  \"$API_BASE/jobs\" \\",
    "  --header \"content-type: application/json\" \\",
    "  --header \"x-api-key: $API_KEY\" \\",
    `  --data-raw ${body}`,
  ].join("\n");
}

export function formatJobNodeSnippet(job, { baseUrl = API_BASES.production, apiKey } = {}) {
  const apiKeyExpression = apiKey
    ? JSON.stringify(apiKey)
    : `process.env.${API_KEY_ENV} || ${JSON.stringify(API_KEY_PLACEHOLDER)}`;
  return `const API_BASE = ${JSON.stringify(baseUrl)};
const API_KEY = ${apiKeyExpression};
const body = ${JSON.stringify(jobSnippetBody(job), null, 2)};

async function main() {
  const response = await fetch(\`\${API_BASE}/jobs\`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": API_KEY,
    },
    body: JSON.stringify(body),
  });
  const data = await response.json();
  if (!response.ok) {
    const error = data.error || {};
    throw new Error(\`\${error.code || response.status}: \${error.message || "Request failed"}\`);
  }
  console.log(JSON.stringify(data, null, 2));
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});`;
}

function quoteForShell(value) {
  return `'${String(value).replace(/'/g, "'\\''")}'`;
}
