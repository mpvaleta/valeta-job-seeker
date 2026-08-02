import assert from "node:assert/strict";
import test from "node:test";
import { findReusableResumes, scoreResumeReuse } from "../lib/resume-reuse.mjs";

test("similar résumé roles are ranked for zero-token reuse", () => {
  const drafts = [
    { id: "a", type: "resume", role: "Creative Operations Manager", trackId: "brand-project", content: "Strong resume", updatedAt: "2026-07-20" },
    { id: "b", type: "resume", role: "Financial Analyst", trackId: "other", content: "Other resume", updatedAt: "2026-07-21" },
  ];
  const matches = findReusableResumes(drafts, { role: "Senior Creative Operations Program Manager", trackId: "brand-project", jobText: "creative operations programs" });
  assert.equal(matches[0].draft.id, "a");
  assert.ok(matches[0].score >= 45);
  assert.match(matches[0].reasons.join(" "), /same résumé track/);
});

test("non-resume and empty drafts cannot be reused", () => {
  assert.equal(scoreResumeReuse({ type: "cover", role: "Creative Manager" }, { role: "Creative Manager" }).score, 0);
  assert.deepEqual(findReusableResumes([{ type: "resume", content: "", role: "Creative Manager" }], { role: "Creative Manager" }), []);
});
