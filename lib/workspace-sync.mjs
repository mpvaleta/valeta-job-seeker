/*
 * Which side is fresher when a device opens the app: the durable revision on
 * the server, or the copy this browser kept in localStorage?
 *
 * The restore-on-load merge used to prefer the local copy whenever one
 * existed, unconditionally. On the machine the user works from every day that
 * is right; on a second device — a phone opened after two weeks, a laptop at
 * a café — it resurrected weeks-old records over everything edited elsewhere,
 * and eight seconds later autosaved that stale union as the newest durable
 * revision. Nothing was ever lost (revisions are append-only), but "open it
 * anywhere" showed whichever device opened last, not the newest edits.
 *
 * The rule: each device stamps localStorage whenever its own workspace state
 * changes (which includes the moment it reconciles a restore, so a device is
 * only ever "fresh" about state that already contains the newest remote
 * data). On load, a durable revision created after this device's stamp means
 * some other device saved more recently — so the remote side wins conflicts,
 * while records that exist only locally are still kept.
 *
 * Clock skew between a device and the server can misjudge the comparison by
 * its magnitude. The failure mode is the same preference the app always had,
 * never data loss, so no skew allowance is layered on top.
 */

// D1's CURRENT_TIMESTAMP is UTC but carries no zone marker, so Date would
// read it in the device's local zone; pin it to UTC explicitly. ISO strings
// with a zone are parsed as-is.
export function parseRevisionTimestamp(value) {
  const raw = String(value || "").trim();
  if (!raw) return 0;
  const normalized = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(raw) ? `${raw.replace(" ", "T")}Z` : raw;
  // Date.parse is lenient enough to read a bare number as a year; only a
  // value that starts like an actual date may count as a revision timestamp.
  if (!/^\d{4}-\d{2}-\d{2}/.test(normalized)) return 0;
  const parsed = Date.parse(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function remoteIsFresher(localEditStampMs, revisionCreatedAt) {
  const local = Number(localEditStampMs);
  const remote = parseRevisionTimestamp(revisionCreatedAt);
  if (!remote) return false;
  // A device that has never stamped has never held reconciled state — any
  // durable revision outranks it.
  if (!Number.isFinite(local) || local <= 0) return true;
  return remote > local;
}
