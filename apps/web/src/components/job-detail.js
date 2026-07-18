"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "@/lib/client/api.js";
import {
  TERMINAL_JOB_STATUSES,
  artifactUrl,
  formatBytes,
  hasTextOutput,
  imageArtifact,
  plainError,
  retryLabel,
} from "@/lib/client/job-detail-view.js";
import { SnippetPanel } from "@/components/snippet-panel.js";
import { Button, C, El, Panel, StatusDot, humanStatus } from "@/components/ui.js";

const POLL_INTERVAL_MS = 2000;

export function JobDetail({ initialJob }) {
  const [job, setJob] = useState(initialJob);
  const [state, setState] = useState("ready");
  const [error, setError] = useState(null);
  const requestRef = useRef(null);

  const refresh = useCallback(async ({ quiet = false, signal } = {}) => {
    if (!quiet) setState("refreshing");
    try {
      const detail = await api.job(initialJob.job_id, { signal });
      setJob(detail);
      setError(null);
      setState("ready");
    } catch (refreshError) {
      if (refreshError.name === "AbortError") return;
      setError(refreshError.message);
      setState("error");
    }
  }, [initialJob.job_id]);

  useEffect(() => {
    if (TERMINAL_JOB_STATUSES.has(job.status)) return undefined;
    const controller = new AbortController();
    const timer = setInterval(() => refresh({ quiet: true, signal: controller.signal }), POLL_INTERVAL_MS);
    return () => {
      controller.abort();
      clearInterval(timer);
    };
  }, [job.status, refresh]);

  useEffect(() => () => requestRef.current?.abort(), []);

  async function rerun() {
    requestRef.current?.abort();
    const controller = new AbortController();
    requestRef.current = controller;
    setState("rerunning");
    setError(null);
    try {
      const created = await api.createJob(
        { model: job.model, input: job.input },
        { signal: controller.signal }
      );
      location.href = `/jobs/${created.job_id}`;
    } catch (rerunError) {
      if (rerunError.name === "AbortError") return;
      setError(rerunError.message);
      setState("error");
    }
  }

  const busy = state === "refreshing" || state === "rerunning";
  const terminal = TERMINAL_JOB_STATUSES.has(job.status);

  return (
    <div className="nodera-job-detail">
      <div className="nodera-detail-topline">
        <Link href="/jobs">Jobs</Link>
        <span>/</span>
        <code>{job.job_id}</code>
      </div>

      <div className="nodera-page-heading">
        <div>
          <El as="h1" s="font-size:20px;font-weight:700;margin:0;display:flex;align-items:center;gap:9px">
            <StatusDot color={statusColor(job.status)} pulse={!terminal} />
            {humanStatus(job.status)}
          </El>
          <El s={`font-size:13px;color:${C.dim};margin-top:4px`}>{job.model}</El>
        </div>
        <div className="nodera-detail-actions">
          <Button type="button" variant="secondary" busy={state === "refreshing"} onClick={() => refresh()}>
            Refresh
          </Button>
          <Button type="button" busy={state === "rerunning"} onClick={rerun}>
            {retryLabel(job)}
          </Button>
        </div>
      </div>

      {error ? <El role="alert" s={`color:${C.red};font-size:13px;margin-bottom:12px`}>{error}</El> : null}

      <div className="nodera-job-detail-grid">
        <section className="nodera-detail-main">
          <ResultPanel job={job} />
          <InputPanel input={job.input} />
          <SnippetPanel job={job} />
        </section>
        <aside className="nodera-detail-side">
          <JobMeta job={job} />
          <ArtifactsPanel job={job} />
        </aside>
      </div>

      {busy ? <span className="nodera-sr-status" aria-live="polite">{state}</span> : null}
    </div>
  );
}

