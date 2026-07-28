import { classifyRadarOpportunity, detectCareerSource, discoverTargetJobsDetailed, isPlausibleRadarJob, normalizeRadarProfile, readSingleJobPosting, scoreRadarOpportunity } from "./radar.mjs";
import { searchCompanyJobSources } from "./radar-web-search.mjs";
import { JOB_WATCH_BATCH_ID, JOB_WATCH_ROLES } from "./job-watch-batch";
import type { RadarProfile } from "./radar.mjs";

type UserRow = { id: string; email: string; display_name: string };
type ProfileRow = {
  id: string;
  headline: string;
  target_roles_json: string;
  target_markets_json: string;
  positioning: string;
  constraints_json: string;
};
type MonitorRow = {
  monitor_id: string;
  company_id: string;
  company_name: string;
  website_url: string | null;
  careers_url: string | null;
  company_type: string;
  primary_market: string | null;
  notes: string | null;
  query: string;
  cadence: string;
  is_active: number;
  last_checked_at: string | null;
  created_at: string;
  last_run_status: string | null;
  last_run_found_count: number | null;
  last_run_summary: string | null;
  last_run_at: string | null;
};
type OpportunityRow = {
  id: string;
  company_id: string | null;
  company_name: string | null;
  company_type: string | null;
  title: string;
  location: string | null;
  source_url: string | null;
  source_type: string;
  fit_score: number | null;
  fit_summary: string | null;
  status: string;
  discovered_at: string;
  updated_at: string;
};

export type RadarMonitorInput = {
  company: string;
  kind?: string;
  websiteUrl?: string;
  careersUrl?: string;
  referenceUrl?: string;
  sourceKind?: string;
  focus?: string;
  targetPosition?: string;
  market?: string;
  cadence?: "twice_daily" | "daily" | "manual";
};

export async function ensureRadarUser(db: D1Database, email: string, displayName?: string | null) {
  const normalizedEmail = email.trim().toLowerCase();
  const existing = await db.prepare("SELECT id, email, display_name FROM users WHERE email = ? LIMIT 1").bind(normalizedEmail).first<UserRow>();
  if (existing) return existing;
  const id = crypto.randomUUID();
  const name = String(displayName || normalizedEmail.split("@")[0] || "V’s user").trim().slice(0, 160);
  await db.prepare("INSERT INTO users (id, email, display_name, default_market) VALUES (?, ?, ?, ?)")
    .bind(id, normalizedEmail, name, "San Francisco Bay Area").run();
  return { id, email: normalizedEmail, display_name: name };
}

