/*
 * What happens to an application nobody answers.
 *
 * An application sits in "Applied" until the owner moves it, and most of them
 * are never answered at all — so the pipeline fills with roles that are, in
 * every real sense, over. Left there they distort the only honest question the
 * pipeline can answer: which of these actually produced a reply.
 *
 * Silence is therefore given a deadline. It is deliberately long, it applies
 * only to applications that were genuinely sent, and it is always reversible:
 * the row is closed with a note saying why, not deleted. Reopening it — the
 * owner moving the status back off Closed — stamps `silenceResetAt`, and the
 * deadline is measured from whichever is later, that stamp or the application
 * date, so a row can neither be re-closed on the very next load nor closed the
 * day after it was re-sent.
 *
 * Every status transition goes through `applyStatusChange` so the UI, the
 * deadline and the reply summary agree on what a status means.
 */
export const SILENCE_DAYS = 60;

const DAY = 24 * 60 * 60 * 1_000;

// "2026-09-03" and "2026-09-03T10:00:00Z" both arrive here; anything else is
// not a date this may act on.
function dayNumber(value) {
  const text = String(value || "").trim().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return null;
  const time = Date.parse(`${text}T00:00:00Z`);
  return Number.isFinite(time) ? Math.floor(time / DAY) : null;
}

export function daysSince(value, today) {
  const from = dayNumber(value);
  const to = dayNumber(today);
  if (from == null || to == null) return null;
  return to - from;
}

/*
 * Close the applications that have gone unanswered past the deadline.
 *
 * Only "Applied" is eligible. "Preparing" was never sent, so silence says
 * nothing about it, and closing it would record a rejection that never
 * happened. Anything that reached Feedback or Interview is answered by
 * definition, and a row the owner already closed is left exactly as it is.
 */
export function expireSilentApplications(applications, options = {}) {
  const today = options.today || "";
  const days = Number.isFinite(options.days) ? options.days : SILENCE_DAYS;
  const rows = Array.isArray(applications) ? applications : [];
  const closed = [];
  const next = rows.map((application) => {
    if (!application || application.status !== "Applied") return application;
    if (application.feedbackDate) return application;
    const { waited, reopened } = silenceSoFar(application, today);
    if (waited == null || waited < days) return application;
    closed.push({ id: application.id, company: application.company, role: application.role, waited, reopened });
    return {
      ...application,
      status: "Closed",
      closedReason: "no_answer",
      note: withAutoCloseNote(application.note, autoCloseNote(waited, reopened)),
    };
  });
  return { applications: closed.length ? next : rows, closed };
}

// How long this row has waited, measured from the later of the application
// date and the last reopen. `reopened` says which one won, so the note can
// say "since it was reopened" instead of claiming the whole silence is new.
function silenceSoFar(application, today) {
  const sinceApplied = daysSince(application.date, today);
  const sinceReopened = daysSince(application.silenceResetAt, today);
  if (sinceReopened != null && (sinceApplied == null || sinceReopened < sinceApplied)) return { waited: sinceReopened, reopened: true };
  return { waited: sinceApplied, reopened: false };
}

const AUTO_CLOSE_NOTE = /\s*(?:—\s*)?Closed automatically: no answer in \d+ days?(?: since it was reopened)?\./g;

function autoCloseNote(waited, reopened) {
  return `Closed automatically: no answer in ${waited} ${waited === 1 ? "day" : "days"}${reopened ? " since it was reopened" : ""}.`;
}

// The note keeps exactly one auto-close sentence: an earlier one from a
// previous cycle is replaced, never stacked beside the new one.
function withAutoCloseNote(existing, addition) {
  const current = clearAutoCloseNote(existing);
  return current ? `${current} — ${addition}` : addition;
}

export function clearAutoCloseNote(note) {
  return String(note || "").replace(AUTO_CLOSE_NOTE, "").replace(/\s*—\s*$/, "").trim();
}

// The banner shown once per load when the deadline closed something. Pure so
// it can be tested; the effect that renders it has no test harness.
export function describeSilentClosures(closed, days = SILENCE_DAYS) {
  const rows = Array.isArray(closed) ? closed : [];
  if (!rows.length) return "";
  const named = rows.slice(0, 3).map((row) => `${row.role} at ${row.company}`).join(", ");
  const more = rows.length > 3 ? `, and ${rows.length - 3} more` : "";
  return `${rows.length} ${rows.length === 1 ? "application was" : "applications were"} closed after ${days} days with no answer: ${named}${more}. Reopen any of them by changing the status back.`;
}

/*
 * One status change, with everything it implies.
 *
 * "Applied" from a pre-application status stamps the date it was sent; from
 * anywhere else it is a correction, and the real date stays. Reaching Feedback
 * or Interview records the first answer once. Closing from Applied with no
 * answer records why, so the reply summary can still count the row as sent.
 * Reopening clears the close, restarts the silence clock, drops the
 * auto-close sentence from the note and — when the row goes back to a status
 * before Feedback — forgets the answer, because a new cycle has no answer yet.
 */