function ResultPanel({ job }) {
  const image = imageArtifact(job);
  return (
    <Panel s="padding:18px 20px">
      <SectionTitle title="Result" />
      {job.status === "failed" ? (
        <div className="nodera-detail-error" role="alert">
          <El s="font-size:14px;font-weight:700;color:#ffd1d1">This run did not finish.</El>
          <El s={`font-size:13px;color:${C.red};margin-top:5px;line-height:1.5`}>{plainError(job)}</El>
        </div>
      ) : null}
      {job.status === "succeeded" && hasTextOutput(job) ? (
        <pre className="nodera-detail-text-output">{job.output.text}</pre>
      ) : null}
      {job.status === "succeeded" && image ? (
        <Image
          alt="Generated result"
          src={artifactUrl(job, image)}
          width={1024}
          height={1024}
          unoptimized
          className="nodera-detail-image"
        />
      ) : null}
      {job.status === "succeeded" && !hasTextOutput(job) && !image ? (
        <El s={`color:${C.dim};font-size:13px;margin-top:12px`}>No inline result was returned.</El>
      ) : null}
      {!TERMINAL_JOB_STATUSES.has(job.status) ? (
        <El s={`color:${C.dim};font-size:13px;margin-top:12px`}>The result will appear here when the job finishes.</El>
      ) : null}
    </Panel>
  );
}

function InputPanel({ input }) {
  return (
    <Panel s="padding:18px 20px">
      <SectionTitle title="Input" />
      {input?.prompt ? (
        <El s={`white-space:pre-wrap;color:#d7deeb;font-size:14px;line-height:1.6;margin-top:12px`}>
          {input.prompt}
        </El>
      ) : null}
      <pre className="nodera-detail-json">{JSON.stringify(input || {}, null, 2)}</pre>
    </Panel>
  );
}

function JobMeta({ job }) {
  const usage = job.run?.usage;
  return (
    <Panel s="padding:18px">
      <SectionTitle title="Run" />
      <div className="nodera-detail-meta">
        <Meta label="Created" value={formatDate(job.created_at)} />
        <Meta label="Finished" value={job.finalized_at ? formatDate(job.finalized_at) : "Still working"} />
        <Meta label="Attempts" value={String(job.attempts)} />
        <Meta label="Run" value={job.run?.run_id || "Not assigned yet"} mono />
        {usage?.tokens_out ? <Meta label="Tokens out" value={String(usage.tokens_out)} /> : null}
        {usage?.images ? <Meta label="Images" value={String(usage.images)} /> : null}
        {usage?.duration_ms ? <Meta label="Compute" value={`${Math.round(usage.duration_ms / 100) / 10}s`} /> : null}
      </div>
    </Panel>
  );
}

function ArtifactsPanel({ job }) {
  const artifacts = job.artifacts || [];
  return (
    <Panel s="overflow:hidden">
      <div className="nodera-section-heading">
        <SectionTitle title="Artifacts" />
      </div>
      {artifacts.length === 0 ? (
        <El s={`color:${C.dim};font-size:13px;padding:16px 18px`}>No artifacts yet.</El>
      ) : (
        <div className="nodera-artifact-list">
          {artifacts.map((artifact) => (
            <a
              href={artifactUrl(job, artifact)}
              download
              className="nodera-artifact-row"
              key={artifact.name}
            >
              <span>
                <strong>{artifact.name}</strong>
                <em>{artifact.mime} / {formatBytes(artifact.size_bytes)}</em>
              </span>
              <b>Download</b>
            </a>
          ))}
        </div>
      )}
    </Panel>
  );
}

function SectionTitle({ title }) {
  return <El s="font-size:15px;font-weight:700">{title}</El>;
}

function Meta({ label, value, mono = false }) {
  return (
    <div>
      <span>{label}</span>
      <strong className={mono ? "is-mono" : undefined}>{value}</strong>
    </div>
  );
}

function formatDate(value) {
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

function statusColor(status) {
  if (status === "succeeded") return C.green;
  if (status === "failed" || status === "canceled") return C.red;
  return C.accent;
}
