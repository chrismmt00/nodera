import { prisma } from "@nodera/db";
import { ApiError } from "./errors.js";

const WINDOW_MS = 60_000;
const CLEANUP_INTERVAL_MS = 5 * WINDOW_MS;
const JOB_CREATE_ACTION = "jobs:create";
let lastCleanupAt = 0;

export function jobRateLimit() {
  return positiveIntegerEnv("RATE_LIMIT_JOBS_PER_MIN", 60);
}

export function maxJobRequestBytes() {
  return positiveIntegerEnv("MAX_JOB_REQUEST_BYTES", 65_536);
}

export async function enforceJobCreateRateLimit({ principalId, via }, now = new Date()) {
  const limit = jobRateLimit();
  const nowMs = now.getTime();
  const windowStart = new Date(Math.floor(nowMs / WINDOW_MS) * WINDOW_MS);
  const expiresAt = new Date(windowStart.getTime() + WINDOW_MS);

  if (nowMs - lastCleanupAt >= CLEANUP_INTERVAL_MS) {
    await prisma.rateLimitWindow.deleteMany({ where: { expiresAt: { lte: now } } });
    lastCleanupAt = nowMs;
  }

  const window = await prisma.rateLimitWindow.upsert({
    where: {
      principalId_action_windowStart: {
        principalId,
        action: JOB_CREATE_ACTION,
        windowStart,
      },
    },
    create: {
      principalId,
      action: JOB_CREATE_ACTION,
      windowStart,
      expiresAt,
      count: 1,
    },
    update: { count: { increment: 1 } },
  });

  if (window.count > limit) {
    const retryAfter = Math.max(1, Math.ceil((expiresAt.getTime() - nowMs) / 1000));
    const caller = via === "session" ? "workspace session" : "API key";
    throw new ApiError(
      "rate_limited",
      `This ${caller} allows ${limit} POST /v1/jobs requests per minute. Try again in ${retryAfter} seconds.`,
      { "Retry-After": String(retryAfter) }
    );
  }
}

function positiveIntegerEnv(name, fallback) {
  const raw = process.env[name];
  if (raw === undefined || raw === "") return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 1) {
    throw new Error(`${name} must be a positive integer.`);
  }
  return value;
}
