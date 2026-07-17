"use client";

import Link from "next/link";
import { useState } from "react";
import { ProductShell } from "@/components/product-shell.js";
import {
  API_BASES,
  CUSTOMER_ENDPOINTS,
  ERROR_CODES,
  PROVIDER_ENDPOINTS,
  WEBHOOK_VERIFY_SNIPPET,
  formatCurl,
} from "@/lib/docs/api-reference.js";

export function ApiDocs() {
  const [environment, setEnvironment] = useState("local");
  const [shell, setShell] = useState("bash");
  const [copyState, setCopyState] = useState({ id: null, status: "idle" });
  const baseUrl = API_BASES[environment];

  async function copyCode(id, code) {
    try {
      await navigator.clipboard.writeText(code);
      setCopyState({ id, status: "copied" });
    } catch {
      setCopyState({ id, status: "manual" });
    }
  }

  function selectEnvironment(nextEnvironment) {
    setEnvironment(nextEnvironment);
    setCopyState({ id: null, status: "idle" });
  }

  function selectShell(nextShell) {
    setShell(nextShell);
    setCopyState({ id: null, status: "idle" });
  }

  return (
    <ProductShell showNavigation wide>
      <header className="nodera-docs-header">
        <div>
          <div className="nodera-docs-kicker">API v1</div>
          <h1>API documentation</h1>
          <p>Submit asynchronous AI jobs, poll durable status, or receive signed webhooks.</p>
        </div>
        <div className="nodera-docs-controls">
          <SegmentedControl
            label="Base URL"
            value={environment}
            onChange={selectEnvironment}
            options={[{ value: "local", label: "Local" }, { value: "production", label: "Production" }]}
          />
          <SegmentedControl
            label="Shell"
            value={shell}
            onChange={selectShell}
            options={[{ value: "bash", label: "Bash" }, { value: "powershell", label: "PowerShell" }]}
          />
        </div>
      </header>

      <div className="nodera-docs-base">
        <span>Base URL</span>
        <code>{baseUrl}</code>
      </div>

      <div className="nodera-docs-layout">
        <DocsNavigation />
        <article className="nodera-docs-content">
          <section id="quickstart" className="nodera-docs-section">
            <div className="nodera-docs-section-label">Start here</div>
            <h2>Quickstart</h2>
            <p>One key and one request are enough to queue your first job.</p>
            <ol className="nodera-quickstart-steps">
              <li>
                <div>
                  <strong>Create an API key</strong>
                  <span>Generate a key in <Link href="/account">Account</Link> and replace <code>YOUR_API_KEY</code> below.</span>
                </div>
              </li>
              <li>
                <div>
                  <strong>Queue a job</strong>
                  <span>The response contains the durable <code>job_id</code> immediately.</span>
                </div>
              </li>
            </ol>
            <CodeBlock
              id="quickstart-create"
              label={shell === "powershell" ? "PowerShell" : "Bash"}
              code={formatCurl(CUSTOMER_ENDPOINTS[0], baseUrl, shell)}
              copyState={copyState}
              onCopy={copyCode}
            />
            <p>Replace <code>YOUR_JOB_ID</code> with that response value and poll until the status is final.</p>
            <CodeBlock
              id="quickstart-poll"
              label={shell === "powershell" ? "PowerShell" : "Bash"}
              code={formatCurl(CUSTOMER_ENDPOINTS[2], baseUrl, shell)}
              copyState={copyState}
              onCopy={copyCode}
            />
          </section>

          <EndpointGroup
            id="customer-api"
            label="Customer API"
            title="Jobs and models"
            description="Every customer request uses x-api-key and is scoped to that key's workspace."
            endpoints={CUSTOMER_ENDPOINTS}
            baseUrl={baseUrl}
            shell={shell}
            copyState={copyState}
            onCopy={copyCode}
          />

          <EndpointGroup
            id="provider-api"
            label="Provider API"
            title="Provider agent protocol"
            description="Provider identity always comes from x-provider-token. Never send a provider ID as identity."
            endpoints={PROVIDER_ENDPOINTS}
            baseUrl={baseUrl}
            shell={shell}
            copyState={copyState}
            onCopy={copyCode}
          />

          <section id="webhooks" className="nodera-docs-section">
            <div className="nodera-docs-section-label">Completion delivery</div>
            <h2>Webhooks</h2>
            <p>
              Set <code>webhook_url</code> when creating a job. Nodera sends <code>job.succeeded</code> or
              <code> job.failed</code> with <code>X-Nodera-Signature</code> and <code>X-Nodera-Timestamp</code> headers.
              Any 2xx acknowledges delivery; failures retry without changing job status.
            </p>
            <CodeBlock
              id="webhook-verify"
              label="Node.js - signature verification"
              code={WEBHOOK_VERIFY_SNIPPET}
              copyState={copyState}
              onCopy={copyCode}
            />
            <div className="nodera-docs-notice">
              Pass the raw request bytes and your <code>NODERA_WEBHOOK_SECRET</code>. Reject timestamps older than five
              minutes. Self-serve webhook-secret delivery is not exposed yet; do not substitute an API key.
            </div>
          </section>

          <section id="errors" className="nodera-docs-section">
            <div className="nodera-docs-section-label">Consistent failures</div>
            <h2>Errors and limits</h2>
            <p>Every non-2xx response uses the same JSON shape.</p>
            <CodeBlock
              id="error-shape"
              label="JSON"
              code={'{\n  "error": {\n    "code": "model_not_found",\n    "message": "No active model with slug \'sdxl-2\'."\n  }\n}'}
              copyState={copyState}
              onCopy={copyCode}
            />
            <div className="nodera-error-codes">
              {ERROR_CODES.map((code) => <code key={code}>{code}</code>)}
            </div>
            <p>
              Job creation defaults to 60 authenticated requests per minute and a 65,536-byte JSON body. A
              <code> 429</code> response includes <code>Retry-After</code> in seconds.
            </p>
          </section>
        </article>
      </div>
    </ProductShell>
  );
}

