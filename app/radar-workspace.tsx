"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { DEFAULT_RADAR_PROFILE, RADAR_COMPANY_CATEGORIES, RADAR_TRACKS } from "@/lib/radar.mjs";
import { readJsonResponse } from "@/lib/http-json.mjs";
import type { RadarProfile } from "@/lib/radar.mjs";

export type RadarOpportunity = {
  id: string;
  companyId: string | null;
  company: string;
  companyCategory: string;
  trackId: string;
  trackLabel: string;
  title: string;
  location: string;
  sourceUrl: string;
  sourceType: string;
  origin: "monitored" | "v-watch" | "imported" | "linkedin-saved";
  importedByUser?: boolean;
  targetPosition: string;
  fitScore: number;
  fitSummary: string;
  alignmentPasses: boolean;
  exclusionHit: boolean;
  status: "new" | "reviewing" | "shortlisted" | "dismissed" | "applied" | "archived";
  discoveredAt: string;
  updatedAt: string;
};

type RadarMonitor = {
  id: string;
  companyId: string;
  company: string;
  websiteUrl: string;
  careersUrl: string;
  referenceUrl: string;
  sourceKind: string;
  kind: string;
  market: string;
  notes: string;
  focus: string;
  targetPosition: string;
  cadence: "twice_daily" | "daily" | "manual";
  active: boolean;
  lastCheckedAt: string | null;
  nextDueAt: string | null;
  due: boolean;
  createdAt: string;
  lastRunStatus: string | null;
  lastRunFoundCount: number | null;
  lastRunSummary: string;
  lastRunAt: string | null;
};

type RadarPayload = {
  ok?: boolean;
  code?: string;
  message?: string;
  profile?: RadarProfile;
  monitors?: RadarMonitor[];
  opportunities?: RadarOpportunity[];
  dueCount?: number;
  lastRunAt?: string | null;
  excludedNavigationCount?: number;
  result?: {
    checked?: number;
    found?: number;
    discovered?: number;
    belowThreshold?: number;
    added?: number;
    matchedAdded?: number;
    repairedSources?: number;
    failures?: Array<{ company?: string; url?: string; message: string }>;
    imported?: Array<{ url: string; title: string; company: string; score: number; status: "added" | "updated" }>;
  };
  automation?: { dailyCatchUp?: boolean; backgroundScheduler?: string };
};

type RadarLinkPayload = {
  ok?: boolean;
  message?: string;
  source?: { finalUrl: string; title: string; links?: Array<{ href: string; label: string }> };
};

type SavedLinkedInJob = { title: string; company: string; url: string; savedAt: string };

type Props = {
  savedLinkedInJobs?: SavedLinkedInJob[];
  onPrepare: (opportunity: RadarOpportunity) => void | Promise<void>;
  onNotice: (message: string) => void;
  onError: (code: string, message: unknown, context?: Record<string, string | number | boolean>) => void;
};

type ProfileDraft = {
  titles: string;
  skills: string;
  locations: string;
  workModes: string[];
  goals: string;
  exclusions: string;
  minScore: number;
};

const TARGET_TYPES = [
  "Brand / Consumer",
  "Creative / Advertising Agency",
  "Marketing Agency",
  "Production Company",
  "Sports / Entertainment",
  "Technology",
  "Media",
  "Retail / Hospitality",
  "Nonprofit / Education",
  "Other",
];

const REFERENCE_SOURCES = ["None", "LinkedIn", "Indeed", "Glassdoor", "Other job board"];
const initialDraft = profileToDraft(DEFAULT_RADAR_PROFILE);

