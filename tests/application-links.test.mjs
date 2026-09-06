import assert from "node:assert/strict";
import test from "node:test";
import {
  applicationForDraft,
  linkDraftToApplication,
  linkableDrafts,
  unpinDrafts,
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

// Drafts carry the date the app prints — "Sep 5, 2026" — so "newest" has to
// come from the calendar, not from the alphabet.
test("the newest matching draft is chosen by date, not by month name", () => {
  const application = { id: "app-1", company: "Airbnb", role: "Producer" };
  const drafts = [
    { id: "sep", type: "resume", company: "Airbnb", role: "Producer", updatedAt: "Sep 1, 2026", versionNumber: 2 },
    { id: "oct", type: "resume", company: "Airbnb", role: "Producer", updatedAt: "Oct 5, 2026", versionNumber: 1 },
    { id: "aug3", type: "cover", company: "Airbnb", role: "Producer", updatedAt: "Aug 3, 2026" },
    { id: "aug20", type: "cover", company: "Airbnb", role: "Producer", updatedAt: "Aug 20, 2026" },
  ];
  const resolved = resolveApplicationDrafts(application, drafts);
  assert.equal(resolved.resume.draft.id, "oct");
  assert.equal(resolved.cover.draft.id, "aug20");
});

test("a pin is honoured automatically but never hides a draft from the hand-picker", () => {
  const first = { id: "app-1", company: "Airbnb", role: "Producer" };
  const second = { id: "app-2", company: "Airbnb", role: "Producer" };
  const drafts = [{ id: "d1", type: "resume", company: "Airbnb", role: "Producer", updatedAt: "2026-09-01", applicationId: "app-1" }];
  assert.equal(resolveApplicationDrafts(second, drafts).resume.draft, null, "pinned elsewhere, so not claimed");
  assert.deepEqual(linkableDrafts(second, drafts).map((draft) => draft.id), ["d1"], "but still offered, so a wrong pin can be corrected");
  assert.deepEqual(linkableDrafts(first, drafts).map((draft) => draft.id), [], "already shown on its own row");
});

test("linking writes both halves, and deleting an application releases its drafts", () => {
  const applications = [{ id: "app-1", company: "Airbnb", role: "Producer" }, { id: "app-2", company: "Acme", role: "Lead" }];
  const drafts = [{ id: "d1", type: "resume", company: "Airbnb", role: "Producer" }, { id: "d2", type: "cover", company: "Airbnb", role: "Producer" }];
  const linked = linkDraftToApplication(applications, drafts, "app-1", drafts[0]);
  assert.equal(linked.applications[0].resumeVersionId, "d1");
  assert.equal(linked.applications[1].resumeVersionId, undefined);
  assert.equal(linked.drafts[0].applicationId, "app-1");
  assert.equal(linked.drafts[1].applicationId, undefined);
  const released = unpinDrafts(linked.drafts, "app-1");
  assert.equal(released[0].applicationId, undefined);
  assert.equal(resolveApplicationDrafts({ id: "app-3", company: "Airbnb", role: "Producer" }, released).resume.draft.id, "d1", "free to match a new row for the same job");
});