export async function readRadarDashboard(db: D1Database, userId: string) {
  const [profileRow, monitorResult, opportunityResult] = await Promise.all([
    db.prepare("SELECT id, headline, target_roles_json, target_markets_json, positioning, constraints_json FROM career_profiles WHERE user_id = ? ORDER BY updated_at DESC LIMIT 1").bind(userId).first<ProfileRow>(),
    // CURRENT_TIMESTAMP only resolves to whole seconds, so two runs of the same
    // monitor inside one second tie on created_at. rowid breaks the tie in
    // insertion order and keeps "last run" pointing at the newest row.
    db.prepare(`SELECT m.id AS monitor_id, m.company_id, c.name AS company_name, c.website_url, c.careers_url, c.company_type, c.primary_market, c.notes, m.query, m.cadence, m.is_active, m.last_checked_at, m.created_at,
      (SELECT mr.run_status FROM monitor_runs mr WHERE mr.monitor_id = m.id ORDER BY mr.created_at DESC, mr.rowid DESC LIMIT 1) AS last_run_status,
      (SELECT mr.found_count FROM monitor_runs mr WHERE mr.monitor_id = m.id ORDER BY mr.created_at DESC, mr.rowid DESC LIMIT 1) AS last_run_found_count,
      (SELECT mr.change_summary FROM monitor_runs mr WHERE mr.monitor_id = m.id ORDER BY mr.created_at DESC, mr.rowid DESC LIMIT 1) AS last_run_summary,
      (SELECT mr.created_at FROM monitor_runs mr WHERE mr.monitor_id = m.id ORDER BY mr.created_at DESC, mr.rowid DESC LIMIT 1) AS last_run_at
      FROM company_monitors m JOIN companies c ON c.id = m.company_id
      WHERE m.user_id = ? ORDER BY m.is_active DESC, c.name ASC`).bind(userId).all<MonitorRow>(),
    db.prepare(`SELECT o.id, o.company_id, c.name AS company_name, c.company_type, o.title, o.location, o.source_url, o.source_type, o.fit_score, o.fit_summary, o.status, o.discovered_at, o.updated_at
      FROM job_opportunities o LEFT JOIN companies c ON c.id = o.company_id
      WHERE o.user_id = ? ORDER BY o.discovered_at DESC, o.fit_score DESC LIMIT 300`).bind(userId).all<OpportunityRow>(),
  ]);
  const profile = profileFromRow(profileRow);
  const monitors = (monitorResult.results || []).map(monitorFromRow);
  const monitorByCompanyId = new Map(monitors.map((monitor) => [monitor.companyId, monitor]));
  const opportunityRows = opportunityResult.results || [];
  const visibleOpportunityRows = opportunityRows.filter((row) => isPlausibleRadarJob({
    title: row.title,
    sourceUrl: row.source_url || "",
    sourceType: row.source_type,
    description: row.fit_summary || "",
  }));
  const opportunities = visibleOpportunityRows.map((row) => {
    const classification = classifyRadarOpportunity({
      company: row.company_name || "",
      title: row.title,
      fitSummary: row.fit_summary || "",
    }, { kind: row.company_type || "" });
    const fitScore = row.fit_score ?? 0;
    const exclusionHit = /review exclusion:/i.test(row.fit_summary || "");
    const monitor = row.company_id ? monitorByCompanyId.get(row.company_id) : undefined;
    const origin = row.source_type === "v-watch" ? "v-watch" : row.source_type === "imported" ? "imported" : row.source_type === "linkedin-saved" ? "linkedin-saved" : "monitored";
    return {
      id: row.id,
      companyId: row.company_id,
      company: row.company_name || "Unknown company",
      companyCategory: classification.companyCategory,
      trackId: classification.trackId,
      trackLabel: classification.trackLabel,
      title: row.title,
      location: row.location || "Location not listed",
      sourceUrl: row.source_url || "",
      sourceType: row.source_type,
      origin,
      targetPosition: origin === "monitored"
        ? monitor?.targetPosition || classification.trackLabel
        : classification.trackLabel,
      // An imported role came from a page the user opened themselves, so its
      // employer may never have been reachable by an automated scan.
      importedByUser: origin === "imported" || origin === "linkedin-saved",
      fitScore,
      fitSummary: row.fit_summary || "No fit summary available.",
      alignmentPasses: fitScore >= profile.minScore && !exclusionHit,
      exclusionHit,
      status: normalizeOpportunityStatus(row.status),
      discoveredAt: row.discovered_at,
      updatedAt: row.updated_at,
    };
  });
  return {
    profile,
    monitors,
    opportunities,
    excludedNavigationCount: opportunityRows.length - visibleOpportunityRows.length,
    dueCount: monitors.filter((monitor) => monitor.active && isMonitorDue(monitor)).length,
    lastRunAt: monitors.map((monitor) => monitor.lastCheckedAt).filter(Boolean).sort().reverse()[0] || null,
  };
}

export async function saveRadarProfile(db: D1Database, userId: string, value: Partial<RadarProfile>) {
  const profile = normalizeRadarProfile(value);
  const existing = await db.prepare("SELECT id FROM career_profiles WHERE user_id = ? ORDER BY updated_at DESC LIMIT 1").bind(userId).first<{ id: string }>();
  const constraints = JSON.stringify({ skills: profile.skills, workModes: profile.workModes, exclusions: profile.exclusions, minScore: profile.minScore });
  if (existing) {
    await db.prepare("UPDATE career_profiles SET headline = ?, target_roles_json = ?, target_markets_json = ?, positioning = ?, constraints_json = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND user_id = ?")
      .bind(profile.titles[0] || "Job radar", JSON.stringify(profile.titles), JSON.stringify(profile.locations), profile.goals || "Target-role radar", constraints, existing.id, userId).run();
  } else {
    await db.prepare("INSERT INTO career_profiles (id, user_id, headline, target_roles_json, target_markets_json, positioning, constraints_json) VALUES (?, ?, ?, ?, ?, ?, ?)")
      .bind(crypto.randomUUID(), userId, profile.titles[0] || "Job radar", JSON.stringify(profile.titles), JSON.stringify(profile.locations), profile.goals || "Target-role radar", constraints).run();
  }
  return profile;
}

