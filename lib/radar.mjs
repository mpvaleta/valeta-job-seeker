import { isLinkedInUrl, readPublicLink, validatePublicUrl } from "./public-link-reader.mjs";

export const DEFAULT_RADAR_PROFILE = {
  titles: ["Creative Operations", "Project Manager", "Producer", "Brand Program Manager"],
  skills: ["creative operations", "integrated production", "project management", "brand", "agency", "cross-functional"],
  locations: ["San Francisco Bay Area", "California", "United States"],
  workModes: ["Hybrid", "On-site", "Remote"],
  goals: "Brand, advertising, marketing, sports, agency, and creative-production roles with meaningful ownership and cross-functional delivery.",
  exclusions: [],
  minScore: 45,
};

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
    passes: bounded >= profile.minScore && !exclusions.length,
  };
}

export function detectCareerSource(value) {
  const url = validatePublicUrl(value);
  const host = url.hostname.toLowerCase().replace(/^www\./, "");
  const firstPath = url.pathname.split("/").filter(Boolean)[0] || "";
  if ((host === "boards.greenhouse.io" || host === "job-boards.greenhouse.io") && firstPath) return { type: "greenhouse", token: firstPath, url };
  if (host === "jobs.lever.co" && firstPath) return { type: "lever", token: firstPath, url };
  if (host === "jobs.ashbyhq.com" && firstPath) return { type: "ashby", token: firstPath, url };
  return { type: "public-page", token: "", url };
}

export async function discoverTargetJobs(target, options = {}) {
  const fetchImpl = options.fetchImpl || fetch;
  const scanUrl = clean(target?.careersUrl || target?.careers || target?.websiteUrl || target?.website || "", 4_000);
  if (!scanUrl) throw new Error("Add a company website or public careers page before scanning this target.");
  if (isLinkedInUrl(scanUrl)) throw new Error("LinkedIn does not permit automated monitoring. Use the company’s public website, careers page, or official ATS board instead.");
  const source = detectCareerSource(scanUrl);
  let jobs;
  if (source.type === "greenhouse") jobs = await readGreenhouse(source.token, fetchImpl);
  else if (source.type === "lever") jobs = await readLever(source.token, fetchImpl);
  else if (source.type === "ashby") jobs = await readAshby(source.token, fetchImpl);
  else jobs = await readGenericCareerPage(source.url.href, fetchImpl, true);

  const company = clean(target?.company || target?.name, 240);
  return uniqueBy(jobs.map((job) => ({
    title: clean(job.title, 300),
    company: clean(job.company || company, 240),
    location: clean(job.location, 400),
    description: clean(job.description, 100_000),
    sourceUrl: safeJobUrl(job.sourceUrl, scanUrl),
    sourceType: clean(job.sourceType || source.type, 80),
    datePosted: clean(job.datePosted, 80),
  })).filter((job) => job.title && job.sourceUrl), (job) => `${job.sourceUrl}|${job.title}`).slice(0, 200);
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

async function readGenericCareerPage(url, fetchImpl, followCareerHub = true) {
  const page = await readPublicLink(url, { fetchImpl });
  const jobs = [...page.jobs.map((job) => ({ ...job, sourceType: "structured-job-page" }))];
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
  if (followCareerHub && !jobs.length) {
    const hub = rankCareerLinks(page.links).find((link) => link.href !== page.finalUrl && link.href !== page.requestedUrl);
    if (hub) {
      const source = detectCareerSource(hub.href);
      if (source.type === "greenhouse") return readGreenhouse(source.token, fetchImpl);
      if (source.type === "lever") return readLever(source.token, fetchImpl);
      if (source.type === "ashby") return readAshby(source.token, fetchImpl);
      return readGenericCareerPage(source.url.href, fetchImpl, false);
    }
  }
  return jobs;
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
  if (label.length < 4 || /^(apply|learn more|view|details|read more|careers?|jobs?|open roles?)$/i.test(label)) return false;
  if (/linkedin\.com/i.test(href)) return false;
  return /\b(job|jobs|career|careers|position|positions|opening|openings|posting|postings|greenhouse|lever|ashby|workday)\b/i.test(href)
    || /\b(manager|director|producer|operations|marketing|brand|creative|project|program|strategy|lead|coordinator)\b/i.test(label);
}

async function fetchJson(url, fetchImpl) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);
  try {
    const response = await fetchImpl(url, {
      signal: controller.signal,
      headers: { Accept: "application/json", "User-Agent": "VJobsSeeker/1.0 radar" },
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
  if (/san francisco bay area|bay area/.test(normalized)) return /san francisco|oakland|san jose|bay area|redwood city|palo alto|mountain view|menlo park|berkeley|california|\bca\b/.test(location);
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

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
