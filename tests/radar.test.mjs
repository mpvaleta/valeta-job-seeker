import assert from "node:assert/strict";
import test from "node:test";
import {
  DEFAULT_RADAR_PROFILE,
  classifyRadarOpportunity,
  detectCareerSource,
  discoverTargetJobs,
  discoverTargetJobsDetailed,
  isPlausibleRadarJob,
  normalizeRadarProfile,
  readSingleJobPosting,
  scoreRadarOpportunity,
  rankCareerLinks,
} from "../lib/radar.mjs";
import { searchCompanyJobSources } from "../lib/radar-web-search.mjs";

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

test("radar treats named Silicon Valley locations as Bay Area roles", () => {
  const result = scoreRadarOpportunity({
    title: "Creative Operations Manager",
    description: "Lead integrated production and project management.",
    location: "Cupertino",
  }, DEFAULT_RADAR_PROFILE);
  assert.match(result.summary, /location: San Francisco Bay Area/i);
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
  assert.deepEqual(detectCareerSource("https://jobs.smartrecruiters.com/example").type, "smartrecruiters");
  assert.deepEqual(detectCareerSource("https://example.wd5.myworkdayjobs.com/en-US/External").type, "workday");
  assert.deepEqual(detectCareerSource("https://jobs.apple.com/en-us/search?location=united-states-USA").type, "apple");
  assert.deepEqual(detectCareerSource("https://www.google.com/about/careers/applications/jobs/results/").type, "google-careers");
  assert.deepEqual(detectCareerSource("https://www.metacareers.com/jobsearch/").type, "meta-search");
  assert.deepEqual(detectCareerSource("https://example.com/careers").type, "public-page");
  // Neither iCIMS nor TeamWork Online has a documented public API or
  // JobPosting JSON-LD (checked directly against real pages on both), so
  // they are detected only for correct labeling and company recovery on the
  // "paste one link" path -- not for bulk scanning.
  assert.deepEqual(detectCareerSource("https://careers-petsuppliesplus.icims.com/jobs/1234/producer/job").type, "icims");
  assert.deepEqual(detectCareerSource("https://www.teamworkonline.com/football-jobs/chiefs/kansas-city-chiefs-29577/role-123").type, "teamwork-online");
});

test("importing an iCIMS job link recovers the employer from the tenant subdomain, not the platform", async () => {
  const job = await readSingleJobPosting("https://careers-petsuppliesplus.icims.com/jobs/1234/producer/job", {
    fetchImpl: async () => new Response("<html><head><title>Producer - Pet Supplies Plus Careers</title></head><body><main>Lead in-store production events, coordinate vendor schedules, and manage seasonal merchandising across assigned retail locations.</main></body></html>", { headers: { "content-type": "text/html" } }),
  });
  assert.equal(job.sourceType, "icims");
  assert.equal(job.company, "Petsuppliesplus");
  assert.match(job.title, /Producer/);
});

test("importing a TeamWork Online job link recovers the team from the URL path, not the platform", async () => {
  const job = await readSingleJobPosting("https://www.teamworkonline.com/football-jobs/chiefs/kansas-city-chiefs-29577/business-development-sales-associate-2181800", {
    fetchImpl: async () => new Response("<html><head><title>Business Development Sales Associate</title></head><body><main>Drive new ticket and sponsorship sales revenue for home games, manage a book of corporate accounts, and support gameday client relations.</main></body></html>", { headers: { "content-type": "text/html" } }),
  });
  assert.equal(job.sourceType, "teamwork-online");
  assert.equal(job.company, "Kansas City Chiefs");
  assert.match(job.title, /Business Development/);
});

test("iCIMS and TeamWork Online imports are trusted without needing a job-detail URL shape or a role-shaped title", () => {
  // The fallback recovers only a title, no description -- confirm that alone
  // is enough for these two sources, matching every other named ATS.
  assert.equal(isPlausibleRadarJob({ title: "Front Desk Associate", sourceUrl: "https://careers-example.icims.com/x", sourceType: "icims" }), true);
  assert.equal(isPlausibleRadarJob({ title: "Ticket Sales Representative", sourceUrl: "https://www.teamworkonline.com/x", sourceType: "teamwork-online" }), true);
});