export async function addRadarMonitor(db: D1Database, userId: string, input: RadarMonitorInput) {
  const company = clean(input.company, 180);
  const careersUrl = clean(input.careersUrl, 4_000);
  const websiteUrl = clean(input.websiteUrl, 4_000);
  if (!company) throw new Error("Add a company, brand, or agency name.");
  const companyId = crypto.randomUUID();
  const monitorId = crypto.randomUUID();
  const query = JSON.stringify({
    focus: clean(input.focus, 1_000),
    targetPosition: clean(input.targetPosition, 180),
    referenceUrl: clean(input.referenceUrl, 4_000),
    sourceKind: clean(input.sourceKind, 80),
  });
  await db.batch([
    db.prepare("INSERT INTO companies (id, name, website_url, careers_url, company_type, primary_market, notes) VALUES (?, ?, ?, ?, ?, ?, ?)")
      .bind(companyId, company, websiteUrl || null, careersUrl || null, clean(input.kind, 80) || "Company", clean(input.market, 180) || "Bay Area / U.S.", "Added to V’s twice-daily radar"),
    db.prepare("INSERT INTO company_monitors (id, user_id, company_id, query, cadence, is_active) VALUES (?, ?, ?, ?, ?, ?)")
      .bind(monitorId, userId, companyId, query, input.cadence === "manual" ? "manual" : input.cadence === "daily" ? "daily" : "twice_daily", 1),
  ]);
  return monitorId;
}

export async function updateRadarMonitor(db: D1Database, userId: string, monitorId: string, patch: { active?: boolean; cadence?: string; focus?: string; targetPosition?: string }) {
  const current = await ownedMonitor(db, userId, monitorId);
  if (!current) throw new Error("That radar target could not be found.");
  const query = parseObject(current.query);
  if (patch.focus != null) query.focus = clean(patch.focus, 1_000);
  if (patch.targetPosition != null) query.targetPosition = clean(patch.targetPosition, 180);
  const cadence = patch.cadence === "manual" ? "manual" : patch.cadence === "twice_daily" ? "twice_daily" : patch.cadence === "daily" || patch.cadence === "weekly" ? "daily" : current.cadence;
  const active = patch.active == null ? Boolean(current.is_active) : Boolean(patch.active);
  await db.prepare("UPDATE company_monitors SET query = ?, cadence = ?, is_active = ? WHERE id = ? AND user_id = ?")
    .bind(JSON.stringify(query), cadence, active ? 1 : 0, monitorId, userId).run();
}

export async function deleteRadarMonitor(db: D1Database, userId: string, monitorId: string) {
  await db.prepare("UPDATE company_monitors SET is_active = 0 WHERE id = ? AND user_id = ?").bind(monitorId, userId).run();
}

export async function setRadarOpportunityStatus(db: D1Database, userId: string, opportunityId: string, status: string) {
  const normalized = normalizeOpportunityStatus(status);
  await db.prepare("UPDATE job_opportunities SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND user_id = ?")
    .bind(normalized, opportunityId, userId).run();
  return normalized;
}

