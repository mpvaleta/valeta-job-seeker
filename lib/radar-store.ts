import { discoverTargetJobs, normalizeRadarProfile, scoreRadarOpportunity } from "./radar.mjs";
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
};
type OpportunityRow = {
  id: string;
  company_id: string | null;
  company_name: string | null;
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
  market?: string;
  cadence?: "daily" | "manual";
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
    db.prepare(`SELECT m.id AS monitor_id, m.company_id, c.name AS company_name, c.website_url, c.careers_url, c.company_type, c.primary_market, c.notes, m.query, m.cadence, m.is_active, m.last_checked_at, m.created_at
      FROM company_monitors m JOIN companies c ON c.id = m.company_id
      WHERE m.user_id = ? ORDER BY m.is_active DESC, c.name ASC`).bind(userId).all<MonitorRow>(),
    db.prepare(`SELECT o.id, o.company_id, c.name AS company_name, o.title, o.location, o.source_url, o.source_type, o.fit_score, o.fit_summary, o.status, o.discovered_at, o.updated_at
      FROM job_opportunities o LEFT JOIN companies c ON c.id = o.company_id
      WHERE o.user_id = ? ORDER BY o.discovered_at DESC, o.fit_score DESC LIMIT 300`).bind(userId).all<OpportunityRow>(),
  ]);
  const profile = profileFromRow(profileRow);
  const monitors = (monitorResult.results || []).map(monitorFromRow);
  const opportunities = (opportunityResult.results || []).map((row) => ({
    id: row.id,
    companyId: row.company_id,
    company: row.company_name || "Unknown company",
    title: row.title,
    location: row.location || "Location not listed",
    sourceUrl: row.source_url || "",
    sourceType: row.source_type,
    fitScore: row.fit_score ?? 0,
    fitSummary: row.fit_summary || "No fit summary available.",
    status: normalizeOpportunityStatus(row.status),
    discoveredAt: row.discovered_at,
    updatedAt: row.updated_at,
  }));
  return {
    profile,
    monitors,
    opportunities,
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
  if (!careersUrl && !websiteUrl) throw new Error("Add the company website or the public careers page you want V’s to monitor.");
  const companyId = crypto.randomUUID();
  const monitorId = crypto.randomUUID();
  const query = JSON.stringify({
    focus: clean(input.focus, 1_000),
    referenceUrl: clean(input.referenceUrl, 4_000),
    sourceKind: clean(input.sourceKind, 80),
  });
  await db.batch([
    db.prepare("INSERT INTO companies (id, name, website_url, careers_url, company_type, primary_market, notes) VALUES (?, ?, ?, ?, ?, ?, ?)")
      .bind(companyId, company, websiteUrl || null, careersUrl || null, clean(input.kind, 80) || "Company", clean(input.market, 180) || "Bay Area / U.S.", "Added to V’s daily radar"),
    db.prepare("INSERT INTO company_monitors (id, user_id, company_id, query, cadence, is_active) VALUES (?, ?, ?, ?, ?, ?)")
      .bind(monitorId, userId, companyId, query, input.cadence === "manual" ? "manual" : "daily", 1),
  ]);
  return monitorId;
}

export async function updateRadarMonitor(db: D1Database, userId: string, monitorId: string, patch: { active?: boolean; cadence?: string; focus?: string }) {
  const current = await ownedMonitor(db, userId, monitorId);
  if (!current) throw new Error("That radar target could not be found.");
  const query = parseObject(current.query);
  if (patch.focus != null) query.focus = clean(patch.focus, 1_000);
  const cadence = patch.cadence === "manual" ? "manual" : patch.cadence === "daily" || patch.cadence === "weekly" ? "daily" : current.cadence;
  const active = patch.active == null ? Boolean(current.is_active) : Boolean(patch.active);
  await db.prepare("UPDATE company_monitors SET query = ?, cadence = ?, is_active = ? WHERE id = ? AND user_id = ?")
    .bind(JSON.stringify(query), cadence, active ? 1 : 0, monitorId, userId).run();
}

export async function deleteRadarMonitor(db: D1Database, userId: string, monitorId: string) {
  await db.prepare("DELETE FROM company_monitors WHERE id = ? AND user_id = ?").bind(monitorId, userId).run();
}

