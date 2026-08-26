import { isLinkedInUrl, readPublicLink, validatePublicUrl } from "./public-link-reader.mjs";

export const DEFAULT_RADAR_PROFILE = {
  titles: ["Creative Operations", "Project Manager", "Producer", "Brand Program Manager"],
  skills: ["creative operations", "integrated production", "project management", "brand", "agency", "cross-functional"],
  locations: ["San Francisco Bay Area", "California", "United States"],
  workModes: ["Hybrid", "On-site", "Remote"],
  goals: "Brand, advertising, marketing, sports, agency, and creative-production roles with meaningful ownership and cross-functional delivery.",
  exclusions: [],
  minScore: 45,
  companyStagePreference: "no_preference",
};

// "no_preference" leaves scoring exactly as it was before this field existed
// (the default, so every profile saved before this shipped keeps behaving the
// same way). "prefer_startups" is a soft boost; "startups_only" is a hard
// filter, same severity class as an exclusion term.
const COMPANY_STAGE_PREFERENCES = new Set(["no_preference", "prefer_startups", "startups_only"]);

export const RADAR_TRACKS = [
  { id: "brand-project", label: "Brand & Creative PM" },
  { id: "operations", label: "Operations" },
  { id: "production", label: "Production" },
  { id: "creative", label: "Creative" },
  { id: "sports", label: "Sports" },
  { id: "general-project", label: "General PM" },
];

export const RADAR_COMPANY_CATEGORIES = [
  "Startup / Early-stage",
  "Technology",
  "Sports / Entertainment",
  "Marketing Agency",
  "Creative / Advertising Agency",
  "Production Company",
  "Brand / Consumer",
  "Media",
  "Retail / Hospitality",
  "Nonprofit / Education",
  "Other",
];

// Stage language a company uses about itself. Deliberately specific: "growth"
// or "scaling" alone describe plenty of large companies, so they are paired with
// a stage word rather than matched on their own.
const STARTUP_SIGNAL = /\b(?:startup|start-up|early[- ]stage|pre[- ]seed|seed[- ]stage|series [a-d]\b|yc[- ]?(?:backed|w\d{2}|s\d{2})|y combinator|techstars|founding (?:team|engineer|marketer|designer)|first (?:marketing|design|ops) hire|venture[- ]backed|vc[- ]backed|angel[- ]backed|stealth mode|fewer than \d{1,2} employees|\d{1,2}[- ]person team)\b/i;

