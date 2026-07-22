import assert from "node:assert/strict";
import test from "node:test";
import {
  DEFAULT_RADAR_PROFILE,
  detectCareerSource,
  discoverTargetJobs,
  normalizeRadarProfile,
  scoreRadarOpportunity,
  rankCareerLinks,
} from "../lib/radar.mjs";

test("radar defaults preserve the Bay Area-first creative and agency focus", () => {
  const profile = normalizeRadarProfile({});
  assert.ok(profile.titles.some((title) => /creative operations/i.test(title)));
  assert.ok(profile.skills.some((skill) => /project management/i.test(skill)));
  assert.ok(profile.locations.some((location) => /Bay Area/i.test(location)));
  assert.equal(profile.minScore, DEFAULT_RADAR_PROFILE.minScore);
});

test("radar scoring rewards target roles, skills, and geography", () => {
  const result = scoreRadarOpportunity({
    title: "Creative Operations Manager",
    description: "Lead integrated production, brand programs, agency partners, project plans, and cross-functional delivery.",
    location: "San Francisco, CA",
  }, DEFAULT_RADAR_PROFILE);
  assert.ok(result.score >= 80);
  assert.equal(result.passes, true);
  assert.match(result.summary, /target title/i);
});

test("radar exclusions prevent a superficially matching role from passing", () => {
  const result = scoreRadarOpportunity({
    title: "Brand Project Manager",
    description: "Commission only independent contractor opportunity in brand marketing.",
    location: "Remote",
  }, { ...DEFAULT_RADAR_PROFILE, exclusions: ["commission only"] });
  assert.ok(result.score <= 24);
  assert.equal(result.passes, false);
  assert.match(result.summary, /review exclusion/i);
});

test("official ATS career URLs are detected without arbitrary endpoint access", () => {
  assert.deepEqual(detectCareerSource("https://boards.greenhouse.io/example").type, "greenhouse");
  assert.deepEqual(detectCareerSource("https://jobs.lever.co/example").type, "lever");
  assert.deepEqual(detectCareerSource("https://jobs.ashbyhq.com/example").type, "ashby");
  assert.deepEqual(detectCareerSource("https://example.com/careers").type, "public-page");
});

test("Greenhouse discovery uses its public jobs API and preserves original links", async () => {
  const calls = [];
  const jobs = await discoverTargetJobs({ company: "Example", careersUrl: "https://boards.greenhouse.io/example" }, {
    fetchImpl: async (url) => {
      calls.push(String(url));
      return Response.json({ jobs: [{
        title: "Senior Creative Producer",
        location: { name: "San Francisco, CA" },
        content: "<p>Lead integrated creative production and partner teams.</p>",
        absolute_url: "https://boards.greenhouse.io/example/jobs/100",
        updated_at: "2026-07-18T00:00:00Z",
      }] });
    },
  });
  assert.equal(jobs.length, 1);
  assert.equal(jobs[0].company, "Example");
  assert.equal(jobs[0].sourceType, "greenhouse");
  assert.equal(jobs[0].sourceUrl, "https://boards.greenhouse.io/example/jobs/100");
  assert.match(calls[0], /boards-api\.greenhouse\.io/);
});

test("company homepage discovery follows a ranked Careers or Opportunities hub once", async () => {
  const calls = [];
  const jobs = await discoverTargetJobs({ company: "Example", websiteUrl: "https://example.com" }, {
    fetchImpl: async (url) => {
      calls.push(String(url));
      if (String(url) === "https://example.com/") return new Response('<html><head><title>Example</title></head><body><a href="/about">About</a><a href="/opportunities">Opportunities</a></body></html>', { headers: { "content-type": "text/html" } });
      return new Response('<html><head><title>Careers</title></head><body><a href="/opportunities/creative-operations-manager">Creative Operations Manager</a></body></html>', { headers: { "content-type": "text/html" } });
    },
  });
  assert.equal(calls.length, 2);
  assert.equal(jobs.length, 1);
  assert.equal(jobs[0].title, "Creative Operations Manager");
  assert.equal(jobs[0].sourceUrl, "https://example.com/opportunities/creative-operations-manager");
});

test("career link ranking prefers official ATS and careers links over generic navigation", () => {
  const ranked = rankCareerLinks([
    { href: "https://example.com/about", label: "About" },
    { href: "https://boards.greenhouse.io/example", label: "Open jobs" },
    { href: "https://example.com/careers", label: "Careers" },
  ]);
  assert.equal(ranked[0].href, "https://boards.greenhouse.io/example");
  assert.equal(ranked.length, 2);
});
