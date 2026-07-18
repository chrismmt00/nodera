"use client";

import { useMemo, useState } from "react";
import { API_BASES } from "@/lib/client/api-bases.js";
import {
  API_KEY_ENV,
  formatJobCurlSnippet,
  formatJobNodeSnippet,
} from "@/lib/client/job-snippets.js";
import { account } from "@/lib/client/api.js";
import { Button, C, El, Panel } from "@/components/ui.js";

export function SnippetPanel({ job }) {
  const [language, setLanguage] = useState("curl");
  const [environment, setEnvironment] = useState("production");
  const [apiKey, setApiKey] = useState(null);
  const [copyState, setCopyState] = useState("idle");
  const [keyState, setKeyState] = useState("idle");
  const [error, setError] = useState(null);
  const baseUrl = API_BASES[environment];
  const code = useMemo(() => {
    const options = { baseUrl, apiKey };
    return language === "curl"
      ? formatJobCurlSnippet(job, options)
      : formatJobNodeSnippet(job, options);
  }, [apiKey, baseUrl, job, language]);

  async function copySnippet() {
    try {
      await navigator.clipboard.writeText(code);
      setCopyState("copied");
    } catch {
      setCopyState("manual");
    }
  }

  async function createSnippetKey() {
    setError(null);
    setKeyState("creating");
    try {
      const created = await account.createKey(`Snippet ${new Date().toISOString().slice(0, 10)}`);
      setApiKey(created.plaintext);
      setKeyState("inserted");
      setCopyState("idle");
    } catch (createError) {
      setError(createError.message);
      setKeyState("error");
    }
  }

  return (
    <Panel s="overflow:hidden">
      <div className="nodera-section-heading">
        <div>
          <El s="font-size:15px;font-weight:700">Code snippet</El>
          <El s={`font-size:12px;color:${C.dim};margin-top:3px`}>
            Recreates this job with the same model and input.
          </El>
        </div>
        <div className="nodera-snippet-actions">
          <Button
            type="button"
            variant="secondary"
            busy={keyState === "creating"}
            disabled={Boolean(apiKey)}
            onClick={createSnippetKey}
          >
            {apiKey ? "Key inserted" : "Insert key"}
          </Button>
          <Button type="button" variant="secondary" onClick={copySnippet}>
            {copyState === "copied" ? "Copied" : copyState === "manual" ? "Select text" : "Copy"}
          </Button>
        </div>
      </div>

      <div className="nodera-snippet-controls">
        <SegmentedControl
          label="Snippet"
          value={language}
          options={[{ value: "curl", label: "curl" }, { value: "node", label: "Node.js" }]}
          onChange={(next) => {
            setLanguage(next);
            setCopyState("idle");
          }}
        />
        <SegmentedControl
          label="Base URL"
          value={environment}
          options={[{ value: "production", label: "Production" }, { value: "local", label: "Local" }]}
          onChange={(next) => {
            setEnvironment(next);
            setCopyState("idle");
          }}
        />
        <El s={`align-self:end;color:${C.dim};font-size:11px`}>
          {apiKey ? "Reveal-once key inserted." : `Uses ${API_KEY_ENV}.`}
        </El>
      </div>

      {error ? <El role="alert" s={`color:${C.red};font-size:12px;padding:0 18px 12px`}>{error}</El> : null}
      <pre className="nodera-snippet-code" tabIndex="0"><code>{code}</code></pre>
    </Panel>
  );
}

function SegmentedControl({ label, value, options, onChange }) {
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
