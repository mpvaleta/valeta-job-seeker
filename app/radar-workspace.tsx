"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { DEFAULT_RADAR_PROFILE } from "@/lib/radar.mjs";
import { readJsonResponse } from "@/lib/http-json.mjs";
import type { RadarProfile } from "@/lib/radar.mjs";

export type RadarOpportunity = {
  id: string;
  companyId: string | null;
  company: string;
  title: string;
  location: string;
  sourceUrl: string;
  sourceType: string;
  fitScore: number;
  fitSummary: string;
  status: "new" | "reviewing" | "shortlisted" | "dismissed" | "applied";
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
  cadence: "twice_daily" | "daily" | "manual";
  active: boolean;
  lastCheckedAt: string | null;
  createdAt: string;
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
  result?: { checked?: number; found?: number; added?: number; failures?: Array<{ company: string; message: string }> };
  automation?: { dailyCatchUp?: boolean; backgroundScheduler?: string };
};

type RadarLinkPayload = {
  ok?: boolean;
  message?: string;
  source?: { finalUrl: string; title: string; links?: Array<{ href: string; label: string }> };
};

type Props = {
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

export function RadarWorkspace({ onPrepare, onNotice, onError }: Props) {
  const [profileDraft, setProfileDraft] = useState<ProfileDraft>(initialDraft);
  const [monitors, setMonitors] = useState<RadarMonitor[]>([]);
  const [opportunities, setOpportunities] = useState<RadarOpportunity[]>([]);
  const [dueCount, setDueCount] = useState(0);
  const [lastRunAt, setLastRunAt] = useState<string | null>(null);
  const [connection, setConnection] = useState<"loading" | "ready" | "error">("loading");
  const [connectionMessage, setConnectionMessage] = useState("Opening your private radar…");
  const [busy, setBusy] = useState("");
  const [progress, setProgress] = useState("");
  const [filter, setFilter] = useState<"active" | "shortlisted" | "dismissed" | "all">("active");
  const [company, setCompany] = useState("");
  const [kind, setKind] = useState(TARGET_TYPES[0]);
  const [websiteUrl, setWebsiteUrl] = useState("");
  const [careersUrl, setCareersUrl] = useState("");
  const [referenceUrl, setReferenceUrl] = useState("");
  const [sourceKind, setSourceKind] = useState(REFERENCE_SOURCES[0]);
  const [focus, setFocus] = useState("Creative operations, brand programs, project management, production");
  const [cadence, setCadence] = useState<"twice_daily" | "daily" | "manual">("twice_daily");
  const autoScanStarted = useRef(false);

  const visibleOpportunities = useMemo(() => opportunities
    .filter((item) => filter === "all" ? true : filter === "active" ? item.status !== "dismissed" : item.status === filter)
    .sort((left, right) => right.fitScore - left.fitScore || right.discoveredAt.localeCompare(left.discoveredAt)), [filter, opportunities]);
  const newCount = opportunities.filter((item) => item.status === "new").length;
  const shortlistedCount = opportunities.filter((item) => item.status === "shortlisted").length;

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
    if (data.profile) setProfileDraft(profileToDraft(data.profile));
    if (Array.isArray(data.monitors)) setMonitors(data.monitors);
    if (Array.isArray(data.opportunities)) setOpportunities(data.opportunities);
    setDueCount(data.dueCount || 0);
    setLastRunAt(data.lastRunAt || null);
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
    if (!company.trim() || (!careersUrl.trim() && !websiteUrl.trim())) { onNotice("Add the company name and either its website or public careers page."); return; }
    const data = await mutate({ action: "add_monitor", monitor: { company, kind, websiteUrl, careersUrl, referenceUrl, sourceKind, focus, cadence, market: "San Francisco Bay Area / United States" } }, "target", "Validating public sources and saving this radar target…");
    if (!data) return;
    setCompany(""); setWebsiteUrl(""); setCareersUrl(""); setReferenceUrl(""); setSourceKind("None");
    onNotice("Radar target added. V’s catches up when it opens; you can also scan now. Background timing activates once the hosting scheduler is connected.");
  }

  async function runScan(options: { monitorId?: string; dueOnly?: boolean; automatic?: boolean } = {}) {
    const data = await mutate({ action: "scan", monitorId: options.monitorId, dueOnly: Boolean(options.dueOnly) }, "scan", "Opening public career sources, collecting roles, and scoring them against your saved goals…");
    if (!data) return;
    const result = data.result || {};
    const failures = result.failures?.length || 0;
    if (!options.automatic) onNotice(`${result.checked || 0} ${result.checked === 1 ? "target" : "targets"} checked · ${result.added || 0} new matching ${result.added === 1 ? "role" : "roles"}${failures ? ` · ${failures} source ${failures === 1 ? "needs" : "need"} attention` : ""}`);
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
      <div><span>New discoveries</span><strong>{newCount}</strong><small>Waiting for your review</small></div>
      <div><span>Approved to prepare</span><strong>{shortlistedCount}</strong><small>No automatic applications</small></div>
      <div><span>Last radar run</span><strong>{lastRunAt ? compactDate(lastRunAt) : "Not yet"}</strong><small>Daily catch-up when V’s opens</small></div>
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
        <label>Company website<input type="url" value={websiteUrl} onChange={(event) => setWebsiteUrl(event.target.value)} placeholder="https://company.com" /></label>
        <div className="careers-discovery"><label>Public careers page <small>optional if website is provided</small><input type="url" value={careersUrl} onChange={(event) => setCareersUrl(event.target.value)} placeholder="Company careers, Greenhouse, Lever, Ashby, or Workday URL" /></label><button onClick={findCareersPage} disabled={Boolean(busy) || !websiteUrl.trim()}>{busy === "find-careers" ? "Finding…" : "Find careers page"}</button></div>
        <div className="radar-two"><label>Reference source<select value={sourceKind} onChange={(event) => setSourceKind(event.target.value)}>{REFERENCE_SOURCES.map((item) => <option key={item}>{item}</option>)}</select></label><label>LinkedIn / Indeed / other URL<input type="url" value={referenceUrl} onChange={(event) => setReferenceUrl(event.target.value)} placeholder="Optional reference link" /></label></div>
        <label>Target-specific focus<textarea value={focus} onChange={(event) => setFocus(event.target.value)} /></label>
        <button className="primary wide-action" onClick={addMonitor} disabled={Boolean(busy)}>{busy === "target" ? "Adding…" : "Add to radar"}</button>
        <div className="radar-safety-note"><strong>Public sources only</strong><span>LinkedIn and Indeed links can be saved as references. Automated scanning uses the employer’s public careers page or official ATS board—never your logged-in session.</span></div>
      </article>
    </div>

    <section className="radar-targets-section">
      <div className="radar-section-head"><div><span>MONITORED TARGETS</span><h2>{monitors.length} saved {monitors.length === 1 ? "company" : "companies"}</h2></div><button className="primary" onClick={() => runScan()} disabled={Boolean(busy) || !monitors.some((item) => item.active)}>{busy === "scan" ? "Scanning public career pages…" : "Run radar now"}</button></div>
      {!monitors.length ? <div className="empty-state compact"><strong>Add the first company you want V’s to watch.</strong><span>Add the website and let V’s find the careers page, or paste an official careers URL. Targets catch up when the app opens, and you can run the radar anytime.</span></div> : <div className="radar-target-list">{monitors.map((monitor) => <article key={monitor.id} className={!monitor.active ? "paused" : ""}><div className="radar-target-main"><span>{monitor.kind}</span><strong>{monitor.company}</strong><small>{monitor.focus || "Uses your global radar goals"}</small>{(monitor.careersUrl || monitor.websiteUrl) && <a href={monitor.careersUrl || monitor.websiteUrl} target="_blank" rel="noreferrer">Open scan source ↗</a>}{monitor.referenceUrl && <a href={monitor.referenceUrl} target="_blank" rel="noreferrer">Open {monitor.sourceKind || "reference"} ↗</a>}</div><div className="radar-target-status"><strong>{monitor.active ? monitor.cadence === "twice_daily" ? "Twice daily" : monitor.cadence === "daily" ? "Daily" : "Manual" : "Archived"}</strong><span>{monitor.lastCheckedAt ? `Checked ${compactDate(monitor.lastCheckedAt)}` : "Never checked"}</span></div><div className="radar-target-actions"><button onClick={() => runScan({ monitorId: monitor.id })} disabled={Boolean(busy) || !monitor.active}>Check now</button><button onClick={() => updateMonitor(monitor.id, { active: !monitor.active })}>{monitor.active ? "Pause" : "Resume"}</button>{monitor.active && <button onClick={() => removeMonitor(monitor.id)}>Archive</button>}</div></article>)}</div>}
      <p className="scheduler-note"><strong>Twice-daily behavior:</strong> V’s treats recommended targets as due every 12 hours and catches them up when you open the private app. Exact early-morning and mid-afternoon runs while the app is closed still require the hosting scheduler trigger to be enabled.</p>
    </section>

    <section className="radar-inbox">
      <div className="radar-section-head"><div><span>DISCOVERY INBOX</span><h2>{visibleOpportunities.length} matching {visibleOpportunities.length === 1 ? "role" : "roles"}</h2></div><div className="radar-filters">{([['active','Active'],['shortlisted','Approved'],['dismissed','Dismissed'],['all','All']] as const).map(([id, label]) => <button key={id} className={filter === id ? "selected" : ""} onClick={() => setFilter(id)}>{label}</button>)}</div></div>
      {!visibleOpportunities.length ? <div className="empty-state"><strong>No roles in this view yet.</strong><span>Save your goals, add a company website or careers page, then run the radar.</span></div> : <div className="radar-opportunity-list">{visibleOpportunities.map((opportunity) => <article key={opportunity.id}><div className="opportunity-score"><strong>{opportunity.fitScore}</strong><span>alignment</span></div><div className="opportunity-copy"><span>{opportunity.company} · {opportunity.location}</span><h3>{opportunity.title}</h3><p>{opportunity.fitSummary}</p><small>Found {compactDate(opportunity.discoveredAt)} · {opportunity.sourceType}</small></div><div className="opportunity-actions"><a href={opportunity.sourceUrl} target="_blank" rel="noreferrer">View original ↗</a>{opportunity.status !== "shortlisted" && <button onClick={() => updateOpportunity(opportunity, "shortlisted")}>Approve for prep</button>}{opportunity.status === "shortlisted" && <button className="primary" onClick={() => prepare(opportunity)}>Prepare application</button>}{opportunity.status !== "dismissed" && <button onClick={() => updateOpportunity(opportunity, "dismissed")}>Dismiss</button>}</div></article>)}</div>}
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

function compactDate(value: string) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "unknown";
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: date.getFullYear() === new Date().getFullYear() ? undefined : "numeric" }).format(date);
}

function autoScanKey() {
  return `v-jobs-radar-auto-${new Date().toISOString().slice(0, 10)}`;
}
