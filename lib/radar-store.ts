import { DISCOVERY_JOB_CAP, classifyRadarOpportunity, deriveClosedListingSignal, deriveDismissalSignal, detectCareerSource, discoverTargetJobsDetailed, isPlausibleRadarJob, normalizeRadarProfile, opportunityContentKey, opportunityKey, readSingleJobPosting, scoreRadarOpportunity, titleRelevance } from "./radar.mjs";
import { searchCompanyJobSources } from "./radar-web-search.mjs";
import { JOB_WATCH_BATCH_ID, JOB_WATCH_ROLES } from "./job-watch-batch";
import { DEFAULT_RADAR_MONITORS } from "./default-radar-monitors";
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
  last_seen_at: string | null;
  last_listing_read_at: string | null;
  dismissed_reason: string | null;
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

// Source types that come from reading a company's complete public board
// (Greenhouse / Lever / Ashby / SmartRecruiters APIs). Only these support the
// "no longer listed" inference below: absence from a *complete* successful
// listing read means the posting is gone, while absence from a partial page
// scrape or a web-search lead means nothing at all.
const COMPLETE_LISTING_SOURCES = new Set(["greenhouse", "lever", "ashby", "smartrecruiters"]);

// Adds the listing-freshness columns to databases created before they
// existed. Runs at most once per database handle, tolerates the columns
// already being there, and never requires a manual migration step — the
// bootstrap workflow re-applies every migration file and fails loudly on
// re-runs, so shipping this as a migration would have made deploying this
// feature a hand-run operation.
const listingColumnsEnsured = new WeakSet<D1Database>();
async function ensureListingColumns(db: D1Database) {
  if (listingColumnsEnsured.has(db)) return;
  for (const statement of [
    "ALTER TABLE job_opportunities ADD COLUMN last_seen_at text",
    "ALTER TABLE companies ADD COLUMN last_listing_read_at text",
    // Why a dismissal happened, not just that it did. "not_relevant" teaches
    // the scorer to rank similar roles lower and "listing_closed" teaches it to
    // rank them higher; "already_applied" is recorded and deliberately inert.
    "ALTER TABLE job_opportunities ADD COLUMN dismissed_reason text",
  ]) {
    try {
      await db.prepare(statement).run();
    } catch (cause) {
      if (!/duplicate column/i.test(safeMessage(cause))) throw cause;
    }
  }
  listingColumnsEnsured.add(db);
}

export async function readRadarDashboard(db: D1Database, userId: string) {
  await ensureListingColumns(db);
  const [profileRow, monitorResult, opportunityResult, opportunityCountRow, decisionHistory] = await Promise.all([
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
    // Newest 600 travel to the browser; the true total rides alongside so the
    // inbox can say "newest 600 of N" instead of silently plateauing at the cap
    // (the old hard 300 made the radar look frozen once the inbox filled up).
    db.prepare(`SELECT o.id, o.company_id, c.name AS company_name, c.company_type, o.title, o.location, o.source_url, o.source_type, o.fit_score, o.fit_summary, o.status, o.discovered_at, o.updated_at, o.last_seen_at, o.dismissed_reason, c.last_listing_read_at
      FROM job_opportunities o LEFT JOIN companies c ON c.id = o.company_id
      WHERE o.user_id = ? ORDER BY o.discovered_at DESC, o.fit_score DESC LIMIT 600`).bind(userId).all<OpportunityRow>(),
    db.prepare("SELECT COUNT(*) AS count FROM job_opportunities WHERE user_id = ?").bind(userId).first<{ count: number }>(),
    // What the scorer has learned so far, so the app can show it instead of
    // leaving the user to guess whether marking roles changes anything.
    readDismissalHistory(db, userId),
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
    // Sniffed from the stored summary rather than a stored boolean, same as
    // everywhere else in this function -- lets a live minScore change
    // re-evaluate old rows without a rescan. Must cover every hard-fail
    // scoreRadarOpportunity can produce, not just plain exclusions: a
    // startups-only mismatch caps score at 20, and the minScore slider goes
    // as low as 20, so missing this here would show a filtered-out role as
    // passing right at that boundary. The location gate caps at 24 for the
    // same reason and has to be listed here too.
    // The role gate is re-applied here, against the title, rather than being
    // read back out of the stored summary. Two reasons: rows scored before the
    // gate existed carry a summary that cannot mention it — and those are
    // exactly the rows flooding the inbox — and re-deriving it means editing a
    // target title re-sorts the whole inbox immediately, with no rescan.
    const offTargetRole = titleRelevance(row.title, profile.titles, profile.skills).tier === "none";
    const exclusionHit = offTargetRole || /review exclusion:|startups-only filter|location filter|role filter/i.test(row.fit_summary || "");
    const monitor = row.company_id ? monitorByCompanyId.get(row.company_id) : undefined;
    const origin = row.source_type === "v-watch" ? "v-watch"
      : row.source_type === "imported" ? "imported"
      : row.source_type === "captured" ? "captured"
      : row.source_type === "linkedin-saved" ? "linkedin-saved"
      : "monitored";
    // The posting came from a complete board read, the board has since been
    // read completely again, and the posting was not in that newer read — the
    // employer has most likely closed or unlisted it. Postings refreshed
    // during the same read carry a last_seen_at at or after the read's start
    // stamp, so strict less-than never flags what the read just confirmed.
    const listingLost = origin === "monitored"
      && COMPLETE_LISTING_SOURCES.has(row.source_type)
      && Boolean(row.last_listing_read_at)
      && (row.last_seen_at || "") < (row.last_listing_read_at || "");
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
      importedByUser: origin === "imported" || origin === "linkedin-saved" || origin === "captured",
      fitScore,
      fitSummary: row.fit_summary || "No fit summary available.",
      alignmentPasses: fitScore >= profile.minScore && !exclusionHit,
      exclusionHit,
      offTargetRole,
      status: normalizeOpportunityStatus(row.status),
      discoveredAt: row.discovered_at,
      updatedAt: row.updated_at,
      lastSeenAt: row.last_seen_at,
      listingLost,
      // Only meaningful while the row is dismissed; the store clears it on any
      // other status change.
      dismissedReason: row.dismissed_reason || null,
    };
  });
  const dismissalSignal = deriveDismissalSignal(decisionHistory, profile);
  const closedSignal = deriveClosedListingSignal(decisionHistory, profile);
  return {
    profile,
    monitors,
    opportunities,
    learning: {
      dismissal: { ready: dismissalSignal.ready, words: dismissalSignal.words, categories: dismissalSignal.categories, reason: dismissalSignal.reason },
      closed: { ready: closedSignal.ready, words: closedSignal.words, companies: closedSignal.companies, reason: closedSignal.reason },
    },
    opportunityTotal: Number(opportunityCountRow?.count || 0),
    excludedNavigationCount: opportunityRows.length - visibleOpportunityRows.length,
    dueCount: monitors.filter((monitor) => monitor.active && isMonitorDue(monitor)).length,
    lastRunAt: monitors.map((monitor) => monitor.lastCheckedAt).filter(Boolean).sort().reverse()[0] || null,
  };
}

