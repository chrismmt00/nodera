const DEFAULT_TARGET_SECONDS = 60;

async function buildCustomerOnboardingReport(
  prisma,
  { targetSeconds = DEFAULT_TARGET_SECONDS, generatedAt = new Date() } = {}
) {
  if (!Number.isFinite(targetSeconds) || targetSeconds <= 0) {
    throw new Error("targetSeconds must be a positive number");
  }
  if (!(generatedAt instanceof Date) || Number.isNaN(generatedAt.getTime())) {
    throw new Error("generatedAt must be a valid Date");
  }

  const [signupRows, successRows] = await Promise.all([
    prisma.user.groupBy({
      by: ["workspaceId"],
      _min: { createdAt: true },
    }),
    prisma.job.groupBy({
      by: ["workspaceId"],
      where: { status: "succeeded", finalizedAt: { not: null } },
      _min: { finalizedAt: true },
    }),
  ]);

  const firstSuccessByWorkspace = new Map(
    successRows.map((row) => [row.workspaceId, row._min.finalizedAt])
  );
  const targetMs = targetSeconds * 1000;
  const workspaces = signupRows
    .map((row) => {
      const signupAt = row._min.createdAt;
      const firstSucceededAt = firstSuccessByWorkspace.get(row.workspaceId) || null;
      if (!firstSucceededAt) {
        return {
          workspace_id: row.workspaceId,
          signup_at: signupAt.toISOString(),
          first_succeeded_at: null,
          seconds_to_first_success: null,
          target_result: "pending",
        };
      }

      const durationMs = firstSucceededAt.getTime() - signupAt.getTime();
      return {
        workspace_id: row.workspaceId,
        signup_at: signupAt.toISOString(),
        first_succeeded_at: firstSucceededAt.toISOString(),
        seconds_to_first_success: durationMs / 1000,
        target_result:
          durationMs < 0 ? "invalid_timestamps" : durationMs < targetMs ? "under_target" : "at_or_over_target",
      };
    })
    .sort((a, b) => b.signup_at.localeCompare(a.signup_at));

  const completedDurations = workspaces
    .filter((row) => row.target_result === "under_target" || row.target_result === "at_or_over_target")
    .map((row) => row.seconds_to_first_success)
    .sort((a, b) => a - b);

  return {
    generated_at: generatedAt.toISOString(),
    target_seconds: targetSeconds,
    summary: {
      total_workspaces: workspaces.length,
      completed: completedDurations.length,
      pending: workspaces.filter((row) => row.target_result === "pending").length,
      under_target: workspaces.filter((row) => row.target_result === "under_target").length,
      at_or_over_target: workspaces.filter((row) => row.target_result === "at_or_over_target").length,
      invalid_timestamps: workspaces.filter((row) => row.target_result === "invalid_timestamps").length,
      median_seconds: median(completedDurations),
    },
    workspaces,
  };
}

function median(sortedValues) {
  if (sortedValues.length === 0) return null;
  const middle = Math.floor(sortedValues.length / 2);
  if (sortedValues.length % 2 === 1) return sortedValues[middle];
  return (sortedValues[middle - 1] + sortedValues[middle]) / 2;
}

module.exports = { buildCustomerOnboardingReport, DEFAULT_TARGET_SECONDS };
