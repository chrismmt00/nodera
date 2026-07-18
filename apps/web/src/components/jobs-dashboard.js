"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "@/lib/client/api.js";
import { isLiveJob, summarizeJobs } from "@/lib/client/jobs-view.js";
import { Button, C, El, Panel, StatusDot, humanStatus } from "@/components/ui.js";

const POLL_INTERVAL_MS = 2000;

export function JobsDashboard({ initialJobs = [], compact = false, poll = false, limit = 20 }) {
  const [jobs, setJobs] = useState(initialJobs);
  const [state, setState] = useState("ready");
  const [error, setError] = useState(null);
  const [lastUpdatedAt, setLastUpdatedAt] = useState(() => new Date());

  const refresh = useCallback(async ({ quiet = false, signal } = {}) => {
    if (!quiet) setState("refreshing");
    try {
      const data = await api.jobs(`?limit=${limit}`, { signal });
      setJobs(data.jobs);
      setLastUpdatedAt(new Date());
      setError(null);
      setState("ready");
    } catch (refreshError) {
      if (refreshError.name === "AbortError") return;
      setError(refreshError.message);
      setState("error");
    }
  }, [limit]);

  useEffect(() => {
    if (!poll) return undefined;
    const controller = new AbortController();
    const timer = setInterval(() => refresh({ quiet: true, signal: controller.signal }), POLL_INTERVAL_MS);
    return () => {
      controller.abort();
      clearInterval(timer);
    };
  }, [poll, refresh]);

  const summary = useMemo(() => summarizeJobs(jobs), [jobs]);
  const hasLiveJobs = jobs.some(isLiveJob);

  if (compact) {
    return (
      <Panel s="overflow:hidden">
        <JobsSectionHeader
          title="Recent jobs"
          description="Newest workspace activity."
        />
        <JobsList jobs={jobs.slice(0, limit)} emptyText="No jobs yet. Your first playground run will appear here." />
      </Panel>
    );
  }

  return (
    <div className="nodera-jobs-dashboard">
      <div className="nodera-job-summary-grid">
        <SummaryCard label="Total" value={jobs.length} />
        <SummaryCard label="Live" value={summary.live} active={hasLiveJobs} />
        <SummaryCard label="Done" value={summary.done} tone="success" />
        <SummaryCard label="Needs attention" value={summary.failed} tone="danger" />
      </div>

      <Panel s="overflow:hidden">
        <JobsSectionHeader
          title="All jobs"
          description="Newest first. This list refreshes while you work."
          right={
            <div className="nodera-jobs-refresh-state" aria-live="polite">
              <StatusDot color={error ? C.red : hasLiveJobs ? C.accent : C.green} pulse={hasLiveJobs && !error} />
              <span>{error ? "Refresh failed" : `Updated ${formatTime(lastUpdatedAt)}`}</span>
              <Button type="button" variant="secondary" busy={state === "refreshing"} onClick={() => refresh()}>
                Refresh
              </Button>
            </div>
          }
        />
        {error ? <El role="alert" s={`color:${C.red};font-size:12px;padding:12px 18px 0`}>{error}</El> : null}
        <JobsList jobs={jobs} emptyText="No jobs yet. Run a model from the gallery to see it here." />
      </Panel>
    </div>
  );
}

function JobsSectionHeader({ title, description, right }) {
  return (
    <div className="nodera-section-heading">
      <div>
        <El s="font-size:15px;font-weight:700">{title}</El>
        <El s={`font-size:12px;color:${C.dim};margin-top:3px`}>{description}</El>
      </div>
      {right || null}
    </div>
  );
}

function JobsList({ jobs, emptyText }) {
  if (jobs.length === 0) {
    return <El s={`color:${C.dim};font-size:13px;padding:18px`}>{emptyText}</El>;
  }
  return (
    <div className="nodera-jobs-list">
      {jobs.map((job) => (
        <Link href={`/jobs/${job.job_id}`} className="nodera-job-row is-dashboard" key={job.job_id}>
          <div>
            <El s="display:flex;align-items:center;gap:8px;font-size:12px;font-weight:600">
              <StatusDot color={statusColor(job.status)} pulse={isLiveJob(job)} />
              {humanStatus(job.status)}
            </El>
            <El s={`font-size:11px;color:${C.dim};margin-top:4px;font-family:var(--font-ibm-plex-mono),monospace`}>
              {job.job_id}
            </El>
          </div>
          <div>
            <El s={`font-size:12px;color:${C.text};font-weight:600`}>{job.model}</El>
            <El s={`font-size:11px;color:${C.dim};margin-top:4px`}>Created {formatDate(job.created_at)}</El>
          </div>
          <El s={`font-size:11px;color:${C.dim};text-align:right`}>
            {job.finalized_at ? `Finished ${formatDate(job.finalized_at)}` : "Still working"}
          </El>
        </Link>
      ))}
    </div>
  );
}

function SummaryCard({ label, value, tone = "default", active = false }) {
  const color = tone === "success" ? C.green : tone === "danger" ? C.red : active ? C.accent : C.text;
  return (
    <Panel s="padding:15px 16px">
      <El s={`font-size:24px;font-weight:700;color:${color}`}>{value}</El>
      <El s={`font-family:var(--font-ibm-plex-mono),monospace;font-size:10px;color:${C.dim};text-transform:uppercase;margin-top:3px`}>
        {label}
      </El>
    </Panel>
  );
}

export function statusColor(status) {
  if (status === "succeeded") return C.green;
  if (status === "failed" || status === "canceled") return C.red;
  return C.accent;
}

function formatDate(value) {
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

function formatTime(value) {
  return new Intl.DateTimeFormat(undefined, { timeStyle: "medium" }).format(value);
}