// Clears discoveries the role gate now rejects out of the inbox.
//
// Rows collected before the gate existed keep their old, inflated score, and
// there can be thousands of them. Read-time re-derivation already stops them
// counting as matches, but the owner still has to scroll past them.
//
// They are archived, not deleted. Archiving empties the inbox exactly as well,
// and it is reversible: the gate is only as good as the titles the owner
// thought to write down, so a role cleared today can turn out to have been
// wanted once a target title is added — and "Restore" brings it back. A DELETE
// was the one action in this app that destroyed the owner's data outright, with
// no undo and no revision history behind it.
//
// Only untouched rows go. Anything shortlisted, archived or dismissed carries a
// decision the owner made, and a dismissal is also what the radar learns from.
export async function purgeOffTargetOpportunities(db: D1Database, userId: string) {
  const profileRow = await db.prepare("SELECT * FROM career_profiles WHERE user_id = ? ORDER BY updated_at DESC LIMIT 1").bind(userId).first<ProfileRow>();
  const profile = profileFromRow(profileRow);
  const rows = await db.prepare("SELECT id, title FROM job_opportunities WHERE user_id = ? AND status IN ('new', 'reviewing')").bind(userId).all<{ id: string; title: string }>();
  const offTarget = (rows.results || [])
    .filter((row) => titleRelevance(row.title, profile.titles, profile.skills).tier === "none")
    .map((row) => row.id);
  // D1 caps how many parameters one statement takes, so this goes out in
  // batches rather than as a single enormous IN list.
  for (let index = 0; index < offTarget.length; index += 90) {
    const chunk = offTarget.slice(index, index + 90);
    await db.prepare(`UPDATE job_opportunities SET status = 'archived', updated_at = CURRENT_TIMESTAMP WHERE user_id = ? AND id IN (${chunk.map(() => "?").join(", ")})`).bind(userId, ...chunk).run();
  }
  return { archived: offTarget.length, kept: (rows.results || []).length - offTarget.length };
}