export function RadarWorkspace({ savedLinkedInJobs = [], onPrepare, onNotice, onError }: Props) {
  const [profileDraft, setProfileDraft] = useState<ProfileDraft>(initialDraft);
  const [monitors, setMonitors] = useState<RadarMonitor[]>([]);
  const [opportunities, setOpportunities] = useState<RadarOpportunity[]>([]);
  const [dueCount, setDueCount] = useState(0);
  const [lastRunAt, setLastRunAt] = useState<string | null>(null);
  const [excludedNavigationCount, setExcludedNavigationCount] = useState(0);
  const [schedulerEnabled, setSchedulerEnabled] = useState(false);
  const [connection, setConnection] = useState<"loading" | "ready" | "error">("loading");
  const [connectionMessage, setConnectionMessage] = useState("Opening your private radar…");
  const [busy, setBusy] = useState("");
  const [progress, setProgress] = useState("");
  const [filter, setFilter] = useState<"active" | "shortlisted" | "dismissed" | "archived" | "all">("active");
  const [alignmentFilter, setAlignmentFilter] = useState<"all" | "matching" | "below">("all");
  const [trackFilter, setTrackFilter] = useState("all");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [companyFilter, setCompanyFilter] = useState("all");
  const [originFilter, setOriginFilter] = useState<"all" | "monitored" | "v-watch" | "imported" | "linkedin-saved">("all");
  const [importLinks, setImportLinks] = useState("");
  const [targetFilter, setTargetFilter] = useState("all");
  const [locationFilter, setLocationFilter] = useState("all");
  const [company, setCompany] = useState("");
  const [kind, setKind] = useState(TARGET_TYPES[0]);
  const [websiteUrl, setWebsiteUrl] = useState("");
  const [careersUrl, setCareersUrl] = useState("");
  const [referenceUrl, setReferenceUrl] = useState("");
  const [sourceKind, setSourceKind] = useState(REFERENCE_SOURCES[0]);
  const [focus, setFocus] = useState("Creative operations, brand programs, project management, production");
  const [targetPosition, setTargetPosition] = useState("");
  const [cadence, setCadence] = useState<"twice_daily" | "daily" | "manual">("twice_daily");
  const autoScanStarted = useRef(false);

  const savedTargetPositions = useMemo(() => list(profileDraft.titles), [profileDraft.titles]);
  const companyOptions = useMemo(() => [...new Set([
    ...monitors.map((monitor) => monitor.company),
    ...opportunities.map((opportunity) => opportunity.company),
  ])].sort((left, right) => left.localeCompare(right)), [monitors, opportunities]);
  const locationOptions = useMemo(() => [...new Set(opportunities.map((opportunity) => opportunity.location).filter(Boolean))]
    .sort((left, right) => left.localeCompare(right)), [opportunities]);
  const targetOptions = useMemo(() => [...new Set([
    ...savedTargetPositions,
    ...monitors.map((monitor) => monitor.targetPosition).filter(Boolean),
    ...opportunities.map((opportunity) => opportunity.targetPosition).filter(Boolean),
  ])].sort((left, right) => left.localeCompare(right)), [monitors, opportunities, savedTargetPositions]);
  const visibleOpportunities = useMemo(() => opportunities
    .filter((item) => filter === "all" ? true : filter === "active" ? item.status !== "dismissed" && item.status !== "archived" : item.status === filter)
    .filter((item) => alignmentFilter === "all" ? true : alignmentFilter === "matching" ? item.alignmentPasses : !item.alignmentPasses)
    .filter((item) => trackFilter === "all" || item.trackId === trackFilter)
    .filter((item) => categoryFilter === "all" || item.companyCategory === categoryFilter)
    .filter((item) => companyFilter === "all" || item.company === companyFilter)
    .filter((item) => originFilter === "all" || item.origin === originFilter)
    .filter((item) => targetFilter === "all" || item.targetPosition === targetFilter || item.trackLabel === targetFilter)
    .filter((item) => locationFilter === "all" || item.location === locationFilter)
    .sort((left, right) => right.fitScore - left.fitScore || right.discoveredAt.localeCompare(left.discoveredAt)), [alignmentFilter, categoryFilter, companyFilter, filter, locationFilter, opportunities, originFilter, targetFilter, trackFilter]);
  const newCount = opportunities.filter((item) => item.status === "new").length;
  const shortlistedCount = opportunities.filter((item) => item.status === "shortlisted").length;
  const matchingCount = opportunities.filter((item) => item.alignmentPasses).length;
  const belowThresholdCount = opportunities.filter((item) => !item.alignmentPasses).length;

  useEffect(() => {
    let active = true;
    fetch("/api/radar", { cache: "no-store" })
      .then(async (response) => ({ response, data: await readJsonResponse<RadarPayload>(response, "The private radar could not be opened.") }))
      .then(async ({ response, data }) => {
        if (!active) return;
        if (!response.ok || !data.ok) throw new Error(data.message || "The private radar could not be opened.");
        applyPayload(data);
        setConnection("ready");
        setConnectionMessage("Targets and discoveries are stored privately for your signed-in account.");
        if (!data.opportunities?.some((opportunity) => opportunity.sourceType === "v-watch")) {
          await mutate({ action: "import_watch_batch" }, "watch-import", "Adding the verified V’s Job Watch opportunities to this private Radar inbox without changing any existing decisions…");
        }
        if ((data.dueCount || 0) > 0 && !autoScanStarted.current && !sessionStorage.getItem(autoScanKey())) {
          autoScanStarted.current = true;
          sessionStorage.setItem(autoScanKey(), "started");
          await runScan({ dueOnly: true, automatic: true });
        }
      })
      .catch((cause) => {
        if (!active) return;
        setConnection("error");
        setConnectionMessage(cause instanceof Error ? cause.message : "The private radar is unavailable.");
        onError("radar_load_failed", cause);
      });
    return () => { active = false; };
    // The callbacks are stable in the parent; the radar should load only once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function applyPayload(data: RadarPayload) {
    if (data.profile) {
      setProfileDraft(profileToDraft(data.profile));
      setTargetPosition((current) => current || data.profile?.titles[0] || "");
    }
    if (Array.isArray(data.monitors)) setMonitors(data.monitors);
    if (Array.isArray(data.opportunities)) setOpportunities(data.opportunities);
    setDueCount(data.dueCount || 0);
    setLastRunAt(data.lastRunAt || null);
    setExcludedNavigationCount(data.excludedNavigationCount || 0);
    if (data.automation) setSchedulerEnabled(data.automation.backgroundScheduler === "enabled");
  }

  async function mutate(body: Record<string, unknown>, label: string, feedback: string) {
    setBusy(label);
    setProgress(feedback);
    try {
      const response = await fetch("/api/radar", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const data = await readJsonResponse<RadarPayload>(response, "The radar request could not be completed.");
      if (!response.ok || !data.ok) throw new Error(data.message || "The radar request could not be completed.");
      applyPayload(data);
      setConnection("ready");
      return data;
    } catch (cause) {
      onError("radar_action_failed", cause, { action: String(body.action || "unknown") });
      onNotice(cause instanceof Error ? cause.message : "The radar action could not be completed.");
      return null;
    } finally {
      setBusy("");
      setProgress("");
    }
  }

  async function findCareersPage() {
    if (!websiteUrl.trim()) { onNotice("Add the company website first, then V’s can look for its Careers, Jobs, or Opportunities page."); return; }
    setBusy("find-careers");
    setProgress("Reading the public company homepage and ranking Careers, Jobs, Opportunities, Openings, and Join-us links…");
    try {
      const response = await fetch("/api/link/read", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ url: websiteUrl.trim(), purpose: "radar" }) });
      const data = await readJsonResponse<RadarLinkPayload>(response, "The company website could not be inspected.");
      if (!response.ok || !data.ok || !data.source) throw new Error(data.message || "The company website could not be inspected.");
      const ranked = rankCareerLinks(data.source.links || []);
      if (!ranked.length) throw new Error("No public Careers, Jobs, Opportunities, Openings, or Join-us link was found. Paste the official careers URL if you know it.");
      setCareersUrl(ranked[0].href);
      onNotice(`Careers page found: ${ranked[0].label || new URL(ranked[0].href).hostname}. Review it, then add the target.`);
    } catch (cause) {
      onError("radar_careers_discovery_failed", cause, { source: "company-website" });
      onNotice(cause instanceof Error ? cause.message : "The careers page could not be discovered.");
    } finally {
      setBusy("");
      setProgress("");
    }
  }

  async function saveProfile() {
    const data = await mutate({ action: "save_profile", profile: draftToProfile(profileDraft) }, "profile", "Saving your roles, skills, locations, work modes, and exclusions…");
    if (data) onNotice("Radar goals saved. Future scans will use these roles, skills, locations, and exclusions.");
  }

  async function addMonitor() {
    if (!company.trim()) { onNotice("Add the company name."); return; }
    const data = await mutate({ action: "add_monitor", monitor: { company, kind, websiteUrl, careersUrl, referenceUrl, sourceKind, focus, targetPosition, cadence, market: "San Francisco Bay Area / United States" } }, "target", "Saving the target. If its official source returns no real roles, V’s will search the public web and validate direct job pages…");
    if (!data) return;
    setCompany(""); setWebsiteUrl(""); setCareersUrl(""); setReferenceUrl(""); setSourceKind("None");
    onNotice("Radar target added. V’s catches up when it opens; you can also scan now. Background timing activates once the hosting scheduler is connected.");
  }

  async function runScan(options: { monitorId?: string; dueOnly?: boolean; automatic?: boolean } = {}) {
    const data = await mutate({ action: "scan", monitorId: options.monitorId, dueOnly: Boolean(options.dueOnly), trigger: options.automatic ? "catch_up" : "manual", profile: draftToProfile(profileDraft) }, "scan", "Checking saved sources, repairing stale careers links, following official ATS boards, and retaining every role with its alignment score…");
    if (!data) return;
    const result = data.result || {};
    const failures = result.failures?.length || 0;
    if (!options.automatic) onNotice(`${result.checked || 0} ${result.checked === 1 ? "target" : "targets"} checked · ${result.discovered || 0} roles read · ${result.found || 0} matched · ${result.added || 0} new saved${result.repairedSources ? ` · ${result.repairedSources} source ${result.repairedSources === 1 ? "was" : "were"} repaired` : ""}${failures ? ` · ${failures} ${failures === 1 ? "target needs" : "targets need"} attention` : ""}`);
  }

  async function importJobLinks() {
    const links = importLinks.split(/[\s,]+/).map((link) => link.trim()).filter(Boolean);
    if (!links.length) { onNotice("Paste at least one public job link, one per line."); return; }
    const data = await mutate({ action: "import_job_links", links }, "import-links", `Reading ${links.length} public job ${links.length === 1 ? "page" : "pages"} you pointed V’s at, scoring each against your radar goals…`);
    if (!data) return;
    const result = data.result || {};
    const added = result.imported?.length || 0;
    const failed = result.failures?.length || 0;
    if (added) setImportLinks(result.failures?.map((failure) => failure.url).filter(Boolean).join("\n") || "");
    onNotice(added
      ? `${added} ${added === 1 ? "role" : "roles"} imported into the discovery inbox${failed ? ` · ${failed} link${failed === 1 ? "" : "s"} could not be read` : ""}.`
      : `No role could be read from ${failed === 1 ? "that link" : "those links"}. ${result.failures?.[0]?.message || ""}`);
  }

  async function importSavedLinkedInJobs() {
    if (!savedLinkedInJobs.length) { onNotice("No saved jobs were found in your LinkedIn export. Import the official ZIP in Knowledge sources first."); return; }
    const data = await mutate({ action: "import_linkedin_saved_jobs", rows: savedLinkedInJobs }, "import-linkedin", `Filing ${savedLinkedInJobs.length} saved LinkedIn ${savedLinkedInJobs.length === 1 ? "role" : "roles"} from your official export. No LinkedIn page is opened…`);
    if (!data) return;
    const result = data.result || {};
    onNotice(`${result.added || 0} saved LinkedIn ${result.added === 1 ? "role" : "roles"} added${result.updated ? ` · ${result.updated} refreshed` : ""}. Each is scored from the exported title and company only — open the role to read the full description.`);
  }

  async function updateMonitor(monitorId: string, patch: Record<string, unknown>) {
    await mutate({ action: "update_monitor", monitorId, patch }, `monitor-${monitorId}`, "Updating this radar target…");
  }

  async function removeMonitor(monitorId: string) {
    const data = await mutate({ action: "delete_monitor", monitorId }, `monitor-${monitorId}`, "Archiving this radar target while preserving its discoveries…");
    if (data) onNotice("Radar target archived. Its discoveries and history remain in your inbox.");
  }

  async function updateOpportunity(opportunity: RadarOpportunity, status: RadarOpportunity["status"]) {
    const data = await mutate({ action: "set_opportunity_status", opportunityId: opportunity.id, status }, `opportunity-${opportunity.id}`, "Updating this opportunity…");
    if (data && status === "shortlisted") onNotice("Role approved for preparation. V’s will not submit anything without you.");
    if (data && status === "reviewing" && (opportunity.status === "dismissed" || opportunity.status === "archived")) onNotice("Role restored to the active inbox. Its discovery history was never deleted.");
  }

  async function prepare(opportunity: RadarOpportunity) {
    await updateOpportunity(opportunity, "reviewing");
    await onPrepare(opportunity);
  }

  return <section className="radar-workspace">
    <div className="radar-hero">
      <div><span>V’S DAILY JOB RADAR</span><h2>Choose the companies. V’s finds the roles worth your attention.</h2><p>Monitor public company career pages and official ATS boards. V’s can discover a Careers, Jobs, Opportunities, or Join-us page from a company homepage. Matching roles enter a review inbox; nothing is applied to automatically.</p></div>
      <div className={`radar-connection ${connection}`}><i /><div><strong>{connection === "loading" ? "Opening radar" : connection === "ready" ? "Private radar ready" : "Radar needs attention"}</strong><span>{connectionMessage}</span></div></div>
    </div>

    {progress && <div className="operation-status" role="status" aria-live="polite"><i /><div><strong>Radar working</strong><span>{progress}</span></div></div>}

    <div className="radar-metrics">
      <div><span>Active targets</span><strong>{monitors.filter((item) => item.active).length}</strong><small>{dueCount} due for their next check</small></div>
      <div><span>New discoveries</span><strong>{newCount}</strong><small>{matchingCount} match · {belowThresholdCount} below threshold{excludedNavigationCount ? ` · ${excludedNavigationCount} non-job ${excludedNavigationCount === 1 ? "label" : "labels"} hidden` : ""}</small></div>
      <div><span>Approved to prepare</span><strong>{shortlistedCount}</strong><small>No automatic applications</small></div>
      <div><span>Last radar run</span><strong>{lastRunAt ? compactDate(lastRunAt) : "Not yet"}</strong><small>{schedulerEnabled ? "Background scans on · catch-up when V’s opens" : "Catch-up when V’s opens · background scans prepared"}</small></div>
    </div>

    <div className="radar-config-grid">
      <article className="radar-goals-card">
        <div className="card-heading"><div><span>01 · SEARCH GOALS</span><h3>What should count as a good lead?</h3></div><button className="primary" onClick={saveProfile} disabled={Boolean(busy)}>{busy === "profile" ? "Saving…" : "Save goals"}</button></div>
        <label>Target positions<textarea value={profileDraft.titles} onChange={(event) => setProfileDraft({ ...profileDraft, titles: event.target.value })} placeholder="One per line: Brand Project Manager…" /></label>
        <label>Skills and themes<textarea value={profileDraft.skills} onChange={(event) => setProfileDraft({ ...profileDraft, skills: event.target.value })} placeholder="Creative operations, integrated production…" /></label>
        <div className="radar-two"><label>Markets<textarea value={profileDraft.locations} onChange={(event) => setProfileDraft({ ...profileDraft, locations: event.target.value })} /></label><label>Exclude<textarea value={profileDraft.exclusions} onChange={(event) => setProfileDraft({ ...profileDraft, exclusions: event.target.value })} placeholder="Commission only, unpaid…" /></label></div>
        <label>Career goals<textarea value={profileDraft.goals} onChange={(event) => setProfileDraft({ ...profileDraft, goals: event.target.value })} /></label>
        <div className="radar-preferences"><fieldset><legend>Work style</legend>{["On-site", "Hybrid", "Remote"].map((mode) => <label key={mode}><input type="checkbox" checked={profileDraft.workModes.includes(mode)} onChange={(event) => setProfileDraft({ ...profileDraft, workModes: event.target.checked ? [...profileDraft.workModes, mode] : profileDraft.workModes.filter((item) => item !== mode) })} />{mode}</label>)}</fieldset><label>Minimum alignment <strong>{profileDraft.minScore}%</strong><input type="range" min="20" max="90" step="5" value={profileDraft.minScore} onChange={(event) => setProfileDraft({ ...profileDraft, minScore: Number(event.target.value) })} /></label></div>
      </article>

      <article className="radar-target-card">
        <div className="card-heading"><div><span>02 · ADD A TARGET</span><h3>Company, brand, agency, or team</h3></div></div>
        <label>Company name<input value={company} onChange={(event) => setCompany(event.target.value)} placeholder="e.g. Apple" /></label>
        <div className="radar-two"><label>Type<select value={kind} onChange={(event) => setKind(event.target.value)}>{TARGET_TYPES.map((item) => <option key={item}>{item}</option>)}</select></label><label>Cadence<select value={cadence} onChange={(event) => setCadence(event.target.value as "twice_daily" | "daily" | "manual")}><option value="twice_daily">Twice daily (recommended)</option><option value="daily">Daily</option><option value="manual">Manual only</option></select></label></div>
        <label>Target position<select value={targetPosition} onChange={(event) => setTargetPosition(event.target.value)}><option value="">Use all saved target positions</option>{savedTargetPositions.map((title) => <option key={title} value={title}>{title}</option>)}</select><small>Controls both the company search query and the match score for this target.</small></label>
        <label>Company website <small>optional—V’s can search by company name</small><input type="url" value={websiteUrl} onChange={(event) => setWebsiteUrl(event.target.value)} placeholder="https://company.com" /></label>
        <div className="careers-discovery"><label>Public careers page <small>optional if website is provided</small><input type="url" value={careersUrl} onChange={(event) => setCareersUrl(event.target.value)} placeholder="Company careers, Greenhouse, Lever, Ashby, or Workday URL" /></label><button onClick={findCareersPage} disabled={Boolean(busy) || !websiteUrl.trim()}>{busy === "find-careers" ? "Finding…" : "Find careers page"}</button></div>
        <div className="radar-two"><label>Reference source<select value={sourceKind} onChange={(event) => setSourceKind(event.target.value)}>{REFERENCE_SOURCES.map((item) => <option key={item}>{item}</option>)}</select></label><label>LinkedIn / Indeed / other URL<input type="url" value={referenceUrl} onChange={(event) => setReferenceUrl(event.target.value)} placeholder="Optional reference link" /></label></div>
        <label>Target-specific focus<textarea value={focus} onChange={(event) => setFocus(event.target.value)} /></label>
        <button className="primary wide-action" onClick={addMonitor} disabled={Boolean(busy)}>{busy === "target" ? "Adding…" : "Add to radar"}</button>
        <div className="radar-safety-note"><strong>Official sources first · public-web fallback second</strong><span>V’s rejects navigation labels and validates direct job URLs before saving them. When an official page yields no real roles, the connected AI provider may run one bounded public-web search. LinkedIn and Indeed logins cannot grant V’s a personal job-feed API, so those URLs remain references rather than account automation.</span></div>
      </article>
    </div>

    <section className="radar-targets-section">
      <div className="radar-section-head"><div><span>MONITORED TARGETS</span><h2>{monitors.length} saved {monitors.length === 1 ? "company" : "companies"}</h2></div><button className="primary" onClick={() => runScan()} disabled={Boolean(busy) || !monitors.some((item) => item.active)}>{busy === "scan" ? "Scanning public career pages…" : "Run radar now"}</button></div>
      {!monitors.length ? <div className="empty-state compact"><strong>Add the first company you want V’s to watch.</strong><span>Add the website and let V’s find the careers page, or paste an official careers URL. Targets catch up when the app opens, and you can run the radar anytime.</span></div> : <div className="radar-target-list">{monitors.map((monitor) => {
        const coverage = monitorCoverage(monitor);
        return <article key={monitor.id} className={`${!monitor.active ? "paused" : ""} scan-${coverage.tone}`}>
          <div className="radar-target-main">
            <span>{monitor.kind} · Added by you</span>
            <strong>{monitor.company}</strong>
            <small><b>Target:</b> {monitor.targetPosition || "All saved target positions"}</small>
            <small>{monitor.focus || "Uses your global radar goals"}</small>
            {monitor.lastRunSummary && <p className={`monitor-run-summary ${coverage.tone}`}>{monitor.lastRunSummary}</p>}
            {(monitor.careersUrl || monitor.websiteUrl) && <a href={monitor.careersUrl || monitor.websiteUrl} target="_blank" rel="noreferrer">Open scan source ↗</a>}
            {monitor.referenceUrl && <a href={monitor.referenceUrl} target="_blank" rel="noreferrer">Open {monitor.sourceKind || "reference"} ↗</a>}
          </div>
          <div className="radar-target-status">
            <strong>{coverage.label}</strong>
            <span>{monitor.lastRunFoundCount == null ? "No scan result yet" : `${monitor.lastRunFoundCount} matching ${monitor.lastRunFoundCount === 1 ? "role" : "roles"} in last check`}</span>
            <span>{monitor.active ? monitor.cadence === "twice_daily" ? "Twice daily" : monitor.cadence === "daily" ? "Daily" : "Manual" : "Archived"} · {monitor.lastCheckedAt ? `last checked ${compactDate(monitor.lastCheckedAt)}` : "never checked"}</span>
            {monitor.active && monitor.cadence !== "manual" && <span>{monitor.due ? "Next check: due now" : monitor.nextDueAt ? `Next check ${compactDateTime(monitor.nextDueAt)}` : "Next check: on first scan"}</span>}
            <select aria-label={`Target position for ${monitor.company}`} value={monitor.targetPosition} onChange={(event) => updateMonitor(monitor.id, { targetPosition: event.target.value })} disabled={Boolean(busy)}>
              <option value="">All saved positions</option>
              {savedTargetPositions.map((title) => <option key={title} value={title}>{title}</option>)}
            </select>
          </div>
          <div className="radar-target-actions"><button onClick={() => runScan({ monitorId: monitor.id })} disabled={Boolean(busy) || !monitor.active}>Check now</button><button onClick={() => updateMonitor(monitor.id, { active: !monitor.active })}>{monitor.active ? "Pause" : "Resume"}</button>{monitor.active && <button onClick={() => removeMonitor(monitor.id)}>Archive</button>}</div>
        </article>;
      })}</div>}
      <p className="scheduler-note"><strong>Twice-daily behavior:</strong> V’s treats recommended targets as due every 12 hours and catches them up when you open the private app. {schedulerEnabled
        ? "The background scheduler is connected, so due targets are also scanned while the app is closed; each run summary says whether it came from the background scheduler, an app-open catch-up, or a manual scan."
        : "Runs while the app is closed are prepared but not yet active: set RADAR_CRON_SECRET on the server and point the hosting scheduler at /api/radar/cron twice daily to enable them."}</p>
    </section>

    <section className="radar-import">
      <div className="radar-section-head"><div><span>ROLES V’S CANNOT REACH</span><h2>Import a job link directly</h2><small>Some employers — Meta’s job search is the standing example — publish a robots policy that forbids automated collection, and LinkedIn blocks reading entirely. Open the role yourself, then paste its job-details link here. V’s reads only that page, scores it against your goals, and files it in the inbox below.</small></div></div>
      <div className="radar-import-body">
        <label>Public job links <small>one per line</small><textarea value={importLinks} onChange={(event) => setImportLinks(event.target.value)} placeholder={"https://www.metacareers.com/profile/job_details/1234567890/\nhttps://boards.greenhouse.io/example/jobs/100"} /></label>
        <div className="radar-import-actions">
          <button className="primary" onClick={importJobLinks} disabled={Boolean(busy) || !importLinks.trim()}>{busy === "import-links" ? "Reading job pages…" : "Import these roles"}</button>
          <small>Works for any public job-details page. A LinkedIn link cannot be read — open it, copy the description, and use Role workspace instead.</small>
        </div>
        <div className="radar-linkedin-bridge">
          <div><strong>{savedLinkedInJobs.length ? `${savedLinkedInJobs.length} saved ${savedLinkedInJobs.length === 1 ? "job" : "jobs"} found in your LinkedIn export` : "Bring in your saved LinkedIn jobs"}</strong><span>{savedLinkedInJobs.length ? "These come from the official archive you already imported. V\u2019s files them here using only the title, company, and link LinkedIn exported \u2014 it never opens a LinkedIn page." : "LinkedIn does not allow automated reading, and its sign-in grants no job access. Request your official data export, import the ZIP in Knowledge sources, and your saved jobs appear here."}</span></div>
          <button onClick={importSavedLinkedInJobs} disabled={Boolean(busy) || !savedLinkedInJobs.length}>{busy === "import-linkedin" ? "Filing saved roles\u2026" : "Add saved LinkedIn roles"}</button>
        </div>
      </div>
    </section>

    <section className="radar-inbox">
      <div className="radar-section-head"><div><span>DISCOVERY INBOX</span><h2>{visibleOpportunities.length} discovered {visibleOpportunities.length === 1 ? "role" : "roles"}</h2><small>V keeps below-threshold discoveries too, so a working scan never looks empty.</small></div><div className="radar-filters">{([['active','Active'],['shortlisted','Approved'],['dismissed','Dismissed'],['archived','Archived'],['all','All statuses']] as const).map(([id, label]) => <button key={id} className={filter === id ? "selected" : ""} onClick={() => setFilter(id)}>{label}</button>)}</div></div>
      <div className="radar-inbox-controls">
        <div className="radar-filters" aria-label="Alignment filter">{([["all",`All alignment (${opportunities.length})`],["matching",`Matching (${matchingCount})`],["below",`Below threshold (${belowThresholdCount})`]] as const).map(([id, label]) => <button key={id} className={alignmentFilter === id ? "selected" : ""} onClick={() => setAlignmentFilter(id)}>{label}</button>)}</div>
        <label>Company<select value={companyFilter} onChange={(event) => setCompanyFilter(event.target.value)}><option value="all">All companies</option>{companyOptions.map((companyName) => <option key={companyName} value={companyName}>{companyName}</option>)}</select></label>
        <label>Found by<select value={originFilter} onChange={(event) => setOriginFilter(event.target.value as "all" | "monitored" | "v-watch" | "imported" | "linkedin-saved")}><option value="all">All discovery sources</option><option value="monitored">Companies I monitor</option><option value="v-watch">Suggested by V’s</option><option value="imported">Imported by me</option><option value="linkedin-saved">Saved on LinkedIn</option></select></label>
        <label>Target position<select value={targetFilter} onChange={(event) => setTargetFilter(event.target.value)}><option value="all">All target positions</option>{targetOptions.map((target) => <option key={target} value={target}>{target}</option>)}</select></label>
        <label>Location<select value={locationFilter} onChange={(event) => setLocationFilter(event.target.value)}><option value="all">All locations</option>{locationOptions.map((location) => <option key={location} value={location}>{location}</option>)}</select></label>
        <label>Career trail<select value={trackFilter} onChange={(event) => setTrackFilter(event.target.value)}><option value="all">All trails</option>{RADAR_TRACKS.map((track) => <option key={track.id} value={track.id}>{track.label}</option>)}</select></label>
        <label>Company type<select value={categoryFilter} onChange={(event) => setCategoryFilter(event.target.value)}><option value="all">All company types</option>{RADAR_COMPANY_CATEGORIES.map((category) => <option key={category} value={category}>{category}</option>)}</select></label>
      </div>
      {!visibleOpportunities.length ? <div className="empty-state"><strong>No roles match these filters.</strong><span>Change the status, company, discovery source, target position, location, alignment, trail, or company-type filter. Running the radar now keeps both matching and below-threshold roles.</span></div> : <div className="radar-opportunity-list">{visibleOpportunities.map((opportunity) => <article key={opportunity.id} className={opportunity.alignmentPasses ? "alignment-match" : "alignment-below"}><div className="opportunity-score"><strong>{opportunity.fitScore}</strong><span>{opportunity.alignmentPasses ? "match" : "below"}</span></div><div className="opportunity-copy"><span>{opportunity.company} · {opportunity.location}</span><h3>{opportunity.title}</h3><div className="opportunity-tags"><em>{opportunity.targetPosition}</em><em>{opportunity.trackLabel}</em><em>{opportunity.companyCategory}</em><em className={opportunity.origin === "v-watch" ? "suggested" : opportunity.origin === "monitored" ? "monitored" : "imported"}>{opportunity.origin === "v-watch" ? "Suggested by V’s" : opportunity.origin === "imported" ? "Imported by you" : opportunity.origin === "linkedin-saved" ? "Saved on LinkedIn" : "Company you monitor"}</em>{!opportunity.alignmentPasses && <em className="below">Below {profileDraft.minScore}% threshold</em>}</div><p>{opportunity.fitSummary}</p><small>{opportunity.origin === "v-watch" ? "Suggested by V’s Job Watch" : opportunity.origin === "imported" ? "Imported from a link you provided" : opportunity.origin === "linkedin-saved" ? "From your official LinkedIn saved-jobs export" : "Found from a monitored company"} · found {compactDate(opportunity.discoveredAt)} · {opportunity.sourceType}</small></div><div className="opportunity-actions"><a href={opportunity.sourceUrl} target="_blank" rel="noreferrer">View original ↗</a>{opportunity.status !== "shortlisted" && <button onClick={() => updateOpportunity(opportunity, "shortlisted")}>Approve for prep</button>}{opportunity.status === "shortlisted" && <button className="primary" onClick={() => prepare(opportunity)}>Prepare application</button>}{opportunity.status !== "dismissed" && <button onClick={() => updateOpportunity(opportunity, "dismissed")}>Dismiss</button>}{opportunity.status !== "archived" && <button onClick={() => updateOpportunity(opportunity, "archived")}>Archive</button>}{(opportunity.status === "dismissed" || opportunity.status === "archived") && <button onClick={() => updateOpportunity(opportunity, "reviewing")}>Restore</button>}</div></article>)}</div>}
    </section>
  </section>;
}

