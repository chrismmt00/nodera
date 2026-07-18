export function hasUsage(report) {
  return Boolean(report?.totals?.jobs);
}

export function formatInteger(value) {
  return new Intl.NumberFormat().format(value || 0);
}

export function formatDuration(ms) {
  const totalSeconds = Math.round((ms || 0) / 1000);
  if (totalSeconds < 60) return `${totalSeconds}s`;
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes < 60) return seconds ? `${minutes}m ${seconds}s` : `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return remainingMinutes ? `${hours}h ${remainingMinutes}m` : `${hours}h`;
}

export function formatDateTime(value) {
  if (!value) return "Not finalized";
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}
