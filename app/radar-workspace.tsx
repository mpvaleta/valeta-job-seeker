"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { DEFAULT_RADAR_PROFILE, RADAR_COMPANY_CATEGORIES, RADAR_MARKETS, RADAR_TRACKS, deriveRadarProfileFromCareer, withHomeMarket } from "@/lib/radar.mjs";
import { AGENCY_PACK_GROUPS } from "@/lib/agency-radar-pack";
import { readJsonResponse } from "@/lib/http-json.mjs";
import { OpportunityCard } from "./opportunity-card";
import { compactDate, compactDateTime } from "./radar-format";
import type { DismissalReason, RadarProfile } from "@/lib/radar.mjs";

// The card owns the shape now that Open job search renders the same rows.
export type { RadarOpportunity } from "./opportunity-card";
import type { RadarOpportunity } from "./opportunity-card";

type RadarMonitor = {
  id: string;
  companyId: string;
  company: string;
  websiteUrl: string;
  careersUrl: string;
  referenceUrl: string;
  sourceKind: string;
  contactEmail: string;
  contactNote: string;
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

type RadarLearning = {
  dismissal: { ready: boolean; words: string[]; categories: string[]; reason: string };
  closed: { ready: boolean; words: string[]; companies: string[]; reason: string };
};

type RadarPayload = {
  ok?: boolean;
  code?: string;
  message?: string;
  profile?: RadarProfile;
  monitors?: RadarMonitor[];
  opportunities?: RadarOpportunity[];
  learning?: RadarLearning;
  opportunityTotal?: number;
  dueCount?: number;
  lastRunAt?: string | null;
  excludedNavigationCount?: number;
  result?: {
    checked?: number;
    deferred?: number;
    found?: number;
    discovered?: number;
    belowThreshold?: number;
    added?: number;
    matchedAdded?: number;
    repairedSources?: number;
    mergedDuplicates?: number;
    updated?: number;
    skipped?: string[];
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

type CareerEvidence = {
  facts: string[];
  headline: string;
  summary: string;
  location: string;
};

type Props = {
  savedLinkedInJobs?: SavedLinkedInJob[];
  careerEvidence?: CareerEvidence;
  onOpenJobSearch?: () => void;
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
  companyStagePreference: RadarProfile["companyStagePreference"];
  locationPolicy: RadarProfile["locationPolicy"];
};

const STAGE_PREFERENCE_OPTIONS: Array<{ value: RadarProfile["companyStagePreference"]; label: string }> = [
  { value: "no_preference", label: "No preference" },
  { value: "prefer_startups", label: "Prefer startups / early-stage" },
  { value: "startups_only", label: "Startups / early-stage only" },
];

const TARGET_TYPES = [
  "Startup / Early-stage",
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

// Region filters for the discovery inbox. Job locations arrive as free text
// ("San Francisco or New York · hybrid", "United States · remote"), so exact
// string matching made the old location dropdown nearly useless — one posting
// per option. Regions match the text instead, and more than one can be on at
// once.
const LOCATION_REGIONS: Array<{ id: string; label: string; test: (location: string) => boolean }> = [
  { id: "bay-area", label: "SF Bay Area", test: (value) => /san francisco|bay area|oakland|berkeley|emeryville|san jose|santa clara|sunnyvale|mountain view|palo alto|menlo park|redwood city|san mateo|san bruno|south san francisco|cupertino|fremont|foster city|burlingame|\bsf\b/i.test(value) },
  { id: "remote", label: "Remote", test: (value) => /\bremote\b|\banywhere\b|work from home|\bwfh\b|\bdistributed\b/i.test(value) },
  { id: "new-york", label: "New York", test: (value) => /new york|\bnyc\b|brooklyn|manhattan/i.test(value) },
  { id: "los-angeles", label: "Los Angeles", test: (value) => /los angeles|santa monica|culver city|burbank|el segundo|\bla\b/i.test(value) },
];

// One-press shortcuts for the company types worth separating at a glance.
// Startup leads deliberately: it is the category the owner asked to be able to
// see on its own, and the one the full Company-type dropdown buried eleven
// options deep.
const CATEGORY_SHORTCUTS: Array<{ category: string; label: string; blurb: string }> = [
  { category: "Startup / Early-stage", label: "Startups", blurb: "Early-stage and venture-backed companies, however the posting describes itself." },
  { category: "Creative / Advertising Agency", label: "Advertising", blurb: "Creative shops: brand campaigns, broadcast, integrated production." },
  { category: "Marketing Agency", label: "Marketing & digital", blurb: "Performance, brand, communications, and digital-experience firms." },
  { category: "Production Company", label: "Production", blurb: "Content, experiential, and film production companies." },
  { category: "Sports / Entertainment", label: "Sports", blurb: "Teams, venues, leagues, and entertainment properties." },
  { category: "Brand / Consumer", label: "Brands", blurb: "Consumer brands with in-house creative and marketing teams." },
  { category: "Technology", label: "Tech", blurb: "Technology companies hiring for brand, creative, and programme roles." },
];

function matchesSelectedRegions(location: string, selected: string[]) {
  if (!selected.length) return true;
  const named = LOCATION_REGIONS.filter((region) => region.test(location)).map((region) => region.id);
  return selected.some((id) => id === "other" ? named.length === 0 : named.includes(id));
}
const initialDraft = profileToDraft(DEFAULT_RADAR_PROFILE);

export function RadarWorkspace({ savedLinkedInJobs = [], careerEvidence, onOpenJobSearch, onPrepare, onNotice, onError }: Props) {
  const [profileDraft, setProfileDraft] = useState<ProfileDraft>(initialDraft);
  const [monitors, setMonitors] = useState<RadarMonitor[]>([]);
  const [opportunities, setOpportunities] = useState<RadarOpportunity[]>([]);
  const [learning, setLearning] = useState<RadarLearning | null>(null);
  const [dueCount, setDueCount] = useState(0);
  const [opportunityTotal, setOpportunityTotal] = useState(0);
  const [lastRunAt, setLastRunAt] = useState<string | null>(null);
  const [excludedNavigationCount, setExcludedNavigationCount] = useState(0);
  const [schedulerEnabled, setSchedulerEnabled] = useState(false);
  const [connection, setConnection] = useState<"loading" | "ready" | "error">("loading");
  const [connectionMessage, setConnectionMessage] = useState("Opening your private radar…");
  const [busy, setBusy] = useState("");
  const [progress, setProgress] = useState("");
  const [filter, setFilter] = useState<"active" | "shortlisted" | "dismissed" | "archived" | "all">("active");
  // The page used to stack goals, target management, imports, and the inbox in
  // one scroll; with 100+ monitored companies the inbox — the part that gets
  // daily attention — sat below a wall of configuration. Tabs put it first.
  const [radarTab, setRadarTab] = useState<"inbox" | "targets" | "goals">("inbox");
  const [alignmentFilter, setAlignmentFilter] = useState<"all" | "matching" | "below">("all");
  const [trackFilter, setTrackFilter] = useState("all");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [companyFilter, setCompanyFilter] = useState("all");
  const [originFilter, setOriginFilter] = useState<"all" | "monitored" | "v-watch" | "imported" | "linkedin-saved" | "captured">("all");
  // Newest first is the default the owner asked for: a job board is a queue,
  // and a role collected an hour ago is worth more than a higher-scoring one
  // that has been sitting in the inbox for a fortnight. Best match is still one
  // press away.
  const [sortOrder, setSortOrder] = useState<"newest" | "score">("newest");
  const [importLinks, setImportLinks] = useState("");
  const [targetFilter, setTargetFilter] = useState("all");
  const [locationRegions, setLocationRegions] = useState<string[]>([]);
  const [company, setCompany] = useState("");
  // "Other" is a deliberate neutral default — TARGET_TYPES[0] is "Startup /
  // Early-stage" (ordered that way for the filter dropdown's prominence), so
  // defaulting the Type field to it silently tagged every manually-added
  // company as a startup unless the user remembered to change it.
  const [kind, setKind] = useState("Other");
  const [websiteUrl, setWebsiteUrl] = useState("");
  const [careersUrl, setCareersUrl] = useState("");
  const [referenceUrl, setReferenceUrl] = useState("");
  const [sourceKind, setSourceKind] = useState(REFERENCE_SOURCES[0]);
  const [focus, setFocus] = useState("Creative operations, brand programs, project management, production");
  const [targetPosition, setTargetPosition] = useState("");
  const [cadence, setCadence] = useState<"twice_daily" | "daily" | "manual">("twice_daily");
  const autoScanStarted = useRef(false);
  // Contact fields are edited locally and saved on blur. Writing on every
  // keystroke would fire a request per character; holding the draft here keeps
  // the input responsive and the save deliberate.
  const [contactDrafts, setContactDrafts] = useState<Record<string, { email: string; note: string }>>({});

  const savedTargetPositions = useMemo(() => list(profileDraft.titles), [profileDraft.titles]);
  const companyOptions = useMemo(() => [...new Set([
    ...monitors.map((monitor) => monitor.company),
    ...opportunities.map((opportunity) => opportunity.company),
  ])].sort((left, right) => left.localeCompare(right)), [monitors, opportunities]);
  // Counted before the category filter itself is applied, so pressing one chip
  // never makes the other chips read zero.
  const categoryCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const opportunity of opportunities) {
      if (opportunity.status === "dismissed" || opportunity.status === "archived") continue;
      counts.set(opportunity.companyCategory, (counts.get(opportunity.companyCategory) || 0) + 1);
    }
    return counts;
  }, [opportunities]);
  const regionCounts = useMemo(() => {
    const counts = new Map<string, number>([["other", 0]]);
    for (const region of LOCATION_REGIONS) counts.set(region.id, 0);
    for (const opportunity of opportunities) {
      const named = LOCATION_REGIONS.filter((region) => region.test(opportunity.location));
      if (!named.length) counts.set("other", (counts.get("other") || 0) + 1);
      for (const region of named) counts.set(region.id, (counts.get(region.id) || 0) + 1);
    }
    return counts;
  }, [opportunities]);
  const targetOptions = useMemo(() => [...new Set([
    ...savedTargetPositions,
    ...monitors.map((monitor) => monitor.targetPosition).filter(Boolean),
    ...opportunities.map((opportunity) => opportunity.targetPosition).filter(Boolean),
  ])].sort((left, right) => left.localeCompare(right)), [monitors, opportunities, savedTargetPositions]);
  const visibleOpportunities = useMemo(() => opportunities
    // "expired" is the V's Job Watch batch ageing out: those rows carry the
    // highest scores in the inbox, so left in Active they would sit above every
    // fresh board match while pointing at roles that are weeks old.
    .filter((item) => filter === "all" ? true : filter === "active" ? item.status !== "dismissed" && item.status !== "archived" && item.status !== "expired" : item.status === filter)
    .filter((item) => alignmentFilter === "all" ? true : alignmentFilter === "matching" ? item.alignmentPasses : !item.alignmentPasses)
    .filter((item) => trackFilter === "all" || item.trackId === trackFilter)
    .filter((item) => categoryFilter === "all" || item.companyCategory === categoryFilter)
    .filter((item) => companyFilter === "all" || item.company === companyFilter)
    .filter((item) => originFilter === "all" || item.origin === originFilter)
    .filter((item) => targetFilter === "all" || item.targetPosition === targetFilter || item.trackLabel === targetFilter)
    .filter((item) => matchesSelectedRegions(item.location, locationRegions))
    .sort((left, right) => sortOrder === "newest"
      ? right.discoveredAt.localeCompare(left.discoveredAt) || right.fitScore - left.fitScore
      : right.fitScore - left.fitScore || right.discoveredAt.localeCompare(left.discoveredAt)), [alignmentFilter, categoryFilter, companyFilter, filter, locationRegions, opportunities, originFilter, sortOrder, targetFilter, trackFilter]);
  const newCount = opportunities.filter((item) => item.status === "new").length;
  const shortlistedCount = opportunities.filter((item) => item.status === "shortlisted").length;
  const matchingCount = opportunities.filter((item) => item.alignmentPasses).length;
  const belowThresholdCount = opportunities.filter((item) => !item.alignmentPasses).length;
  const offTargetCount = opportunities.filter((item) => item.offTargetRole && (item.status === "new" || item.status === "reviewing")).length;

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
        if (!data.monitors?.length) {
          const seeded = await mutate({ action: "seed_default_monitors" }, "seed-monitors", "Adding a starter set of companies matching your profile, so the real scan engine has something to search instead of relying only on the fixed V’s Job Watch list…");
          if (seeded) {
            // Scan right away: the dueCount check below still holds the
            // pre-seed payload (zero monitors), so without this the freshly
            // added companies would sit unscanned until the next cron pass.
            autoScanStarted.current = true;
            sessionStorage.setItem(autoScanKey(), "started");
            onNotice("Added a starter set of companies to the radar — scanning their career pages now.");
            await runScan({ dueOnly: true, automatic: true });
          }
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
    if (data.learning) setLearning(data.learning);
    setOpportunityTotal(data.opportunityTotal || 0);
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

  // The toggles and the free-text box edit the same field, so a market ticked
  // above appears in the box below and vice versa. Comparison is
  // case-insensitive because the box is hand-edited.
  function marketSelected(value: string) {
    return list(profileDraft.locations).some((item) => item.toLowerCase() === value.toLowerCase());
  }

  function toggleMarket(value: string, on: boolean) {
    const kept = list(profileDraft.locations).filter((item) => item.toLowerCase() !== value.toLowerCase());
    setProfileDraft({ ...profileDraft, locations: (on ? [...kept, value] : kept).join("\n") });
  }

  // Clears out discoveries collected before the role gate existed. Those rows
  // keep the inflated score the old scorer gave them, and there can be
  // thousands; re-derivation already stops them counting as matches, but the
  // owner still has to scroll past them.
  async function cleanUpInbox() {
    const offTarget = opportunities.filter((item) => item.offTargetRole && (item.status === "new" || item.status === "reviewing")).length;
    if (!offTarget) { onNotice("Nothing to clear — every role in the inbox matches one of your target positions."); return; }
    const data = await mutate({ action: "cleanup_inbox" }, "cleanup", "Removing roles that match none of your target positions…");
    if (data) {
      const removed = (data as { result?: { removed?: number } }).result?.removed ?? 0;
      onNotice(removed
        ? `Removed ${removed} ${removed === 1 ? "role that matched" : "roles that matched"} none of your target positions. Anything you approved, dismissed, or archived was left alone.`
        : "Nothing to clear — every role in the inbox matches one of your target positions.");
    }
  }

  async function saveProfile() {
    const data = await mutate({ action: "save_profile", profile: draftToProfile(profileDraft) }, "profile", "Saving your roles, skills, locations, work modes, and exclusions…");
    if (data) onNotice("Radar goals saved. Future scans will use these roles, skills, locations, and exclusions.");
  }

  /*
   * Fill the goals draft from the user's own approved career evidence.
   *
   * deriveRadarProfileFromCareer only counts what is literally written in the
   * approved facts, so this proposes rather than invents. It is additive and
   * draft-only: nothing the user typed is removed, and nothing reaches the
   * server until they press Save goals.
   */
  function suggestFromCareer() {
    if (!careerEvidence || !careerEvidence.facts.length) {
      onNotice("Approve some career facts first — upload a résumé in Knowledge sources, approve its facts, and the radar can learn your targets from them.");
      return;
    }
    const suggestion = deriveRadarProfileFromCareer(careerEvidence);
    const merge = (draftValue: string, additions: string[]) => {
      const existing = list(draftValue).map((item) => item.toLowerCase());
      const fresh = additions.filter((item) => !existing.includes(item.toLowerCase()));
      return { value: [draftValue.trim(), ...fresh].filter(Boolean).join("\n"), added: fresh.length };
    };
    const titles = merge(profileDraft.titles, suggestion.titles);
    const skills = merge(profileDraft.skills, suggestion.skills);
    const fillLocations = !profileDraft.locations.trim() && suggestion.locations.length;
    const fillGoals = !profileDraft.goals.trim() && suggestion.goals;
    const added = titles.added + skills.added + (fillLocations ? suggestion.locations.length : 0) + (fillGoals ? 1 : 0);
    if (!added) {
      onNotice(`Nothing new to add — your saved goals already cover what the ${suggestion.evidence.factsRead} approved facts describe.`);
      return;
    }
    setProfileDraft({
      ...profileDraft,
      titles: titles.value,
      skills: skills.value,
      locations: fillLocations ? suggestion.locations.join("\n") : profileDraft.locations,
      goals: fillGoals ? suggestion.goals : profileDraft.goals,
    });
    onNotice(`Suggested from ${suggestion.evidence.factsRead} approved facts: ${titles.added} ${titles.added === 1 ? "title" : "titles"} and ${skills.added} recurring ${skills.added === 1 ? "skill" : "skills"} added to the draft. Review the goals, remove anything off, then press Save goals.`);
  }

  async function addMonitor() {
    if (!company.trim()) { onNotice("Add the company name."); return; }
    const data = await mutate({ action: "add_monitor", monitor: { company, kind, websiteUrl, careersUrl, referenceUrl, sourceKind, focus, targetPosition, cadence, market: "San Francisco Bay Area / United States" } }, "target", "Saving the target. If its official source returns no real roles, V’s will search the public web and validate direct job pages…");
    if (!data) return;
    setCompany(""); setWebsiteUrl(""); setCareersUrl(""); setReferenceUrl(""); setSourceKind("None");
    const newMonitorId = typeof data.result === "string" ? data.result : "";
    const scanned = newMonitorId ? await runScan({ monitorId: newMonitorId }) : null;
    if (scanned) {
      onNotice("Radar target added and scanned right away. It will also be checked automatically by the twice-daily background scheduler.");
    } else if (!newMonitorId) {
      onNotice("Radar target added. It will be checked by the next scheduled or manual scan.");
    }
    // If the scan itself failed (e.g. rate limited), runScan's own mutate()
    // call already surfaced the reason — don't overwrite that notice here.
  }

  async function runScan(options: { monitorId?: string; dueOnly?: boolean; automatic?: boolean } = {}) {
    // An automatic catch-up scan sends no profile at all. It fires from a mount
    // effect whose closure can still hold the pre-load default form state, so
    // sending profileDraft here would overwrite the user's saved goals with
    // defaults. The server refuses a non-manual profile too; this is the
    // matching half, so a stale draft never leaves the browser.
    const data = await mutate({ action: "scan", monitorId: options.monitorId, dueOnly: Boolean(options.dueOnly), trigger: options.automatic ? "catch_up" : "manual", profile: options.automatic ? undefined : draftToProfile(profileDraft) }, "scan", "Checking saved sources, repairing stale careers links, following official ATS boards, and retaining every role with its alignment score…");
    if (!data) return;
    const result = data.result || {};
    const failures = result.failures?.length || 0;
    if (!options.automatic) onNotice(`${result.checked || 0} ${result.checked === 1 ? "target" : "targets"} checked · ${result.discovered || 0} roles read · ${result.found || 0} matched · ${result.added || 0} new saved${result.repairedSources ? ` · ${result.repairedSources} source ${result.repairedSources === 1 ? "was" : "were"} repaired` : ""}${result.mergedDuplicates ? ` · ${result.mergedDuplicates} duplicate ${result.mergedDuplicates === 1 ? "row was" : "rows were"} merged` : ""}${failures ? ` · ${failures} ${failures === 1 ? "target needs" : "targets need"} attention` : ""}${result.deferred ? ` · ${result.deferred} longest-waiting ${result.deferred === 1 ? "target goes" : "targets go"} in the next run` : ""}`);
  }

  async function seedAgencyPack(group?: { id: string; label: string }) {
    const data = await mutate(
      { action: "seed_agency_pack", group: group?.id },
      group ? `agency-pack-${group.id}` : "agency-pack",
      group
        ? `Adding ${group.label.toLowerCase()} agencies to your monitored targets…`
        : "Adding U.S. advertising, marketing, digital, and creative agencies — SF Bay Area shops first — to your monitored targets…",
    );
    if (!data) return;
    const result = (data.result || {}) as { added?: number; skipped?: number };
    const noun = group ? `${group.label.toLowerCase()} ${result.added === 1 ? "agency" : "agencies"}` : result.added === 1 ? "agency" : "agencies";
    onNotice(result.added
      ? `${result.added} ${noun} added to the radar${result.skipped ? ` · ${result.skipped} already monitored` : ""}. They will be scanned automatically — or press “Run radar now.”`
      : `Every ${group ? `${group.label.toLowerCase()} agency` : "agency"} in that pack is already on your radar.`);
  }

  async function seedBrandPack() {
    const data = await mutate({ action: "seed_brand_pack" }, "brand-pack", "Adding Bay Area consumer, media, and sports brands with in-house creative and production teams…");
    if (!data) return;
    const result = (data.result || {}) as { added?: number; skipped?: number };
    onNotice(result.added
      ? `${result.added} ${result.added === 1 ? "brand" : "brands"} added to the radar${result.skipped ? ` · ${result.skipped} already monitored` : ""}. Every board in this pack was verified as publicly readable, so they should start returning roles on the next scan.`
      : "Every brand in the pack is already on your radar.");
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

  async function saveContact(monitor: RadarMonitor, patch: { contactEmail?: string; contactNote?: string }) {
    const currentValue = patch.contactEmail != null ? monitor.contactEmail : monitor.contactNote;
    const nextValue = patch.contactEmail ?? patch.contactNote ?? "";
    // Blur fires even when nothing was typed. Saving anyway would write on
    // every click-through of the list.
    if (nextValue.trim() === currentValue.trim()) return;
    const data = await mutate({ action: "update_monitor", monitorId: monitor.id, patch }, `monitor-${monitor.id}`, "Saving this contact…");
    if (!data) return;
    // The store clears an address that is not a plausible email rather than
    // storing a half-typed one, so re-sync the draft from what came back
    // instead of leaving the input showing something that was not saved.
    setContactDrafts((current) => {
      const next = { ...current };
      delete next[monitor.id];
      return next;
    });
    if (patch.contactEmail != null && patch.contactEmail.trim() && !data.monitors?.find((item) => item.id === monitor.id)?.contactEmail) {
      onNotice("That did not look like an email address, so nothing was saved for this company.");
    }
  }

  async function removeMonitor(monitorId: string) {
    const data = await mutate({ action: "delete_monitor", monitorId }, `monitor-${monitorId}`, "Archiving this radar target while preserving its discoveries…");
    if (data) onNotice("Radar target archived. Its discoveries and history remain in your inbox.");
  }

  async function updateOpportunity(opportunity: RadarOpportunity, status: RadarOpportunity["status"], reason?: DismissalReason) {
    const data = await mutate({ action: "set_opportunity_status", opportunityId: opportunity.id, status, reason }, `opportunity-${opportunity.id}`, "Updating this opportunity…");
    if (data && status === "shortlisted") onNotice("Role approved for preparation. V’s will not submit anything without you.");
    if (data && status === "reviewing" && (opportunity.status === "dismissed" || opportunity.status === "archived")) onNotice("Role restored to the active inbox. Its discovery history was never deleted. It no longer teaches the radar either.");
    if (data && reason === "already_applied") onNotice("Filed as already handled. This one does not change what the radar looks for — you wanted it.");
    if (data && reason === "listing_closed") onNotice("Filed as no longer available. The role stays on record, and V’s reads it as interest: once a few closed roles share a word, similar ones are ranked higher — the opposite of “Not for me”.");
    if (data && reason === "not_relevant") onNotice("Noted as not relevant. Once a few roles share a pattern, V’s starts ranking similar ones lower. Words from your own target titles and skills are never learned against you.");
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

    <div className="radar-tabs" role="tablist" aria-label="Radar sections">
      {([["inbox", `Inbox · ${opportunities.length}`], ["targets", `Targets · ${monitors.length}`], ["goals", "Search goals"]] as const).map(([id, label]) => <button key={id} role="tab" aria-selected={radarTab === id} className={radarTab === id ? "selected" : ""} onClick={() => setRadarTab(id)}>{label}</button>)}
      <div className="radar-tabs-actions"><button className="primary" onClick={() => runScan()} disabled={Boolean(busy) || !monitors.some((item) => item.active)} title={!monitors.some((item) => item.active) ? "No active targets. Resume at least one target on the Targets tab, then run the radar." : undefined}>{busy === "scan" ? "Scanning public career pages…" : "Run radar now"}</button></div>
    </div>

    {radarTab === "goals" && <div className="radar-config-grid solo">
      <article className="radar-goals-card">
        <div className="card-heading"><div><span>SEARCH GOALS</span><h3>What should count as a good lead?</h3></div><div className="card-heading-actions"><button onClick={suggestFromCareer} disabled={Boolean(busy)} title="Reads your approved career facts and adds the titles and recurring skills they contain to this draft. Nothing is saved until you press Save goals.">Suggest from my career</button><button className="primary" onClick={saveProfile} disabled={Boolean(busy)}>{busy === "profile" ? "Saving…" : "Save goals"}</button></div></div>
        <label>Target positions<textarea value={profileDraft.titles} onChange={(event) => setProfileDraft({ ...profileDraft, titles: event.target.value })} placeholder="One per line: Brand Project Manager…" /></label>
        <label>Skills and themes<textarea value={profileDraft.skills} onChange={(event) => setProfileDraft({ ...profileDraft, skills: event.target.value })} placeholder="Creative operations, integrated production…" /></label>
        <fieldset className="radar-markets"><legend>Markets</legend>
          <p>The Bay Area is the search. Tick another city only when you want the radar to widen — untick it to go back to local-only.</p>
          <div className="radar-market-toggles">{RADAR_MARKETS.map((market) => {
            const on = market.home || marketSelected(market.value);
            return <label key={market.id} className={market.home ? "home" : undefined}><input type="checkbox" checked={on} disabled={market.home} title={market.home ? "Your home market — always included, even if you clear it from the box below." : undefined} onChange={(event) => toggleMarket(market.value, event.target.checked)} />{market.label}{market.home ? " · always on" : ""}</label>;
          })}</div>
        </fieldset>
        <div className="radar-two"><label>Markets in full<textarea value={profileDraft.locations} onChange={(event) => setProfileDraft({ ...profileDraft, locations: event.target.value })} /><select aria-label="How strictly to apply your markets" value={profileDraft.locationPolicy} onChange={(event) => setProfileDraft({ ...profileDraft, locationPolicy: event.target.value as RadarProfile["locationPolicy"] })}><option value="required">Only these markets (plus remote, if allowed below)</option><option value="preferred">Prefer these markets, but keep roles elsewhere</option></select></label><label>Exclude<textarea value={profileDraft.exclusions} onChange={(event) => setProfileDraft({ ...profileDraft, exclusions: event.target.value })} placeholder="Commission only, unpaid…" /></label></div>
        <label>Career goals<textarea value={profileDraft.goals} onChange={(event) => setProfileDraft({ ...profileDraft, goals: event.target.value })} /></label>
        {learning && <div className="radar-learning">
          <strong>What V’s has learned from your decisions</strong>
          <p><b>Roles you marked no longer available:</b> {learning.closed.ready
            ? <>ranking roles about <b>{learning.closed.words.join(", ")}</b> higher{learning.closed.companies.length ? <> · employers that keep posting them: {learning.closed.companies.join(", ")}</> : null}. Add any of those words to Target positions above to make it permanent.</>
            : learning.closed.reason}</p>
          <p><b>Roles you marked “Not for me”:</b> {learning.dismissal.ready
            ? <>ranking roles about <b>{learning.dismissal.words.join(", ")}</b> lower{learning.dismissal.categories.length ? <>, and the company types {learning.dismissal.categories.join(", ")}</> : null}. Words from your own targets and skills are never learned against you.</>
            : learning.dismissal.reason}</p>
        </div>}
        <div className="radar-preferences"><fieldset><legend>Work style</legend>{["On-site", "Hybrid", "Remote"].map((mode) => <label key={mode}><input type="checkbox" checked={profileDraft.workModes.includes(mode)} onChange={(event) => setProfileDraft({ ...profileDraft, workModes: event.target.checked ? [...profileDraft.workModes, mode] : profileDraft.workModes.filter((item) => item !== mode) })} />{mode}</label>)}</fieldset><label>Minimum alignment <strong>{profileDraft.minScore}%</strong><input type="range" min="20" max="90" step="5" value={profileDraft.minScore} onChange={(event) => setProfileDraft({ ...profileDraft, minScore: Number(event.target.value) })} /></label><label>Company stage<select value={profileDraft.companyStagePreference} onChange={(event) => setProfileDraft({ ...profileDraft, companyStagePreference: event.target.value as RadarProfile["companyStagePreference"] })}>{STAGE_PREFERENCE_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label></div>
      </article>
    </div>}

    {radarTab === "targets" && <div className="radar-config-grid solo">
      <article className="radar-target-card">
        <div className="card-heading"><div><span>ADD A TARGET</span><h3>Company, brand, agency, or team</h3></div></div>
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
    </div>}

    {radarTab === "targets" && <section className="radar-targets-section">
      <div className="radar-section-head"><div><span>MONITORED TARGETS</span><h2>{monitors.length} saved {monitors.length === 1 ? "company" : "companies"}</h2></div><div className="radar-target-actions">{AGENCY_PACK_GROUPS.map((group) => <button key={group.id} onClick={() => seedAgencyPack(group)} disabled={Boolean(busy)} title={`${group.blurb} Adds ${group.entries.length} companies.`}>{busy === `agency-pack-${group.id}` ? `Adding ${group.label.toLowerCase()}…` : `+ ${group.label}`}</button>)}<button onClick={seedBrandPack} disabled={Boolean(busy)} title="Add Bay Area consumer, media, and sports brands with in-house creative and production teams — every board verified as publicly readable">{busy === "brand-pack" ? "Adding brands…" : "Add brand pack"}</button></div></div>
      {monitors.length > 0 && !monitors.some((item) => item.active) && <div className="empty-state compact"><strong>Every target is paused.</strong><span>“Run radar now” stays disabled until at least one target below is resumed.</span></div>}
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
            <div className="monitor-contact">
              <label>
                <span>Contact</span>
                <input
                  type="email"
                  aria-label={`Contact email for ${monitor.company}`}
                  placeholder="Nobody found — add one you have"
                  value={contactDrafts[monitor.id]?.email ?? monitor.contactEmail}
                  onChange={(event) => setContactDrafts((current) => ({ ...current, [monitor.id]: { email: event.target.value, note: current[monitor.id]?.note ?? monitor.contactNote } }))}
                  onBlur={(event) => saveContact(monitor, { contactEmail: event.target.value })}
                  disabled={Boolean(busy)}
                />
              </label>
              <label>
                <span>Note</span>
                <input
                  aria-label={`Contact note for ${monitor.company}`}
                  placeholder="How you know them, or where it came from"
                  value={contactDrafts[monitor.id]?.note ?? monitor.contactNote}
                  onChange={(event) => setContactDrafts((current) => ({ ...current, [monitor.id]: { email: current[monitor.id]?.email ?? monitor.contactEmail, note: event.target.value } }))}
                  onBlur={(event) => saveContact(monitor, { contactNote: event.target.value })}
                  disabled={Boolean(busy)}
                />
              </label>
              {monitor.contactEmail && <a href={`mailto:${monitor.contactEmail}`}>Write to {monitor.contactEmail} ↗</a>}
            </div>
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
        ? "The background scheduler checks for due targets every 2 hours (not just at two fixed times a day) and scans them while the app is closed; each run summary says whether it came from the background scheduler, an app-open catch-up, or a manual scan."
        : "Connecting to the background scheduler…"}</p>
    </section>}

    {radarTab === "inbox" && <section className="radar-inbox">
      <div className="radar-section-head"><div><span>DISCOVERY INBOX</span><h2>{visibleOpportunities.length} discovered {visibleOpportunities.length === 1 ? "role" : "roles"}{opportunityTotal > opportunities.length ? ` · ${opportunityTotal} total` : ""}</h2><small>{opportunityTotal > opportunities.length ? `Showing the newest ${opportunities.length} of ${opportunityTotal} preserved discoveries — nothing was deleted. ` : ""}V keeps below-threshold discoveries too, so a working scan never looks empty.</small></div><div className="radar-filters">{([['active','Active'],['shortlisted','Approved'],['dismissed','Dismissed'],['archived','Archived'],['all','All statuses']] as const).map(([id, label]) => <button key={id} className={filter === id ? "selected" : ""} onClick={() => setFilter(id)}>{label}</button>)}{offTargetCount > 0 && <button className="cleanup" onClick={cleanUpInbox} disabled={Boolean(busy)} title="Deletes untouched roles whose title matches none of your target positions. Approved, dismissed, and archived roles are never removed.">{busy === "cleanup" ? "Clearing…" : `Clear ${offTargetCount} off-target`}</button>}</div></div>
      <div className="radar-category-chips" aria-label="Company type shortcuts">
        <small>Jump to</small>
        {CATEGORY_SHORTCUTS.map((shortcut) => {
          const count = categoryCounts.get(shortcut.category) || 0;
          return <button
            key={shortcut.category}
            className={`chip ${categoryFilter === shortcut.category ? "active" : ""}`}
            onClick={() => setCategoryFilter(categoryFilter === shortcut.category ? "all" : shortcut.category)}
            disabled={!count && categoryFilter !== shortcut.category}
            title={shortcut.blurb}
          >{shortcut.label} <b>{count}</b></button>;
        })}
        {categoryFilter !== "all" && <button className="chip clear" onClick={() => setCategoryFilter("all")}>Clear ×</button>}
      </div>
      <div className="radar-inbox-controls">
        <div className="radar-filters" aria-label="Alignment filter">{([["all",`All alignment (${opportunities.length})`],["matching",`Matching (${matchingCount})`],["below",`Below threshold (${belowThresholdCount})`]] as const).map(([id, label]) => <button key={id} className={alignmentFilter === id ? "selected" : ""} onClick={() => setAlignmentFilter(id)}>{label}</button>)}</div>
        <div className="radar-filters" aria-label="Sort order">{([["newest", "Newest first"], ["score", "Best match"]] as const).map(([id, label]) => <button key={id} className={sortOrder === id ? "selected" : ""} aria-pressed={sortOrder === id} onClick={() => setSortOrder(id)} title={id === "newest" ? "Most recently collected roles at the top." : "Highest alignment score at the top."}>{label}</button>)}</div>
        <label>Company<select value={companyFilter} onChange={(event) => setCompanyFilter(event.target.value)}><option value="all">All companies</option>{companyOptions.map((companyName) => <option key={companyName} value={companyName}>{companyName}</option>)}</select></label>
        <label>Found by<select value={originFilter} onChange={(event) => setOriginFilter(event.target.value as "all" | "monitored" | "v-watch" | "imported" | "linkedin-saved" | "captured")}><option value="all">All discovery sources</option><option value="monitored">Companies I monitor</option><option value="v-watch">Suggested by V’s</option><option value="captured">Captured from a search</option><option value="imported">Imported by me</option><option value="linkedin-saved">Saved on LinkedIn</option></select></label>
        <label>Target position<select value={targetFilter} onChange={(event) => setTargetFilter(event.target.value)}><option value="all">All target positions</option>{targetOptions.map((target) => <option key={target} value={target}>{target}</option>)}</select></label>
        <div className="radar-filters" aria-label="Location filter — pick one or more regions">
          <button className={locationRegions.length === 0 ? "selected" : ""} onClick={() => setLocationRegions([])}>All locations</button>
          {LOCATION_REGIONS.map((region) => <button key={region.id} className={locationRegions.includes(region.id) ? "selected" : ""} aria-pressed={locationRegions.includes(region.id)} onClick={() => setLocationRegions((current) => current.includes(region.id) ? current.filter((id) => id !== region.id) : [...current, region.id])}>{region.label} ({regionCounts.get(region.id) || 0})</button>)}
          <button className={locationRegions.includes("other") ? "selected" : ""} aria-pressed={locationRegions.includes("other")} onClick={() => setLocationRegions((current) => current.includes("other") ? current.filter((id) => id !== "other") : [...current, "other"])}>Other ({regionCounts.get("other") || 0})</button>
        </div>
        <label>Career trail<select value={trackFilter} onChange={(event) => setTrackFilter(event.target.value)}><option value="all">All trails</option>{RADAR_TRACKS.map((track) => <option key={track.id} value={track.id}>{track.label}</option>)}</select></label>
        <label>Company type<select value={categoryFilter} onChange={(event) => setCategoryFilter(event.target.value)}><option value="all">All company types</option>{RADAR_COMPANY_CATEGORIES.map((category) => <option key={category} value={category}>{category}</option>)}</select></label>
      </div>
      {!visibleOpportunities.length ? <div className="empty-state"><strong>No roles match these filters.</strong><span>Change the status, company, discovery source, target position, location, alignment, trail, or company-type filter. Running the radar now keeps both matching and below-threshold roles.</span></div> : <div className="radar-opportunity-list">{visibleOpportunities.map((opportunity) => <OpportunityCard key={opportunity.id} opportunity={opportunity} minScore={profileDraft.minScore} onStatus={updateOpportunity} onPrepare={prepare} />)}</div>}
    </section>}

    {radarTab === "inbox" && <section className="radar-board-handoff">
      <div>
        <span>THE BOARDS V’S CANNOT SCAN</span>
        <strong>LinkedIn, Indeed, Glassdoor and the rest live in Open job search</strong>
        <small>Those boards forbid automated reading, so the radar can never scan them. The Open job search tab builds the exact search for each one — your roles, your places, your freshness window — and remembers which you already worked through.</small>
      </div>
      {onOpenJobSearch && <button className="primary" onClick={onOpenJobSearch}>Open job search →</button>}
    </section>}

    {radarTab === "inbox" && <section className="radar-import">
      <div className="radar-section-head"><div><span>ROLES V’S CANNOT REACH</span><h2>Import a job link directly</h2><small>Some employers — Meta’s job search is the standing example — publish a robots policy that forbids automated collection, and LinkedIn blocks reading entirely. Open the role yourself, then paste its job-details link here. V’s reads only that page, scores it against your goals, and files it in the inbox below.</small></div></div>
      <div className="radar-import-body">
        <label>Public job links <small>one per line</small><textarea value={importLinks} onChange={(event) => setImportLinks(event.target.value)} placeholder={"https://www.metacareers.com/profile/job_details/1234567890/\nhttps://boards.greenhouse.io/example/jobs/100"} /></label>
        <div className="radar-import-actions">
          <button className="primary" onClick={importJobLinks} disabled={Boolean(busy) || !importLinks.trim()}>{busy === "import-links" ? "Reading job pages…" : "Import these roles"}</button>
          <small>Works for any public job-details page, including iCIMS-hosted career sites and TeamWork Online (the sports-industry board) — neither publishes an open API or structured job data, so each link is read individually rather than scanned in bulk. A LinkedIn link cannot be read — open it, copy the description, and use Role workspace instead.</small>
        </div>
        <div className="radar-linkedin-bridge">
          <div><strong>{savedLinkedInJobs.length ? `${savedLinkedInJobs.length} saved ${savedLinkedInJobs.length === 1 ? "job" : "jobs"} found in your LinkedIn export` : "Bring in your saved LinkedIn jobs"}</strong><span>{savedLinkedInJobs.length ? "These come from the official archive you already imported. V\u2019s files them here using only the title, company, and link LinkedIn exported \u2014 it never opens a LinkedIn page." : "LinkedIn does not allow automated reading, and its sign-in grants no job access. Request your official data export, import the ZIP in Knowledge sources, and your saved jobs appear here."}</span></div>
          <button onClick={importSavedLinkedInJobs} disabled={Boolean(busy) || !savedLinkedInJobs.length}>{busy === "import-linkedin" ? "Filing saved roles\u2026" : "Add saved LinkedIn roles"}</button>
        </div>
        <div className="radar-startup-bridge">
          <div>
            <strong>Startup boards</strong>
            <span>Enterprise ATS boards mostly miss startups. Search <a href="https://wellfound.com/jobs" target="_blank" rel="noreferrer">Wellfound</a> or <a href="https://www.workatastartup.com" target="_blank" rel="noreferrer">Y Combinator&rsquo;s Work at a Startup</a>, then paste the role&rsquo;s link above &mdash; a role from either site is filed under Startup / Early-stage automatically, no matter what the posting itself says about funding stage. <a href="https://builtin.com" target="_blank" rel="noreferrer">Built In</a> works the same paste-link way but lists companies of every size, so it is not auto-tagged as a startup.</span>
            <small>Checked directly against each site&rsquo;s published robots policy before adding this: Wellfound and Work at a Startup allow it, but a live page fetch from Wellfound was refused by its own server during this check &mdash; if importing from Wellfound fails, that is most likely why, not a bug in the import itself.</small>
          </div>
        </div>
      </div>
    </section>}
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
    companyStagePreference: profile.companyStagePreference,
    locationPolicy: profile.locationPolicy,
  };
}

function draftToProfile(draft: ProfileDraft): RadarProfile {
  return {
    titles: list(draft.titles),
    skills: list(draft.skills),
    locations: withHomeMarket(list(draft.locations)),
    workModes: draft.workModes,
    goals: draft.goals.trim(),
    exclusions: list(draft.exclusions),
    minScore: draft.minScore,
    companyStagePreference: draft.companyStagePreference,
    locationPolicy: draft.locationPolicy,
  };
}

function list(value: string) {
  return [...new Set(value.split(/[,\n]/).map((item) => item.trim()).filter(Boolean))];
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
