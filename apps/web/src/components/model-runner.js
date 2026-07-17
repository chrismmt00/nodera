"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/client/api.js";
import {
  buildModelInput,
  initialModelValues,
  modelFields,
  validateModelValues,
} from "@/lib/client/model-form.js";
import { Button, C, El, Panel, StatusDot, css, humanStatus } from "@/components/ui.js";

const TERMINAL = new Set(["succeeded", "failed", "canceled"]);

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

export function JobComposer({ model }) {
  const [values, setValues] = useState(() => initialModelValues(model));
  const [showOptions, setShowOptions] = useState(false);
  const [phase, setPhase] = useState("idle");
  const [job, setJob] = useState(null);
  const [error, setError] = useState(null);
  const requestRef = useRef(null);

  useEffect(() => () => requestRef.current?.abort(), []);

  async function run(event) {
    event.preventDefault();
    setError(null);
    const validationError = validateModelValues(model, values);
    if (validationError) {
      setError(validationError);
      return;
    }

    requestRef.current?.abort();
    const controller = new AbortController();
    requestRef.current = controller;
    setJob(null);
    setPhase("submitting");

    try {
      const created = await api.createJob(
        { model: model.slug, input: buildModelInput(model, values) },
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
  const fields = modelFields(model);
  const required = fields.filter((field) => field.required);
  const options = fields.filter((field) => !field.required);

  return (
    <form onSubmit={run}>
      <Panel s="padding:18px 20px">
        <div className="nodera-required-fields">
          {required.map((field) => (
            <ModelField
              key={field.name}
              field={field}
              model={model}
              value={values[field.name] ?? ""}
              disabled={busy}
              onChange={(value) => setValues((current) => ({ ...current, [field.name]: value }))}
            />
          ))}
        </div>

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
                {options.map((field) => (
                  <ModelField
                    key={field.name}
                    field={field}
                    model={model}
                    value={values[field.name] ?? ""}
                    disabled={busy}
                    onChange={(value) => setValues((current) => ({ ...current, [field.name]: value }))}
                    compact
                  />
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

function ModelField({ field, model, value, disabled, onChange, compact = false }) {
  const id = `${model.slug}-${field.name}`;
  const definition = field.definition;
  const isInteger = definition.type === "integer";
  const useTextarea = !compact && !isInteger;
  const hint = fieldHint(definition);
  return (
    <label className={compact ? "nodera-option-field" : "nodera-model-field"} htmlFor={id}>
      <span className="nodera-field-label">{field.label}</span>
      {useTextarea ? (
        <textarea
          id={id}
          rows={5}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder={placeholderFor(model, field)}
          className="nodera-textarea"
          disabled={disabled}
        />
      ) : (
        <input
          id={id}
          type={isInteger ? "number" : "text"}
          min={isInteger ? 1 : undefined}
          max={definition.max}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className={compact ? undefined : "nodera-input"}
          disabled={disabled}
        />
      )}
      {hint ? <span className="nodera-field-hint">{hint}</span> : null}
    </label>
  );
}

function placeholderFor(model, field) {
  if (field.name === "prompt" && model.modality === "image") return "Describe the image you want to create...";
  if (field.name === "prompt") return "Tell the model what you want it to write...";
  return "";
}

function fieldHint(definition) {
  if (definition.max) return `Max ${definition.max}`;
  if (definition.max_bytes) return `Max ${definition.max_bytes.toLocaleString()} bytes`;
  return "";
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