export const PRE_APPLICATION = new Set(["Saved opportunity", "Preparing"]);
export const ANSWERED_STATUSES = new Set(["Feedback", "Interview"]);

export function applyStatusChange(application, nextStatus, today) {
  const previous = application.status;
  const applied = nextStatus === "Applied" && PRE_APPLICATION.has(previous);
  const answered = ANSWERED_STATUSES.has(nextStatus) && !application.feedbackDate;
  const reopened = previous === "Closed" && nextStatus !== "Closed";
  const closing = nextStatus === "Closed" && previous !== "Closed";
  const next = { ...application, status: nextStatus };
  if (applied) next.date = today;
  if (answered) next.feedbackDate = today;
  if (closing) next.closedReason = application.feedbackDate ? "answered" : previous === "Applied" ? "no_answer" : "not_sent";
  if (reopened) {
    delete next.closedReason;
    next.silenceResetAt = today;
    next.note = clearAutoCloseNote(application.note) || undefined;
    if (PRE_APPLICATION.has(nextStatus) || nextStatus === "Applied") delete next.feedbackDate;
  }
  return { application: next, applied, answered, reopened };
}

/*
 * What has actually produced a reply.
 *
 * Counted from applications that reached Feedback or Interview, against those
 * that were sent and answered with silence. Everything here is a count of the
 * owner's own decisions — no inference, no model — so the panel can show the
 * evidence beside every claim.
 *
 * `ready` is false until there is enough to mean anything. Two replies is not
 * a pattern, and presenting it as one would be the most expensive kind of
 * wrong: it would change what he applies to.
 */
export const REPLY_MIN_SAMPLE = 5;
const STOP_WORDS = new Set(["and", "the", "for", "with", "of", "to", "in", "at", "a", "an", "senior", "sr", "junior", "jr", "staff", "lead", "principal", "head", "director", "manager", "specialist", "coordinator", "associate", "assistant", "executive", "global", "regional", "remote", "hybrid", "full", "part", "time", "contract", "i", "ii", "iii"]);

export function summarizeReplies(applications, options = {}) {
  const rows = (Array.isArray(applications) ? applications : []).filter(Boolean);
  const answered = rows.filter((row) => row.feedbackDate || ANSWERED_STATUSES.has(row.status));
  // Sent and never answered: still waiting, or closed — by the deadline or by
  // hand — with the reason recorded. A row closed with no reason predates the
  // reason field and is left out, since nothing says whether it was ever sent.
  const silent = rows.filter((row) => !row.feedbackDate && !ANSWERED_STATUSES.has(row.status)
    && (row.status === "Applied" || (row.status === "Closed" && row.closedReason === "no_answer")));
  const sent = answered.length + silent.length;

  const byWord = new Map();
  for (const row of answered) {
    for (const word of new Set(titleWords(row.role))) {
      byWord.set(word, (byWord.get(word) || 0) + 1);
    }
  }
  const words = [...byWord.entries()]
    .filter(([, count]) => count >= 2)
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
    .slice(0, 8)
    .map(([word, count]) => ({ word, count }));

  const trackCounts = new Map();
  for (const row of answered) {
    const track = String(row.trackName || "").trim();
    if (track) trackCounts.set(track, (trackCounts.get(track) || 0) + 1);
  }
  const tracks = [...trackCounts.entries()]
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
    .map(([name, count]) => ({ name, count }));

  const waits = answered
    .map((row) => daysSince(row.date, row.feedbackDate))
    .filter((value) => value != null && value >= 0)
    .sort((left, right) => left - right);
  const minimum = Number.isFinite(options.minimum) ? options.minimum : REPLY_MIN_SAMPLE;
  const ready = answered.length >= minimum;
  // A real median — the mean of the two middle values when the count is even —
  // and only from as many measurable waits as the word list needs replies: a
  // blank application date drops a row from `waits` without dropping it from
  // `answered`, so the two counts are gated separately.
  const middle = waits.length / 2;
  const median = waits.length === 0 ? null : waits.length % 2 ? waits[Math.floor(middle)] : (waits[middle - 1] + waits[middle]) / 2;
  const medianReplyDays = ready && waits.length >= minimum ? median : null;
  return {
    ready,
    answered: answered.length,
    silent: silent.length,
    sent,
    replyRate: sent ? Math.round((answered.length / sent) * 100) : null,
    words: ready ? words : [],
    tracks: ready ? tracks : [],
    medianReplyDays,
    reason: ready
      ? `Learned from ${answered.length} ${answered.length === 1 ? "reply" : "replies"} across ${sent} sent applications.`
      : `V's reads what is working once ${REPLY_MIN_SAMPLE} applications have been answered. So far: ${answered.length} of ${sent} sent.`,
  };
}

function titleWords(value) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .match(/[a-z][a-z+#'-]*/g)
    ?.map((word) => word.replace(/^[-']+|[-']+$/g, ""))
    .filter((word) => word.length >= 3 && !STOP_WORDS.has(word)) || [];
}