function SegmentedControl({ label, value, onChange, options }) {
  return (
    <div>
      <span>{label}</span>
      <div className="nodera-segmented" role="group" aria-label={label}>
        {options.map((option) => (
          <button
            type="button"
            aria-pressed={value === option.value}
            onClick={() => onChange(option.value)}
            key={option.value}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function DocsNavigation() {
  return (
    <aside className="nodera-docs-nav" aria-label="API documentation sections">
      <a href="#quickstart">Quickstart</a>
      <span>Customer API</span>
      {CUSTOMER_ENDPOINTS.map((endpoint) => <a href={`#${endpoint.id}`} key={endpoint.id}>{endpoint.title}</a>)}
      <span>Provider API</span>
      {PROVIDER_ENDPOINTS.map((endpoint) => <a href={`#${endpoint.id}`} key={endpoint.id}>{endpoint.title}</a>)}
      <span>Reference</span>
      <a href="#webhooks">Webhooks</a>
      <a href="#errors">Errors and limits</a>
    </aside>
  );
}

function EndpointGroup({ id, label, title, description, endpoints, ...codeProps }) {
  return (
    <section id={id} className="nodera-docs-section">
      <div className="nodera-docs-section-label">{label}</div>
      <h2>{title}</h2>
      <p>{description}</p>
      {endpoints.map((endpoint) => (
        <EndpointSection endpoint={endpoint} key={endpoint.id} {...codeProps} />
      ))}
    </section>
  );
}

function EndpointSection({ endpoint, baseUrl, shell, copyState, onCopy }) {
  const response = typeof endpoint.response === "string"
    ? endpoint.response
    : JSON.stringify(endpoint.response, null, 2);
  return (
    <section id={endpoint.id} className="nodera-endpoint">
      <div className="nodera-endpoint-title">
        <span className={`nodera-method is-${endpoint.method.toLowerCase()}`}>{endpoint.method}</span>
        <code>{endpoint.path}</code>
      </div>
      <h3>{endpoint.title}</h3>
      <p>{endpoint.description}</p>
      <div className="nodera-auth-line">
        Auth: <code>{authLabel(endpoint.auth)}</code>
      </div>
      <CodeBlock
        id={`${endpoint.id}-request`}
        label={shell === "powershell" ? "PowerShell" : "Bash"}
        code={formatCurl(endpoint, baseUrl, shell)}
        copyState={copyState}
        onCopy={onCopy}
      />
      <CodeBlock
        id={`${endpoint.id}-response`}
        label="Response example"
        code={response}
        copyState={copyState}
        onCopy={onCopy}
      />
      {endpoint.note ? <div className="nodera-docs-notice">{endpoint.note}</div> : null}
    </section>
  );
}

function CodeBlock({ id, label, code, copyState, onCopy }) {
  const state = copyState.id === id ? copyState.status : "idle";
  const buttonLabel = state === "copied" ? "Copied" : state === "manual" ? "Select text" : "Copy";
  return (
    <div className="nodera-code-block">
      <div className="nodera-code-toolbar">
        <span>{label}</span>
        <button type="button" onClick={() => onCopy(id, code)}>{buttonLabel}</button>
      </div>
      <pre tabIndex="0"><code>{code}</code></pre>
    </div>
  );
}

function authLabel(auth) {
  if (auth === "api_key") return "x-api-key: YOUR_API_KEY";
  if (auth === "provider") return "x-provider-token: YOUR_PROVIDER_TOKEN";
  return "Enrollment secret in request body";
}
