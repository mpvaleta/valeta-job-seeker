import assert from "node:assert/strict";
import test from "node:test";
import {
  applicationForDraft,
  companyFromJobUrl,
  draftLinksFor,
  draftMatchesApplication,
  normalizeJobUrl,
  resolveApplicationDrafts,
} from "../lib/application-links.mjs";

const application = {
  id: "app-1",
  company: "Airbnb",
  role: "Executive Producer",
  url: "https://www.linkedin.com/jobs/view/4001/?trk=flagship_search",
};

const draft = (over = {}) => ({
  id: "draft-1", type: "resume", company: "Airbnb", role: "Executive Producer",
  createdAt: "2026-09-01", updatedAt: "2026-09-01", ...over,
});

// The bug as the owner met it: he saved the résumé before filling the company
// field, so it was stored as "Unknown company" and the exact-match link button
// never appeared. The URL is on both records and settles it.
test("a draft saved before the company was filled still matches by job URL", () => {
  const orphan = draft({ company: "Unknown company", role: "Untitled role", url: "https://linkedin.com/jobs/view/4001" });
  assert.equal(draftMatchesApplication(orphan, application), true);
  // ...and the placeholder alone never matches anything.
  assert.equal(draftMatchesApplication(draft({ company: "Unknown company", role: "Untitled role" }), application), false);
});

test("company and role match once normalised, not only when typed identically", () => {
  assert.equal(draftMatchesApplication(draft({ company: "airbnb  ", role: "executive producer" }), application), true);
  assert.equal(draftMatchesApplication(draft({ company: "Airbnb", role: "Senior Producer" }), application), false);
});

test("a draft already linked to another application is never claimed", () => {
  assert.equal(draftMatchesApplication(draft({ applicationId: "app-2" }), application), false);
  assert.equal(draftMatchesApplication(draft({ applicationId: "app-1" }), application), true);
});

test("the same posting reached by two links is one job", () => {
  assert.equal(
    normalizeJobUrl("https://www.linkedin.com/jobs/view/4001/?trk=flagship&refId=x"),
    normalizeJobUrl("https://linkedin.com/jobs/view/4001"),
  );
});

test("an explicit link wins, and otherwise the newest matching draft is shown", () => {
  const drafts = [
    draft({ id: "old", updatedAt: "2026-08-01", versionNumber: 1 }),
    draft({ id: "new", updatedAt: "2026-09-02", versionNumber: 2 }),
    draft({ id: "cover", type: "cover", updatedAt: "2026-09-02" }),
  ];
  const automatic = resolveApplicationDrafts(application, drafts);
  assert.equal(automatic.resume.draft.id, "new");
  assert.equal(automatic.resume.linked, false, "an inferred match is reported as inferred");
  assert.equal(automatic.cover.draft.id, "cover");

  const chosen = resolveApplicationDrafts({ ...application, resumeVersionId: "old" }, drafts);
  assert.equal(chosen.resume.draft.id, "old", "the owner's own choice is never overridden");
  assert.equal(chosen.resume.linked, true);
});

test("the ids to store are only the ones not already stored", () => {
  const drafts = [draft({ id: "r1" }), draft({ id: "c1", type: "cover" })];
  assert.deepEqual(draftLinksFor(application, drafts), { resumeVersionId: "r1", coverVersionId: "c1" });
  assert.deepEqual(draftLinksFor({ ...application, resumeVersionId: "kept" }, drafts), { coverVersionId: "c1" });
  assert.deepEqual(draftLinksFor(application, []), {});
});

test("a freshly saved draft finds the application already open for that role", () => {
  const applications = [{ id: "other", company: "Mercury", role: "Producer" }, application];
  assert.equal(applicationForDraft(draft(), applications).id, "app-1");
  assert.equal(applicationForDraft(draft({ company: "Nobody", role: "Nothing" }), applications), null);
});

// An ATS board is organised by employer, so the path names the company. A job
// board is not: filing an Airbnb role under "Linkedin" would be worse than
// leaving the field empty.
test("a company is derived from an ATS URL and never from a job board", () => {
  assert.equal(companyFromJobUrl("https://job-boards.greenhouse.io/airbnb/jobs/7213"), "Airbnb");
  assert.equal(companyFromJobUrl("https://jobs.lever.co/instrument/8f21bd7a"), "Instrument");
  assert.equal(companyFromJobUrl("https://careers.airbnb.com/positions/1234/"), "Airbnb");
  assert.equal(companyFromJobUrl("https://www.linkedin.com/jobs/view/4001/"), "");
  assert.equal(companyFromJobUrl("https://www.indeed.com/viewjob?jk=abc"), "");
  assert.equal(companyFromJobUrl("not a url"), "");
  assert.equal(companyFromJobUrl(""), "");
});
