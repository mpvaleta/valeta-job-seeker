import assert from "node:assert/strict";
import test from "node:test";
import { REPLY_MIN_SAMPLE, SILENCE_DAYS, applyStatusChange, clearAutoCloseNote, daysSince, describeSilentClosures, expireSilentApplications, summarizeReplies } from "../lib/application-lifecycle.mjs";

const applied = (over = {}) => ({ id: "a", status: "Applied", date: "2026-06-01", company: "Airbnb", role: "Executive Producer", ...over });

test("an application unanswered past the deadline is closed, with the reason on the row", () => {
  const { applications, closed } = expireSilentApplications([applied()], { today: "2026-09-03" });
  assert.equal(closed.length, 1);
  assert.equal(closed[0].waited, 94);
  assert.equal(applications[0].status, "Closed");
  assert.equal(applications[0].closedReason, "no_answer");
  assert.match(applications[0].note, /no answer in 94 days/);
});

test("silence only closes what was actually sent, and never overrides an answer", () => {
  const rows = [
    applied({ id: "prep", status: "Preparing" }),
    applied({ id: "answered", feedbackDate: "2026-06-20" }),
    applied({ id: "interview", status: "Interview" }),
    applied({ id: "closed", status: "Closed", note: "Rejected by email" }),
  ];
  const { applications, closed } = expireSilentApplications(rows, { today: "2026-09-03" });
  assert.deepEqual(closed, [], "nothing here is unanswered-and-sent");
  assert.equal(applications[0].status, "Preparing", "never sent, so silence says nothing about it");
  assert.equal(applications[1].status, "Applied", "an answered application is not closed by the clock");
  assert.equal(applications[3].note, "Rejected by email", "a row the owner closed is left exactly as it is");
});

test("the deadline is a boundary, not a range", () => {
  const dayBefore = expireSilentApplications([applied({ date: "2026-07-06" })], { today: "2026-09-03" });
  assert.equal(dayBefore.closed.length, 0, `${SILENCE_DAYS - 1} days is still waiting`);
  const dayOf = expireSilentApplications([applied({ date: "2026-07-05" })], { today: "2026-09-03" });
  assert.equal(dayOf.closed.length, 1);
  // A row with no usable date is never touched.
  assert.equal(expireSilentApplications([applied({ date: "" })], { today: "2026-09-03" }).closed.length, 0);
  assert.equal(daysSince("2026-09-01", "2026-09-03"), 2);
  assert.equal(daysSince("nonsense", "2026-09-03"), null);
});

test("reopening resets the clock, so the same silence must be waited out again", () => {
  // Applied 2026-06-01, already past the deadline by 2026-09-03 (94 days) —
  // but reopened on 2026-08-20, so the clock restarts there.
  const reopened = applied({ silenceResetAt: "2026-08-20", note: "Closed automatically: no answer in 94 days." });
  const stillWaiting = expireSilentApplications([reopened], { today: "2026-09-03" });
  assert.equal(stillWaiting.closed.length, 0, "14 days since the reopen is still within the deadline");
  const pastAgain = expireSilentApplications([reopened], { today: "2026-10-19" });
  assert.equal(pastAgain.closed.length, 1, "the reset deadline can still be reached");
  assert.equal(pastAgain.closed[0].waited, 60);
  assert.equal(pastAgain.closed[0].reopened, true);
  // The note says what the number measures, and one sentence replaces the
  // last — a row that cycles twice does not read "94 days — 60 days".
  assert.equal(pastAgain.applications[0].note, "Closed automatically: no answer in 60 days since it was reopened.");
});

test("the deadline runs from the later date, so a reopened row re-sent later is not closed on arrival", () => {
  // Reopened to Preparing on 2026-09-05, then actually sent on 2026-11-20.
  const resent = applied({ date: "2026-11-20", silenceResetAt: "2026-09-05" });
  assert.equal(expireSilentApplications([resent], { today: "2026-11-21" }).closed.length, 0, "sent yesterday is not 77 days of silence");
  const later = expireSilentApplications([resent], { today: "2027-01-19" });
  assert.equal(later.closed[0].waited, 60);
  assert.equal(later.closed[0].reopened, false, "the application date won, so the note does not mention the reopen");
});