export async function saveRadarProfile(db: D1Database, userId: string, value: Partial<RadarProfile>) {
  const profile = normalizeRadarProfile(value);
  const existing = await db.prepare("SELECT id FROM career_profiles WHERE user_id = ? ORDER BY updated_at DESC LIMIT 1").bind(userId).first<{ id: string }>();
  const constraints = JSON.stringify({ skills: profile.skills, workModes: profile.workModes, exclusions: profile.exclusions, minScore: profile.minScore, companyStagePreference: profile.companyStagePreference, locationPolicy: profile.locationPolicy });
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

// Seed a curated pack of monitors so the real scan engine (direct board
// scraping, with an AI web-search fallback when no board URL is known) has
// something to run against. Skips any company the user already monitors, so
// packs are safe to apply repeatedly — they only ever fill gaps, never
// duplicate or override.
type MonitorPackEntry = { readonly company: string; readonly kind: string; readonly careersUrl: string; readonly websiteUrl: string; readonly focus: string };

export async function seedRadarMonitorPack(db: D1Database, userId: string, pack: readonly MonitorPackEntry[]) {
  const existing = await db.prepare(
    "SELECT c.name AS name FROM company_monitors m JOIN companies c ON c.id = m.company_id WHERE m.user_id = ?"
  ).bind(userId).all<{ name: string }>();
  const existingNames = new Set((existing.results || []).map((row) => row.name.trim().toLowerCase()));
  let added = 0;
  for (const monitor of pack) {
    if (existingNames.has(monitor.company.toLowerCase())) continue;
    await addRadarMonitor(db, userId, {
      company: monitor.company,
      kind: monitor.kind,
      careersUrl: monitor.careersUrl,
      websiteUrl: monitor.websiteUrl,
      focus: monitor.focus,
      cadence: "twice_daily",
    });
    added += 1;
  }
  return { added, skipped: pack.length - added };
}

export async function seedDefaultRadarMonitors(db: D1Database, userId: string) {
  return seedRadarMonitorPack(db, userId, DEFAULT_RADAR_MONITORS);
}

export async function updateRadarMonitor(db: D1Database, userId: string, monitorId: string, patch: { active?: boolean; cadence?: string; focus?: string; targetPosition?: string; contactEmail?: string; contactNote?: string }) {
  const current = await ownedMonitor(db, userId, monitorId);
  if (!current) throw new Error("That radar target could not be found.");
  const query = parseObject(current.query);
  if (patch.focus != null) query.focus = clean(patch.focus, 1_000);
  if (patch.targetPosition != null) query.targetPosition = clean(patch.targetPosition, 180);
  // Contact details the user supplies themselves. A survey of these agencies
  // found that essentially none publish a careers or HR address, so there is
  // nothing to look up automatically — this is a place to record a contact the
  // user already has, from their own network or an application they sent.
  // Stored in the existing query JSON, so no migration is needed.
  if (patch.contactEmail != null) query.contactEmail = normalizeContactEmail(patch.contactEmail);
  if (patch.contactNote != null) query.contactNote = clean(patch.contactNote, 400);
  const cadence = patch.cadence === "manual" ? "manual" : patch.cadence === "twice_daily" ? "twice_daily" : patch.cadence === "daily" || patch.cadence === "weekly" ? "daily" : current.cadence;
  const active = patch.active == null ? Boolean(current.is_active) : Boolean(patch.active);
  await db.prepare("UPDATE company_monitors SET query = ?, cadence = ?, is_active = ? WHERE id = ? AND user_id = ?")
    .bind(JSON.stringify(query), cadence, active ? 1 : 0, monitorId, userId).run();
}

export async function deleteRadarMonitor(db: D1Database, userId: string, monitorId: string) {
  await db.prepare("UPDATE company_monitors SET is_active = 0 WHERE id = ? AND user_id = ?").bind(monitorId, userId).run();
}

export async function setRadarOpportunityStatus(db: D1Database, userId: string, opportunityId: string, status: string, reason?: string) {
  await ensureListingColumns(db);
  const normalized = normalizeOpportunityStatus(status);
  // A reason only means anything on a dismissal. Restoring a role, or moving it
  // anywhere else, clears the stored reason so a role the user changed their
  // mind about stops teaching the scorer.
  const normalizedReason = normalized === "dismissed" ? normalizeDismissalReason(reason) : null;
  await db.prepare("UPDATE job_opportunities SET status = ?, dismissed_reason = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND user_id = ?")
    .bind(normalized, normalizedReason, opportunityId, userId).run();
  return normalized;
}

/*
 * The same decision on many rows at once.
 *
 * Working an inbox of two hundred roles one button at a time is the reason
 * most of them never got a decision at all. This is the same write as the
 * single-row version, batched: one request instead of two hundred, and the
 * reason is recorded on every row so bulk decisions teach the scorer exactly
 * as individual ones do.
 */
export async function setRadarOpportunityStatusBulk(db: D1Database, userId: string, opportunityIds: string[], status: string, reason?: string) {
  await ensureListingColumns(db);
  const normalized = normalizeOpportunityStatus(status);
  const normalizedReason = normalized === "dismissed" ? normalizeDismissalReason(reason) : null;
  const ids = [...new Set(opportunityIds.map((id) => clean(id, 100)).filter(Boolean))].slice(0, 200);
  let updated = 0;
  // D1 caps how many parameters one statement takes, so this goes out in
  // batches rather than as a single enormous IN list.
  for (let cursor = 0; cursor < ids.length; cursor += 80) {
    const chunk = ids.slice(cursor, cursor + 80);
    const result = await db.prepare(`UPDATE job_opportunities SET status = ?, dismissed_reason = ?, updated_at = CURRENT_TIMESTAMP
      WHERE user_id = ? AND id IN (${chunk.map(() => "?").join(", ")})`)
      .bind(normalized, normalizedReason, userId, ...chunk).run();
    updated += Number(result.meta?.changes ?? chunk.length);
  }
  return { status: normalized, reason: normalizedReason, updated };
}

/*
 * Reading back what the user has rejected.
 *
 * Capped well above the sample the learner needs, and ordered newest first, so
 * a long-running inbox teaches from recent taste rather than from whatever was
 * dismissed a year ago.
 */
export async function readDismissalHistory(db: D1Database, userId: string) {
  await ensureListingColumns(db);
  const result = await db.prepare(`SELECT o.title, o.dismissed_reason, o.fit_summary, c.name AS company_name, c.company_type
    FROM job_opportunities o LEFT JOIN companies c ON c.id = o.company_id
    WHERE o.user_id = ? AND o.status = 'dismissed' AND o.dismissed_reason IS NOT NULL
    ORDER BY o.updated_at DESC LIMIT 200`)
    .bind(userId).all<{ title: string; dismissed_reason: string; fit_summary: string | null; company_name: string | null; company_type: string | null }>();
  return (result.results || []).map((row) => ({
    title: row.title,
    reason: row.dismissed_reason,
    company: row.company_name || "",
    companyCategory: classifyRadarOpportunity({
      company: row.company_name || "",
      title: row.title,
      fitSummary: row.fit_summary || "",
    }, { kind: row.company_type || "" }).companyCategory,
  }));
}

/*
 * Index the user's existing discoveries by canonical job identity.
 *
 * Every dedup check used to compare the raw source_url as an exact string, so
 * the same posting reached by a slightly different link became a second inbox
 * row. Matching happens in application code because job_opportunities has no
 * unique constraint to lean on and adding one would need a migration the
 * deployment path does not control.
 */
/*
 * Every identity a stored posting answers to.
 *
 * The canonical URL is the primary one. The content key is the safety net for
 * the same job published under two unrelated URLs — a company careers page and
 * a board, say — which URL canonicalization alone can never catch.
 */
function opportunityIdentities(row: { source_url: string | null; title?: string | null; company_name?: string | null; location?: string | null }) {
  return [
    opportunityKey(row.source_url || ""),
    opportunityContentKey({ company: row.company_name || "", title: row.title || "", location: row.location || "" }),
  ].filter(Boolean);
}

async function loadOpportunityIndex(db: D1Database, userId: string) {
  const rows = await db.prepare(`SELECT o.id, o.source_url, o.status, o.discovered_at, o.title, o.location, c.name AS company_name
    FROM job_opportunities o LEFT JOIN companies c ON c.id = o.company_id WHERE o.user_id = ?`)
    .bind(userId).all<{ id: string; source_url: string | null; status: string; discovered_at: string; title: string; location: string | null; company_name: string | null }>();
  const index = new Map<string, { id: string; status: string; discovered_at: string }>();
  for (const row of rows.results || []) {
    for (const key of opportunityIdentities(row)) {
      const current = index.get(key);
      // Keep the earliest row so a merge preserves the original discovery date.
      if (!current || String(row.discovered_at) < String(current.discovered_at)) {
        index.set(key, { id: row.id, status: row.status, discovered_at: row.discovered_at });
      }
    }
  }
  return index;
}

/*
 * Collapse duplicate rows an earlier build already created.
 *
 * Matching on the canonical key stops NEW duplicates, but rows recorded before
 * that fix stay in the inbox. This repairs them: the earliest row survives so
 * the original discovery date is kept, and the user's own decision is carried
 * across — their most recent explicit status wins, so a role they shortlisted
 * or applied to never reverts to "new" because a later copy was untouched.
 */
export async function mergeDuplicateOpportunities(db: D1Database, userId: string) {
  const rows = await db.prepare(`SELECT o.id, o.source_url, o.status, o.discovered_at, o.updated_at, o.title, o.location, c.name AS company_name
    FROM job_opportunities o LEFT JOIN companies c ON c.id = o.company_id
    WHERE o.user_id = ? ORDER BY o.discovered_at ASC, o.rowid ASC`)
    .bind(userId).all<{ id: string; source_url: string | null; status: string; discovered_at: string; updated_at: string; title: string; location: string | null; company_name: string | null }>();

  const groups = new Map<string, Array<{ id: string; status: string; updated_at: string }>>();
  // A row joins the group of whichever of its identities was claimed first, so
  // three copies under two URLs and one shared title collapse into one group
  // rather than two.
  const groupOfKey = new Map<string, string>();
  for (const row of rows.results || []) {
    const keys = opportunityIdentities(row);
    if (!keys.length) continue;
    const groupKey = keys.map((key) => groupOfKey.get(key)).find(Boolean) || keys[0];
    for (const key of keys) if (!groupOfKey.has(key)) groupOfKey.set(key, groupKey);
    const group = groups.get(groupKey);
    if (group) group.push(row); else groups.set(groupKey, [row]);
  }

  let merged = 0;
  for (const group of groups.values()) {
    if (group.length < 2) continue;
    const [survivor, ...redundant] = group;
    // The latest decision the user actually made, ignoring untouched rows.
    const decided = group
      .filter((row) => normalizeOpportunityStatus(row.status) !== "new")
      .sort((left, right) => String(right.updated_at).localeCompare(String(left.updated_at)))[0];
    const status = decided ? normalizeOpportunityStatus(decided.status) : normalizeOpportunityStatus(survivor.status);
    if (status !== normalizeOpportunityStatus(survivor.status)) {
      await db.prepare("UPDATE job_opportunities SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND user_id = ?")
        .bind(status, survivor.id, userId).run();
    }
    for (const row of redundant) {
      await db.prepare("DELETE FROM job_opportunities WHERE id = ? AND user_id = ?").bind(row.id, userId).run();
      merged += 1;
    }
  }
  return merged;
}

function rememberOpportunity(
  index: Map<string, { id: string; status: string; discovered_at: string }>,
  url: string,
  id: string,
  job: { company?: string; title?: string; location?: string } = {},
) {
  // Both identities are registered, so a second copy arriving later in the
  // same run under a different URL is recognized before it is inserted.
  for (const key of [opportunityKey(url), opportunityContentKey(job)]) {
    if (key && !index.has(key)) index.set(key, { id, status: "new", discovered_at: "" });
  }
}

export async function importJobWatchBatch(db: D1Database, userId: string) {
  let added = 0;
  let updated = 0;
  // Once the hand-verified batch has aged past its shelf life, its roles are no
  // longer credible as open postings, so it stops seeding the inbox instead of
  // filing month-old listings as fresh discoveries.
  if (isWatchBatchStale()) {
    const staleExpired = await expireStaleWatchBatch(db, userId);
    return { batchId: JOB_WATCH_BATCH_ID, checked: 0, added, updated, expired: staleExpired, stale: true };
  }
  const index = await loadOpportunityIndex(db, userId);
  for (const role of JOB_WATCH_ROLES) {
    const existing = index.get(opportunityKey(role.sourceUrl));
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
    const watchId = crypto.randomUUID();
    await db.prepare("INSERT INTO job_opportunities (id, user_id, company_id, title, location, source_url, source_type, fit_score, fit_summary, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
      .bind(watchId, userId, company.id, role.title, role.location, role.sourceUrl, "v-watch", role.fitScore, role.fitSummary, "new").run();
    // Register immediately: one run can surface the same role by two links.
    rememberOpportunity(index, role.sourceUrl, watchId);
    added += 1;
  }
  return { batchId: JOB_WATCH_BATCH_ID, checked: JOB_WATCH_ROLES.length, added, updated };
}

/*
 * Retiring postings that no longer exist.
 *
 * Employer-board delisting is handled non-destructively: last_seen_at on the
 * row and last_listing_read_at on the company together derive a "no longer on
 * the company board" badge at read time, without mutating status. That is
 * strictly safer than flipping status, because a truncated or failed read can
 * make a live role look absent, and a status write would then bury a role the
 * user had already shortlisted.
 *
 * The one case the badge cannot cover is the V's Job Watch batch: a
 * hand-verified snapshot with no live source to re-read, so absence can never
 * be observed for it. That batch ages out on the calendar instead.
 */
const WATCH_BATCH_SHELF_LIFE_DAYS = 45;

export function isWatchBatchStale(now = Date.now()) {
  const verifiedAt = Date.parse(`${JOB_WATCH_BATCH_ID.slice(-10)}T00:00:00Z`);
  if (!Number.isFinite(verifiedAt)) return false;
  return now - verifiedAt >= WATCH_BATCH_SHELF_LIFE_DAYS * 24 * 60 * 60 * 1_000;
}

export async function expireStaleWatchBatch(db: D1Database, userId: string) {
  if (!isWatchBatchStale()) return 0;
  const result = await db.prepare("UPDATE job_opportunities SET status = 'expired', updated_at = CURRENT_TIMESTAMP WHERE user_id = ? AND source_type = 'v-watch' AND status IN ('new', 'reviewing')")
    .bind(userId).run();
  const changes = result.meta?.changes;
  return typeof changes === "number" ? changes : 0;
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
  const index = await loadOpportunityIndex(db, userId);
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
      let company = await db.prepare("SELECT id, company_type FROM companies WHERE lower(name) = lower(?) LIMIT 1").bind(companyName).first<{ id: string; company_type: string }>();
      // Reuse the company's own stored type as a kind override when it already
      // exists (e.g. the user manually marked it Startup/Early-stage on its
      // monitor) — otherwise a fresh import of the same company would silently
      // disagree with what's already on file, since classification without a
      // kind override falls back to source/text signals alone.
      const classification = classifyRadarOpportunity({ company: companyName, title: job.title, fitSummary: job.description, sourceUrl: job.sourceUrl }, { kind: company?.company_type });
      if (!company) {
        company = { id: crypto.randomUUID(), company_type: classification.companyCategory };
        await db.prepare("INSERT INTO companies (id, name, company_type, primary_market, notes) VALUES (?, ?, ?, ?, ?)")
          .bind(company.id, companyName, classification.companyCategory, "United States", "Added from an imported job link").run();
      }
      const match = scoreRadarOpportunity({ ...job, companyCategory: classification.companyCategory }, dashboard.profile);
      const existing = index.get(opportunityKey(job.sourceUrl));
      if (existing) {
        await db.prepare("UPDATE job_opportunities SET company_id = ?, title = ?, location = ?, source_type = ?, fit_score = ?, fit_summary = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND user_id = ?")
          .bind(company.id, job.title, job.location || null, "imported", match.score, match.summary, existing.id, userId).run();
        imported.push({ url, title: job.title, company: companyName, score: match.score, status: "updated" });
        continue;
      }
      const importedId = crypto.randomUUID();
      await db.prepare("INSERT INTO job_opportunities (id, user_id, company_id, title, location, source_url, source_type, fit_score, fit_summary, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
        .bind(importedId, userId, company.id, job.title, job.location || null, job.sourceUrl, "imported", match.score, match.summary, "new").run();
      rememberOpportunity(index, job.sourceUrl, importedId);
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
  rows: Array<{ title: string; company: string; url: string; savedAt?: string; location?: string; description?: string }>,
  // The provenance to record. A LinkedIn export or a LinkedIn capture is
  // genuinely "linkedin-saved"; an Indeed or other-board capture is a role the
  // owner picked out themselves, which is what "imported" already means. Both
  // the origin filter and the row's label read this, so filing everything as
  // LinkedIn mislabelled every non-LinkedIn capture.
  sourceType: "linkedin-saved" | "imported" | "captured" = "linkedin-saved",
) {
  const dashboard = await readRadarDashboard(db, userId);
  const index = await loadOpportunityIndex(db, userId);
  let added = 0;
  let updated = 0;
  const skipped: string[] = [];

  for (const row of rows.slice(0, 200)) {
    const title = clean(row?.title, 240);
    const url = clean(row?.url, 4_000);
    if (!title || !/^https?:\/\//i.test(url)) { skipped.push(title || url || "unnamed row"); continue; }
    const companyName = clean(row?.company, 180) || "Saved on LinkedIn";
    let company = await db.prepare("SELECT id, company_type FROM companies WHERE lower(name) = lower(?) LIMIT 1").bind(companyName).first<{ id: string; company_type: string }>();
    const classification = classifyRadarOpportunity({ company: companyName, title }, { kind: company?.company_type });
    if (!company) {
      company = { id: crypto.randomUUID(), company_type: classification.companyCategory };
      await db.prepare("INSERT INTO companies (id, name, company_type, primary_market, notes) VALUES (?, ?, ?, ?, ?)")
        .bind(company.id, companyName, classification.companyCategory, "United States", sourceType === "linkedin-saved" ? "Added from your LinkedIn saved jobs" : "Added from a job page you captured yourself").run();
    }
    // A LinkedIn data export carries only the title and company, so a score
    // built from it is necessarily thin. A capture taken in the owner's own
    // browser carries the location and often the description too — when those
    // arrive, score against them and say so, rather than warning about a
    // limitation that no longer applies.
    const location = clean(row?.location, 240);
    const description = clean(row?.description, 8_000);
    const match = scoreRadarOpportunity({ title, company: companyName, location, description, companyCategory: classification.companyCategory }, dashboard.profile);
    const summary = description
      ? `${match.summary} · Scored from the job page you captured in your own browser.`
      : `${match.summary} · Scored from the title${location ? ", company, and location" : " and company"} only — open the role to review the full description.`;
    const existing = index.get(opportunityKey(url));
    if (existing) {
      await db.prepare("UPDATE job_opportunities SET company_id = ?, title = ?, location = COALESCE(NULLIF(?, ''), location), source_type = ?, fit_score = ?, fit_summary = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND user_id = ?")
        .bind(company.id, title, location, sourceType, match.score, summary, existing.id, userId).run();
      updated += 1;
      continue;
    }
    const savedId = crypto.randomUUID();
    await db.prepare("INSERT INTO job_opportunities (id, user_id, company_id, title, location, source_url, source_type, fit_score, fit_summary, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
      .bind(savedId, userId, company.id, title, location || null, url, sourceType, match.score, summary, "new").run();
    rememberOpportunity(index, url, savedId);
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
  // Runs on every trigger — manual, app-open catch-up, and the twice-daily
  // background cron — so the general V's Job Watch list stays current
  // without depending on someone opening the app or clicking a button.
  await ensureListingColumns(db);
  const watchBatch = await importJobWatchBatch(db, userId);
  // Self-heal rows an earlier build duplicated before reading the current state.
  const mergedDuplicates = await mergeDuplicateOpportunities(db, userId);
  const expired = await expireStaleWatchBatch(db, userId);
  const dashboard = await readRadarDashboard(db, userId);
  // What the user keeps rejecting — and what they wanted but lost to a closed
  // listing — read once per scan. Applied only to roles the radar found on its
  // own; a link the user imported by hand is their explicit choice and is
  // never re-ranked by either signal.
  const decisionHistory = await readDismissalHistory(db, userId);
  const dismissalSignal = deriveDismissalSignal(decisionHistory, dashboard.profile);
  const closedSignal = deriveClosedListingSignal(decisionHistory, dashboard.profile);
  const index = await loadOpportunityIndex(db, userId);
  // A Worker request has a hard subrequest budget, and one monitor can spend
  // seven of them when its careers page needs recovery plus a web-search
  // fallback. Scanning every target in a single run silently exhausted that
  // budget: the tail companies were stamped "completed · 0 found" within the
  // same second, having never actually been fetched — which is why the same
  // five names reported zero on every run for weeks.
  //
  // Least-recently-checked first turns that into a rotation: each run covers
  // a slice it can genuinely finish, and the two-hourly cron works through
  // the whole list. A single-target scan ("Check now") is never throttled.
  //
  // The slice is measured in source attempts rather than companies, because
  // the two are not the same thing. A healthy Greenhouse board costs one
  // attempt; a company whose careers page has moved costs up to seven. A flat
  // count of six companies therefore stopped after six subrequests on a good
  // run and after forty-two on a bad one — too early in the common case and
  // too late in the case that caused the bug. Counting what is actually spent
  // covers far more companies per run while lowering the worst case, and the
  // company cap stays as a second ceiling so no single run monopolizes time.
  const SCAN_ATTEMPT_BUDGET = 14;
  const SCAN_COMPANY_CAP = 12;
  const eligible = dashboard.monitors
    .filter((monitor) => monitor.active)
    .filter((monitor) => !options.monitorId || monitor.id === options.monitorId)
    .filter((monitor) => !options.dueOnly || isMonitorDue(monitor));
  // A saved board is one fetch and reliably answers; a website-only target
  // can burn the page read plus every common careers path and still find
  // nothing. Mixing both in one least-recently-checked rotation let the
  // cheap, productive boards wait behind dozens of fruitless site crawls --
  // each real board was being read about every five days. A board that is
  // due goes first; a board read recently is not worth re-reading ahead of
  // the rotation, and leaving it there is what keeps a manual run (which is
  // not due-only) from cycling through the same boards forever. Self-repair
  // below writes a discovered board back as careers_url, so a website target
  // promotes itself into this lane.
  const boardDue = (monitor: { careersUrl: string; due: boolean; lastCheckedAt: string | null }) =>
    Boolean(monitor.careersUrl) && (monitor.due || !monitor.lastCheckedAt);
  /*
   * A board that failed its last read waits behind the boards that work.
   *
   * A dead ATS token — a company that renamed its board and left no website to
   * recover from — costs two attempts on every run, forever, and can never
   * repair itself. Those attempts were being spent ahead of boards that return
   * roles. The demotion is time-boxed rather than permanent: after three days a
   * failed board rejoins the front, so one that was merely down for an
   * afternoon comes back on its own and nothing is ever quietly dropped.
   */
  const RETRY_FAILED_BOARD_AFTER_MS = 3 * 24 * 60 * 60 * 1_000;
  const failingRecently = (monitor: { lastRunStatus: string | null; lastCheckedAt: string | null }) => {
    if (monitor.lastRunStatus !== "failed" || !monitor.lastCheckedAt) return false;
    const checked = utcTimestampMs(monitor.lastCheckedAt);
    return Number.isFinite(checked) && Date.now() - checked < RETRY_FAILED_BOARD_AFTER_MS;
  };
  const queue = options.monitorId
    ? eligible.slice(0, 1)
    : [...eligible].sort((left, right) =>
      Number(!boardDue(left)) - Number(!boardDue(right))
      || Number(failingRecently(left)) - Number(failingRecently(right))
      || (left.lastCheckedAt || "").localeCompare(right.lastCheckedAt || ""));
  // A single-target scan always runs, however expensive it turns out to be.
  const throttled = !options.monitorId;
  let attemptsUsed = 0;
  const selected: typeof queue = [];
  let found = 0;
  let discovered = 0;
  let belowThreshold = 0;
  let added = 0;
  let matchedAdded = 0;
  let repairedSources = 0;
  const failures: Array<{ monitorId: string; company: string; message: string }> = [];

  for (const monitor of queue) {
    if (throttled && (attemptsUsed >= SCAN_ATTEMPT_BUDGET || selected.length >= SCAN_COMPANY_CAP)) break;
    selected.push(monitor);
    const runId = crypto.randomUUID();
    // Charged against the run budget in the finally below, so a company that
    // fails partway through still pays for the sources it did reach. The
    // floor of one keeps a monitor that fails before its first fetch from
    // looking free and letting the loop run away.
    let monitorAttempts = 1;
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
          // An aggregator lead is kept deliberately: this branch only runs when
          // the employer's own source produced nothing, and for an employer
          // whose robots policy blocks collection it is the only way the role
          // surfaces at all. It does create a second row when a later run does
          // reach the employer's board directly -- that copy is then caught by
          // the read-time "no longer listed" inference in readRadarDashboard
          // (last_seen_at against last_listing_read_at), which is safer than
          // dropping the lead outright.
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
      monitorAttempts = Math.max(1, discovery.attempts.length);
      const jobs = discovery.jobs;
      const focus = monitor.focus ? monitor.focus.split(/[,\n]/).map((item) => item.trim()).filter(Boolean) : [];
      const titles = monitor.targetPosition
        ? [monitor.targetPosition, ...dashboard.profile.titles.filter((title) => title !== monitor.targetPosition)]
        : dashboard.profile.titles;
      const profile = normalizeRadarProfile({ ...dashboard.profile, titles, skills: [...dashboard.profile.skills, ...focus] });
      const scored = jobs.map((job) => {
        // monitor.kind carries whatever the user picked in the "Type" dropdown
        // when adding this target, so it overrides text/source-based signals
        // the same way classifyRadarOpportunity already does for display.
        const classification = classifyRadarOpportunity(job, monitor);
        return { job, match: scoreRadarOpportunity({ ...job, companyCategory: classification.companyCategory }, profile, dismissalSignal, closedSignal) };
      }).sort((left, right) => right.match.score - left.match.score)
        .slice(0, 150);
      const matches = scored.filter(({ match }) => match.passes);
      let monitorAdded = 0;
      let monitorMatchedAdded = 0;
      found += matches.length;
      discovered += scored.length;
      belowThreshold += scored.length - matches.length;
      // Captured before any row is touched: every posting confirmed by this
      // read gets a last_seen_at at or after this stamp, so comparing a
      // posting's last_seen_at against the company's stamp cleanly separates
      // "confirmed by the newest read" from "absent from it".
      const listingReadStamp = new Date().toISOString().slice(0, 19).replace("T", " ");
      // One batch per monitor instead of one awaited round trip per job: a
      // large board is hundreds of rows (scoring keeps up to 150 of them), and
      // this loop covers up to twelve companies per run, so per-row awaits
      // multiplied into the thousands.
      // The in-memory index keeps deduplication correct even though the
      // inserts have not landed yet.
      const jobStatements: D1PreparedStatement[] = [];
      // Rows this read is about to stamp itself, so the sweep below does not
      // stamp them a second time.
      const touchedIds = new Set<string>();
      // Every scored posting used to be written to the inbox — up to 150 per
      // company, across 100+ monitored companies — so a scan buried a handful
      // of real matches under thousands of rows the scorer had already rejected.
      // What is worth keeping is a match, or a near miss the owner could reach
      // by lowering the bar a little. A posting stopped by a hard gate (wrong
      // role, wrong market, an exclusion, the wrong company stage) can never
      // become a match by moving a slider, so it is not kept at all.
      const nearMissFloor = Math.max(0, profile.minScore - 15);
      const worthKeeping = scored.filter(({ match }) => match.passes || (!match.gated && match.score >= nearMissFloor));
      for (const { job, match } of worthKeeping) {
        const existing = index.get(opportunityKey(job.sourceUrl));
        if (existing) {
          touchedIds.add(existing.id);
          jobStatements.push(db.prepare("UPDATE job_opportunities SET company_id = ?, title = ?, location = ?, source_type = ?, fit_score = ?, fit_summary = ?, updated_at = CURRENT_TIMESTAMP, last_seen_at = CURRENT_TIMESTAMP WHERE id = ? AND user_id = ?")
            .bind(monitor.companyId, job.title, job.location || null, job.sourceType || "public-careers-page", match.score, match.summary, existing.id, userId));
        } else {
          const discoveredId = crypto.randomUUID();
          jobStatements.push(db.prepare("INSERT INTO job_opportunities (id, user_id, company_id, title, location, source_url, source_type, fit_score, fit_summary, status, last_seen_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)")
            .bind(discoveredId, userId, monitor.companyId, job.title, job.location || null, job.sourceUrl, job.sourceType || "public-careers-page", match.score, match.summary, "new"));
          rememberOpportunity(index, job.sourceUrl || "", discoveredId, { company: monitor.company, title: job.title, location: job.location });
          added += 1;
          monitorAdded += 1;
          if (match.passes) {
            matchedAdded += 1;
            monitorMatchedAdded += 1;
          }
        }
      }
      // Delisting is handled by the non-destructive last_seen_at /
      // last_listing_read_at pair below, which derives a "no longer on the
      // company board" badge at read time. An earlier local branch flipped
      // status to "expired" here instead; that was dropped deliberately —
      // mutating status on a scan that merely looked truncated would bury
      // roles the user had already shortlisted, and the badge conveys the
      // same fact without touching the row's state.
      /*
       * Every posting this read confirmed is still up, not only the ones worth
       * storing.
       *
       * The loop above refreshes last_seen_at for the rows it writes, which is
       * the rows that pass the score floor today. A stored posting that is
       * still on the board but has since fallen below that floor — the owner
       * narrowed a target title, or raised the minimum — was left with an old
       * last_seen_at, and the next complete read of that board then badged it
       * "No longer on the company board". That badge is now a decision the
       * owner acts on and the radar learns from, so a false one is worse than
       * it was: it teaches from a role that never closed.
       */
      const stillListed = [...new Set(jobs
        .map((job) => index.get(opportunityKey(job.sourceUrl))?.id)
        .filter((id): id is string => typeof id === "string" && !touchedIds.has(id)))];
      for (let cursor = 0; cursor < stillListed.length; cursor += 90) {
        const chunk = stillListed.slice(cursor, cursor + 90);
        jobStatements.push(db.prepare(`UPDATE job_opportunities SET last_seen_at = CURRENT_TIMESTAMP WHERE user_id = ? AND id IN (${chunk.map(() => "?").join(", ")})`).bind(userId, ...chunk));
      }
      if (jobStatements.length) await db.batch(jobStatements);
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
      // "completed" means a source answered, not that the code reached the end
      // of the function. A run where nothing responded — a renamed ATS board
      // with no website to recover from is the standing case — was recorded as
      // "completed · 0 found", which reads on the Targets tab exactly like a
      // healthy board with no matching roles, and left the scan queue with no
      // way to tell a dead source from a quiet one.
      //
      // Both halves are required. A blocked search that still yielded a direct
      // public job lead — Meta's careers page is the standing example — read
      // something real, and calling that run failed would be as wrong in the
      // other direction.
      const nothingResponded = completedSources.length === 0 && jobs.length === 0;
      const statements = [
        db.prepare("UPDATE company_monitors SET last_checked_at = CURRENT_TIMESTAMP WHERE id = ? AND user_id = ?").bind(monitor.id, userId),
        db.prepare("INSERT INTO monitor_runs (id, monitor_id, run_status, found_count, change_summary) VALUES (?, ?, ?, ?, ?)")
          .bind(runId, monitor.id, nothingResponded ? "failed" : "completed", matches.length, `${triggerLabel} · ${jobs.length} verified roles read · ${matches.length} met the ${profile.minScore}% minimum · ${worthKeeping.length - matches.length} near misses kept · ${scored.length - worthKeeping.length} filtered out by the role/market gates · ${monitorAdded} new (${monitorMatchedAdded} matching) · ${discovery.attempts.length} source${discovery.attempts.length === 1 ? "" : "s"} tried${rejectedNavigationCount ? ` · ${rejectedNavigationCount} navigation/non-job ${rejectedNavigationCount === 1 ? "link" : "links"} excluded` : ""}. ${sourceCoverage} ${sourceNote}${zeroReason}`),
      ];
      if (repairStatement) statements.unshift(repairStatement);
      // Only a read that produced at least one complete-board posting counts
      // as a listing read: a failed fetch or a web-search-only run says
      // nothing about which postings are still up, and must never make older
      // postings look withdrawn. A read that filled the discovery cap is not
      // complete either: whatever sat past the cap was never seen, and
      // stamping it would flag those live postings as withdrawn.
      if (jobs.length < DISCOVERY_JOB_CAP && jobs.some((job) => COMPLETE_LISTING_SOURCES.has(job.sourceType || ""))) {
        statements.push(db.prepare("UPDATE companies SET last_listing_read_at = ? WHERE id = ?").bind(listingReadStamp, monitor.companyId));
      }
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
    } finally {
      attemptsUsed += monitorAttempts;
    }
  }
  const deferred = Math.max(0, eligible.length - selected.length);
  // `expired` now counts only the V's Job Watch batch ageing out; per-board
  // delisting is reported through the derived listingLost badge instead.
  return { checked: selected.length, deferred, found, discovered, belowThreshold, added, matchedAdded, repairedSources, mergedDuplicates, expired, failures, watchBatch };
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
    // Validated for real by normalizeRadarProfile's own allow-list below; this
    // cast only satisfies the stricter Partial<RadarProfile> input type.
    companyStagePreference: typeof constraints.companyStagePreference === "string" ? (constraints.companyStagePreference as RadarProfile["companyStagePreference"]) : undefined,
    locationPolicy: typeof constraints.locationPolicy === "string" ? (constraints.locationPolicy as RadarProfile["locationPolicy"]) : undefined,
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
    contactEmail: typeof query.contactEmail === "string" ? query.contactEmail : "",
    contactNote: typeof query.contactNote === "string" ? query.contactNote : "",
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
  return ["new", "reviewing", "shortlisted", "dismissed", "applied", "archived", "expired"].includes(value) ? value : "new";
}

// An unrecognised reason becomes null rather than a default, so a client that
// sends nothing never accidentally teaches the scorer.
function normalizeDismissalReason(value: unknown) {
  return value === "not_relevant" || value === "already_applied" || value === "listing_closed" ? value : null;
}

// Deliberately permissive beyond the shape check: this field holds whatever
// address the user actually has, and rejecting an unusual but valid one would
// be worse than storing it. Anything without a single @ and a dotted domain is
// cleared rather than saved, so a half-typed entry does not look recorded.
function normalizeContactEmail(value: unknown) {
  const trimmed = clean(value, 200).toLowerCase();
  if (!trimmed) return "";
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(trimmed) ? trimmed : "";
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
