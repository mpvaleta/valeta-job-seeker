"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { DEFAULT_RADAR_PROFILE } from "@/lib/radar.mjs";
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
  kind: string;
  market: string;
  notes: string;
  focus: string;
  cadence: "weekly" | "manual";
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
  automation?: { weeklyCatchUp?: boolean; backgroundScheduler?: string };
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
  const [filter, setFilter] = useState<"active" | "shortlisted" | "dismissed" | "all">("active");
  const [company, setCompany] = useState("");
  const [kind, setKind] = useState("Brand");
  const [websiteUrl, setWebsiteUrl] = useState("");
  const [careersUrl, setCareersUrl] = useState("");
  const [focus, setFocus] = useState("Creative operations, brand programs, project management, production");
  const [cadence, setCadence] = useState<"weekly" | "manual">("weekly");
  const autoScanStarted = useRef(false);

  const visibleOpportunities = useMemo(() => opportunities
    .filter((item) => filter === "all" ? true : filter === "active" ? item.status !== "dismissed" : item.status === filter)
    .sort((left, right) => right.fitScore - left.fitScore || right.discoveredAt.localeCompare(left.discoveredAt)), [filter, opportunities]);
  const newCount = opportunities.filter((item) => item.status === "new").length;
  const shortlistedCount = opportunities.filter((item) => item.status === "shortlisted").length;

  useEffect(() => {
    let active = true;
    fetch("/api/radar", { cache: "no-store" })
      .then(async (response) => ({ response, data: await response.json() as RadarPayload }))
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

  async function mutate(body: Record<string, unknown>, label: string) {
    setBusy(label);
    try {
      const response = await fetch("/api/radar", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const data = await response.json() as RadarPayload;
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
    }
  }

  async function saveProfile() {
    const data = await mutate({ action: "save_profile", profile: draftToProfile(profileDraft) }, "profile");
    if (data) onNotice("Radar goals saved. Future scans will use these roles, skills, locations, and exclusions.");
  }

  async function addMonitor() {
    if (!company.trim() || !careersUrl.trim()) { onNotice("Add the company name and its public careers page."); return; }
    const data = await mutate({ action: "add_monitor", monitor: { company, kind, websiteUrl, careersUrl, focus, cadence, market: "San Francisco Bay Area / United States" } }, "target");
    if (!data) return;
    setCompany(""); setWebsiteUrl(""); setCareersUrl("");
    onNotice("Radar target added. Run the radar now or leave it on weekly catch-up.");
  }

  async function runScan(options: { monitorId?: string; dueOnly?: boolean; automatic?: boolean } = {}) {
    const data = await mutate({ action: "scan", monitorId: options.monitorId, dueOnly: Boolean(options.dueOnly) }, "scan");
    if (!data) return;
    const result = data.result || {};
    const failures = result.failures?.length || 0;
    if (!options.automatic) onNotice(`${result.checked || 0} ${result.checked === 1 ? "target" : "targets"} checked · ${result.added || 0} new matching ${result.added === 1 ? "role" : "roles"}${failures ? ` · ${failures} source ${failures === 1 ? "needs" : "need"} attention` : ""}`);
  }

  async function updateMonitor(monitorId: string, patch: Record<string, unknown>) {
    await mutate({ action: "update_monitor", monitorId, patch }, `monitor-${monitorId}`);
  }

  async function removeMonitor(monitorId: string) {
    const data = await mutate({ action: "delete_monitor", monitorId }, `monitor-${monitorId}`);
    if (data) onNotice("Radar target removed. Existing discoveries remain in your inbox.");
  }

  async function updateOpportunity(opportunity: RadarOpportunity, status: RadarOpportunity["status"]) {
    const data = await mutate({ action: "set_opportunity_status", opportunityId: opportunity.id, status }, `opportunity-${opportunity.id}`);
    if (data && status === "shortlisted") onNotice("Role approved for preparation. V’s will not submit anything without you.");
  }

  async function prepare(opportunity: RadarOpportunity) {
    await updateOpportunity(opportunity, "reviewing");
    await onPrepare(opportunity);
  }

  return <section className="radar-workspace">
    <div className="radar-hero">
      <div><span>V’S WEEKLY JOB RADAR</span><h2>Choose the companies. V’s finds the roles worth your attention.</h2><p>Monitor public company career pages and official ATS boards. Matching roles enter a review inbox; nothing is applied to or submitted automatically.</p></div>
      <div className={`radar-connection ${connection}`}><i /><div><strong>{connection === "loading" ? "Opening radar" : connection === "ready" ? "Private radar ready" : "Radar needs attention"}</strong><span>{connectionMessage}</span></div></div>
    </div>

    <div className="radar-metrics">
      <div><span>Active targets</span><strong>{monitors.filter((item) => item.active).length}</strong><small>{dueCount} due for a weekly check</small></div>
      <div><span>New discoveries</span><strong>{newCount}</strong><small>Waiting for your review</small></div>
      <div><span>Approved to prepare</span><strong>{shortlistedCount}</strong><small>No automatic applications</small></div>
      <div><span>Last radar run</span><strong>{lastRunAt ? compactDate(lastRunAt) : "Not yet"}</strong><small>Automatic catch-up when V’s opens</small></div>
    </div>

    <div className="radar-config-grid">
      <article className="radar-goals-card">
        <div className="card-heading"><div><span>01 · SEARCH GOALS</span><h3>What should count as a good lead?</h3></div><button className="primary" onClick={saveProfile} disabled={Boolean(busy)}>{busy === "profile" ? "Saving…" : "Save goals"}</button></div>
        <label>Target positions<textarea value={profileDraft.titles} onChange={(event) => setProfileDraft({ ...profileDraft, titles: event.target.value })} placeholder="One per line: Creative Operations Manager…" /></label>
        <label>Skills and themes<textarea value={profileDraft.skills} onChange={(event) => setProfileDraft({ ...profileDraft, skills: event.target.value })} placeholder="Creative operations, integrated production…" /></label>
        <div className="radar-two"><label>Markets<textarea value={profileDraft.locations} onChange={(event) => setProfileDraft({ ...profileDraft, locations: event.target.value })} /></label><label>Exclude<textarea value={profileDraft.exclusions} onChange={(event) => setProfileDraft({ ...profileDraft, exclusions: event.target.value })} placeholder="Commission only, unpaid…" /></label></div>
        <label>Career goals<textarea value={profileDraft.goals} onChange={(event) => setProfileDraft({ ...profileDraft, goals: event.target.value })} /></label>
        <div className="radar-preferences"><fieldset><legend>Work style</legend>{["On-site", "Hybrid", "Remote"].map((mode) => <label key={mode}><input type="checkbox" checked={profileDraft.workModes.includes(mode)} onChange={(event) => setProfileDraft({ ...profileDraft, workModes: event.target.checked ? [...profileDraft.workModes, mode] : profileDraft.workModes.filter((item) => item !== mode) })} />{mode}</label>)}</fieldset><label>Minimum alignment <strong>{profileDraft.minScore}%</strong><input type="range" min="20" max="90" step="5" value={profileDraft.minScore} onChange={(event) => setProfileDraft({ ...profileDraft, minScore: Number(event.target.value) })} /></label></div>
      </article>

      <article className="radar-target-card">
        <div className="card-heading"><div><span>02 · ADD A TARGET</span><h3>Company, brand, agency, or team</h3></div></div>
        <label>Company name<input value={company} onChange={(event) => setCompany(event.target.value)} placeholder="e.g. Apple" /></label>
        <div className="radar-two"><label>Type<select value={kind} onChange={(event) => setKind(event.target.value)}><option>Brand</option><option>Agency</option><option>Sports</option><option>Tech</option><option>Company</option></select></label><label>Cadence<select value={cadence} onChange={(event) => setCadence(event.target.value as "weekly" | "manual")}><option value="weekly">Weekly</option><option value="manual">Manual only</option></select></label></div>
        <label>Public careers page<input type="url" value={careersUrl} onChange={(event) => setCareersUrl(event.target.value)} placeholder="Company careers, Greenhouse, Lever, or Ashby URL" /></label>
        <label>Website <small>optional</small><input type="url" value={websiteUrl} onChange={(event) => setWebsiteUrl(event.target.value)} placeholder="https://" /></label>
        <label>Target-specific focus<textarea value={focus} onChange={(event) => setFocus(event.target.value)} /></label>
        <button className="primary wide-action" onClick={addMonitor} disabled={Boolean(busy)}>{busy === "target" ? "Adding…" : "Add to radar"}</button>
        <div className="radar-safety-note"><strong>Public sources only</strong><span>LinkedIn scraping is not used. Add the employer’s careers page or official ATS board.</span></div>
      </article>
    </div>

    <section className="radar-targets-section">
      <div className="radar-section-head"><div><span>MONITORED TARGETS</span><h2>{monitors.length} saved {monitors.length === 1 ? "company" : "companies"}</h2></div><button className="primary" onClick={() => runScan()} disabled={Boolean(busy) || !monitors.some((item) => item.active)}>{busy === "scan" ? "Scanning public career pages…" : "Run radar now"}</button></div>
      {!monitors.length ? <div className="empty-state compact"><strong>Add the first company you want V’s to watch.</strong><span>Use its official careers URL. Weekly targets are checked when the app opens after they become due, and you can run the radar anytime.</span></div> : <div className="radar-target-list">{monitors.map((monitor) => <article key={monitor.id} className={!monitor.active ? "paused" : ""}><div className="radar-target-main"><span>{monitor.kind}</span><strong>{monitor.company}</strong><small>{monitor.focus || "Uses your global radar goals"}</small><a href={monitor.careersUrl} target="_blank" rel="noreferrer">Open careers page ↗</a></div><div className="radar-target-status"><strong>{monitor.active ? monitor.cadence === "weekly" ? "Weekly" : "Manual" : "Paused"}</strong><span>{monitor.lastCheckedAt ? `Checked ${compactDate(monitor.lastCheckedAt)}` : "Never checked"}</span></div><div className="radar-target-actions"><button onClick={() => runScan({ monitorId: monitor.id })} disabled={Boolean(busy) || !monitor.active}>Check now</button><button onClick={() => updateMonitor(monitor.id, { active: !monitor.active })}>{monitor.active ? "Pause" : "Resume"}</button><button onClick={() => removeMonitor(monitor.id)}>Remove</button></div></article>)}</div>}
      <p className="scheduler-note"><strong>Weekly behavior:</strong> V’s automatically catches up on due targets when you open the private app. The Worker contains a background-scan hook; activating a true closed-app schedule still requires a verified hosting scheduler trigger.</p>
    </section>

    <section className="radar-inbox">
      <div className="radar-section-head"><div><span>DISCOVERY INBOX</span><h2>{visibleOpportunities.length} matching {visibleOpportunities.length === 1 ? "role" : "roles"}</h2></div><div className="radar-filters">{([['active','Active'],['shortlisted','Approved'],['dismissed','Dismissed'],['all','All']] as const).map(([id, label]) => <button key={id} className={filter === id ? "selected" : ""} onClick={() => setFilter(id)}>{label}</button>)}</div></div>
      {!visibleOpportunities.length ? <div className="empty-state"><strong>No roles in this view yet.</strong><span>Save your goals, add a company’s public careers page, then run the radar.</span></div> : <div className="radar-opportunity-list">{visibleOpportunities.map((opportunity) => <article key={opportunity.id}><div className="opportunity-score"><strong>{opportunity.fitScore}</strong><span>alignment</span></div><div className="opportunity-copy"><span>{opportunity.company} · {opportunity.location}</span><h3>{opportunity.title}</h3><p>{opportunity.fitSummary}</p><small>Found {compactDate(opportunity.discoveredAt)} · {opportunity.sourceType}</small></div><div className="opportunity-actions"><a href={opportunity.sourceUrl} target="_blank" rel="noreferrer">View original ↗</a>{opportunity.status !== "shortlisted" && <button onClick={() => updateOpportunity(opportunity, "shortlisted")}>Approve for prep</button>}{opportunity.status === "shortlisted" && <button className="primary" onClick={() => prepare(opportunity)}>Prepare application</button>}{opportunity.status !== "dismissed" && <button onClick={() => updateOpportunity(opportunity, "dismissed")}>Dismiss</button>}</div></article>)}</div>}
    </section>
  </section>;
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