export async function setRadarOpportunityStatus(db: D1Database, userId: string, opportunityId: string, status: string) {
  const normalized = normalizeOpportunityStatus(status);
  await db.prepare("UPDATE job_opportunities SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND user_id = ?")
    .bind(normalized, opportunityId, userId).run();
  return normalized;
}

export async function scanRadar(db: D1Database, userId: string, options: { monitorId?: string; dueOnly?: boolean } = {}) {
  const dashboard = await readRadarDashboard(db, userId);
  const selected = dashboard.monitors
    .filter((monitor) => monitor.active)
    .filter((monitor) => !options.monitorId || monitor.id === options.monitorId)
    .filter((monitor) => !options.dueOnly || isMonitorDue(monitor))
    .slice(0, 20);
  let found = 0;
  let added = 0;
  const failures: Array<{ monitorId: string; company: string; message: string }> = [];

  for (const monitor of selected) {
    const runId = crypto.randomUUID();
    try {
      const jobs = await discoverTargetJobs({ company: monitor.company, careersUrl: monitor.careersUrl, websiteUrl: monitor.websiteUrl });
      const focus = monitor.focus ? monitor.focus.split(/[,\n]/).map((item) => item.trim()).filter(Boolean) : [];
      const profile = normalizeRadarProfile({ ...dashboard.profile, skills: [...dashboard.profile.skills, ...focus] });
      const matches = jobs.map((job) => ({ job, match: scoreRadarOpportunity(job, profile) }))
        .filter(({ match }) => match.passes)
        .sort((left, right) => right.match.score - left.match.score)
        .slice(0, 100);
      let monitorAdded = 0;
      found += matches.length;
      for (const { job, match } of matches) {
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
        }
      }
      await db.batch([
        db.prepare("UPDATE company_monitors SET last_checked_at = CURRENT_TIMESTAMP WHERE id = ? AND user_id = ?").bind(monitor.id, userId),
        db.prepare("INSERT INTO monitor_runs (id, monitor_id, run_status, found_count, change_summary) VALUES (?, ?, ?, ?, ?)")
          .bind(runId, monitor.id, "completed", matches.length, `${matches.length} matching roles found; ${monitorAdded} new roles added for this target.`),
      ]);
    } catch (cause) {
      const message = safeMessage(cause);
      failures.push({ monitorId: monitor.id, company: monitor.company, message });
      await db.prepare("INSERT INTO monitor_runs (id, monitor_id, run_status, found_count, change_summary) VALUES (?, ?, ?, ?, ?)")
        .bind(runId, monitor.id, "failed", 0, message).run();
    }
  }
  return { checked: selected.length, found, added, failures };
}

export async function scanAllDueRadars(db: D1Database) {
  const result = await db.prepare("SELECT DISTINCT user_id FROM company_monitors WHERE is_active = 1 AND cadence IN ('daily', 'weekly')").all<{ user_id: string }>();
  const summaries = [];
  for (const row of (result.results || []).slice(0, 500)) {
    summaries.push({ userId: row.user_id, ...(await scanRadar(db, row.user_id, { dueOnly: true })) });
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
    referenceUrl: typeof query.referenceUrl === "string" ? query.referenceUrl : "",
    sourceKind: typeof query.sourceKind === "string" ? query.sourceKind : "",
    cadence: row.cadence === "manual" ? "manual" : "daily",
    active: Boolean(row.is_active),
    lastCheckedAt: row.last_checked_at,
    createdAt: row.created_at,
  };
}

export function isMonitorDue(monitor: { cadence: string; lastCheckedAt: string | null }) {
  if (monitor.cadence === "manual") return false;
  if (monitor.cadence !== "daily" && monitor.cadence !== "weekly") return false;
  if (!monitor.lastCheckedAt) return true;
  const checked = new Date(monitor.lastCheckedAt).getTime();
  return !Number.isFinite(checked) || Date.now() - checked >= 24 * 60 * 60 * 1_000;
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
  return ["new", "reviewing", "shortlisted", "dismissed", "applied"].includes(value) ? value : "new";
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
