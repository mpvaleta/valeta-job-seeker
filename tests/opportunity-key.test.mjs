import assert from "node:assert/strict";
import test from "node:test";

import { opportunityKey } from "../lib/radar.mjs";

const same = (left, right) => assert.equal(opportunityKey(left), opportunityKey(right), `${left}\n  should match\n${right}`);
const different = (left, right) => assert.notEqual(opportunityKey(left), opportunityKey(right), `${left}\n  should NOT match\n${right}`);

test("trivially different links to one posting share a key", () => {
  same("https://boards.greenhouse.io/acme/jobs/4012", "https://boards.greenhouse.io/acme/jobs/4012/");
  same("https://jobs.lever.co/acme/9f2", "http://jobs.lever.co/acme/9f2");
  same("https://www.metacareers.com/profile/job_details/55/", "https://metacareers.com/profile/job_details/55/");
  same("https://acme.com/careers/pm#apply", "https://acme.com/careers/pm");
  same("https://acme.com/careers/pm?a=1&b=2", "https://acme.com/careers/pm?b=2&a=1");
  same("https://ACME.com/careers/pm", "https://acme.com/careers/pm");
});

test("tracking parameters do not create a second job", () => {
  same("https://acme.com/careers/pm?utm_source=linkedin&utm_medium=social", "https://acme.com/careers/pm");
  same("https://boards.greenhouse.io/acme/jobs/4012?gh_src=abc123", "https://boards.greenhouse.io/acme/jobs/4012");
  same("https://acme.com/jobs/12?trk=public_jobs&refId=xyz", "https://acme.com/jobs/12");
  same("https://acme.com/jobs/12?fbclid=abc&gclid=def", "https://acme.com/jobs/12");
});

// These parameters are the job's identity, not its referrer.
test("identifying parameters still separate distinct jobs", () => {
  different("https://acme.com/careers?gh_jid=4012", "https://acme.com/careers?gh_jid=4013");
  different("https://www.indeed.com/viewjob?jk=abc123", "https://www.indeed.com/viewjob?jk=def456");
  different("https://acme.com/jobs?requisitionId=90", "https://acme.com/jobs?requisitionId=91");
  // A tracking parameter alongside an identifying one keeps the identity.
  same("https://acme.com/careers?gh_jid=4012&utm_source=x", "https://acme.com/careers?gh_jid=4012");
});

test("genuinely different postings never collapse together", () => {
  different("https://boards.greenhouse.io/acme/jobs/4012", "https://boards.greenhouse.io/acme/jobs/4013");
  different("https://boards.greenhouse.io/acme/jobs/4012", "https://boards.greenhouse.io/other/jobs/4012");
  different("https://acme.com/careers/pm", "https://acme.com/careers/producer");
});

// Some ATS platforms use case-sensitive identifiers, so merging on a
// lowercased path could hide a real role. A duplicate is the safer failure.
test("path case is preserved so distinct job ids cannot merge", () => {
  different("https://acme.com/jobs/AbC123", "https://acme.com/jobs/abc123");
});

test("unparseable and empty values degrade without throwing", () => {
  assert.equal(opportunityKey(""), "");
  assert.equal(opportunityKey(null), "");
  assert.equal(opportunityKey(undefined), "");
  assert.equal(opportunityKey("not a url"), "not a url");
  same("not a url", "NOT A URL");
});