test("the auto-close sentence can be removed, leaving the owner's own note", () => {
  assert.equal(clearAutoCloseNote("Recruiter: Ana — Closed automatically: no answer in 94 days."), "Recruiter: Ana");
  assert.equal(clearAutoCloseNote("Closed automatically: no answer in 1 day since it was reopened."), "");
  assert.equal(clearAutoCloseNote("Nothing automatic here"), "Nothing automatic here");
});

test("the load-time banner names up to three rows and counts the rest", () => {
  const row = (n) => ({ id: String(n), role: `Role ${n}`, company: `Co ${n}`, waited: 70, reopened: false });
  assert.equal(describeSilentClosures([]), "");
  assert.match(describeSilentClosures([row(1)]), /^1 application was closed after 60 days with no answer: Role 1 at Co 1\. Reopen/);
  assert.match(describeSilentClosures([row(1), row(2), row(3), row(4), row(5)]), /5 applications were closed .*Role 3 at Co 3, and 2 more\. Reopen/);
});

// Every status change goes through one function, so what a status means is
// decided once — not separately by the dropdown, the archive button and the
// deadline.
test("a status change stamps exactly what it implies", () => {
  const today = "2026-09-06";
  const sent = applyStatusChange(applied({ status: "Preparing", date: "2026-08-01" }), "Applied", today);
  assert.equal(sent.application.date, today, "moving from Preparing to Applied is the submission");
  assert.equal(sent.applied, true);

  const answered = applyStatusChange(applied(), "Feedback", today);
  assert.equal(answered.application.feedbackDate, today);
  assert.equal(answered.answered, true);
  assert.equal(applyStatusChange(answered.application, "Interview", "2026-09-10").application.feedbackDate, today, "the first answer is kept");

  assert.equal(applyStatusChange(applied(), "Closed", today).application.closedReason, "no_answer", "closed by hand from Applied is still a sent, unanswered row");
  assert.equal(applyStatusChange(answered.application, "Closed", today).application.closedReason, "answered");
  assert.equal(applyStatusChange(applied({ status: "Saved opportunity" }), "Closed", today).application.closedReason, "not_sent");
});

test("reopening is not a fresh submission, and forgets what belonged to the closed cycle", () => {
  const closed = applied({ status: "Closed", closedReason: "no_answer", feedbackDate: "2026-06-20", note: "Recruiter: Ana — Closed automatically: no answer in 94 days." });
  const back = applyStatusChange(closed, "Applied", "2026-09-06");
  assert.equal(back.reopened, true);
  assert.equal(back.applied, false, "the date it was really sent stays");
  assert.equal(back.application.date, "2026-06-01");
  assert.equal(back.application.silenceResetAt, "2026-09-06");
  assert.equal(back.application.closedReason, undefined);
  assert.equal(back.application.feedbackDate, undefined, "a new cycle has no answer yet");
  assert.equal(back.application.note, "Recruiter: Ana");
  // Reopening straight to Feedback keeps the answer — that is a correction of
  // an accidental close, not a new cycle.
  assert.equal(applyStatusChange(closed, "Feedback", "2026-09-06").application.feedbackDate, "2026-06-20");
  // And a reopened row can be closed by the deadline again, without stacking notes.
  const again = expireSilentApplications([back.application], { today: "2026-11-05" });
  assert.equal(again.applications[0].note, "Recruiter: Ana — Closed automatically: no answer in 60 days since it was reopened.");
});

