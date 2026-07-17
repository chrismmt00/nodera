"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/client/api.js";
import { Button, C, El, Panel, StatusDot, css, humanStatus } from "@/components/ui.js";

const TERMINAL = new Set(["succeeded", "failed", "canceled"]);

function initialValues(model) {
  const values = {};
  for (const [name, definition] of Object.entries(model.params)) {
    values[name] = name === "prompt" ? "" : (definition.default ?? "");
  }
  return values;
}

function fieldLabel(name) {
  return {
    prompt: "Prompt",
    max_tokens: "Maximum tokens",
    width: "Width",
    height: "Height",
  }[name] || name.replaceAll("_", " ");
}

function buildInput(model, values) {
  const input = {};
  for (const [name, definition] of Object.entries(model.params)) {
    const value = values[name];
    if (value === undefined || value === "") continue;
    input[name] = definition.type === "integer" ? Number(value) : value;
  }
  return input;
}

export function ModelRunner({ models }) {
  const [selectedSlug, setSelectedSlug] = useState(null);
  const slug = selectedSlug || models[0]?.slug || "";
  const model = models.find((candidate) => candidate.slug === slug);

  if (!model) {
    return (
      <Panel s="padding:22px">
        <El s={`color:${C.dim};font-size:14px`}>No models are available right now.</El>
      </Panel>
    );
  }

  return (
    <div className="nodera-runner">
      <Panel s="padding:18px 20px">
        <label className="nodera-field-label" htmlFor="model-select">Model</label>
        <select
          id="model-select"
          value={slug}
          onChange={(event) => setSelectedSlug(event.target.value)}
          className="nodera-select"
        >
          {models.map((candidate) => (
            <option key={candidate.slug} value={candidate.slug}>
              {candidate.slug} - {candidate.description}
            </option>
          ))}
        </select>
      </Panel>
      <JobComposer key={slug} model={model} />
    </div>
  );
}

