import assert from "node:assert/strict";
import test from "node:test";
import {
  DEFAULT_RADAR_PROFILE,
  classifyRadarOpportunity,
  deriveDismissalSignal,
  deriveInterestSignal,
  deriveRadarProfileFromCareer,
  dismissalPenalty,
  interestBoost,
  detectCareerSource,
  discoverTargetJobs,
  discoverTargetJobsDetailed,
  isBayAreaLocation,
  isPlausibleRadarJob,
  isUnitedStatesLocation,
  normalizeRadarProfile,
  opportunityContentKey,
  opportunityKey,
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

// The Bay Area test used to accept "california" and a bare "ca", so the whole
// state read as one market and a San Diego role scored as a local one.
test("Bay Area matching excludes the rest of California", () => {
  for (const location of ["Oakland, CA", "Palo Alto, California", "San Jose", "Berkeley, CA", "San Francisco Bay Area"]) {
    assert.equal(isBayAreaLocation(location), true, location);
  }
  for (const location of ["San Diego, CA", "Los Angeles, California", "Sacramento, CA", "Irvine, CA", "Austin, TX"]) {
    assert.equal(isBayAreaLocation(location), false, location);
  }
});

// Newark, Richmond, Fremont, Concord, and Dublin all name a Bay Area city and
// a city somewhere else, so they only count with California alongside them.
test("cities that exist in two places need a California marker", () => {
  assert.equal(isBayAreaLocation("Newark, CA"), true);
  assert.equal(isBayAreaLocation("Newark, NJ"), false);
  assert.equal(isBayAreaLocation("Dublin, CA"), true);
  assert.equal(isBayAreaLocation("Dublin, Ireland"), false);
  assert.equal(isBayAreaLocation("Richmond, California"), true);
  assert.equal(isBayAreaLocation("Richmond, VA"), false);
});

// The old United States test was `\b[a-z .]+, [a-z]{2}\b`, which reads any
// "City, XX" on earth as American.
test("United States matching does not accept foreign City, XX locations", () => {
  for (const location of ["Austin, TX", "Boston, MA", "United States", "Seattle, Washington"]) {
    assert.equal(isUnitedStatesLocation(location), true, location);
  }
  for (const location of ["Toronto, ON", "Tokyo, JP", "London, UK", "Bengaluru, IN", "Munich, DE", "São Paulo, Brazil"]) {
    assert.equal(isUnitedStatesLocation(location), false, location);
  }
});

test("a strong role outside the target market cannot pass while the market is required", () => {
  const opportunity = {
    title: "Creative Operations Manager",
    description: "Lead integrated production, brand programs, agency partners, and cross-functional delivery.",
  };
  const inside = scoreRadarOpportunity({ ...opportunity, location: "Oakland, CA" }, DEFAULT_RADAR_PROFILE);
  assert.equal(inside.passes, true);
  assert.ok(inside.score >= 80);

  for (const location of ["San Diego, CA", "Austin, TX", "Tokyo, JP", "Toronto, ON"]) {
    const outside = scoreRadarOpportunity({ ...opportunity, location }, DEFAULT_RADAR_PROFILE);
    assert.equal(outside.passes, false, `${location} must not pass`);
    assert.ok(outside.score <= 24, `${location} scored ${outside.score}`);
    assert.match(outside.summary, /location filter/i);
  }
});

test("remote substitutes for the market only when it is not scoped somewhere else", () => {
  const opportunity = {
    title: "Brand Program Manager",
    description: "Own integrated production and brand programs with cross-functional partners.",
  };
  const open = scoreRadarOpportunity({ ...opportunity, location: "Remote" }, DEFAULT_RADAR_PROFILE);
  assert.equal(open.passes, true);
  assert.match(open.summary, /remote option/i);

  const elsewhere = scoreRadarOpportunity({ ...opportunity, location: "Remote — EMEA" }, DEFAULT_RADAR_PROFILE);
  assert.equal(elsewhere.passes, false);
  assert.match(elsewhere.summary, /location filter/i);

  // With Remote unchecked, an open remote role stops standing in for the market.
  const noRemote = scoreRadarOpportunity({ ...opportunity, location: "Remote" }, { ...DEFAULT_RADAR_PROFILE, workModes: ["Hybrid", "On-site"] });
  assert.equal(noRemote.passes, false);
});

test("locationPolicy preferred keeps the old behaviour of scoring geography without gating on it", () => {
  const opportunity = {
    title: "Creative Operations Manager",
    description: "Lead integrated production, brand programs, agency partners, and cross-functional delivery.",
    location: "Austin, TX",
  };
  assert.equal(scoreRadarOpportunity(opportunity, DEFAULT_RADAR_PROFILE).passes, false);
  assert.equal(scoreRadarOpportunity(opportunity, { ...DEFAULT_RADAR_PROFILE, locationPolicy: "preferred" }).passes, true);
  assert.equal(normalizeRadarProfile({ locationPolicy: "whatever" }).locationPolicy, "required");
});

// "manager" is a stop word, so the generic phrase matcher reduced the target
// "Project Manager" to "project" and handed the full exact-title bonus to every
// "Project …" role in existence.
test("a target title is not matched by an unrelated role that shares one word", () => {
  const profile = { ...DEFAULT_RADAR_PROFILE, skills: [], goals: "", titles: ["Project Manager"] };
  const exact = scoreRadarOpportunity({ title: "Senior Project Manager", location: "Oakland, CA" }, profile);
  assert.match(exact.summary, /target title/i);

  for (const title of ["Project Engineer", "Project Coordinator", "Structural Project Architect"]) {
    const result = scoreRadarOpportunity({ title, location: "Oakland, CA" }, profile);
    assert.doesNotMatch(result.summary, /target title/i, title);
    assert.ok(result.score < exact.score, `${title} scored ${result.score}`);
  }
});

test("radar goals derived from career evidence read roles from job headers, never from accomplishment bullets", () => {
  const derived = deriveRadarProfileFromCareer({
    headline: "Creative Operations Manager",
    summary: "Brand and creative production leader focused on integrated campaigns.",
    location: "Oakland, CA",
    facts: [
      "Senior Project Manager, Acme Studios — Jan 2019 to Present",
      "Led cross-functional creative production programs from brief through launch with brand and media teams.",
      "Managed integrated campaign timelines, budgets, and delivery risks across creative workstreams.",
      "Producer, Northwind Agency — March 2015 – December 2018",
      "Ran production schedules, crews, and location logistics for national broadcast shoots.",
      "Owned the integrated production budget and quarterly forecast for brand campaigns.",
      "Delivered brand campaigns with agency partners and cross-functional creative teams.",
    ],
  });
  assert.deepEqual(derived.titles, ["Creative Operations Manager", "Senior Project Manager", "Producer"]);
  assert.deepEqual(derived.locations, ["San Francisco Bay Area"]);
  assert.ok(derived.skills.length >= 3, JSON.stringify(derived.skills));
  // Every proposed skill must actually recur in the evidence it was read from.
  const bullets = [
    "Led cross-functional creative production programs from brief through launch with brand and media teams.",
    "Managed integrated campaign timelines, budgets, and delivery risks across creative workstreams.",
    "Ran production schedules, crews, and location logistics for national broadcast shoots.",
    "Owned the integrated production budget and quarterly forecast for brand campaigns.",
    "Delivered brand campaigns with agency partners and cross-functional creative teams.",
  ].map((bullet) => bullet.toLowerCase());
  for (const skill of derived.skills) {
    const hits = bullets.filter((bullet) => bullet.includes(skill)).length;
    assert.ok(hits >= 2, `"${skill}" appears in ${hits} of the source facts`);
  }
  // Action verbs that open every bullet are not themes.
  assert.ok(!derived.skills.some((skill) => /^(?:led|managed|ran|owned|delivered)\b/.test(skill)), JSON.stringify(derived.skills));
});

test("career-derived goals stay empty rather than guessing from thin evidence", () => {
  const derived = deriveRadarProfileFromCareer({ headline: "", summary: "", location: "", facts: ["Did some things."] });
  assert.deepEqual(derived.titles, []);
  assert.deepEqual(derived.skills, []);
  assert.deepEqual(derived.locations, []);
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

test("companyStagePreference defaults to no_preference and leaves scoring unchanged either way", () => {
  const opportunity = {
    title: "Creative Operations Manager",
    description: "Lead integrated production and project management.",
    location: "San Francisco, CA",
  };
  const withoutTag = scoreRadarOpportunity(opportunity, DEFAULT_RADAR_PROFILE);
  const withStartupTag = scoreRadarOpportunity({ ...opportunity, companyCategory: "Startup / Early-stage" }, DEFAULT_RADAR_PROFILE);
  assert.equal(DEFAULT_RADAR_PROFILE.companyStagePreference, "no_preference");
  assert.equal(withoutTag.score, withStartupTag.score);
  assert.equal(withoutTag.passes, true);
});

test("prefer_startups boosts a role tagged Startup / Early-stage without excluding anything else", () => {
  const opportunity = {
    title: "Creative Operations Manager",
    description: "Lead integrated production and project management.",
    location: "San Francisco, CA",
  };
  const profile = { ...DEFAULT_RADAR_PROFILE, companyStagePreference: "prefer_startups" };
  const startup = scoreRadarOpportunity({ ...opportunity, companyCategory: "Startup / Early-stage" }, profile);
  const established = scoreRadarOpportunity({ ...opportunity, companyCategory: "Technology" }, profile);
  assert.ok(startup.score > established.score);
  assert.match(startup.summary, /startup \/ early-stage company/i);
  assert.equal(established.passes, true, "prefer_startups must not exclude non-startup roles");
});

test("startups_only filters out a well-matching role at an established company", () => {
  const opportunity = {
    title: "Creative Operations Manager",
    description: "Lead integrated production and project management.",
    location: "San Francisco, CA",
  };
  const profile = { ...DEFAULT_RADAR_PROFILE, companyStagePreference: "startups_only" };
  const established = scoreRadarOpportunity({ ...opportunity, companyCategory: "Technology" }, profile);
  assert.equal(established.passes, false);
  assert.match(established.summary, /not early-stage \(Technology\)/i);
  const startup = scoreRadarOpportunity({ ...opportunity, companyCategory: "Startup / Early-stage" }, profile);
  assert.equal(startup.passes, true);
});

test("startups_only treats an unclassified opportunity as a mismatch rather than silently passing it through", () => {
  const result = scoreRadarOpportunity({
    title: "Creative Operations Manager",
    description: "Lead integrated production and project management.",
    location: "San Francisco, CA",
  }, { ...DEFAULT_RADAR_PROFILE, companyStagePreference: "startups_only" });
  assert.equal(result.passes, false);
  assert.match(result.summary, /company stage not yet known/i);
});

test("normalizeRadarProfile rejects an unrecognized companyStagePreference instead of persisting garbage", () => {
  const profile = normalizeRadarProfile({ companyStagePreference: "definitely-not-real" });
  assert.equal(profile.companyStagePreference, "no_preference");
});

test("official ATS career URLs are detected without arbitrary endpoint access", () => {
  assert.deepEqual(detectCareerSource("https://boards.greenhouse.io/example").type, "greenhouse");
  assert.deepEqual(detectCareerSource("https://jobs.lever.co/example").type, "lever");
  assert.deepEqual(detectCareerSource("https://jobs.ashbyhq.com/example").type, "ashby");
  assert.deepEqual(detectCareerSource("https://jobs.smartrecruiters.com/example").type, "smartrecruiters");
  assert.deepEqual(detectCareerSource("https://apply.workable.com/example/").type, "workable");
  assert.deepEqual(detectCareerSource("https://example.recruitee.com/").type, "recruitee");
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

test("a Workday board larger than one page is read across pages, and a short page ends the read", async () => {
  const offsets = [];
  const page = (offset, count) => Array.from({ length: count }, (_, index) => ({
    title: `Program Manager ${offset + index}`,
    locationsText: "San Francisco, CA",
    externalPath: `/job/San-Francisco/Program-Manager_R${offset + index}`,
    postedOn: "Posted Today",
  }));
  const jobs = await discoverTargetJobs({ company: "Example", careersUrl: "https://example.wd5.myworkdayjobs.com/en-US/External" }, {
    fetchImpl: async (url, init) => {
      const offset = JSON.parse(init.body).offset;
      offsets.push(offset);
      return Response.json({ jobPostings: offset === 0 ? page(0, 100) : page(100, 20) });
    },
  });
  assert.equal(jobs.length, 120, "the second page's postings must be kept, not truncated at 100");
  assert.deepEqual(offsets, [0, 100], "a short second page must end the read without a third request");
});

test("Workable discovery uses the public widget feed and links each posting's own page", async () => {
  const calls = [];
  const jobs = await discoverTargetJobs({ company: "Example", careersUrl: "https://apply.workable.com/example/" }, {
    fetchImpl: async (url) => {
      calls.push(String(url));
      return Response.json({ jobs: [{
        title: "Creative Producer",
        city: "Oakland",
        state: "California",
        country: "United States",
        shortcode: "AB12CD",
        url: "https://apply.workable.com/example/j/AB12CD/",
        published_on: "2026-08-01",
      }] });
    },
  });
  assert.equal(jobs.length, 1);
  assert.equal(jobs[0].sourceType, "workable");
  assert.equal(jobs[0].sourceUrl, "https://apply.workable.com/example/j/AB12CD/");
  assert.equal(jobs[0].location, "Oakland, California, United States");
  assert.match(calls[0], /apply\.workable\.com\/api\/v1\/widget\/accounts\/example$/);
});

test("Recruitee discovery reads the tenant's public offers feed", async () => {
  const calls = [];
  const jobs = await discoverTargetJobs({ company: "Example", careersUrl: "https://example.recruitee.com/" }, {
    fetchImpl: async (url) => {
      calls.push(String(url));
      return Response.json({ offers: [{
        title: "Marketing Project Manager",
        location: "San Francisco, CA",
        description: "<p>Own cross-functional campaign delivery.</p>",
        careers_url: "https://example.recruitee.com/o/marketing-project-manager",
        published_at: "2026-08-02",
      }] });
    },
  });
  assert.equal(jobs.length, 1);
  assert.equal(jobs[0].sourceType, "recruitee");
  assert.equal(jobs[0].sourceUrl, "https://example.recruitee.com/o/marketing-project-manager");
  assert.equal(jobs[0].description, "Own cross-functional campaign delivery.");
  assert.match(calls[0], /example\.recruitee\.com\/api\/offers\/$/);
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

test("one posting reached by several routes has one identity", () => {
  // Greenhouse alone serves the same posting under four spellings. Treating
  // them as four postings is what filled the inbox with repeats.
  const greenhouse = [
    "https://boards.greenhouse.io/figma/jobs/5711913004",
    "https://job-boards.greenhouse.io/figma/jobs/5711913004",
    "https://job-boards.greenhouse.io/figma/jobs/5711913004?gh_jid=5711913004&gh_src=abc",
    "https://boards.greenhouse.io/embed/job_app?for=figma&token=5711913004",
  ].map(opportunityKey);
  assert.equal(new Set(greenhouse).size, 1, `expected one identity, got ${[...new Set(greenhouse)].join(" / ")}`);

  // The apply and confirmation pages are the same posting as the listing.
  assert.equal(opportunityKey("https://jobs.lever.co/plaid/abc-123/apply"), opportunityKey("https://jobs.lever.co/plaid/abc-123"));
  assert.equal(opportunityKey("https://jobs.ashbyhq.com/notion/uuid-1/application"), opportunityKey("https://jobs.ashbyhq.com/notion/uuid-1"));

  // Two genuinely different postings must stay apart.
  assert.notEqual(opportunityKey("https://boards.greenhouse.io/figma/jobs/1"), opportunityKey("https://boards.greenhouse.io/figma/jobs/2"));
  assert.notEqual(opportunityKey("https://boards.greenhouse.io/figma/jobs/1"), opportunityKey("https://boards.greenhouse.io/notion/jobs/1"));
});

test("the content identity collapses one job published under unrelated URLs", () => {
  const onBoard = opportunityContentKey({ company: "VaynerMedia", title: "Senior Creative Producer", location: "San Francisco, CA" });
  const onCareersPage = opportunityContentKey({ company: "vaynermedia", title: "Senior  Creative   Producer", location: "San Francisco, CA" });
  assert.equal(onBoard, onCareersPage);

  // Same title in another city is a different job, and must not collapse.
  assert.notEqual(onBoard, opportunityContentKey({ company: "VaynerMedia", title: "Senior Creative Producer", location: "New York, NY" }));
  // Different employers never collapse, however similar the title.
  assert.notEqual(onBoard, opportunityContentKey({ company: "R/GA", title: "Senior Creative Producer", location: "San Francisco, CA" }));
  // Too little to identify anything is no identity at all, never a false match.
  assert.equal(opportunityContentKey({ company: "", title: "Producer" }), "");
  assert.equal(opportunityContentKey({ company: "VaynerMedia", title: "PM" }), "");
});

const DISMISSAL_PROFILE = {
  titles: ["Brand Project Manager", "Integrated Producer"],
  skills: ["creative operations", "brand programs"],
  locations: ["San Francisco Bay Area"],
  workModes: ["Hybrid"],
  goals: "Lead brand and creative delivery.",
  exclusions: [],
  minScore: 45,
};

const notRelevant = (title, companyCategory) => ({ title, companyCategory, reason: "not_relevant" });

test("one dismissal teaches the radar nothing", () => {
  const signal = deriveDismissalSignal([notRelevant("Senior Software Engineer")], DISMISSAL_PROFILE);
  assert.equal(signal.ready, false);
  assert.deepEqual(signal.words, []);
  // The copy has to say what is still missing, not just refuse.
  assert.match(signal.reason, /at least 4/);
  assert.equal(signal.stats.teachingDismissals, 1);
});

test("a word repeated across dismissed roles is learned and lowers a similar role", () => {
  const signal = deriveDismissalSignal([
    notRelevant("Senior Software Engineer"),
    notRelevant("Staff Software Engineer"),
    notRelevant("Software Development Manager"),
    notRelevant("Principal Engineer, Platform"),
  ], DISMISSAL_PROFILE);
  assert.equal(signal.ready, true);
  assert.ok(signal.words.includes("software"), `expected "software" in ${JSON.stringify(signal.words)}`);
  assert.ok(signal.words.includes("engineer"), `expected "engineer" in ${JSON.stringify(signal.words)}`);

  // A word that appeared only once never makes the list.
  assert.ok(!signal.words.includes("platform"), "a single mention must not teach");

  const engineering = scoreRadarOpportunity({ title: "Software Engineer", location: "Oakland, CA" }, DISMISSAL_PROFILE, signal);
  const unpenalized = scoreRadarOpportunity({ title: "Software Engineer", location: "Oakland, CA" }, DISMISSAL_PROFILE);
  assert.ok(engineering.score < unpenalized.score, "a learned word must lower the score");
  assert.ok(engineering.reasons.some((line) => /dismissed/.test(line)), "the reason must say why it sank");
});

test("learning never contradicts the roles the user asked for", () => {
  // Four project roles dismissed -- but "project" is in a saved target title,
  // so it must never become a penalty. Otherwise the radar would learn to bury
  // exactly what the user told it to look for.
  const signal = deriveDismissalSignal([
    notRelevant("Project Coordinator"),
    notRelevant("Project Administrator"),
    notRelevant("Junior Project Assistant"),
    notRelevant("Project Scheduling Clerk"),
  ], DISMISSAL_PROFILE);
  assert.ok(!signal.words.includes("project"), `"project" is a saved target word and must be protected, got ${JSON.stringify(signal.words)}`);

  const target = scoreRadarOpportunity({ title: "Brand Project Manager", location: "Oakland, CA" }, DISMISSAL_PROFILE, signal);
  const untaught = scoreRadarOpportunity({ title: "Brand Project Manager", location: "Oakland, CA" }, DISMISSAL_PROFILE);
  assert.equal(target.score, untaught.score, "a saved target title must score identically before and after learning");
});

test("dismissing something you already applied to teaches nothing", () => {
  const applied = [
    { title: "Senior Software Engineer", reason: "already_applied" },
    { title: "Staff Software Engineer", reason: "already_applied" },
    { title: "Software Development Manager", reason: "already_applied" },
    { title: "Principal Software Architect", reason: "already_applied" },
  ];
  const signal = deriveDismissalSignal(applied, DISMISSAL_PROFILE);
  assert.equal(signal.ready, false, "applying to a role is interest, not rejection");
  assert.deepEqual(signal.words, []);
  assert.equal(signal.stats.teachingDismissals, 0);
  assert.equal(signal.stats.dismissalsRead, 4, "they are still read, just not learned from");
});

test("a learned penalty is bounded and never vetoes a strong match", () => {
  const signal = deriveDismissalSignal([
    notRelevant("Software Engineer"),
    notRelevant("Software Developer"),
    notRelevant("Engineering Manager Software"),
    notRelevant("Software Platform Engineer"),
  ], DISMISSAL_PROFILE);

  // Every learned word present at once, plus an exact target title.
  const strong = scoreRadarOpportunity(
    { title: "Brand Project Manager, Software Engineer Programs", location: "Oakland, CA" },
    DISMISSAL_PROFILE,
    signal,
  );
  assert.ok(strong.passes, "learning nudges the ranking; it must not gate a role out");
  assert.ok(strong.score >= DISMISSAL_PROFILE.minScore);

  // The penalty itself is capped regardless of how many words match.
  const { penalty } = dismissalPenalty("software engineer developer platform engineering", "", signal);
  assert.ok(penalty <= 22, `penalty must stay bounded, got ${penalty}`);
});

test("two pursued roles teach the radar nothing yet", () => {
  const signal = deriveInterestSignal([
    { title: "Sports Partnerships Manager" },
    { title: "Sports Marketing Coordinator" },
  ], DISMISSAL_PROFILE);
  assert.equal(signal.ready, false);
  assert.deepEqual(signal.words, []);
  assert.match(signal.reason, /at least 3/);
  assert.equal(signal.stats.pursuitsRead, 2);
});

test("a word repeated across shortlisted roles is learned and lifts a similar discovery", () => {
  const signal = deriveInterestSignal([
    { title: "Sports Partnerships Manager" },
    { title: "Sports Marketing Coordinator" },
    { title: "Sports Events Producer" },
  ], DISMISSAL_PROFILE);
  assert.equal(signal.ready, true);
  assert.ok(signal.words.includes("sports"), `expected "sports" in ${JSON.stringify(signal.words)}`);
  // A word that appeared only once never makes the list.
  assert.ok(!signal.words.includes("partnerships"), "a single mention must not teach");
  // Words the saved targets already contain score through the profile itself.
  assert.ok(!signal.words.includes("manager"), `"manager" is a saved target word, got ${JSON.stringify(signal.words)}`);

  const boosted = scoreRadarOpportunity({ title: "Sports Production Lead", location: "Oakland, CA" }, DISMISSAL_PROFILE, undefined, signal);
  const plain = scoreRadarOpportunity({ title: "Sports Production Lead", location: "Oakland, CA" }, DISMISSAL_PROFILE);
  assert.ok(boosted.score > plain.score, "a learned interest word must raise the score");
  assert.ok(boosted.reasons.some((line) => /shortlisted or applied/.test(line)), "the reason must say why it rose");
});

test("an interest boost is bounded and never overrides a hard gate", () => {
  const signal = deriveInterestSignal([
    { title: "Sports Partnerships Producer", companyCategory: "Sports / Entertainment" },
    { title: "Sports Marketing Producer", companyCategory: "Sports / Entertainment" },
    { title: "Sports Events Producer", companyCategory: "Sports / Entertainment" },
  ], DISMISSAL_PROFILE);

  // The boost itself is capped regardless of how many words and the category match.
  const { boost } = interestBoost("sports partnerships marketing events producer", "Sports / Entertainment", signal);
  assert.ok(boost <= 15, `boost must stay bounded, got ${boost}`);

  // A pursued-looking role outside the target market still fails the location
  // gate: learning lifts rankings, it never reopens a hard filter.
  const abroad = scoreRadarOpportunity({ title: "Sports Marketing Manager", location: "Tokyo, Japan" }, DISMISSAL_PROFILE, undefined, signal);
  assert.equal(abroad.passes, false, "an interest boost must not override the location gate");
});

test("restoring a role removes its teaching signal", () => {
  // The store clears dismissed_reason on any non-dismissed status, so a
  // restored role arrives here with no reason and drops out of the sample.
  const afterRestore = [
    notRelevant("Software Engineer"),
    notRelevant("Software Developer"),
    { title: "Software Architect", reason: null },
    { title: "Software Analyst", reason: null },
  ];
  const signal = deriveDismissalSignal(afterRestore, DISMISSAL_PROFILE);
  assert.equal(signal.ready, false, "two restored roles drop the sample below the learning threshold");
  assert.equal(signal.stats.teachingDismissals, 2);
});