test("the reply rate counts every sent application, including the ones closed by hand", () => {
  const rows = [
    ...[1, 2].map((n) => applied({ id: `a${n}`, status: "Feedback", feedbackDate: "2026-06-10" })),
    ...[3, 4, 5].map((n) => applied({ id: `c${n}`, status: "Closed", closedReason: "no_answer" })),
    ...[6, 7, 8, 9, 10].map((n) => applyStatusChange(applied({ id: `h${n}` }), "Closed", "2026-09-01").application),
  ];
  const summary = summarizeReplies(rows, {});
  assert.equal(summary.sent, 10);
  assert.equal(summary.replyRate, 20, "not 40% with the hand-closed five missing from the denominator");
});

test("the median is a median, and only from enough measured waits", () => {
  const answered = (id, date, feedbackDate) => applied({ id, status: "Feedback", date, feedbackDate });
  const even = summarizeReplies([
    answered("1", "2026-06-01", "2026-06-04"), answered("2", "2026-06-01", "2026-06-06"), answered("3", "2026-06-01", "2026-06-09"),
    answered("4", "2026-06-01", "2026-06-21"), answered("5", "2026-06-01", "2026-07-01"), answered("6", "2026-06-01", "2026-07-16"),
  ], {});
  assert.equal(even.medianReplyDays, 14, "waits 3, 5, 8, 20, 30, 45 → (8 + 20) / 2, not the upper middle");
  // Five answered, but four with a blank date: one measurable wait is not a
  // typical anything, however many replies there are.
  const sparse = summarizeReplies([answered("1", "2026-06-01", "2026-06-04"), ...[2, 3, 4, 5].map((n) => answered(String(n), "", "2026-06-04"))], {});
  assert.equal(sparse.ready, true);
  assert.equal(sparse.medianReplyDays, null);
});

test("the array is returned untouched when nothing expires", () => {
  const rows = [applied({ date: "2026-09-01" })];
  assert.equal(expireSilentApplications(rows, { today: "2026-09-03" }).applications, rows, "no needless re-render");
});

// Two replies is not a pattern. Presenting it as one would change what he
// applies to, which is the most expensive way to be wrong.
test("what is working stays quiet until there is enough to mean anything", () => {
  const two = summarizeReplies([
    applied({ id: "1", status: "Feedback", feedbackDate: "2026-06-10" }),
    applied({ id: "2", status: "Interview", feedbackDate: "2026-06-12" }),
    applied({ id: "3" }),
  ], {});
  assert.equal(two.ready, false);
  assert.equal(two.answered, 2);
  assert.deepEqual(two.words, [], "no pattern is offered from two replies");
  assert.equal(two.medianReplyDays, null, "a speed claim from two replies would be as misleading as the word list");
  assert.match(two.reason, new RegExp(`once ${REPLY_MIN_SAMPLE} applications have been answered`));
});

test("with enough replies it reports the words, tracks, rate and speed — all countable", () => {
  const answered = ["Executive Producer", "Creative Producer", "Executive Producer, Brand", "Senior Producer", "Producer, Content"]
    .map((role, index) => applied({ id: `y${index}`, role, status: "Feedback", date: "2026-06-01", feedbackDate: "2026-06-08", trackName: "Production" }));
  const silent = [applied({ id: "n1", role: "Operations Lead" }), applied({ id: "n2", role: "Project Manager", status: "Closed", closedReason: "no_answer" })];
  const summary = summarizeReplies([...answered, ...silent], {});
  assert.equal(summary.ready, true);
  assert.equal(summary.answered, 5);
  assert.equal(summary.silent, 2);
  assert.equal(summary.replyRate, 71);
  assert.equal(summary.medianReplyDays, 7);
  assert.equal(summary.words[0].word, "producer");
  assert.equal(summary.words[0].count, 5);
  assert.deepEqual(summary.tracks, [{ name: "Production", count: 5 }]);
  // Rank words say how senior a job is, not what it is, so they never lead.
  assert.ok(!summary.words.some((entry) => entry.word === "senior"), JSON.stringify(summary.words));
});
