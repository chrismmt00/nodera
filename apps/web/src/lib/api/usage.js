import { prisma } from "@nodera/db";

export function currentUsagePeriod(now = new Date()) {
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
  return { start, end };
}

export async function buildUsageReport({ workspaceId, now = new Date() }) {
  const period = currentUsagePeriod(now);
  const jobs = await prisma.job.findMany({
    where: {
      workspaceId,
      status: "succeeded",
      finalizedAt: { gte: period.start, lt: period.end },
    },
    orderBy: [{ finalizedAt: "desc" }, { id: "desc" }],
    select: {
      id: true,
      modelSlug: true,
      finalizedAt: true,
      runs: {
        where: { status: "succeeded" },
        orderBy: [{ assignedAt: "asc" }, { id: "asc" }],
        select: { id: true, usage: true },
      },
    },
  });

  const totals = emptyUsageTotals();
  const byModel = new Map();
  const recent_jobs = [];

  for (const job of jobs) {
    const run = job.runs.find((candidate) => candidate.usage && typeof candidate.usage === "object");
    if (!run) continue;
    const usage = normalizeUsage(run.usage, job.modelSlug);
    addUsage(totals, usage);
    totals.jobs += 1;

    const model = byModel.get(usage.model_slug) || { model: usage.model_slug, ...emptyUsageTotals() };
    addUsage(model, usage);
    model.jobs += 1;
    byModel.set(model.model, model);

    recent_jobs.push({
      job_id: job.id,
      run_id: run.id,
      model: usage.model_slug,
      finalized_at: job.finalizedAt ? job.finalizedAt.toISOString() : null,
      usage,
    });
  }

  return {
    period: {
      start: period.start.toISOString(),
      end: period.end.toISOString(),
      label: periodLabel(period.start),
    },
    totals: finishTotals(totals),
    by_model: [...byModel.values()]
      .map(finishTotals)
      .sort((a, b) => b.tokens_total - a.tokens_total || b.duration_ms - a.duration_ms || a.model.localeCompare(b.model)),
    recent_jobs: recent_jobs.slice(0, 10),
  };
}

function emptyUsageTotals() {
  return {
    jobs: 0,
    tokens_in: 0,
    tokens_out: 0,
    tokens_total: 0,
    images: 0,
    duration_ms: 0,
  };
}

function normalizeUsage(usage, fallbackModel) {
  return {
    tokens_in: count(usage.tokens_in),
    tokens_out: count(usage.tokens_out),
    images: count(usage.images),
    duration_ms: count(usage.duration_ms),
    model_slug: typeof usage.model_slug === "string" && usage.model_slug ? usage.model_slug : fallbackModel,
  };
}

function addUsage(target, usage) {
  target.tokens_in += usage.tokens_in;
  target.tokens_out += usage.tokens_out;
  target.tokens_total += usage.tokens_in + usage.tokens_out;
  target.images += usage.images;
  target.duration_ms += usage.duration_ms;
}

function finishTotals(row) {
  return { ...row };
}

function count(value) {
  return Number.isInteger(value) && value > 0 ? value : 0;
}

function periodLabel(start) {
  return new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric", timeZone: "UTC" }).format(start);
}