const COMMON_CAREER_PATHS = ["/careers", "/jobs", "/opportunities", "/join-us", "/work-with-us"];
// "imported" and "linkedin-saved" are trusted because the user chose the exact
// role themselves — by handing V's a job-details link, or by exporting their own
// saved jobs from LinkedIn. Neither came from crawling a page of links.
const TRUSTED_JOB_SOURCES = new Set(["apple", "ashby", "google-careers", "greenhouse", "icims", "imported", "lever", "linkedin-saved", "meta-job", "public-job-page", "smartrecruiters", "structured-job-page", "teamwork-online", "v-watch", "workday"]);
const NAVIGATION_TITLE = /^(?:apply|benefits|blog|browse|careers?|culture|departments?|details?|discover|diversity(?: (?:&|and) inclusion)?|early careers?|events?|explore|faq|find|hiring process|internships?|job search|jobs?|join us|learn|life at|locations?|meet the team|mission|news|open roles?|openings?|opportunities|our (?:culture|mission|story|teams?|values)|people|perks|read more|search|search jobs?|search roles?|stories|students?(?: (?:&|and) grads)?|talent community|teams?|university(?: recruiting)?|values|view|view all|why [\w &-]+|work(?:ing)? (?:at|with).*)$/i;
const NAVIGATION_PHRASE = /\b(?:benefits (?:&|and) perks|browse (?:all )?(?:jobs|roles)|career opportunities|employee stories|explore (?:jobs|opportunities|roles)|find (?:a |your )?(?:job|role)|hiring process|how we hire|job search|learn about working|learn more|life at|meet (?:our|the) team|our (?:culture|mission|story|values)|search (?:all )?(?:jobs|openings|positions|roles)|talent community|view (?:all )?(?:jobs|openings|positions|roles)|why (?:join|work)|working at)\b/i;
const ROLE_TITLE_SIGNAL = /\b(?:account(?:ant)?|administrator|analyst|architect|art director|assistant|associate|attorney|buyer|consultant|controller|coordinator|copywriter|counsel|designer|developer|director|editor|engineer|executive|head of [\w ]+|intern|lead|manager|marketer|nurse|officer|photographer|planner|principal [\w]+|producer|professor|recruiter|researcher|scientist|scrum master|specialist|strategist|supervisor|teacher|technician|therapist|videographer|vice president|vp|writer)\b|\b(?:sr|jr|senior|junior|staff)\.? [a-z]|,? (?:i{1,3}|iv|v)$/i;
const JOB_DETAIL_PATH = /(?:\/(?:careers?|jobs?|opportunities)\/(?:[^/?#]+\/)?(?:[a-z]*\d[\w-]*|[\w-]{8,})|\/jobs\/view\/[\w-]{6,}|\/viewjob(?:\/|[?#])|\/positions?\/[\w-]{6,}|\/openings?\/[\w-]{6,}|\/postings?\/[\w-]{6,}|\/details\/\d|\/profile\/job_details\/\d|[?&](?:gh_jid|jk|jobid|job_id|positionid|requisitionid|rid)=)/i;

const STOP_WORDS = new Set([
  "and", "are", "for", "from", "into", "job", "manager", "role", "the", "this", "that", "with", "you", "your",
  "our", "who", "will", "work", "team", "position", "opportunity", "candidate", "responsibilities", "required",
]);

export function normalizeRadarProfile(value = {}) {
  return {
    titles: cleanList(value.titles ?? DEFAULT_RADAR_PROFILE.titles, 30, 120),
    skills: cleanList(value.skills ?? DEFAULT_RADAR_PROFILE.skills, 60, 120),
    locations: cleanList(value.locations ?? DEFAULT_RADAR_PROFILE.locations, 20, 120),
    workModes: cleanList(value.workModes ?? DEFAULT_RADAR_PROFILE.workModes, 8, 40),
    goals: clean(value.goals ?? DEFAULT_RADAR_PROFILE.goals, 2_000),
    exclusions: cleanList(value.exclusions ?? DEFAULT_RADAR_PROFILE.exclusions, 30, 120),
    minScore: boundedNumber(value.minScore, 0, 100, DEFAULT_RADAR_PROFILE.minScore),
    companyStagePreference: COMPANY_STAGE_PREFERENCES.has(value.companyStagePreference) ? value.companyStagePreference : DEFAULT_RADAR_PROFILE.companyStagePreference,
  };
}

export function scoreRadarOpportunity(opportunity, profileValue) {
  const profile = normalizeRadarProfile(profileValue);
  const title = clean(opportunity?.title, 300);
  const description = clean(opportunity?.description, 80_000);
  const location = clean(opportunity?.location, 400);
  const haystack = `${title} ${description} ${location}`.toLowerCase();
  const titleLower = title.toLowerCase();
  const reasons = [];
  let score = 8;

  const exactTitleMatches = profile.titles.filter((target) => phraseMatches(titleLower, target));
  const titleTokens = tokens(profile.titles.join(" "));
  const titleTokenMatches = titleTokens.filter((token) => titleLower.includes(token));
  if (exactTitleMatches.length) {
    score += 42;
    reasons.push(`target title: ${exactTitleMatches.slice(0, 2).join(", ")}`);
  } else if (titleTokenMatches.length) {
    score += Math.min(34, 12 + titleTokenMatches.length * 7);
    reasons.push(`title overlap: ${titleTokenMatches.slice(0, 4).join(", ")}`);
  }

  const skillMatches = profile.skills.filter((skill) => phraseMatches(haystack, skill));
  if (skillMatches.length) {
    score += Math.min(30, 8 + skillMatches.length * 5);
    reasons.push(`skill overlap: ${skillMatches.slice(0, 4).join(", ")}`);
  }

  const goalMatches = tokens(profile.goals).filter((token) => haystack.includes(token));
  if (goalMatches.length) {
    score += Math.min(12, goalMatches.length * 3);
    reasons.push(`goal overlap: ${goalMatches.slice(0, 4).join(", ")}`);
  }

  const locationLower = location.toLowerCase();
  const remoteRole = /\b(remote|distributed|anywhere)\b/i.test(location) || /\bremote\b/i.test(title);
  const locationMatches = profile.locations.filter((target) => locationMatch(locationLower, target));
  if (!profile.locations.length) score += 8;
  else if (locationMatches.length) {
    score += 14;
    reasons.push(`location: ${locationMatches.slice(0, 2).join(", ")}`);
  } else if (remoteRole && profile.workModes.some((mode) => mode.toLowerCase() === "remote")) {
    score += 12;
    reasons.push("remote option");
  }

  // opportunity.companyCategory is a caller-supplied field (from
  // classifyRadarOpportunity), not derived from opportunity text here — this
  // function only scores, it never re-classifies the company itself.
  const companyCategory = clean(opportunity?.companyCategory, 120);
  const isStartup = companyCategory === "Startup / Early-stage";
  let stageMismatch = false;
  if (profile.companyStagePreference === "prefer_startups") {
    if (isStartup) {
      score += 10;
      reasons.push("startup / early-stage company");
    }
  } else if (profile.companyStagePreference === "startups_only" && !isStartup) {
    stageMismatch = true;
    score = Math.min(score - 40, 20);
    reasons.push(companyCategory ? `not early-stage (${companyCategory}) — startups-only filter` : "company stage not yet known — startups-only filter applied");
  }

  const exclusions = profile.exclusions.filter((term) => phraseMatches(haystack, term));
  if (exclusions.length) {
    score = Math.min(score - 35, 24);
    reasons.push(`review exclusion: ${exclusions.slice(0, 3).join(", ")}`);
  }

  const bounded = Math.max(0, Math.min(100, Math.round(score)));
  return {
    score: bounded,
    reasons,
    summary: reasons.length ? `${bounded}% target alignment · ${reasons.join(" · ")}` : `${bounded}% target alignment · limited overlap with the saved radar goals`,
    passes: bounded >= profile.minScore && !exclusions.length && !stageMismatch,
  };
}

export function detectCareerSource(value) {
  const url = validatePublicUrl(value);
  const host = url.hostname.toLowerCase().replace(/^www\./, "");
  const firstPath = url.pathname.split("/").filter(Boolean)[0] || "";
  if (host === "jobs.apple.com") return { type: "apple", token: "", url };
  if ((host === "google.com" || host === "careers.google.com") && /\/about\/careers\/applications\/jobs\/?/i.test(url.pathname)) {
    return { type: "google-careers", token: "", url };
  }
  if (host === "metacareers.com" && /^\/jobsearch\/?$/i.test(url.pathname)) return { type: "meta-search", token: "", url };
  if (host === "metacareers.com" && /^\/profile\/job_details\//i.test(url.pathname)) return { type: "meta-job", token: "", url };
  if ((host === "boards.greenhouse.io" || host === "job-boards.greenhouse.io") && firstPath) return { type: "greenhouse", token: firstPath, url };
  if (host === "jobs.lever.co" && firstPath) return { type: "lever", token: firstPath, url };
  if (host === "jobs.ashbyhq.com" && firstPath) return { type: "ashby", token: firstPath, url };
  if ((host === "jobs.smartrecruiters.com" || host === "careers.smartrecruiters.com") && firstPath) return { type: "smartrecruiters", token: firstPath, url };
  if (/\.wd\d*\.myworkdayjobs\.com$/.test(host) || /\.myworkdayjobs\.com$/.test(host)) {
    const segments = url.pathname.split("/").filter(Boolean);
    const locale = /^[a-z]{2}-[A-Z]{2}$/.test(segments[0] || "") ? segments.shift() : "";
    const site = segments[0] || "";
    const tenant = host.split(".")[0] || "";
    if (tenant && site) return { type: "workday", token: [tenant, site, locale].join("|"), url };
  }
  // Neither iCIMS nor TeamWork Online exposes a documented public API or
  // JobPosting JSON-LD (checked directly: iCIMS's real API is OAuth-gated to
  // its own customers; both a real iCIMS customer instance and several
  // TeamWork Online listing and job-detail pages were fetched and carried no
  // structured data). Detected here only so the "paste one link" import path
  // labels these correctly and can recover a company name from the URL, the
  // same treatment already given to Meta and to Wellfound/Work at a Startup.
  if (/\.icims\.com$/.test(host)) return { type: "icims", token: host.split(".")[0] || "", url };
  if (host === "teamworkonline.com") return { type: "teamwork-online", token: url.pathname, url };
  return { type: "public-page", token: "", url };
}

// Best-effort employer name from the URL alone, for sources with no
// structured data to read it from. Approximate by nature -- imperfect
// capitalization is a much smaller problem than reporting the job BOARD
// (Wellfound, TeamWork Online) as the employer, which a bare hostname guess
// would otherwise produce.
function companyFromSourceUrl(source) {
  if (source.type === "icims") {
    // Tenant subdomains look like "careers-petsuppliesplus" or "petsuppliesplus".
    const label = source.token.replace(/^careers[-.]?/i, "").replace(/^jobs[-.]?/i, "");
    return label ? titleCaseSlug(label) : "";
  }
  if (source.type === "teamwork-online") {
    // /football-jobs/chiefs/kansas-city-chiefs-29577/role-slug-123456 -- the
    // third segment is the fuller team name; the second is a short alias
    // ("chiefs") used only as a fallback when the fuller one is missing.
    const segments = String(source.token || "").split("/").filter(Boolean);
    const teamSegment = segments[2] || segments[1] || segments[0] || "";
    return teamSegment ? titleCaseSlug(teamSegment.replace(/-\d+$/, "")) : "";
  }
  return "";
}

function titleCaseSlug(value) {
  return value.replace(/[-_]+/g, " ").trim().replace(/\b\w/g, (letter) => letter.toUpperCase());
}

// Job-board hosts that exist specifically to list startups. A posting found
// there is strong, direct evidence of company stage — almost always stronger
// than STARTUP_SIGNAL, since most job listings never mention their own
// funding round or headcount in the text. Wellfound is startup job search;
// Work at a Startup is literally Y Combinator's board; Built In leans
// tech/startup but also lists larger employers, so it is deliberately left
// off this list rather than overclaimed.
const STARTUP_BOARD_HOSTS = new Set(["wellfound.com", "angel.co", "workatastartup.com"]);

function sourceIsStartupBoard(sourceUrl) {
  try {
    return STARTUP_BOARD_HOSTS.has(new URL(clean(sourceUrl, 4_000)).hostname.toLowerCase().replace(/^www\./, ""));
  } catch {
    return false;
  }
}

export function classifyRadarOpportunity(opportunity = {}, target = {}) {
  const title = clean(opportunity?.title, 300);
  const company = clean(opportunity?.company || target?.company || target?.name, 240);
  const description = clean(opportunity?.description || opportunity?.fitSummary, 6_000);
  const focus = clean(target?.focus, 1_000);
  const combined = `${title} ${company} ${description} ${focus}`.toLowerCase();
  let trackId = "general-project";
  if (/\b(sports?|athletic|athlete|league|football|basketball|baseball|soccer|nfl|nba|mlb|nhl|fan engagement|sponsorship)\b/.test(combined)) trackId = "sports";
  else if (/\b(producer|production|experiential|live event|event production|studio production|photo shoot|video production)\b/.test(combined)) trackId = "production";
  else if (/\b(creative operations?|creative ops|marketing operations?|program operations?|business operations?|resource management|capacity planning|workflow|process improvement)\b/.test(combined)) trackId = "operations";
  else if (/\b(creative director|art director|designer|copywriter|content creator|creative strategist|creative studio)\b/.test(combined)) trackId = "creative";
  else if (/\b(brand|marketing|advertising|campaign|go-to-market|gtm|creative program|creative project)\b/.test(combined)) trackId = "brand-project";
  const trackLabel = RADAR_TRACKS.find((track) => track.id === trackId)?.label || "General PM";
  return {
    trackId,
    trackLabel,
    // The source itself outranks the text-based classifier: a role listed on
    // a startup-only board is startup evidence even when its own description
    // never mentions funding stage, which is the common case.
    companyCategory: sourceIsStartupBoard(opportunity?.sourceUrl) ? "Startup / Early-stage" : classifyCompanyCategory(target?.kind || target?.companyType, combined),
  };
}

export function classifyCompanyCategory(value, context = "") {
  const explicit = clean(value, 120);
  if (RADAR_COMPANY_CATEGORIES.includes(explicit)) return explicit;
  const combined = `${explicit} ${clean(context, 6_000)}`.toLowerCase();
  if (STARTUP_SIGNAL.test(combined)) return "Startup / Early-stage";
  if (/\b(sports?|athletic|athlete|league|football|basketball|baseball|soccer|entertainment)\b/.test(combined)) return "Sports / Entertainment";
  if (/\b(anthropic|google|openai|attentive|hinge health|perplexity|snap|whatnot)\b/.test(combined)) return "Technology";
  if (/\b(the athletic|tubi)\b/.test(combined)) return "Media";
  if (/\b(highwire|george p\.? johnson|inizio evoke|jack morton)\b/.test(combined)) return "Creative / Advertising Agency";
  if (/\b(e\.?l\.?f\.? cosmetics|aventon|gantri)\b/.test(combined)) return "Brand / Consumer";
  if (/\b(marketing agency|communications agency|public relations agency|pr agency)\b/.test(combined)) return "Marketing Agency";
  if (/\b(creative agency|advertising agency|ad agency|experiential agency|agency production)\b/.test(combined)) return "Creative / Advertising Agency";
  if (/\b(production company|production studio|live production|film production)\b/.test(combined)) return "Production Company";
  if (/\b(software|technology|tech company|artificial intelligence| ai |saas|platform|healthtech|fintech)\b/.test(` ${combined} `)) return "Technology";
  if (/\b(media|publisher|news|streaming|television)\b/.test(combined)) return "Media";
  if (/\b(retail|hospitality|hotel|restaurant)\b/.test(combined)) return "Retail / Hospitality";
  if (/\b(nonprofit|education|university|school)\b/.test(combined)) return "Nonprofit / Education";
  if (/\b(consumer|brand|beauty|cosmetics|apparel|ecommerce|e-commerce)\b/.test(combined)) return "Brand / Consumer";
  if (/\bagency\b/.test(combined)) return "Creative / Advertising Agency";
  return "Other";
}

export async function discoverTargetJobs(target, options = {}) {
  return (await discoverTargetJobsDetailed(target, options)).jobs;
}

export async function discoverTargetJobsDetailed(target, options = {}) {
  const fetchImpl = options.fetchImpl || fetch;
  const candidates = uniqueCandidates([
    { url: target?.careersUrl || target?.careers, purpose: "saved-careers" },
    { url: target?.websiteUrl || target?.website, purpose: "company-website" },
    { url: target?.referenceUrl, purpose: "reference" },
    ...(Array.isArray(target?.searchUrls) ? target.searchUrls.map((url) => ({ url, purpose: "public-web-search" })) : []),
  ].map((candidate) => ({ ...candidate, url: clean(candidate.url, 4_000) }))
    .filter((candidate) => candidate.url && !isLinkedInUrl(candidate.url) && !/\b(?:indeed|glassdoor)\.com\b/i.test(candidate.url)));
  if (!candidates.length) throw new Error("Add a company website or public careers page before scanning this target.");
  const attempts = [];
  const allJobs = [];
  let recommendedCareersUrl = "";
  for (const candidate of candidates.slice(0, 4)) {
    const result = await tryCareerSource(candidate.url, candidate.purpose, target, fetchImpl);
    attempts.push(result.attempt);
    if (result.jobs.length) {
      allJobs.push(...result.jobs.map((job) => ({ ...job, sourceType: job.sourceType || result.attempt.sourceType, scanUrl: candidate.url })));
      recommendedCareersUrl ||= result.resolvedCareersUrl || candidate.url;
    }
  }

  if (!allJobs.length) {
    for (const candidate of commonCareerCandidates(target, candidates).slice(0, COMMON_CAREER_PATHS.length)) {
      const result = await tryCareerSource(candidate.url, candidate.purpose, target, fetchImpl);
      attempts.push(result.attempt);
      if (result.jobs.length) {
        allJobs.push(...result.jobs.map((job) => ({ ...job, sourceType: job.sourceType || result.attempt.sourceType, scanUrl: candidate.url })));
        recommendedCareersUrl ||= result.resolvedCareersUrl || candidate.url;
        break;
      }
    }
  }
  if (!allJobs.length && attempts.every((attempt) => attempt.status === "failed")) {
    throw new Error(`Every public source failed: ${attempts.map((attempt) => `${attempt.sourceType}: ${attempt.message}`).join(" · ")}`.slice(0, 500));
  }

  const company = clean(target?.company || target?.name, 240);
  const jobs = uniqueBy(allJobs.map((job) => ({
    title: clean(job.title, 300),
    company: clean(job.company || company, 240),
    location: clean(job.location, 400),
    description: clean(job.description, 100_000),
    sourceUrl: safeJobUrl(job.sourceUrl, job.scanUrl || candidates[0].url),
    sourceType: clean(job.sourceType || "public-page", 80),
    datePosted: clean(job.datePosted, 80),
  })).filter(isPlausibleRadarJob), (job) => `${job.sourceUrl}|${job.title}`).slice(0, 300);
  return { jobs, attempts, recommendedCareersUrl };
}

async function tryCareerSource(scanUrl, purpose, target, fetchImpl) {
  try {
    const source = detectCareerSource(scanUrl);
    let jobs;
    let resolvedCareersUrl = source.url.href;
    if (source.type === "greenhouse") jobs = await readGreenhouse(source.token, fetchImpl);
    else if (source.type === "lever") jobs = await readLever(source.token, fetchImpl);
    else if (source.type === "ashby") jobs = await readAshby(source.token, fetchImpl);
    else if (source.type === "smartrecruiters") jobs = await readSmartRecruiters(source.token, fetchImpl);
    else if (source.type === "workday") jobs = await readWorkday(source.token, source.url, fetchImpl);
    else if (source.type === "apple") jobs = await readApple(source.url, target, fetchImpl);
    else if (source.type === "google-careers") jobs = await readGoogleCareers(source.url, target, fetchImpl);
    else if (source.type === "meta-search") throw new Error("Meta's published robots policy does not permit automated job collection. V’s can keep this as a reference and import individual public Meta job pages, but it will not crawl Meta search results.");
    else {
      const result = await readGenericCareerPageDetailed(source.url.href, fetchImpl, true);
      jobs = result.jobs;
      resolvedCareersUrl = result.resolvedCareersUrl || source.url.href;
    }
    const candidateJobs = Array.isArray(jobs) ? jobs : [];
    const validatedJobs = candidateJobs.filter(isPlausibleRadarJob);
    const rejected = candidateJobs.length - validatedJobs.length;
    return {
      jobs: validatedJobs,
      resolvedCareersUrl,
      attempt: {
        url: scanUrl,
        resolvedUrl: resolvedCareersUrl,
        purpose,
        sourceType: source.type,
        status: "completed",
        found: validatedJobs.length,
        rejected,
        message: rejected ? `${rejected} navigation or non-job ${rejected === 1 ? "link was" : "links were"} excluded.` : undefined,
      },
    };
  } catch (cause) {
    return {
      jobs: [],
      resolvedCareersUrl: "",
      attempt: { url: scanUrl, purpose, sourceType: safeSourceType(scanUrl), status: "failed", found: 0, message: safeAttemptMessage(cause) },
    };
  }
}

function commonCareerCandidates(target, existing) {
  const website = clean(target?.websiteUrl || target?.website, 4_000);
  if (!website) return [];
  try {
    const url = validatePublicUrl(website);
    if (detectCareerSource(url.href).type !== "public-page") return [];
    const seen = new Set(existing.map((candidate) => canonicalUrl(candidate.url)));
    return COMMON_CAREER_PATHS
      .map((path) => ({ url: new URL(path, url.origin).href, purpose: "automatic-recovery" }))
      .filter((candidate) => !seen.has(canonicalUrl(candidate.url)));
  } catch {
    return [];
  }
}

function uniqueCandidates(items) {
  const seen = new Set();
  return items.filter((item) => {
    const key = canonicalUrl(item.url);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function canonicalUrl(value) {
  try {
    const url = validatePublicUrl(value);
    url.hash = "";
    return url.href.replace(/\/$/, "").toLowerCase();
  } catch {
    return "";
  }
}

async function readWorkday(token, url, fetchImpl) {
  const [tenant, site, locale] = token.split("|");
  const endpoint = new URL(`/wday/cxs/${encodeURIComponent(tenant)}/${encodeURIComponent(site)}/jobs`, url.origin);
  const payload = await fetchJson(endpoint.href, fetchImpl, {
    method: "POST",
    body: JSON.stringify({ appliedFacets: {}, limit: 100, offset: 0, searchText: "" }),
    headers: { "Content-Type": "application/json" },
  });
  const prefix = `/${locale || "en-US"}/${site}`;
  return (Array.isArray(payload?.jobPostings) ? payload.jobPostings : []).map((job) => ({
    title: job.title,
    location: job.locationsText || (Array.isArray(job.bulletFields) ? job.bulletFields.join(" · ") : ""),
    description: "",
    sourceUrl: new URL(`${prefix}${String(job.externalPath || "")}`, url.origin).href,
    sourceType: "workday",
    datePosted: job.postedOn || "",
  }));
}

/* Apple and Google expose public search data, but their visual pages are
 * JavaScript applications. These bounded adapters read only the same public
 * search responses a visitor receives; no account session or cookies are used. */
async function readApple(url, target, fetchImpl) {
  const searches = [
    { filters: { locations: ["postLocation-USA"] }, pages: 3 },
    ...radarSearchTerms(target).slice(0, 3).map((keyword) => ({ filters: { locations: ["postLocation-USA"], keywords: [keyword] }, pages: 1 })),
  ];
  const jobs = [];
  for (const search of searches) {
    for (let page = 1; page <= search.pages; page += 1) {
      const payload = await fetchJson(`${url.origin}/api/v1/search`, fetchImpl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          query: "",
          filters: search.filters,
          page,
          locale: "en-us",
          sort: "newest",
          format: { longDate: "MMMM D, YYYY", mediumDate: "MMM D, YYYY" },
        }),
      });
      for (const role of Array.isArray(payload?.res?.searchResults) ? payload.res.searchResults : []) {
        const positionId = clean(role.positionId || role.jobPositionId || role.id, 120);
        const title = clean(role.postingTitle, 300);
        if (!positionId || !title) continue;
        jobs.push({
          title,
          location: appleLocation(role.locations),
          description: clean(role.jobSummary, 100_000),
          sourceUrl: `${url.origin}/en-us/details/${encodeURIComponent(positionId)}/${appleSlug(role.transformedPostingTitle || title)}`,
          sourceType: "apple",
          datePosted: clean(role.postDateInGMT || role.postingDate, 80),
        });
      }
    }
  }
  return uniqueBy(jobs, (job) => job.sourceUrl).slice(0, 180);
}

async function readGoogleCareers(url, target, fetchImpl) {
  const jobs = [];
  for (const term of radarSearchTerms(target).slice(0, 4)) {
    const searchUrl = new URL("/about/careers/applications/jobs/results/", url.origin);
    searchUrl.searchParams.set("q", term);
    jobs.push(...parseGoogleSearchResults(await fetchHtml(searchUrl.href, fetchImpl)));
  }
  return uniqueBy(jobs, (job) => job.sourceUrl).slice(0, 140);
}

function radarSearchTerms(target) {
  const requested = clean(target?.focus, 1_000).split(/[\n,;|]/).map((item) => clean(item, 100)).filter((item) => item.length >= 3);
  return [...new Set([...requested, "creative operations", "creative project manager", "marketing producer", "program manager"])].slice(0, 5);
}

function parseGoogleSearchResults(html) {
  const jobs = [];
  for (const card of String(html || "").split(/<li\s+class=["']lLd3Je["'][^>]*>/i).slice(1)) {
    const title = clean(stripMarkup(firstRegex(card, /<h3\b[^>]*class=["']QJPWVe["'][^>]*>([\s\S]*?)<\/h3>/i)), 300);
    const href = firstRegex(card, /<a\b[^>]*href=["']([^"']*jobs\/results\/[^"']+)["']/i);
    if (!title || !href) continue;
    const location = clean(stripMarkup(firstRegex(card, /<span\b[^>]*class=["']r0wTof[^"']*["'][^>]*>([\s\S]*?)<\/span>/i)), 400);
    jobs.push({
      title,
      location,
      description: clean(stripMarkup(card), 12_000),
      sourceUrl: new URL(href, "https://www.google.com/about/careers/applications/").href,
      sourceType: "google-careers",
      datePosted: "",
    });
  }
  return uniqueBy(jobs, (job) => job.sourceUrl);
}

async function fetchHtml(url, fetchImpl) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);
  try {
    const response = await fetchImpl(url, {
      signal: controller.signal,
      headers: { Accept: "text/html,application/xhtml+xml;q=0.9,*/*;q=0.1", "User-Agent": "VJobsSeeker/1.0 radar" },
    });
    if (!response.ok) throw new Error(`The public careers page returned HTTP ${response.status}.`);
    const text = await response.text();
    if (text.length > 4_000_000) throw new Error("The public careers page is too large to scan safely.");
    return text;
  } catch (cause) {
    if (cause instanceof Error && cause.name === "AbortError") throw new Error("The public careers page took too long to respond.");
    throw cause;
  } finally {
    clearTimeout(timeout);
  }
}

function appleLocation(locations) {
  return (Array.isArray(locations) ? locations : []).map((location) => clean(location?.name || [location?.city, location?.stateProvince, location?.countryName].filter(Boolean).join(", "), 160)).filter(Boolean).join(" / ");
}

function appleSlug(value) {
  return clean(value, 300).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "role";
}

function firstRegex(value, expression) {
  return String(value || "").match(expression)?.[1] || "";
}

/*
 * Read a public company page and follow only the best official careers/ATS
 * links. The resolved hub is returned so a monitor can self-repair a stale URL.
 */
async function readGenericCareerPageDetailed(url, fetchImpl, followCareerHub = true) {
  const page = await readPublicLink(url, { fetchImpl });
  const jobs = [...page.jobs.map((job) => ({ ...job, sourceType: "structured-job-page" }))];
  let resolvedCareersUrl = page.finalUrl || page.requestedUrl || url;
  for (const link of page.links) {
    if (!looksLikeJobLink(link)) continue;
    jobs.push({
      title: link.label,
      location: "",
      description: "",
      sourceUrl: link.href,
      sourceType: "public-careers-page",
      datePosted: "",
    });
  }
  if (followCareerHub) {
    for (const hub of rankCareerLinks(page.links).filter((link) => link.href !== page.finalUrl && link.href !== page.requestedUrl).slice(0, 5)) {
      try {
        const source = detectCareerSource(hub.href);
        let discovered = [];
        let discoveredHub = hub.href;
        if (source.type === "greenhouse") discovered = await readGreenhouse(source.token, fetchImpl);
        else if (source.type === "lever") discovered = await readLever(source.token, fetchImpl);
        else if (source.type === "ashby") discovered = await readAshby(source.token, fetchImpl);
        else if (source.type === "smartrecruiters") discovered = await readSmartRecruiters(source.token, fetchImpl);
        else if (source.type === "workday") discovered = await readWorkday(source.token, source.url, fetchImpl);
        else {
          const nested = await readGenericCareerPageDetailed(source.url.href, fetchImpl, false);
          discovered = nested.jobs;
          discoveredHub = nested.resolvedCareersUrl || hub.href;
        }
        if (discovered.length) {
          jobs.push(...discovered);
          resolvedCareersUrl = discoveredHub;
        }
      } catch {
        // Keep trying the remaining official Careers/Jobs/Opportunities links.
      }
    }
  }
  return { jobs: uniqueBy(jobs, (job) => `${job.sourceUrl}|${job.title}`), resolvedCareersUrl };
}

async function readGreenhouse(token, fetchImpl) {
  const payload = await fetchJson(`https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(token)}/jobs?content=true`, fetchImpl);
  return (Array.isArray(payload?.jobs) ? payload.jobs : []).map((job) => ({
    title: job.title,
    location: job.location?.name,
    description: stripMarkup(job.content || ""),
    sourceUrl: job.absolute_url,
    sourceType: "greenhouse",
    datePosted: job.updated_at,
  }));
}

async function readLever(token, fetchImpl) {
  const payload = await fetchJson(`https://api.lever.co/v0/postings/${encodeURIComponent(token)}?mode=json`, fetchImpl);
  return (Array.isArray(payload) ? payload : []).map((job) => ({
    title: job.text,
    location: job.categories?.location || job.categories?.allLocations?.join(" / "),
    description: [job.descriptionPlain, job.additionalPlain].filter(Boolean).join("\n"),
    sourceUrl: job.hostedUrl || job.applyUrl,
    sourceType: "lever",
    datePosted: job.createdAt ? new Date(job.createdAt).toISOString() : "",
  }));
}

async function readAshby(token, fetchImpl) {
  const payload = await fetchJson(`https://api.ashbyhq.com/posting-api/job-board/${encodeURIComponent(token)}?includeCompensation=false`, fetchImpl);
  return (Array.isArray(payload?.jobs) ? payload.jobs : []).map((job) => ({
    title: job.title,
    location: [job.location, job.isRemote ? "Remote" : ""].filter(Boolean).join(" · "),
    description: job.descriptionPlain || stripMarkup(job.descriptionHtml || ""),
    sourceUrl: job.jobUrl || job.applyUrl,
    sourceType: "ashby",
    datePosted: job.publishedAt,
  }));
}

async function readSmartRecruiters(token, fetchImpl) {
  const payload = await fetchJson(`https://api.smartrecruiters.com/v1/companies/${encodeURIComponent(token)}/postings?limit=100`, fetchImpl);
  return (Array.isArray(payload?.content) ? payload.content : []).map((job) => ({
    title: job.name,
    location: [job.location?.city, job.location?.region, job.location?.country].filter(Boolean).join(", "),
    description: clean(job.jobAd?.sections?.jobDescription?.text || job.jobAd?.sections?.qualifications?.text || "", 100_000),
    sourceUrl: job.ref || `https://jobs.smartrecruiters.com/${encodeURIComponent(token)}/${job.id}`,
    sourceType: "smartrecruiters",
    datePosted: job.releasedDate || "",
  }));
}

export function rankCareerLinks(links) {
  return (Array.isArray(links) ? links : [])
    .filter((link) => /^https?:\/\//i.test(clean(link?.href, 4_000)) && !isLinkedInUrl(link.href))
    .map((link) => {
      const label = clean(link?.label, 240);
      const href = clean(link?.href, 4_000);
      const haystack = `${label} ${href}`.toLowerCase();
      const semantic = /career/.test(haystack) ? 50
        : /\bjobs?\b/.test(haystack) ? 45
          : /opportunit/.test(haystack) ? 40
            : /openings?|open roles?/.test(haystack) ? 35
              : /join(?:-|\s)?us|work(?:-|\s)?with(?:-|\s)?us/.test(haystack) ? 30
                : 0;
      const ats = /greenhouse|lever|ashby|workday|smartrecruiters|jobvite/.test(haystack) ? 20 : 0;
      return { href, label, score: semantic + ats };
    })
    .filter((link) => link.score > 0)
    .sort((left, right) => right.score - left.score || left.href.length - right.href.length);
}

function looksLikeJobLink(link) {
  const label = clean(link?.label, 240);
  const href = clean(link?.href, 4_000);
  if (/linkedin\.com/i.test(href)) return false;
  return isPlausibleRadarJob({ title: label, sourceUrl: href, sourceType: "public-careers-page" });
}

/*
 * Read one public job-detail page the user pointed V's at directly.
 *
 * Employers whose robots policy forbids automated collection — Meta's job
 * search is the standing example — still publish individual job pages that a
 * person may open and share. This is the user-directed path for those: it
 * reads exactly the one URL supplied, follows no links, and crawls nothing.
 */
export async function readSingleJobPosting(value, options = {}) {
  const fetchImpl = options.fetchImpl || fetch;
  const source = detectCareerSource(value);
  if (source.type === "meta-search") {
    throw new Error("That is a Meta job-search URL, which cannot be collected automatically. Open the specific role and paste its job-details link instead.");
  }
  if (isLinkedInUrl(source.url.href)) {
    throw new Error("LinkedIn job pages cannot be read automatically. Open the role, copy the description, and paste it in Role workspace instead.");
  }
  const page = await readPublicLink(source.url.href, { fetchImpl });
  const finalUrl = page.finalUrl || page.requestedUrl || source.url.href;
  const posting = page.jobs[0];
  if (posting) {
    return {
      title: clean(posting.title, 300),
      company: clean(posting.company, 180),
      location: clean(posting.location, 180),
      description: clean(posting.description, 20_000),
      sourceUrl: clean(posting.sourceUrl, 4_000) || finalUrl,
      sourceType: "structured-job-page",
      datePosted: clean(posting.datePosted, 40),
    };
  }
  // No JSON-LD posting: fall back to the page's own title and text, and keep
  // the detected source type so a trusted ATS page is still trusted.
  const title = pageTitleAsRole(page.title);
  if (!title) throw new Error("That page did not contain a readable job title. Open it and confirm it is a public job-details page.");
  return {
    title,
    company: companyFromSourceUrl(source),
    location: "",
    description: clean(page.description || page.text, 20_000),
    sourceUrl: finalUrl,
    sourceType: source.type === "public-page" ? "public-job-page" : source.type,
    datePosted: "",
  };
}

// Job pages title themselves "Senior Producer - Acme Careers" or
// "Acme | Senior Producer"; keep the segment that reads like a role.
function pageTitleAsRole(value) {
  const raw = clean(value, 300);
  if (!raw) return "";
  const segments = raw.split(/\s+[|·—–]\s+|\s+-\s+/).map((segment) => clean(segment, 200)).filter(Boolean);
  const roleSegment = segments.find((segment) => ROLE_TITLE_SIGNAL.test(segment) && !NAVIGATION_TITLE.test(segment));
  return roleSegment || (segments[0] && !NAVIGATION_TITLE.test(segments[0]) ? segments[0] : "");
}

// Parameters that identify where a click came from, never which job it is.
// gh_jid, jk, and requisition ids are deliberately absent: those ARE the job.
const TRACKING_PARAMS = /^(?:utm_[a-z_]*|gh_src|trk|trkinfo|refid|ref|referrer|src|source|campaign|mc_cid|mc_eid|fbclid|gclid|msclkid|igshid|s_kwcid|recruiter|rx_[a-z]+)$/i;

/*
 * A stable identity for one job posting, used to decide whether a discovery is
 * new or one V's already has.
 *
 * Deduplication used to compare the raw source_url as an exact string, so the
 * same posting reached by a slightly different link became a second inbox row:
 * a trailing slash, http vs https, a www. prefix, a tracking parameter, a
 * reordered query, or a #fragment were each enough. A role found by a monitored
 * scan, then by V's Job Watch, then imported by hand produced three rows.
 *
 * Host and scheme are normalized because they never distinguish two jobs. The
 * path keeps its original case: some ATS platforms use case-sensitive job ids,
 * and wrongly merging two real postings loses a role, which is worse than
 * showing a duplicate.
 */
/*
 * Reduce an applicant-tracking-system URL to the board and posting it names.
 *
 * The same posting reaches the radar by several routes — the board API, the
 * company's own careers page, a web-search lead — and each spells the URL
 * differently. Greenhouse alone serves one posting as
 * boards.greenhouse.io/figma/jobs/123, job-boards.greenhouse.io/figma/jobs/123,
 * the same with ?gh_jid=123 appended, and boards.greenhouse.io/embed/job_app
 * ?for=figma&token=123. Treating those as four postings is exactly why the
 * same jobs kept reappearing in the inbox. Where the ATS is recognized, the
 * identity is the board plus the posting id and nothing else.
 */
function atsIdentity(url) {
  const host = url.hostname;
  const segments = url.pathname.split("/").filter(Boolean);

  if (host.endsWith("greenhouse.io")) {
    const embedBoard = url.searchParams.get("for");
    const embedToken = url.searchParams.get("token") || url.searchParams.get("gh_jid");
    if (embedBoard && embedToken) return `greenhouse:${embedBoard.toLowerCase()}:${embedToken}`;
    const jobsAt = segments.indexOf("jobs");
    const id = url.searchParams.get("gh_jid") || (jobsAt > 0 ? segments[jobsAt + 1] : "");
    const board = jobsAt > 0 ? segments[jobsAt - 1] : segments[0];
    if (board && id) return `greenhouse:${board.toLowerCase()}:${id}`;
  }

  if (host.endsWith("lever.co")) {
    // /<board>/<id>, optionally followed by /apply or /thanks.
    const [board, id] = segments;
    if (board && id) return `lever:${board.toLowerCase()}:${id.toLowerCase()}`;
  }

  if (host.endsWith("ashbyhq.com")) {
    // /<board>/<uuid>, optionally followed by /application.
    const cleaned = segments.filter((segment) => segment !== "posting-api" && segment !== "job-board");
    const [board, id] = cleaned;
    if (board && id) return `ashby:${board.toLowerCase()}:${id.toLowerCase()}`;
  }

  if (host.endsWith("smartrecruiters.com")) {
    const [board, id] = segments;
    if (board && id) return `smartrecruiters:${board.toLowerCase()}:${id.toLowerCase()}`;
  }

  if (host.endsWith("myworkdayjobs.com")) {
    // The final segment carries the requisition id; the locale prefix and the
    // human-readable slug in between vary by entry point.
    const requisition = segments[segments.length - 1] || "";
    if (/_R?-?\d{3,}/i.test(requisition)) return `workday:${host}:${requisition.toLowerCase()}`;
  }

  return "";
}

export function opportunityKey(value) {
  const raw = clean(value, 4_000);
  if (!raw) return "";
  try {
    const url = new URL(raw);
    url.hash = "";
    url.protocol = "https:";
    url.hostname = url.hostname.toLowerCase().replace(/^www\./, "");
    url.port = "";
    for (const key of [...url.searchParams.keys()]) {
      if (TRACKING_PARAMS.test(key)) url.searchParams.delete(key);
    }
    const ats = atsIdentity(url);
    if (ats) return ats;
    url.searchParams.sort();
    const path = url.pathname.replace(/\/+$/, "");
    return `${url.hostname}${path}${url.search}`;
  } catch {
    return raw.toLowerCase();
  }
}

/*
 * A second identity for the same posting, used only when the URLs disagree.
 *
 * Some employers publish a role on their own careers page and on a board under
 * unrelated URLs, and a web-search lead can land on a third. One company
 * advertising one title in one place is one job, so this collapses them. It is
 * deliberately strict: the location is part of the key, so the same title open
 * in two cities stays two postings.
 */
export function opportunityContentKey(job = {}) {
  const normalize = (value) => clean(value, 300)
    .toLowerCase()
    .replace(/[\u2010-\u2015]/g, "-")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
  const company = normalize(job.company);
  const title = normalize(job.title)
    // Requisition numbers and city suffixes that some boards append to an
    // otherwise identical title.
    .replace(/\b(?:job )?(?:req|requisition|id)\s*\d+\b/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (!company || title.length < 4) return "";
  const location = normalize(job.location).replace(/\b(?:united states|usa|us|remote first)\b/g, "").replace(/\s+/g, " ").trim();
  return `content:${company}:${title}:${location}`;
}

export function isPlausibleRadarJob(job = {}) {
  const title = clean(job?.title, 300);
  const sourceUrl = clean(job?.sourceUrl, 4_000);
  const sourceType = clean(job?.sourceType, 80);
  if (title.length < 4 || !sourceUrl) return false;
  if (NAVIGATION_TITLE.test(title) || NAVIGATION_PHRASE.test(title)) return false;
  if (/^(?:about|benefits|careers?|culture|departments?|locations?|our company|people|search|teams?|why join)\b/i.test(title)) return false;
  if (TRUSTED_JOB_SOURCES.has(sourceType)) return true;
  // Untrusted pages need a job-detail URL plus a role-shaped title or a real
  // description — a bare /careers/<slug> link with a marketing title is a
  // navigation card, not a posting.
  if (!JOB_DETAIL_PATH.test(sourceUrl)) return false;
  return ROLE_TITLE_SIGNAL.test(title) || clean(job?.description, 2_000).length >= 80;
}

async function fetchJson(url, fetchImpl, init = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);
  try {
    const response = await fetchImpl(url, {
      ...init,
      signal: controller.signal,
      headers: { Accept: "application/json", "User-Agent": "VJobsSeeker/1.0 radar", ...(init.headers || {}) },
    });
    if (!response.ok) throw new Error(`The careers service returned HTTP ${response.status}.`);
    const length = Number(response.headers.get("content-length") || "0");
    if (length > 4_000_000) throw new Error("The careers response is too large to scan safely.");
    const text = await response.text();
    try {
      return JSON.parse(text);
    } catch {
      throw new Error("The careers service returned an unreadable response. Open the source in your browser and verify that it is public.");
    }
  } catch (cause) {
    if (cause instanceof Error && cause.name === "AbortError") throw new Error("The careers service took too long to respond.");
    throw cause;
  } finally {
    clearTimeout(timeout);
  }
}

function tokens(value) {
  return [...new Set(String(value || "").toLowerCase().match(/[a-z0-9][a-z0-9+#.-]{1,}/g) || [])]
    .filter((token) => token.length >= 3 && !STOP_WORDS.has(token));
}

function phraseMatches(haystack, phrase) {
  const normalized = clean(phrase, 200).toLowerCase();
  if (!normalized) return false;
  if (normalized.length <= 3) return new RegExp(`\\b${escapeRegExp(normalized)}\\b`, "i").test(haystack);
  return haystack.includes(normalized) || tokens(normalized).every((token) => haystack.includes(token));
}

function locationMatch(location, target) {
  const normalized = clean(target, 120).toLowerCase();
  if (!normalized) return false;
  if (location.includes(normalized)) return true;
  if (/san francisco bay area|bay area/.test(normalized)) return /san francisco|oakland|san jose|bay area|redwood city|palo alto|mountain view|menlo park|cupertino|sunnyvale|santa clara|fremont|berkeley|california|\bca\b/.test(location);
  if (/united states|\bu\.s\.?\b|\busa\b/.test(normalized)) return /united states|\bu\.s\.?\b|\busa\b|remote|\b[a-z .]+, [a-z]{2}\b/.test(location);
  return tokens(normalized).some((token) => location.includes(token));
}

function cleanList(value, limit, itemLimit) {
  const source = Array.isArray(value) ? value : typeof value === "string" ? value.split(/[,\n]/) : [];
  return [...new Set(source.map((item) => clean(item, itemLimit)).filter(Boolean))].slice(0, limit);
}

function clean(value, limit) {
  return String(value || "").replace(/\s+/g, " ").trim().slice(0, limit);
}

function boundedNumber(value, minimum, maximum, fallback) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(minimum, Math.min(maximum, Math.round(parsed)));
}

function safeJobUrl(value, fallback) {
  try {
    return validatePublicUrl(new URL(String(value || ""), fallback).href).href;
  } catch {
    return validatePublicUrl(fallback).href;
  }
}

function stripMarkup(value) {
  return String(value || "").replace(/<[^>]+>/g, " ").replace(/&nbsp;/gi, " ").replace(/&amp;/gi, "&").replace(/\s+/g, " ").trim();
}

function uniqueBy(items, key) {
  const seen = new Set();
  return items.filter((item) => {
    const value = key(item).toLowerCase();
    if (!value || seen.has(value)) return false;
    seen.add(value);
    return true;
  });
}

function safeSourceType(value) {
  try { return detectCareerSource(value).type; } catch { return "public-page"; }
}

function safeAttemptMessage(value) {
  return (value instanceof Error ? value.message : "The source could not be scanned.")
    .replace(/https?:\/\/\S+/gi, "[url]")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 180);
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
