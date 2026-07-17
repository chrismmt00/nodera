export const LIVE_STATUSES = new Set(["queued", "assigned", "running"]);

export function isLiveJob(job) {
  return LIVE_STATUSES.has(job.status);
}

export function summarizeJobs(jobs) {
  return jobs.reduce(
    (summary, job) => {
      if (isLiveJob(job)) summary.live += 1;
      if (job.status === "succeeded") summary.done += 1;
      if (job.status === "failed" || job.status === "canceled") summary.failed += 1;
      return summary;
    },
    { live: 0, done: 0, failed: 0 }
  );
}
