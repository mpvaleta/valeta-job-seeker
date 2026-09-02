import assert from "node:assert/strict";
import test from "node:test";
import {
  DEFAULT_RADAR_PROFILE,
  classifyRadarOpportunity,
  closedListingBonus,
  deriveClosedListingSignal,
  deriveDismissalSignal,
  deriveRadarProfileFromCareer,
  dismissalPenalty,
  detectCareerSource,
  discoverTargetJobs,
  discoverTargetJobsDetailed,
  isBayAreaLocation,
  isPlausibleRadarJob,
  isUnitedStatesLocation,
  normalizeRadarProfile,
  opportunityContentKey,
  opportunityKey,
  phraseVariants,
  readSingleJobPosting,
  scoreRadarOpportunity,
  titleRelevance,
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

// The bug this whole gate exists for. Skills were matched against the entire
// job description with a "every word appears somewhere" fallback, and a
// description runs to tens of thousands of characters, so any company whose
// careers boilerplate mentioned creative work made every one of its postings a
// match. A warehouse role and a nursing role scored 64% and passed, exactly as
// a Creative Operations Manager did.
test("careers-page boilerplate cannot turn an unrelated role into a match", () => {
  const boilerplate = "We are a creative, brand-led company. You will partner with marketing, "
    + "design and agency teams, bring strong project management skills, and work "
    + "cross-functional with our in-house production studio on integrated campaigns. ".repeat(4);

  for (const title of ["Warehouse Associate", "Nurse Practitioner", "Senior Software Engineer", "Staff Accountant"]) {
    const result = scoreRadarOpportunity({ title, description: boilerplate, location: "San Francisco, CA" }, DEFAULT_RADAR_PROFILE);
    assert.equal(result.passes, false, `${title} must not pass on description text alone`);
    assert.equal(result.gated, true, `${title} must be reported as gated so it is never stored`);
    assert.match(result.summary, /role filter/i);
  }

  // The same description on a role that IS the work still passes, so the gate
  // is rejecting the title, not the boilerplate.
  const onTarget = scoreRadarOpportunity({ title: "Creative Operations Manager", description: boilerplate, location: "San Francisco, CA" }, DEFAULT_RADAR_PROFILE);
  assert.equal(onTarget.passes, true);
  assert.equal(onTarget.gated, false);
});

// "product" and "producer" share six letters and are different careers. A plain
// prefix rule merges them, which would put every product role in a producer's
// inbox.
test("a product role is never read as a producer role", () => {
  const profile = { ...DEFAULT_RADAR_PROFILE, titles: ["Producer", "Integrated Producer"], skills: [], goals: "" };
  assert.equal(titleRelevance("Product Manager", profile.titles).tier, "none");
  assert.equal(titleRelevance("Director of Product", profile.titles).tier, "none");
  // ...while the real variants of the word still collapse onto one another.
  assert.equal(titleRelevance("Head of Production", profile.titles).tier, "family");
  assert.equal(titleRelevance("Senior Producer, Brand", profile.titles).tier, "exact");
});

// The gate can only be as good as the titles the owner thought to write down,
// so a saved skill named in the title counts as its own evidence of relevance.
test("a saved multi-word skill in the title establishes relevance on its own", () => {
  const titles = ["Creative Operations Manager"];
  assert.equal(titleRelevance("Brand Programs Manager", titles, ["brand programs"]).tier, "family");
  // A one-word skill must not do this: "agency" and "brand" turn up in titles
  // that have nothing to do with the work.
  assert.equal(titleRelevance("Agency Nurse", titles, ["agency"]).tier, "none");
  assert.equal(titleRelevance("Brand Ambassador", titles, ["brand"]).tier, "none");
});

// The employer's vocabulary is not the owner's. A "Program Manager" and a
// "Delivery Lead" are the job a saved "Project Manager" describes, and the role
// gate used to throw both out as off-target.
test("a role written in a different word for the same work is not off-target", () => {
  const titles = ["Project Manager", "Creative Operations"];
  assert.equal(titleRelevance("Program Manager", titles).tier, "adjacent");
  assert.equal(titleRelevance("Delivery Lead", titles).tier, "adjacent");
  assert.equal(titleRelevance("Studio Manager", titles).tier, "adjacent");
  // The reason names both words, so the inbox can say what it was read against.
  assert.match(titleRelevance("Program Manager", titles).matched[0], /program ≈ project/);

  // ...and the careers it must never merge stay apart. "product" appears in no
  // relatedness row precisely so this keeps holding.
  assert.equal(titleRelevance("Product Manager", titles).tier, "none");
  assert.equal(titleRelevance("Warehouse Associate", titles).tier, "none");
  assert.equal(titleRelevance("Nurse Practitioner", titles).tier, "none");

  const profile = { ...DEFAULT_RADAR_PROFILE, titles, skills: [], goals: "" };
  const adjacent = scoreRadarOpportunity({ title: "Program Manager", location: "Oakland, CA" }, profile);
  const exact = scoreRadarOpportunity({ title: "Senior Project Manager", location: "Oakland, CA" }, profile);
  assert.equal(adjacent.gated, false, "the same work under another name must reach the inbox");
  assert.match(adjacent.summary, /same work, different word/);
  assert.ok(adjacent.score < exact.score, "and must still rank below the words the owner actually saved");
});

// Skills were matched as one literal phrase, so "creative operations" missed
// every posting that said "creative ops" — the way most of them say it.
test("a saved skill is found when the posting words it differently", () => {
  assert.ok(phraseVariants("creative operations").includes("creative ops"));
  assert.ok(phraseVariants("project management").includes("program management"));
  assert.ok(phraseVariants("brand & creative").includes("brand and creative"));

  assert.equal(titleRelevance("Creative Ops Lead", ["Producer"], ["creative operations"]).tier, "family");
  assert.equal(titleRelevance("Brand & Creative Manager", ["Producer"], ["brand and creative"]).tier, "family");
  // The phrase still has to be present as a phrase. Two words scattered through
  // a title never add up to the skill.
  assert.equal(titleRelevance("Creative Assistant, Retail Operations Desk", ["Producer"], ["creative operations"]).tier, "none");
});

const closedListing = (title, company) => ({ title, company, reason: "listing_closed" });

// Marking a listing closed is interest, not rejection: the owner opened it and
// found the employer had taken it down.
test("closed listings teach the radar upward, and only once there are enough", () => {
  const profile = { ...DEFAULT_RADAR_PROFILE, titles: ["Project Manager"], skills: [], goals: "" };
  const thin = deriveClosedListingSignal([closedListing("Experiential Producer", "A")], profile);
  assert.equal(thin.ready, false);
  assert.match(thin.reason, /at least 3/);

  const signal = deriveClosedListingSignal([
    closedListing("Experiential Producer", "Giant Spoon"),
    closedListing("Senior Experiential Lead", "Giant Spoon"),
    closedListing("Experiential Marketing Manager", "Jack Morton"),
  ], profile);
  assert.equal(signal.ready, true);
  assert.ok(signal.words.includes("event"), `expected the experiential work to be learned, got ${JSON.stringify(signal.words)}`);
  // A word the saved goals already contain is scored by the goals themselves.
  assert.ok(!signal.words.includes("project"), "a saved target word must not be paid for twice");
  assert.ok(signal.companies.includes("Giant Spoon"), "the employer that keeps posting them is worth surfacing");

  assert.equal(closedListingBonus("event producer", signal).bonus > 0, true);
  assert.equal(closedListingBonus("staff accountant", signal).bonus, 0);

  const lifted = scoreRadarOpportunity({ title: "Experiential Project Manager", location: "Oakland, CA" }, profile, undefined, signal);
  const plain = scoreRadarOpportunity({ title: "Experiential Project Manager", location: "Oakland, CA" }, profile);
  assert.ok(lifted.score > plain.score, "a role like the ones you missed must rank higher");
});

// The bonus is a nudge, not a bypass. A role the title gate rejects stays
// capped however many closed listings share a word with it.
test("learning from closed listings never lifts a role past the role gate", () => {
  const profile = { ...DEFAULT_RADAR_PROFILE, titles: ["Project Manager"], skills: [], goals: "" };
  const signal = deriveClosedListingSignal([
    closedListing("Experiential Producer", "A"),
    closedListing("Experiential Lead", "B"),
    closedListing("Experiential Marketing Manager", "C"),
  ], profile);
  const gated = scoreRadarOpportunity({ title: "Event Security Guard", location: "Oakland, CA" }, profile, undefined, signal);
  assert.equal(gated.gated, true);
  assert.ok(gated.score <= 24, `a gated role must stay capped, got ${gated.score}`);
});

// A posting that names no location is unknown, not wrong. Company career pages
// routinely omit the field, and treating that as a mismatch was quietly
// rejecting a large share of everything the monitored-company scans read.
test("a posting with no location listed is not treated as outside the market", () => {
  const result = scoreRadarOpportunity({
    title: "Creative Operations Manager",
    description: "Lead integrated production and brand programs.",
  }, DEFAULT_RADAR_PROFILE);
  assert.equal(result.passes, true);
  assert.equal(result.gated, false);
  assert.doesNotMatch(result.summary, /location filter/i);
  assert.match(result.summary, /market unconfirmed/i);

  // A location that is known and elsewhere is still a hard stop.
  const elsewhere = scoreRadarOpportunity({
    title: "Creative Operations Manager",
    description: "Lead integrated production and brand programs.",
    location: "Austin, TX",
  }, DEFAULT_RADAR_PROFILE);
  assert.equal(elsewhere.passes, false);
  assert.equal(elsewhere.gated, true);
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

test("a board larger than the old 300-role cap is read in full", async () => {
  // OpenAI lists ~770 roles and Anthropic ~570. A read cut at 300 was still
  // stamped as a complete listing read, so live roles past the cut were
  // badged "no longer on the company board".
  const jobs = Array.from({ length: 400 }, (_, index) => ({
    title: `Producer ${index + 1}`,
    location: { name: "San Francisco, CA" },
    content: "<p>Production role.</p>",
    absolute_url: `https://boards.greenhouse.io/example/jobs/${index + 1}`,
    updated_at: "2026-07-18T00:00:00Z",
  }));
  const result = await discoverTargetJobs({ company: "Example", careersUrl: "https://boards.greenhouse.io/example" }, {
    fetchImpl: async () => Response.json({ jobs }),
  });
  assert.equal(result.length, 400);
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