function JobComposer({ model }) {
  const [values, setValues] = useState(() => initialValues(model));
  const [showOptions, setShowOptions] = useState(false);
  const [phase, setPhase] = useState("idle");
  const [job, setJob] = useState(null);
  const [error, setError] = useState(null);
  const requestRef = useRef(null);

  useEffect(() => () => requestRef.current?.abort(), []);

  async function run(event) {
    event.preventDefault();
    setError(null);
    if (!String(values.prompt || "").trim()) {
      setError("Type a prompt first - it is the only required field.");
      return;
    }

    requestRef.current?.abort();
    const controller = new AbortController();
    requestRef.current = controller;
    setJob(null);
    setPhase("submitting");

    try {
      const created = await api.createJob(
        { model: model.slug, input: buildInput(model, values) },
        { signal: controller.signal }
      );
      setPhase("polling");
      while (!controller.signal.aborted) {
        const detail = await api.job(created.job_id, { signal: controller.signal });
        setJob(detail);
        if (TERMINAL.has(detail.status)) {
          setPhase("done");
          return;
        }
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
    } catch (runError) {
      if (runError.name === "AbortError") return;
      setError(runError.message);
      setPhase("error");
    }
  }

  const busy = phase === "submitting" || phase === "polling";
  const options = Object.entries(model.params).filter(([name]) => name !== "prompt");

  return (
    <form onSubmit={run}>
      <Panel s="padding:18px 20px">
        <label className="nodera-field-label" htmlFor={`${model.slug}-prompt`}>Prompt</label>
        <textarea
          id={`${model.slug}-prompt`}
          rows={5}
          value={values.prompt ?? ""}
          onChange={(event) => setValues((current) => ({ ...current, prompt: event.target.value }))}
          placeholder={model.modality === "image" ? "Describe the image you want to create..." : "Tell the model what you want it to write..."}
          className="nodera-textarea"
          disabled={busy}
        />

        {options.length ? (
          <>
            <button
              type="button"
              className="nodera-options-toggle"
              aria-expanded={showOptions}
              onClick={() => setShowOptions((open) => !open)}
            >
              Options <span>{showOptions ? "Hide" : "Show"}</span>
            </button>
            {showOptions ? (
              <div className="nodera-options-grid">
                {options.map(([name, definition]) => (
                  <label key={name} className="nodera-option-field">
                    <span>{fieldLabel(name)}</span>
                    <input
                      type={definition.type === "integer" ? "number" : "text"}
                      value={values[name] ?? ""}
                      max={definition.max}
                      onChange={(event) => setValues((current) => ({ ...current, [name]: event.target.value }))}
                      disabled={busy}
                    />
                  </label>
                ))}
              </div>
            ) : null}
          </>
        ) : null}

        <div className="nodera-form-actions">
          <El s={`font-size:12px;color:${C.dim}`}>{model.description}</El>
          <Button type="submit" busy={busy}>{busy ? "Running..." : "Run"}</Button>
        </div>
        {error ? <El role="alert" s={`color:${C.red};font-size:13px;margin-top:10px`}>{error}</El> : null}
      </Panel>

      {phase !== "idle" && phase !== "error" ? <Pipeline phase={phase} status={job?.status} /> : null}
      {job && TERMINAL.has(job.status) ? <Result job={job} /> : null}
    </form>
  );
}

function Pipeline({ phase, status }) {
  const running = status === "running";
  const finished = TERMINAL.has(status);
  const steps = [
    { label: "Sent", active: true },
    { label: "Waiting for a machine", active: phase === "polling" || Boolean(status) },
    { label: "Running", active: running || finished },
    { label: finished ? humanStatus(status) : "Done", active: finished },
  ];
  return (
    <Panel s="margin-top:14px;padding:13px 18px">
      <div className="nodera-pipeline" aria-label="Job progress">
        {steps.map((step, index) => (
          <div className={`nodera-pipeline-step ${step.active ? "is-active" : ""}`} key={step.label}>
            <StatusDot color={step.active ? C.accent : C.faint} pulse={step.active && !finished && index > 0} />
            <span>{step.label}</span>
          </div>
        ))}
      </div>
    </Panel>
  );
}

function Result({ job }) {
  const image = job.artifacts?.find((artifact) => artifact.mime?.startsWith("image/"));
  const duration = Math.round((job.run?.usage?.duration_ms || 0) / 100) / 10;
  return (
    <Panel s="margin-top:14px;padding:18px 20px">
      <div className="nodera-result-header">
        <El s="display:flex;align-items:center;gap:8px;font-size:13px;font-weight:600">
          <StatusDot color={job.status === "succeeded" ? C.green : C.red} />
          {humanStatus(job.status)}
        </El>
        <El s={`font-family:var(--font-ibm-plex-mono),monospace;font-size:10px;color:${C.faint}`}>{job.job_id}</El>
      </div>
      {job.status === "failed" ? (
        <El role="alert" s={`color:${C.red};font-size:14px;margin-top:12px`}>{job.error?.message || "This job could not be completed."}</El>
      ) : null}
      {job.status === "succeeded" && job.output?.text ? (
        <El s={`white-space:pre-wrap;background:${C.bg};border:1px solid ${C.border};border-radius:10px;padding:15px 17px;font-size:14px;line-height:1.65;color:#d7deeb;margin-top:12px`}>
          {job.output.text}
        </El>
      ) : null}
      {job.status === "succeeded" && image ? (
        <Image
          alt="Generated result"
          src={`/api/v1/jobs/${job.job_id}/artifacts/${encodeURIComponent(image.name)}`}
          width={1024}
          height={1024}
          unoptimized
          className="nodera-result-image"
        />
      ) : null}
      {job.status === "succeeded" && job.run?.usage ? (
        <El s={`font-family:var(--font-ibm-plex-mono),monospace;font-size:10.5px;color:${C.dim};margin-top:10px`}>
          {job.run.usage.tokens_out ? `${job.run.usage.tokens_out} tokens / ` : ""}
          {job.run.usage.images ? `${job.run.usage.images} image / ` : ""}
          {duration}s compute
        </El>
      ) : null}
    </Panel>
  );
}
