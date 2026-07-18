"use client";

export const TERMINAL_JOB_STATUSES = new Set(["succeeded", "failed", "canceled"]);

export function artifactUrl(job, artifact) {
  return `/api/v1/jobs/${job.job_id}/artifacts/${encodeURIComponent(artifact.name)}`;
}

export function imageArtifact(job) {
  return job.artifacts?.find((artifact) => artifact.mime?.startsWith("image/")) || null;
}

export function hasTextOutput(job) {
  return Boolean(job.output?.text);
}

export function retryLabel(job) {
  return job.status === "failed" ? "Retry" : "Re-run";
}

export function formatBytes(bytes) {
  if (!Number.isFinite(bytes)) return "";
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${Math.round(kb * 10) / 10} KB`;
  return `${Math.round((kb / 1024) * 10) / 10} MB`;
}

export function plainError(job) {
  return job.error?.message || "This job could not be completed. Try again.";
}