test("Google careers discovery reads public search cards instead of mistaking support links for jobs", async () => {
  const jobs = await discoverTargetJobs({ company: "Google", careersUrl: "https://www.google.com/about/careers/applications/jobs/results/" }, {
    fetchImpl: async () => new Response(`
      <ul><li class="lLd3Je" ssk="17:123"><h3 class="QJPWVe">Senior AI Marketing Producer</h3><span class="r0wTof">San Francisco, CA, USA</span><h4>Minimum qualifications</h4><ul><li>Creative program management experience.</li></ul><a href="jobs/results/123-senior-ai-marketing-producer">Learn more</a></li></ul>`, { headers: { "content-type": "text/html" } }),
  });
  assert.equal(jobs.length, 1);
  assert.equal(jobs[0].title, "Senior AI Marketing Producer");
  assert.equal(jobs[0].location, "San Francisco, CA, USA");
  assert.equal(jobs[0].sourceType, "google-careers");
  assert.match(jobs[0].sourceUrl, /google\.com\/about\/careers\/applications\/jobs\/results\/123/);
});

test("Apple discovery uses the public search response and retains location, date, and original role link", async () => {
  const jobs = await discoverTargetJobs({ company: "Apple", careersUrl: "https://jobs.apple.com/en-us/search?location=united-states-USA" }, {
    fetchImpl: async (url) => {
      assert.match(String(url), /jobs\.apple\.com\/api\/v1\/search/);
      return Response.json({ res: { searchResults: [{
        positionId: "200123456",
        postingTitle: "Creative Operations Program Manager",
        transformedPostingTitle: "creative-operations-program-manager",
        locations: [{ city: "Cupertino", stateProvince: "CA", countryName: "United States" }],
        jobSummary: "Lead creative operations and cross-functional production.",
        postDateInGMT: "2026-07-24T00:00:00Z",
      }] } });
    },
  });
  assert.equal(jobs.length, 1);
  assert.equal(jobs[0].location, "Cupertino, CA, United States");
  assert.equal(jobs[0].datePosted, "2026-07-24T00:00:00Z");
  assert.match(jobs[0].sourceUrl, /jobs\.apple\.com\/en-us\/details\/200123456/);
});

test("Meta search is reported honestly instead of silently returning a false empty scan", async () => {
  await assert.rejects(
    discoverTargetJobs({ company: "Meta", careersUrl: "https://www.metacareers.com/jobsearch/" }),
    /robots policy does not permit automated job collection/i,
  );
});

test("individual public Meta job pages remain importable through their structured posting data", async () => {
  const jobs = await discoverTargetJobs({
    company: "Meta",
    careersUrl: "https://www.metacareers.com/profile/job_details/1225967876069493/",
  }, {
    fetchImpl: async () => new Response(`<html><head><script type="application/ld+json">${JSON.stringify({
      "@context": "https://schema.org",
      "@type": "JobPosting",
      title: "Creative Director, Meta.com",
      hiringOrganization: { name: "Meta" },
      jobLocation: { address: { addressLocality: "Menlo Park", addressRegion: "CA", addressCountry: "US" } },
      description: "Lead brand and creative programs across cross-functional teams.",
      datePosted: "2026-07-20",
    })}</script></head><body><h1>Creative Director, Meta.com</h1></body></html>`, { headers: { "content-type": "text/html" } }),
  });
  assert.equal(jobs.length, 1);
  assert.equal(jobs[0].title, "Creative Director, Meta.com");
  assert.match(jobs[0].location, /Menlo Park/);
  assert.equal(jobs[0].sourceType, "structured-job-page");
});

test("radar tries a fallback company source when the saved careers URL fails", async () => {
  const calls = [];
  const jobs = await discoverTargetJobs({ company: "Example", careersUrl: "https://broken.example/careers", websiteUrl: "https://example.com" }, {
    fetchImpl: async (url) => {
      calls.push(String(url));
      if (String(url).includes("broken.example")) return new Response("blocked", { status: 403 });
      return new Response('<html><head><title>Careers</title></head><body><a href="/jobs/creative-producer">Creative Producer</a></body></html>', { headers: { "content-type": "text/html" } });
    },
  });
  assert.ok(calls.some((url) => url.includes("broken.example")));
  assert.ok(calls.some((url) => url.includes("example.com")));
  assert.equal(jobs[0].title, "Creative Producer");
});