function rankCareerLinks(links: Array<{ href: string; label: string }>) {
  return links
    .filter((link) => /^https?:\/\//i.test(link.href) && !/linkedin\.com|indeed\.com/i.test(link.href))
    .map((link) => {
      const text = `${link.label} ${link.href}`.toLowerCase();
      const score = /career/.test(text) ? 50 : /\bjobs?\b/.test(text) ? 45 : /opportunit/.test(text) ? 40 : /openings?|open roles?/.test(text) ? 35 : /join(?:-|\s)?us|work(?:-|\s)?with(?:-|\s)?us/.test(text) ? 30 : 0;
      const ats = /greenhouse|lever|ashby|workday|smartrecruiters|jobvite/.test(text) ? 20 : 0;
      return { ...link, score: score + ats };
    })
    .filter((link) => link.score > 0)
    .sort((left, right) => right.score - left.score || left.href.length - right.href.length);
}

function profileToDraft(profile: RadarProfile): ProfileDraft {
  return {
    titles: profile.titles.join("\n"),
    skills: profile.skills.join("\n"),
    locations: profile.locations.join("\n"),
    workModes: [...profile.workModes],
    goals: profile.goals,
    exclusions: profile.exclusions.join("\n"),
    minScore: profile.minScore,
  };
}

function draftToProfile(draft: ProfileDraft): RadarProfile {
  return {
    titles: list(draft.titles),
    skills: list(draft.skills),
    locations: list(draft.locations),
    workModes: draft.workModes,
    goals: draft.goals.trim(),
    exclusions: list(draft.exclusions),
    minScore: draft.minScore,
  };
}

function list(value: string) {
  return [...new Set(value.split(/[,\n]/).map((item) => item.trim()).filter(Boolean))];
}

// SQLite CURRENT_TIMESTAMP values are UTC without a zone marker; pin them to
// UTC before formatting in the visitor's local zone.
function parseTimestamp(value: string) {
  return new Date(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(value) ? `${value.replace(" ", "T")}Z` : value);
}

function compactDate(value: string) {
  const date = parseTimestamp(value);
  if (!Number.isFinite(date.getTime())) return "unknown";
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: date.getFullYear() === new Date().getFullYear() ? undefined : "numeric" }).format(date);
}

function compactDateTime(value: string) {
  const date = parseTimestamp(value);
  if (!Number.isFinite(date.getTime())) return "unknown";
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(date);
}

function monitorCoverage(monitor: RadarMonitor) {
  if (!monitor.active) return { tone: "paused", label: "Archived target" };
  if (monitor.lastRunStatus === "limited") return { tone: "limited", label: "Reference-only coverage" };
  if (monitor.lastRunStatus === "failed") return { tone: "failed", label: "Source needs attention" };
  if (monitor.lastRunStatus === "completed" && (monitor.lastRunFoundCount || 0) > 0) return { tone: "completed", label: "Radar working" };
  if (monitor.lastRunStatus === "completed") return { tone: "empty", label: "Checked · no matches" };
  return { tone: "pending", label: "Not checked yet" };
}

function autoScanKey() {
  const now = new Date();
  const slot = now.getHours() < 12 ? "morning" : "afternoon";
  return `v-jobs-radar-auto-${now.toISOString().slice(0, 10)}-${slot}`;
}
