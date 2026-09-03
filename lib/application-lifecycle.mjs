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
 * the row is closed with a note saying why, not deleted.
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
    const waited = daysSince(application.date, today);
    if (waited == null || waited < days) return application;
    closed.push({ id: application.id, company: application.company, role: application.role, waited });
    return {
      ...application,
      status: "Closed",
      closedReason: "no_answer",
      note: appendNote(application.note, `Closed automatically: no answer in ${waited} days.`),
    };
  });
  return { applications: closed.length ? next : rows, closed };
}

function appendNote(existing, addition) {
  const current = String(existing || "").trim();
  if (current.includes(addition)) return current;
  return current ? `${current} — ${addition}` : addition;
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
  const answered = rows.filter((row) => row.feedbackDate || row.status === "Feedback" || row.status === "Interview");
  const silent = rows.filter((row) => !row.feedbackDate && row.status !== "Feedback" && row.status !== "Interview"
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
  const medianReplyDays = waits.length ? waits[Math.floor(waits.length / 2)] : null;

  const ready = answered.length >= (Number.isFinite(options.minimum) ? options.minimum : REPLY_MIN_SAMPLE);
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
