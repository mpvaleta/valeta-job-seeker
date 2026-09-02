"use client";

import { useMemo, useState } from "react";
import type { ReactNode } from "react";
import { RADAR_COMPANY_CATEGORIES, RADAR_TRACKS } from "@/lib/radar.mjs";
import { OpportunityCard } from "./opportunity-card";
import type { RadarOpportunity } from "./opportunity-card";
import type { DismissalReason } from "@/lib/radar.mjs";

/*
 * The discovery inbox: filters, ordering, pagination, selection, and the rows.
 *
 * It lives on its own because both tabs need all of it. The radar tab had the
 * filters and Open job search had none, so a role captured by hand could only
 * be worked through in the other tab — and every decision had to be taken one
 * row at a time, which is what makes an inbox of two hundred roles unusable.
 */

// Region filters for the discovery inbox. Job locations arrive as free text
// ("San Francisco or New York · hybrid", "United States · remote"), so exact
// string matching made the old location dropdown nearly useless — one posting
// per option. Regions match the text instead, and more than one can be on at
// once.
export const LOCATION_REGIONS: Array<{ id: string; label: string; test: (location: string) => boolean }> = [
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

// Enough rows to scan in one screenful, few enough that a decision on the last
// one does not mean scrolling past two hundred others to reach it.
const PAGE_SIZES = [25, 50, 100];

export function matchesSelectedRegions(location: string, selected: string[]) {
  if (!selected.length) return true;
  const named = LOCATION_REGIONS.filter((region) => region.test(location)).map((region) => region.id);
  return selected.some((id) => id === "other" ? named.length === 0 : named.includes(id));
}

type StatusFilter = "active" | "shortlisted" | "dismissed" | "archived" | "all";
type OriginFilter = "all" | "monitored" | "v-watch" | "imported" | "linkedin-saved" | "captured";
type SortOrder = "newest" | "oldest" | "score";

type Props = {
  opportunities: RadarOpportunity[];
  minScore: number;
  busy: boolean;
  label: string;
  // Rendered under the count, after the row totals this component works out.
  note: ReactNode;
  // The count of everything on the server, when more exists than was sent.
  totalCount?: number;
  actions?: ReactNode;
  showCategoryChips?: boolean;
  showOriginFilter?: boolean;
  // Target positions the owner saved but that no stored role carries yet.
  extraTargets?: string[];
  emptyState: ReactNode;
  onStatus: (opportunity: RadarOpportunity, status: RadarOpportunity["status"], reason?: DismissalReason) => void | Promise<void>;
  onBulkStatus: (ids: string[], status: RadarOpportunity["status"], reason?: DismissalReason) => void | Promise<void>;
  onPrepare?: (opportunity: RadarOpportunity) => void | Promise<void>;
};

export function OpportunityInbox({
  opportunities, minScore, busy, label, note, totalCount, actions,
  showCategoryChips = true, showOriginFilter = true, extraTargets = [], emptyState,
  onStatus, onBulkStatus, onPrepare,
}: Props) {
  const [filter, setFilter] = useState<StatusFilter>("active");
  const [alignmentFilter, setAlignmentFilter] = useState<"all" | "matching" | "below">("all");
  const [trackFilter, setTrackFilter] = useState("all");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [companyFilter, setCompanyFilter] = useState("all");
  const [originFilter, setOriginFilter] = useState<OriginFilter>("all");
  const [targetFilter, setTargetFilter] = useState("all");
  const [locationRegions, setLocationRegions] = useState<string[]>([]);
  // Newest first is the default the owner asked for: an inbox is a queue, and a
  // role collected an hour ago is worth more than a higher-scoring one that has
  // been sitting there a fortnight.
  const [sortOrder, setSortOrder] = useState<SortOrder>("newest");
  const [pageSize, setPageSize] = useState(PAGE_SIZES[0]);
  const [page, setPage] = useState(1);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  // Every control resets to the first page. Changing a filter while on page
  // seven would otherwise land on an empty screen that reads as "no results".
  const onFirstPage = <T,>(apply: (value: T) => void) => (value: T) => { apply(value); setPage(1); };

  const companyOptions = useMemo(() => [...new Set(opportunities.map((item) => item.company))]
    .sort((left, right) => left.localeCompare(right)), [opportunities]);
  const targetOptions = useMemo(() => [...new Set([
    ...extraTargets,
    ...opportunities.map((item) => item.targetPosition).filter(Boolean),
  ])].sort((left, right) => left.localeCompare(right)), [extraTargets, opportunities]);
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

  const matchingCount = opportunities.filter((item) => item.alignmentPasses).length;
  const belowThresholdCount = opportunities.filter((item) => !item.alignmentPasses).length;

  const visible = useMemo(() => opportunities
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
    .sort((left, right) => sortOrder === "score"
      ? right.fitScore - left.fitScore || right.discoveredAt.localeCompare(left.discoveredAt)
      : sortOrder === "oldest"
        ? left.discoveredAt.localeCompare(right.discoveredAt) || right.fitScore - left.fitScore
        : right.discoveredAt.localeCompare(left.discoveredAt) || right.fitScore - left.fitScore),
    [alignmentFilter, categoryFilter, companyFilter, filter, locationRegions, opportunities, originFilter, sortOrder, targetFilter, trackFilter]);

  const pageCount = Math.max(1, Math.ceil(visible.length / pageSize));
  // Clamped rather than reset in an effect: a filter that shortens the list
  // must never leave the reader looking at a blank page.
  const currentPage = Math.min(page, pageCount);
  const start = (currentPage - 1) * pageSize;
  const pageRows = visible.slice(start, start + pageSize);

  const selected = new Set(selectedIds);
  const pageSelectedCount = pageRows.filter((item) => selected.has(item.id)).length;
  const selectedOnScreen = visible.filter((item) => selected.has(item.id));

  function toggleSelected(id: string, on: boolean) {
    setSelectedIds((current) => on ? [...new Set([...current, id])] : current.filter((value) => value !== id));
  }

  function togglePage(on: boolean) {
    const ids = pageRows.map((item) => item.id);
    setSelectedIds((current) => on ? [...new Set([...current, ...ids])] : current.filter((value) => !ids.includes(value)));
  }

  async function applyBulk(status: RadarOpportunity["status"], reason?: DismissalReason) {
    const ids = selectedOnScreen.map((item) => item.id);
    if (!ids.length) return;
    await onBulkStatus(ids, status, reason);
    setSelectedIds([]);
  }

  return <>
    <div className="radar-section-head">
      <div>
        <span>{label}</span>
        <h2>{visible.length} {visible.length === 1 ? "role" : "roles"}{visible.length !== opportunities.length ? ` of ${opportunities.length}` : ""}{totalCount && totalCount > opportunities.length ? ` · ${totalCount} kept in all` : ""}</h2>
        <small>{note}</small>
      </div>
      <div className="radar-filters">
        {([["active", "Active"], ["shortlisted", "Approved"], ["dismissed", "Dismissed"], ["archived", "Archived"], ["all", "All statuses"]] as const)
          .map(([id, text]) => <button key={id} className={filter === id ? "selected" : ""} onClick={() => onFirstPage(setFilter)(id)}>{text}</button>)}
        {actions}
      </div>
    </div>

    {showCategoryChips && <div className="radar-category-chips" aria-label="Company type shortcuts">
      <small>Jump to</small>
      {CATEGORY_SHORTCUTS.map((shortcut) => {
        const count = categoryCounts.get(shortcut.category) || 0;
        return <button
          key={shortcut.category}
          className={`chip ${categoryFilter === shortcut.category ? "active" : ""}`}
          onClick={() => onFirstPage(setCategoryFilter)(categoryFilter === shortcut.category ? "all" : shortcut.category)}
          disabled={!count && categoryFilter !== shortcut.category}
          title={shortcut.blurb}
        >{shortcut.label} <b>{count}</b></button>;
      })}
      {categoryFilter !== "all" && <button className="chip clear" onClick={() => onFirstPage(setCategoryFilter)("all")}>Clear ×</button>}
    </div>}

    <div className="radar-inbox-controls">
      <div className="radar-filters" aria-label="Sort order">
        <small className="control-label">Order</small>
        {([["newest", "Newest first"], ["oldest", "Oldest first"], ["score", "Best match"]] as const).map(([id, text]) => <button
          key={id}
          className={sortOrder === id ? "selected" : ""}
          aria-pressed={sortOrder === id}
          onClick={() => onFirstPage(setSortOrder)(id)}
          title={id === "newest" ? "Most recently collected roles at the top." : id === "oldest" ? "Longest-waiting roles at the top — the ones about to go stale." : "Highest alignment score at the top."}
        >{text}</button>)}
      </div>
      <div className="radar-filters" aria-label="Alignment filter">
        {([["all", `All alignment (${opportunities.length})`], ["matching", `Matching (${matchingCount})`], ["below", `Below threshold (${belowThresholdCount})`]] as const)
          .map(([id, text]) => <button key={id} className={alignmentFilter === id ? "selected" : ""} onClick={() => onFirstPage(setAlignmentFilter)(id)}>{text}</button>)}
      </div>
      <label>Company<select value={companyFilter} onChange={(event) => onFirstPage(setCompanyFilter)(event.target.value)}><option value="all">All companies</option>{companyOptions.map((companyName) => <option key={companyName} value={companyName}>{companyName}</option>)}</select></label>
      {showOriginFilter && <label>Found by<select value={originFilter} onChange={(event) => onFirstPage(setOriginFilter)(event.target.value as OriginFilter)}><option value="all">All discovery sources</option><option value="monitored">Companies I monitor</option><option value="v-watch">Suggested by V’s</option><option value="captured">Captured from a search</option><option value="imported">Imported by me</option><option value="linkedin-saved">Saved on LinkedIn</option></select></label>}
      <label>Target position<select value={targetFilter} onChange={(event) => onFirstPage(setTargetFilter)(event.target.value)}><option value="all">All target positions</option>{targetOptions.map((target) => <option key={target} value={target}>{target}</option>)}</select></label>
      <div className="radar-filters" aria-label="Location filter — pick one or more regions">
        <button className={locationRegions.length === 0 ? "selected" : ""} onClick={() => onFirstPage(setLocationRegions)([])}>All locations</button>
        {LOCATION_REGIONS.map((region) => <button key={region.id} className={locationRegions.includes(region.id) ? "selected" : ""} aria-pressed={locationRegions.includes(region.id)} onClick={() => onFirstPage(setLocationRegions)(locationRegions.includes(region.id) ? locationRegions.filter((id) => id !== region.id) : [...locationRegions, region.id])}>{region.label} ({regionCounts.get(region.id) || 0})</button>)}
        <button className={locationRegions.includes("other") ? "selected" : ""} aria-pressed={locationRegions.includes("other")} onClick={() => onFirstPage(setLocationRegions)(locationRegions.includes("other") ? locationRegions.filter((id) => id !== "other") : [...locationRegions, "other"])}>Other ({regionCounts.get("other") || 0})</button>
      </div>
      <label>Career trail<select value={trackFilter} onChange={(event) => onFirstPage(setTrackFilter)(event.target.value)}><option value="all">All trails</option>{RADAR_TRACKS.map((track) => <option key={track.id} value={track.id}>{track.label}</option>)}</select></label>
      <label>Company type<select value={categoryFilter} onChange={(event) => onFirstPage(setCategoryFilter)(event.target.value)}><option value="all">All company types</option>{RADAR_COMPANY_CATEGORIES.map((category) => <option key={category} value={category}>{category}</option>)}</select></label>
    </div>

    {visible.length > 0 && <div className="radar-bulk-bar">
      <label className="bulk-select-all">
        <input
          type="checkbox"
          checked={pageRows.length > 0 && pageSelectedCount === pageRows.length}
          ref={(node) => { if (node) node.indeterminate = pageSelectedCount > 0 && pageSelectedCount < pageRows.length; }}
          onChange={(event) => togglePage(event.target.checked)}
        />
        <span>{selectedOnScreen.length ? `${selectedOnScreen.length} selected` : `Select these ${pageRows.length}`}</span>
      </label>
      {selectedOnScreen.length > 0 && <div className="bulk-actions">
        <button onClick={() => applyBulk("shortlisted")} disabled={busy}>Approve for prep</button>
        <button onClick={() => applyBulk("dismissed", "already_applied")} disabled={busy} title="You already applied to these, or you have seen them. Hides them without changing what the radar looks for.">Saw it / applied</button>
        <button onClick={() => applyBulk("dismissed", "not_relevant")} disabled={busy} title="Not the kind of role you want. Once a few share a pattern, V’s ranks similar roles lower.">Not for me</button>
        <button className="closed-listing" onClick={() => applyBulk("dismissed", "listing_closed")} disabled={busy} title="The postings are gone from the employers’ sites. Kept on file, and V’s learns to surface roles like them sooner.">No longer available</button>
        <button onClick={() => applyBulk("archived")} disabled={busy}>Archive</button>
        <button className="bulk-clear" onClick={() => setSelectedIds([])} disabled={busy}>Clear selection</button>
      </div>}
    </div>}

    {!visible.length ? emptyState : <>
      <div className="radar-opportunity-list">{pageRows.map((opportunity) => <OpportunityCard
        key={opportunity.id}
        opportunity={opportunity}
        minScore={minScore}
        selected={selected.has(opportunity.id)}
        onSelect={toggleSelected}
        onStatus={onStatus}
        onPrepare={onPrepare}
      />)}</div>
      {pageCount > 1 && <div className="radar-pagination">
        <button onClick={() => setPage(currentPage - 1)} disabled={currentPage <= 1}>← Newer page</button>
        <span>{start + 1}–{start + pageRows.length} of {visible.length}</span>
        <button onClick={() => setPage(currentPage + 1)} disabled={currentPage >= pageCount}>Older page →</button>
        <label>Per page<select value={pageSize} onChange={(event) => onFirstPage(setPageSize)(Number(event.target.value))}>{PAGE_SIZES.map((size) => <option key={size} value={size}>{size}</option>)}</select></label>
      </div>}
    </>}
  </>;
}
