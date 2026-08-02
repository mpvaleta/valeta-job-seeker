import assert from "node:assert/strict";
import test from "node:test";

import { classifyCompanyCategory, classifyRadarOpportunity } from "../lib/radar.mjs";

test("early-stage companies are classified as startups", () => {
  const startups = [
    "Series A fintech building payments infrastructure",
    "We are a seed-stage startup based in San Francisco",
    "YC W24 company hiring our founding marketer",
    "Venture-backed, pre-seed, 12-person team",
    "Stealth mode consumer app",
  ];
  for (const context of startups) {
    assert.equal(classifyCompanyCategory("", context), "Startup / Early-stage", context);
  }
});

test("established companies are not mislabelled as startups", () => {
  // "growth" and "scaling" describe plenty of large companies, so they must not
  // on their own imply an early-stage employer.
  const established = [
    ["", "A global streaming media company with 4,000 employees", "Media"],
    ["", "Enterprise software platform for retail analytics", "Technology"],
    ["", "Our growth marketing team is scaling paid channels", "Other"],
    ["Brand / Consumer", "A seed-stage beauty brand", "Brand / Consumer"],
  ];
  for (const [explicit, context, expected] of established) {
    assert.equal(classifyCompanyCategory(explicit, context), expected, `${explicit} | ${context}`);
  }
});

// Most job postings never mention their own funding stage, so classifying by
// posting TEXT alone misses almost every real startup. A role found on a
// board that exists specifically to list startups is itself strong evidence
// -- stronger than STARTUP_SIGNAL -- so the source URL overrides the
// text-based classifier for the two boards that are startup-only.
test("a role sourced from Wellfound or Work at a Startup is tagged Startup / Early-stage regardless of what the posting text says", () => {
  const noStageLanguage = { title: "Senior Software Engineer", company: "Acme Corp", fitSummary: "Build backend services for our platform team." };
  const wellfound = classifyRadarOpportunity({ ...noStageLanguage, sourceUrl: "https://wellfound.com/company/acme/jobs/12345" });
  assert.equal(wellfound.companyCategory, "Startup / Early-stage");
  const yc = classifyRadarOpportunity({ ...noStageLanguage, sourceUrl: "https://www.workatastartup.com/jobs/98765" });
  assert.equal(yc.companyCategory, "Startup / Early-stage");
});

test("Built In is not auto-tagged as a startup, since it also lists large employers", () => {
  const result = classifyRadarOpportunity({ title: "Senior Software Engineer", company: "Acme Corp", sourceUrl: "https://builtin.com/job/senior-software-engineer/12345" });
  assert.notEqual(result.companyCategory, "Startup / Early-stage");
});

test("a Wellfound-sourced role still gets a real track, not just the startup category", () => {
  const result = classifyRadarOpportunity({ title: "Brand Producer", company: "Acme", fitSummary: "Lead integrated production for brand campaigns.", sourceUrl: "https://wellfound.com/company/acme/jobs/1" });
  assert.equal(result.companyCategory, "Startup / Early-stage");
  assert.equal(result.trackId, "production");
});

test("an unparseable or unrelated source URL falls back to the ordinary text-based classifier", () => {
  const withBadUrl = classifyRadarOpportunity({ title: "Seed-stage founding engineer", sourceUrl: "not a url" });
  assert.equal(withBadUrl.companyCategory, "Startup / Early-stage");
  const withOtherHost = classifyRadarOpportunity({ title: "Software Engineer", company: "Acme", sourceUrl: "https://boards.greenhouse.io/acme/jobs/1" });
  assert.notEqual(withOtherHost.companyCategory, "Startup / Early-stage");
});