test("radar repairs an outdated source by trying bounded careers paths on the employer domain", async () => {
  const calls = [];
  const result = await discoverTargetJobsDetailed({ company: "Example", careersUrl: "https://broken.example/old-jobs", websiteUrl: "https://example.com" }, {
    fetchImpl: async (url) => {
      calls.push(String(url));
      if (String(url).includes("broken.example")) return new Response("gone", { status: 404 });
      if (String(url) === "https://example.com/") return new Response("<html><body><a href=\"/about\">About</a></body></html>", { headers: { "content-type": "text/html" } });
      if (String(url) === "https://example.com/careers") return new Response("<html><body><a href=\"/careers/creative-operations-lead\">Creative Operations Lead</a></body></html>", { headers: { "content-type": "text/html" } });
      return new Response("not found", { status: 404 });
    },
  });
  assert.equal(result.jobs.length, 1);
  assert.equal(result.recommendedCareersUrl, "https://example.com/careers");
  assert.ok(result.attempts.some((attempt) => attempt.purpose === "automatic-recovery" && attempt.found === 1));
  assert.ok(calls.includes("https://example.com/careers"));
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

test("generic career pages reject navigation labels instead of saving them as roles", async () => {
  const result = await discoverTargetJobsDetailed({ company: "Example", careersUrl: "https://example.com/careers" }, {
    fetchImpl: async () => new Response(`<html><body>
      <a href="/careers/search">Search roles</a>
      <a href="/careers/working-here">Learn about working</a>
      <a href="/careers/benefits">Learn more</a>
      <a href="/careers/senior-creative-operations-manager">Senior Creative Operations Manager</a>
    </body></html>`, { headers: { "content-type": "text/html" } }),
  });
  assert.deepEqual(result.jobs.map((job) => job.title), ["Senior Creative Operations Manager"]);
  assert.ok(result.attempts.some((attempt) => attempt.rejected === 0));
  assert.equal(isPlausibleRadarJob({ title: "Search rules", sourceUrl: "https://example.com/careers/search-rules", sourceType: "public-careers-page" }), false);
  assert.equal(isPlausibleRadarJob({ title: "Learn more about working here", sourceUrl: "https://example.com/careers/working-here", sourceType: "public-careers-page" }), false);
});

test("provider public-web search keeps only allowed direct sources for later validation", async () => {
  const result = await searchCompanyJobSources({
    company: "Example",
    websiteUrl: "https://example.com",
    focus: "creative operations",
  }, {
    openAiKey: "test-key",
    fetchImpl: async (url, init) => {
      assert.equal(String(url), "https://api.openai.com/v1/responses");
      const request = JSON.parse(init.body);
      assert.equal(request.tools[0].type, "web_search");
      assert.ok(request.tools[0].filters.allowed_domains.includes("example.com"));
      return Response.json({ output: [{
        type: "web_search_call",
        action: { sources: [
          { url: "https://example.com/careers/creative-operations-manager", title: "Creative Operations Manager" },
          { url: "https://untrusted.example/jobs/fake", title: "Fake role" },
        ] },
      }] });
    },
  });
  assert.equal(result.provider, "openai");
  assert.equal(result.status, "completed");
  assert.deepEqual(result.sources.map((source) => source.url), ["https://example.com/careers/creative-operations-manager"]);
});

test("provider public-web recovery can use direct secondary job pages when an official search blocks indexing", async () => {
  const result = await searchCompanyJobSources({
    company: "Meta",
    websiteUrl: "https://www.meta.com",
    focus: "creative operations",
  }, {
    openAiKey: "test-key",
    fetchImpl: async (_url, init) => {
      const request = JSON.parse(init.body);
      assert.ok(request.tools[0].filters.allowed_domains.includes("linkedin.com"));
      assert.ok(request.tools[0].filters.allowed_domains.includes("indeed.com"));
      return Response.json({ output: [{
        type: "web_search_call",
        action: { sources: [{
          url: "https://www.linkedin.com/jobs/view/design-producer-at-meta-1234567890",
          title: "Meta hiring Design Producer, Reality Labs in Burlingame, CA | LinkedIn",
        }] },
      }] });
    },
  });
  assert.equal(result.status, "completed");
  assert.equal(result.sources[0].title, "Design Producer, Reality Labs");
  assert.equal(isPlausibleRadarJob({
    title: result.sources[0].title,
    sourceUrl: result.sources[0].url,
    sourceType: "openai-web-search",
  }), true);
  assert.equal(isPlausibleRadarJob({
    title: "Creative Operations Manager",
    sourceUrl: "https://www.indeed.com/viewjob?jk=abc123456789",
    sourceType: "openai-web-search",
  }), true);
});

test("Workday discovery uses the employer's public tenant endpoint", async () => {
  const calls = [];
  const jobs = await discoverTargetJobs({ company: "Example", careersUrl: "https://example.wd5.myworkdayjobs.com/en-US/External" }, {
    fetchImpl: async (url, init) => {
      calls.push({ url: String(url), init });
      return Response.json({ jobPostings: [{
        title: "Creative Program Manager",
        locationsText: "San Francisco, CA",
        externalPath: "/job/San-Francisco/Creative-Program-Manager_R100",
        postedOn: "Posted Today",
      }] });
    },
  });
  assert.equal(jobs.length, 1);
  assert.equal(jobs[0].sourceType, "workday");
  assert.match(jobs[0].sourceUrl, /\/en-US\/External\/job\/San-Francisco/);
  assert.match(calls[0].url, /\/wday\/cxs\/example\/External\/jobs$/);
  assert.equal(calls[0].init.method, "POST");
});

test("radar classifies discoveries by career trail and company category", () => {
  const sports = classifyRadarOpportunity({ company: "The Athletic", title: "Senior Manager, Video Production Operations", fitSummary: "Sports sponsorship integrations" });
  assert.equal(sports.trackId, "sports");
  assert.equal(sports.companyCategory, "Sports / Entertainment");
  const agency = classifyRadarOpportunity({ company: "Example Studio", title: "Creative Operations Manager" }, { kind: "Creative / Advertising Agency" });
  assert.equal(agency.trackId, "operations");
  assert.equal(agency.companyCategory, "Creative / Advertising Agency");
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

test("radar accepts real Meta, Google, and Apple job detail pages", () => {
  assert.equal(isPlausibleRadarJob({ title: "Brand Project Manager", sourceUrl: "https://www.metacareers.com/jobs/1234567890", sourceType: "public-careers-page" }), true);
  assert.equal(isPlausibleRadarJob({ title: "Program Manager, Creative Operations", sourceUrl: "https://www.google.com/about/careers/applications/jobs/results/12345-program-manager", sourceType: "public-careers-page" }), true);
  assert.equal(isPlausibleRadarJob({ title: "Producer, Marcom", sourceUrl: "https://jobs.apple.com/en-us/details/200554321/producer-marcom", sourceType: "public-careers-page" }), true);
  assert.equal(isPlausibleRadarJob({ title: "Untitled listing with details", sourceUrl: "https://example.com/careers/openings/abc-12345", sourceType: "public-careers-page", description: "Lead integrated campaign delivery across brand, production, and vendor workstreams for national programs." }), true);
});

test("radar rejects marketing cards even when their URLs look like job details", () => {
  const cards = [
    { title: "Impact stories", sourceUrl: "https://example.com/careers/impact-stories-2026" },
    { title: "Benefits and perks", sourceUrl: "https://example.com/careers/benefits-and-perks" },
    { title: "Life at Example", sourceUrl: "https://example.com/careers/life-at-example" },
    { title: "Engineering", sourceUrl: "https://example.com/careers/engineering-teams" },
    { title: "Why work here", sourceUrl: "https://example.com/careers/why-work-here" },
    { title: "Meet the team", sourceUrl: "https://example.com/careers/meet-the-team" },
    { title: "Our hiring process", sourceUrl: "https://example.com/careers/hiring-process-2026" },
    { title: "Early careers", sourceUrl: "https://example.com/careers/early-careers" },
  ];
  for (const card of cards) {
    assert.equal(isPlausibleRadarJob({ ...card, sourceType: "public-careers-page" }), false, `accepted: ${card.title}`);
  }
});

test("radar still trusts ATS feeds without a role-shaped title", () => {
  assert.equal(isPlausibleRadarJob({ title: "Growth Marketing", sourceUrl: "https://boards.greenhouse.io/example/jobs/7654321", sourceType: "greenhouse" }), true);
});