export async function importJobWatchBatch(db: D1Database, userId: string) {
  let added = 0;
  let updated = 0;
  for (const role of JOB_WATCH_ROLES) {
    const existing = await db.prepare("SELECT id FROM job_opportunities WHERE user_id = ? AND source_url = ? LIMIT 1")
      .bind(userId, role.sourceUrl).first<{ id: string }>();
    if (existing) {
      await db.prepare("UPDATE job_opportunities SET title = ?, location = ?, source_type = ?, fit_score = ?, fit_summary = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND user_id = ?")
        .bind(role.title, role.location, "v-watch", role.fitScore, role.fitSummary, existing.id, userId).run();
      updated += 1;
      continue;
    }
    let company = await db.prepare("SELECT id FROM companies WHERE lower(name) = lower(?) LIMIT 1")
      .bind(role.company).first<{ id: string }>();
    if (!company) {
      company = { id: crypto.randomUUID() };
      const classification = classifyRadarOpportunity(role);
      await db.prepare("INSERT INTO companies (id, name, company_type, primary_market, notes) VALUES (?, ?, ?, ?, ?)")
        .bind(company.id, role.company, classification.companyCategory, "United States", `Imported from ${JOB_WATCH_BATCH_ID}`).run();
    }
    await db.prepare("INSERT INTO job_opportunities (id, user_id, company_id, title, location, source_url, source_type, fit_score, fit_summary, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
      .bind(crypto.randomUUID(), userId, company.id, role.title, role.location, role.sourceUrl, "v-watch", role.fitScore, role.fitSummary, "new").run();
    added += 1;
  }
  return { batchId: JOB_WATCH_BATCH_ID, checked: JOB_WATCH_ROLES.length, added, updated };
}

export type RadarScanTrigger = "manual" | "catch_up" | "background";

const SCAN_TRIGGER_LABELS: Record<RadarScanTrigger, string> = {
  manual: "Manual scan",
  catch_up: "App-open catch-up scan",
  background: "Background scheduled scan",
};

/*
 * Import specific public job pages the user pointed V's at.
 *
 * This is the supported path for employers whose robots policy blocks
 * automated collection: the user opens the role themselves and hands V's the
 * job-details URL. Each URL is read once, on its own, with no crawling. The
 * result is scored against the saved radar profile exactly like a discovered
 * role and lands in the same inbox, tagged as imported.
 */
export async function importRadarOpportunities(db: D1Database, userId: string, urls: string[]) {
  const dashboard = await readRadarDashboard(db, userId);
  const unique = [...new Set(urls.map((url) => clean(url, 4_000)).filter(Boolean))].slice(0, 25);
  const imported: Array<{ url: string; title: string; company: string; score: number; status: "added" | "updated" }> = [];
  const failures: Array<{ url: string; message: string }> = [];

  for (const url of unique) {
    try {
      const job = await readSingleJobPosting(url);
      if (!isPlausibleRadarJob(job)) {
        failures.push({ url, message: "That page does not look like a single job posting. Open the specific role and copy its job-details link." });
        continue;
      }
      const companyName = job.company || companyFromUrl(url);
      let company = await db.prepare("SELECT id FROM companies WHERE lower(name) = lower(?) LIMIT 1").bind(companyName).first<{ id: string }>();
      if (!company) {
        company = { id: crypto.randomUUID() };
        const classification = classifyRadarOpportunity({ company: companyName, title: job.title, fitSummary: job.description });
        await db.prepare("INSERT INTO companies (id, name, company_type, primary_market, notes) VALUES (?, ?, ?, ?, ?)")
          .bind(company.id, companyName, classification.companyCategory, "United States", "Added from an imported job link").run();
      }
      const match = scoreRadarOpportunity(job, dashboard.profile);
      const existing = await db.prepare("SELECT id FROM job_opportunities WHERE user_id = ? AND source_url = ? LIMIT 1")
        .bind(userId, job.sourceUrl).first<{ id: string }>();
      if (existing) {
        await db.prepare("UPDATE job_opportunities SET company_id = ?, title = ?, location = ?, source_type = ?, fit_score = ?, fit_summary = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND user_id = ?")
          .bind(company.id, job.title, job.location || null, "imported", match.score, match.summary, existing.id, userId).run();
        imported.push({ url, title: job.title, company: companyName, score: match.score, status: "updated" });
        continue;
      }
      await db.prepare("INSERT INTO job_opportunities (id, user_id, company_id, title, location, source_url, source_type, fit_score, fit_summary, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
        .bind(crypto.randomUUID(), userId, company.id, job.title, job.location || null, job.sourceUrl, "imported", match.score, match.summary, "new").run();
      imported.push({ url, title: job.title, company: companyName, score: match.score, status: "added" });
    } catch (cause) {
      failures.push({ url, message: safeMessage(cause) });
    }
  }

  return { checked: unique.length, imported, failures };
}

/*
 * File saved jobs from the user's own official LinkedIn export.
 *
 * No page is fetched: LinkedIn forbids automated reading of job pages, and the
 * archive already carries the title, company, and link. The row is therefore
 * treated as the user's own record of a role, scored on the text they exported.
 */
export async function importLinkedInSavedJobs(
  db: D1Database,
  userId: string,
  rows: Array<{ title: string; company: string; url: string; savedAt?: string }>,
) {
  const dashboard = await readRadarDashboard(db, userId);
  let added = 0;
  let updated = 0;
  const skipped: string[] = [];

  for (const row of rows.slice(0, 200)) {
    const title = clean(row?.title, 240);
    const url = clean(row?.url, 4_000);
    if (!title || !/^https?:\/\//i.test(url)) { skipped.push(title || url || "unnamed row"); continue; }
    const companyName = clean(row?.company, 180) || "Saved on LinkedIn";
    let company = await db.prepare("SELECT id FROM companies WHERE lower(name) = lower(?) LIMIT 1").bind(companyName).first<{ id: string }>();
    if (!company) {
      company = { id: crypto.randomUUID() };
      const classification = classifyRadarOpportunity({ company: companyName, title });
      await db.prepare("INSERT INTO companies (id, name, company_type, primary_market, notes) VALUES (?, ?, ?, ?, ?)")
        .bind(company.id, companyName, classification.companyCategory, "United States", "Added from your LinkedIn saved jobs export").run();
    }
    // Only the exported title and company are available, so the score reflects
    // that limited text rather than a full description.
    const match = scoreRadarOpportunity({ title, company: companyName, location: "", description: "" }, dashboard.profile);
    const summary = `${match.summary} · Scored from your LinkedIn export's title and company only — open the role to review the full description.`;
    const existing = await db.prepare("SELECT id FROM job_opportunities WHERE user_id = ? AND source_url = ? LIMIT 1")
      .bind(userId, url).first<{ id: string }>();
    if (existing) {
      await db.prepare("UPDATE job_opportunities SET company_id = ?, title = ?, source_type = ?, fit_score = ?, fit_summary = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND user_id = ?")
        .bind(company.id, title, "linkedin-saved", match.score, summary, existing.id, userId).run();
      updated += 1;
      continue;
    }
    await db.prepare("INSERT INTO job_opportunities (id, user_id, company_id, title, location, source_url, source_type, fit_score, fit_summary, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
      .bind(crypto.randomUUID(), userId, company.id, title, null, url, "linkedin-saved", match.score, summary, "new").run();
    added += 1;
  }

  return { checked: rows.length, added, updated, skipped: skipped.slice(0, 10) };
}

function companyFromUrl(value: string) {
  try {
    const host = new URL(value).hostname.toLowerCase().replace(/^www\./, "").replace(/^(?:jobs|boards|job-boards|careers|apply)\./, "");
    const label = host.split(".")[0] || host;
    return label.charAt(0).toUpperCase() + label.slice(1);
  } catch {
    return "Imported role";
  }
}

export async function scanRadar(db: D1Database, userId: string, options: { monitorId?: string; dueOnly?: boolean; trigger?: RadarScanTrigger } = {}) {
  const triggerLabel = SCAN_TRIGGER_LABELS[options.trigger || "manual"];
  const dashboard = await readRadarDashboard(db, userId);
  const selected = dashboard.monitors
    .filter((monitor) => monitor.active)
    .filter((monitor) => !options.monitorId || monitor.id === options.monitorId)
    .filter((monitor) => !options.dueOnly || isMonitorDue(monitor))
    .slice(0, 20);
  let found = 0;
  let discovered = 0;
  let belowThreshold = 0;
  let added = 0;
  let matchedAdded = 0;
  let repairedSources = 0;
  const failures: Array<{ monitorId: string; company: string; message: string }> = [];

  for (const monitor of selected) {
    const runId = crypto.randomUUID();
    try {
      const searchFocus = [
        monitor.targetPosition,
        monitor.focus,
        ...dashboard.profile.titles,
      ].filter(Boolean).join(", ");
      const scanTarget = {
        company: monitor.company,
        careersUrl: monitor.careersUrl,
        websiteUrl: monitor.websiteUrl,
        referenceUrl: monitor.referenceUrl,
        focus: searchFocus,
        locations: dashboard.profile.locations.join(", "),
      };
      let discovery: Awaited<ReturnType<typeof discoverTargetJobsDetailed>> = { jobs: [], attempts: [], recommendedCareersUrl: "" };
      if (monitor.careersUrl || monitor.websiteUrl) {
        try {
          discovery = await discoverTargetJobsDetailed(scanTarget);
        } catch (cause) {
          discovery.attempts.push({
            url: monitor.careersUrl || monitor.websiteUrl,
            purpose: "direct-source-recovery",
            sourceType: "public-page",
            status: "failed",
            found: 0,
            message: safeMessage(cause),
          });
        }
      }
      if (!discovery.jobs.length) {
        const webSearch = await searchCompanyJobSources(scanTarget, {
          openAiKey: process.env.OPENAI_API_KEY,
          geminiKey: process.env.GEMINI_API_KEY,
        });
        discovery.attempts.push({
          url: "",
          purpose: "company-name-web-search",
          sourceType: webSearch.provider === "google" ? "gemini-google-search" : webSearch.provider === "openai" ? "openai-web-search" : "provider-web-search",
          status: webSearch.status === "completed" ? "completed" : "failed",
          found: webSearch.sources.length,
          message: webSearch.message,
        });
        if (webSearch.sources.length) {
          const citedDirectJobs = webSearch.sources.map((source) => ({
            title: source.title,
            company: monitor.company,
            location: "",
            description: "",
            sourceUrl: source.url,
            sourceType: webSearch.provider === "google" ? "gemini-google-search" : "openai-web-search",
            datePosted: "",
          })).filter(isPlausibleRadarJob);
          const directlyReadableSources = webSearch.sources
            .map((source) => source.url)
            .filter((sourceUrl) => !/\b(?:linkedin|indeed)\.com\b/i.test(sourceUrl));
          let webDiscovery: Awaited<ReturnType<typeof discoverTargetJobsDetailed>> = { jobs: [], attempts: [], recommendedCareersUrl: "" };
          if (directlyReadableSources.length) {
            try {
              webDiscovery = await discoverTargetJobsDetailed({
                ...scanTarget,
                careersUrl: "",
                websiteUrl: "",
                referenceUrl: "",
                searchUrls: directlyReadableSources,
              });
            } catch (cause) {
              discovery.attempts.push({
                url: "",
                purpose: "public-web-validation",
                sourceType: "provider-web-search",
                status: "failed",
                found: 0,
                message: safeMessage(cause),
              });
            }
          }
          discovery.attempts.push({
            url: "",
            purpose: "secondary-job-detail-recovery",
            sourceType: webSearch.provider === "google" ? "gemini-google-search" : "openai-web-search",
            status: citedDirectJobs.length ? "completed" : "failed",
            found: citedDirectJobs.length,
            message: citedDirectJobs.length
              ? `${citedDirectJobs.length} direct public job ${citedDirectJobs.length === 1 ? "lead was" : "leads were"} retained when the official search could not be indexed.`
              : "The public search results did not contain a valid direct job-detail URL.",
          });
          const combinedJobs = [...webDiscovery.jobs, ...citedDirectJobs]
            .filter((job, index, items) => items.findIndex((candidate) => candidate.sourceUrl === job.sourceUrl) === index);
          if (combinedJobs.length) {
            discovery = {
              jobs: combinedJobs,
              attempts: [...discovery.attempts, ...webDiscovery.attempts],
              recommendedCareersUrl: discovery.recommendedCareersUrl || webDiscovery.recommendedCareersUrl,
            };
          }
        }
      }
      if (!discovery.jobs.length) {
        const metaLimitation = discovery.attempts.find((attempt) => /Meta's published robots policy|does not permit automated job collection/i.test(attempt.message || ""));
        if (metaLimitation) throw new Error(metaLimitation.message || "Meta search does not permit automated job collection.");
      }
      const jobs = discovery.jobs;
      const focus = monitor.focus ? monitor.focus.split(/[,\n]/).map((item) => item.trim()).filter(Boolean) : [];
      const titles = monitor.targetPosition
        ? [monitor.targetPosition, ...dashboard.profile.titles.filter((title) => title !== monitor.targetPosition)]
        : dashboard.profile.titles;
      const profile = normalizeRadarProfile({ ...dashboard.profile, titles, skills: [...dashboard.profile.skills, ...focus] });
      const scored = jobs.map((job) => ({ job, match: scoreRadarOpportunity(job, profile) }))
        .sort((left, right) => right.match.score - left.match.score)
        .slice(0, 150);
      const matches = scored.filter(({ match }) => match.passes);
      let monitorAdded = 0;
      let monitorMatchedAdded = 0;
      found += matches.length;
      discovered += scored.length;
      belowThreshold += scored.length - matches.length;
      for (const { job, match } of scored) {
        const existing = await db.prepare("SELECT id FROM job_opportunities WHERE user_id = ? AND source_url = ? LIMIT 1")
          .bind(userId, job.sourceUrl).first<{ id: string }>();
        if (existing) {
          await db.prepare("UPDATE job_opportunities SET company_id = ?, title = ?, location = ?, source_type = ?, fit_score = ?, fit_summary = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND user_id = ?")
            .bind(monitor.companyId, job.title, job.location || null, job.sourceType || "public-careers-page", match.score, match.summary, existing.id, userId).run();
        } else {
          await db.prepare("INSERT INTO job_opportunities (id, user_id, company_id, title, location, source_url, source_type, fit_score, fit_summary, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
            .bind(crypto.randomUUID(), userId, monitor.companyId, job.title, job.location || null, job.sourceUrl, job.sourceType || "public-careers-page", match.score, match.summary, "new").run();
          added += 1;
          monitorAdded += 1;
          if (match.passes) {
            matchedAdded += 1;
            monitorMatchedAdded += 1;
          }
        }
      }
      const savedAttempt = discovery.attempts.find((attempt) => attempt.purpose === "saved-careers");
      const repairedSource = clean(discovery.recommendedCareersUrl, 4_000);
      const shouldRepairSource = Boolean(repairedSource)
        && canonicalUrl(repairedSource) !== canonicalUrl(monitor.careersUrl)
        && (!monitor.careersUrl || !savedAttempt || savedAttempt.status === "failed" || savedAttempt.found === 0);
      const repairStatement = shouldRepairSource
        ? db.prepare("UPDATE companies SET careers_url = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?")
          .bind(repairedSource, monitor.companyId)
        : null;
      if (shouldRepairSource) repairedSources += 1;
      const failedAttemptCount = discovery.attempts.filter((attempt) => attempt.status === "failed").length;
      const completedSources = discovery.attempts.filter((attempt) => attempt.status === "completed").map((attempt) => attempt.sourceType);
      const rejectedNavigationCount = discovery.attempts.reduce((total, attempt) => total + (attempt.rejected || 0), 0);
      const secondaryLeadCount = discovery.attempts
        .filter((attempt) => attempt.purpose === "secondary-job-detail-recovery" && attempt.status === "completed")
        .reduce((total, attempt) => total + attempt.found, 0);
      const sourceNote = shouldRepairSource
        ? "V’s repaired the saved source to a working official careers page."
        : failedAttemptCount
          ? `${failedAttemptCount} source fallback${failedAttemptCount === 1 ? "" : "s"} failed; another source still completed.`
          : "All attempted sources responded.";
      const sourceCoverage = completedSources.length
        ? `Working source${completedSources.length === 1 ? "" : "s"}: ${[...new Set(completedSources)].join(", ")}.${secondaryLeadCount ? ` ${secondaryLeadCount} direct public job ${secondaryLeadCount === 1 ? "lead was" : "leads were"} retained from a secondary board because the official search blocked indexing.` : ""}`
        : "No working public source was identified.";
      const zeroReason = scored.length
        ? ""
        : completedSources.length
          ? " Zero-result reason: the sources responded but contained no direct job-detail links matching the radar's role filters."
          : " Zero-result reason: no public source responded on this run.";
      const statements = [
        db.prepare("UPDATE company_monitors SET last_checked_at = CURRENT_TIMESTAMP WHERE id = ? AND user_id = ?").bind(monitor.id, userId),
        db.prepare("INSERT INTO monitor_runs (id, monitor_id, run_status, found_count, change_summary) VALUES (?, ?, ?, ?, ?)")
          .bind(runId, monitor.id, "completed", matches.length, `${triggerLabel} · ${jobs.length} verified roles read · ${matches.length} met the ${profile.minScore}% minimum · ${jobs.length - matches.length} saved below threshold · ${monitorAdded} new (${monitorMatchedAdded} matching) · ${discovery.attempts.length} source${discovery.attempts.length === 1 ? "" : "s"} tried${rejectedNavigationCount ? ` · ${rejectedNavigationCount} navigation/non-job ${rejectedNavigationCount === 1 ? "link" : "links"} excluded` : ""}. ${sourceCoverage} ${sourceNote}${zeroReason}`),
      ];
      if (repairStatement) statements.unshift(repairStatement);
      await db.batch(statements);
    } catch (cause) {
      const message = safeMessage(cause);
      const limited = isManualCoverageLimitation(message, monitor.careersUrl);
      if (!limited) failures.push({ monitorId: monitor.id, company: monitor.company, message });
      await db.batch([
        db.prepare("UPDATE company_monitors SET last_checked_at = CURRENT_TIMESTAMP WHERE id = ? AND user_id = ?").bind(monitor.id, userId),
        db.prepare("INSERT INTO monitor_runs (id, monitor_id, run_status, found_count, change_summary) VALUES (?, ?, ?, ?, ?)")
          .bind(
            runId,
            monitor.id,
            limited ? "limited" : "failed",
            0,
            limited
              ? `${triggerLabel} · Meta search does not permit automatic collection. Direct public Meta job pages and verified V’s suggestions still appear in the inbox; the monitored search URL remains saved as a reference.`
              : `${triggerLabel} · Source check failed after automatic careers-page recovery: ${message}`,
          ),
      ]);
    }
  }
  return { checked: selected.length, found, discovered, belowThreshold, added, matchedAdded, repairedSources, failures };
}

export async function scanAllDueRadars(db: D1Database) {
  const result = await db.prepare("SELECT DISTINCT user_id FROM company_monitors WHERE is_active = 1 AND cadence IN ('twice_daily', 'daily', 'weekly')").all<{ user_id: string }>();
  const summaries = [];
  for (const row of (result.results || []).slice(0, 500)) {
    summaries.push({ userId: row.user_id, ...(await scanRadar(db, row.user_id, { dueOnly: true, trigger: "background" })) });
  }
  return summaries;
}

function profileFromRow(row: ProfileRow | null): RadarProfile {
  if (!row) return normalizeRadarProfile({});
  const constraints = parseObject(row.constraints_json);
  return normalizeRadarProfile({
    titles: parseArray(row.target_roles_json),
    skills: Array.isArray(constraints.skills) ? constraints.skills : [],
    locations: parseArray(row.target_markets_json),
    workModes: Array.isArray(constraints.workModes) ? constraints.workModes : [],
    goals: row.positioning,
    exclusions: Array.isArray(constraints.exclusions) ? constraints.exclusions : [],
    minScore: typeof constraints.minScore === "number" ? constraints.minScore : undefined,
  });
}

function monitorFromRow(row: MonitorRow) {
  const query = parseObject(row.query);
  const cadence = row.cadence === "manual" ? "manual" : row.cadence === "daily" || row.cadence === "weekly" ? "daily" : "twice_daily";
  return {
    id: row.monitor_id,
    companyId: row.company_id,
    company: row.company_name,
    websiteUrl: row.website_url || "",
    careersUrl: row.careers_url || "",
    kind: row.company_type,
    market: row.primary_market || "Bay Area / U.S.",
    notes: row.notes || "",
    focus: typeof query.focus === "string" ? query.focus : "",
    targetPosition: typeof query.targetPosition === "string" ? query.targetPosition : "",
    referenceUrl: typeof query.referenceUrl === "string" ? query.referenceUrl : "",
    sourceKind: typeof query.sourceKind === "string" ? query.sourceKind : "",
    cadence,
    active: Boolean(row.is_active),
    lastCheckedAt: row.last_checked_at,
    nextDueAt: monitorNextDueAt({ cadence, lastCheckedAt: row.last_checked_at }),
    due: Boolean(row.is_active) && isMonitorDue({ cadence, lastCheckedAt: row.last_checked_at }),
    createdAt: row.created_at,
    lastRunStatus: row.last_run_status || null,
    lastRunFoundCount: typeof row.last_run_found_count === "number" ? row.last_run_found_count : null,
    lastRunSummary: row.last_run_summary || "",
    lastRunAt: row.last_run_at || null,
  };
}

function isManualCoverageLimitation(message: string, careersUrl: string) {
  if (/Meta's published robots policy|does not permit automated job collection/i.test(message)) return true;
  try {
    return detectCareerSource(careersUrl).type === "meta-search";
  } catch {
    return false;
  }
}

// SQLite CURRENT_TIMESTAMP is UTC but has no zone marker, so Date would parse
// it in the runtime's local zone; pin it to UTC explicitly.
function utcTimestampMs(value: string) {
  const normalized = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(value) ? `${value.replace(" ", "T")}Z` : value;
  return new Date(normalized).getTime();
}

// Null means "no schedule" (manual) or "due immediately" (never checked); the
// dashboard's `due` flag distinguishes the two.
export function monitorNextDueAt(monitor: { cadence: string; lastCheckedAt: string | null }) {
  if (monitor.cadence !== "twice_daily" && monitor.cadence !== "daily" && monitor.cadence !== "weekly") return null;
  if (!monitor.lastCheckedAt) return null;
  const checked = utcTimestampMs(monitor.lastCheckedAt);
  if (!Number.isFinite(checked)) return null;
  const interval = monitor.cadence === "twice_daily" ? 12 * 60 * 60 * 1_000 : 24 * 60 * 60 * 1_000;
  return new Date(checked + interval).toISOString();
}

export function isMonitorDue(monitor: { cadence: string; lastCheckedAt: string | null }) {
  if (monitor.cadence === "manual") return false;
  if (monitor.cadence !== "twice_daily" && monitor.cadence !== "daily" && monitor.cadence !== "weekly") return false;
  if (!monitor.lastCheckedAt) return true;
  const checked = utcTimestampMs(monitor.lastCheckedAt);
  const interval = monitor.cadence === "twice_daily" ? 12 * 60 * 60 * 1_000 : 24 * 60 * 60 * 1_000;
  return !Number.isFinite(checked) || Date.now() - checked >= interval;
}

async function ownedMonitor(db: D1Database, userId: string, monitorId: string) {
  return db.prepare("SELECT id, query, cadence, is_active FROM company_monitors WHERE id = ? AND user_id = ? LIMIT 1")
    .bind(monitorId, userId).first<{ id: string; query: string; cadence: string; is_active: number }>();
}

function parseObject(value: string | null | undefined): Record<string, unknown> {
  try {
    const parsed = JSON.parse(value || "{}");
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function parseArray(value: string | null | undefined): string[] {
  try {
    const parsed = JSON.parse(value || "[]");
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
}

function normalizeOpportunityStatus(value: string) {
  return ["new", "reviewing", "shortlisted", "dismissed", "applied", "archived"].includes(value) ? value : "new";
}

function clean(value: unknown, limit: number) {
  return String(value || "").replace(/\s+/g, " ").trim().slice(0, limit);
}

function safeMessage(value: unknown) {
  return (value instanceof Error ? value.message : "The careers page could not be scanned.")
    .replace(/https?:\/\/\S+/gi, "[url]")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 500);
}

function canonicalUrl(value: unknown) {
  try {
    const url = new URL(String(value || ""));
    url.hash = "";
    return url.href.replace(/\/$/, "").toLowerCase();
  } catch {
    return "";
  }
}
