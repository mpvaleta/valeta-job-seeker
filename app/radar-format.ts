// Shared date formatting for the radar surfaces.
//
// SQLite CURRENT_TIMESTAMP values are UTC without a zone marker; pin them to
// UTC before formatting in the visitor's local zone.
export function parseTimestamp(value: string) {
  return new Date(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(value) ? `${value.replace(" ", "T")}Z` : value);
}

export function compactDate(value: string) {
  const date = parseTimestamp(value);
  if (!Number.isFinite(date.getTime())) return "unknown";
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: date.getFullYear() === new Date().getFullYear() ? undefined : "numeric" }).format(date);
}

export function compactDateTime(value: string) {
  const date = parseTimestamp(value);
  if (!Number.isFinite(date.getTime())) return "unknown";
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(date);
}
