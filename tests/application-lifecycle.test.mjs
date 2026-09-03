import assert from "node:assert/strict";
import test from "node:test";
import { REPLY_MIN_SAMPLE, SILENCE_DAYS, daysSince, expireSilentApplications, summarizeReplies } from "../lib/application-lifecycle.mjs";

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
