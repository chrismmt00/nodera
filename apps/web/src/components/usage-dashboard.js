"use client";

import Link from "next/link";
import { formatDateTime, formatDuration, formatInteger, hasUsage } from "@/lib/client/usage-view.js";
import { C, El, Panel } from "@/components/ui.js";

export function UsageDashboard({ report }) {
  return (
    <div className="nodera-usage-dashboard">
      <div className="nodera-usage-summary-grid">
        <UsageCard label="Metered jobs" value={formatInteger(report.totals.jobs)} />
        <UsageCard label="Input tokens" value={formatInteger(report.totals.tokens_in)} />
        <UsageCard label="Output tokens" value={formatInteger(report.totals.tokens_out)} />
        <UsageCard label="Images" value={formatInteger(report.totals.images)} />
        <UsageCard label="Compute time" value={formatDuration(report.totals.duration_ms)} />
      </div>

      <Panel s="overflow:hidden">
        <div className="nodera-section-heading">
          <div>
            <El s="font-size:15px;font-weight:700">Usage by model</El>
            <El s={`font-size:12px;color:${C.dim};margin-top:3px`}>
              Successful jobs finalized in {report.period.label}. Totals come from run metering.
            </El>
          </div>
        </div>
        {hasUsage(report) ? <UsageModelRows models={report.by_model} /> : <EmptyUsage />}
      </Panel>

      <Panel s="overflow:hidden">
        <div className="nodera-section-heading">
          <div>
            <El s="font-size:15px;font-weight:700">Recent metered jobs</El>
            <El s={`font-size:12px;color:${C.dim};margin-top:3px`}>
              The latest succeeded jobs included in this month&apos;s totals.
            </El>
          </div>
        </div>
        {report.recent_jobs.length ? <RecentUsageJobs jobs={report.recent_jobs} /> : <EmptyUsage />}
      </Panel>
    </div>
  );
}

function UsageCard({ label, value }) {
  return (
    <Panel s="padding:15px 16px">
      <El s="font-size:23px;font-weight:700;overflow-wrap:anywhere">{value}</El>
      <El s={`font-family:var(--font-ibm-plex-mono),monospace;font-size:10px;color:${C.dim};text-transform:uppercase;margin-top:3px`}>
        {label}
      </El>
    </Panel>
  );
}

function UsageModelRows({ models }) {
  return (
    <div className="nodera-usage-model-list">
      {models.map((model) => (
        <div className="nodera-usage-model-row" key={model.model}>
          <div>
            <El s="font-size:13px;font-weight:700">{model.model}</El>
            <El s={`font-size:11px;color:${C.dim};margin-top:4px`}>
              {formatInteger(model.jobs)} metered {model.jobs === 1 ? "job" : "jobs"}
            </El>
          </div>
          <Metric label="Tokens" value={formatInteger(model.tokens_total)} />
          <Metric label="Images" value={formatInteger(model.images)} />
          <Metric label="Compute" value={formatDuration(model.duration_ms)} />
        </div>
      ))}
    </div>
  );
}

function RecentUsageJobs({ jobs }) {
  return (
    <div className="nodera-usage-job-list">
      {jobs.map((job) => (
        <Link href={`/jobs/${job.job_id}`} className="nodera-usage-job-row" key={job.job_id}>
          <div>
            <El s="font-size:12px;font-weight:700">{job.model}</El>
            <El s={`font-family:var(--font-ibm-plex-mono),monospace;font-size:10px;color:${C.dim};margin-top:4px`}>
              {job.job_id}
            </El>
          </div>
          <Metric label="Tokens" value={formatInteger(job.usage.tokens_in + job.usage.tokens_out)} />
          <Metric label="Images" value={formatInteger(job.usage.images)} />
          <Metric label="Compute" value={formatDuration(job.usage.duration_ms)} />
          <El s={`font-size:11px;color:${C.dim};text-align:right`}>{formatDateTime(job.finalized_at)}</El>
        </Link>
      ))}
    </div>
  );
}

function Metric({ label, value }) {
  return (
    <div>
      <El s={`font-size:10px;color:${C.dim};text-transform:uppercase;font-family:var(--font-ibm-plex-mono),monospace`}>
        {label}
      </El>
      <El s="font-size:12px;font-weight:700;margin-top:3px">{value}</El>
    </div>
  );
}

function EmptyUsage() {
  return (
    <El s={`color:${C.dim};font-size:13px;padding:18px`}>
      No metered usage yet. Successful jobs will appear here after a provider reports usage.
    </El>
  );
}
