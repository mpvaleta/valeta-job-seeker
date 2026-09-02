"use client";

import { compactDate, compactDateTime } from "./radar-format";
import type { DismissalReason } from "@/lib/radar.mjs";

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
  origin: "monitored" | "v-watch" | "imported" | "linkedin-saved" | "captured";
  importedByUser?: boolean;
  targetPosition: string;
  fitScore: number;
  fitSummary: string;
  alignmentPasses: boolean;
  exclusionHit: boolean;
  offTargetRole: boolean;
  status: "new" | "reviewing" | "shortlisted" | "dismissed" | "applied" | "archived" | "expired";
  discoveredAt: string;
  updatedAt: string;
  lastSeenAt?: string | null;
  // The company's board has been read completely since this posting was last
  // seen there, and it was gone — likely closed or unlisted by the employer.
  listingLost?: boolean;
  // Why you dismissed it, when you said. Only set while the row is dismissed.
  dismissedReason?: DismissalReason | null;
};

type Props = {
  opportunity: RadarOpportunity;
  // Shown on the "below threshold" tag, so the card says which bar was missed.
  minScore: number;
  onStatus: (opportunity: RadarOpportunity, status: RadarOpportunity["status"], reason?: DismissalReason) => void | Promise<void>;
  onPrepare?: (opportunity: RadarOpportunity) => void | Promise<void>;
  // Present when the list offers bulk decisions. Without it the row renders
  // exactly as it did before, with no checkbox.
  selected?: boolean;
  onSelect?: (id: string, selected: boolean) => void;
};

/*
 * One discovered role, with its score and every decision that can be taken on
 * it.
 *
 * This lives on its own because two tabs show the same rows: the radar's
 * discovery inbox, and Open job search, where the roles the owner captured by
 * hand are filed. Before this, the inbox card was a single expression inside
 * the radar workspace, so the search tab listed nothing — a captured role
 * disappeared into another tab, score and all.
 */
export function OpportunityCard({ opportunity, minScore, onStatus, onPrepare, selected = false, onSelect }: Props) {
  const originLabel = opportunity.origin === "v-watch" ? "Suggested by V’s"
    : opportunity.origin === "imported" ? "Imported by you"
    : opportunity.origin === "captured" ? "Captured from a search"
    : opportunity.origin === "linkedin-saved" ? "Saved on LinkedIn"
    : "Company you monitor";
  const originNote = opportunity.origin === "v-watch" ? "Suggested by V’s Job Watch"
    : opportunity.origin === "imported" ? "Imported from a link you provided"
    : opportunity.origin === "captured" ? "Captured from a results page you were reading"
    : opportunity.origin === "linkedin-saved" ? "From your official LinkedIn saved-jobs export"
    : "Found from a monitored company";
  return <article className={`${opportunity.alignmentPasses ? "alignment-match" : "alignment-below"}${selected ? " selected" : ""}`}>
    <div className="opportunity-lead">
      {onSelect && <input
        type="checkbox"
        className="opportunity-select"
        checked={selected}
        aria-label={`Select ${opportunity.title} at ${opportunity.company}`}
        onChange={(event) => onSelect(opportunity.id, event.target.checked)}
      />}
      <div className="opportunity-score"><strong>{opportunity.fitScore}</strong><span>{opportunity.alignmentPasses ? "match" : "below"}</span></div>
    </div>
    <div className="opportunity-copy">
      <span>{opportunity.company} · {opportunity.location}</span>
      <h3>{opportunity.title}</h3>
      <div className="opportunity-tags">
        <em>{opportunity.targetPosition}</em>
        <em>{opportunity.trackLabel}</em>
        <em>{opportunity.companyCategory}</em>
        <em className={opportunity.origin === "v-watch" ? "suggested" : opportunity.origin === "monitored" ? "monitored" : "imported"}>{originLabel}</em>
        {opportunity.offTargetRole && <em className="below" title="Nothing in this title matches your target positions or a saved multi-word skill. Add the title to Search goals if you want roles like it.">Not one of your target roles</em>}
        {!opportunity.alignmentPasses && !opportunity.offTargetRole && <em className="below">Below {minScore}% threshold</em>}
        {opportunity.listingLost && <em className="closed" title="This role came from the company's public board, and the newest complete read of that board no longer includes it. Open the original to confirm before spending time on it.">No longer on the company board</em>}
        {opportunity.status === "expired" && <em className="closed" title="This suggestion came from a dated V’s Job Watch batch that has since aged out. Check the original before spending time on it.">Expired suggestion</em>}
        {opportunity.dismissedReason === "listing_closed" && <em className="closed" title="You told V’s this listing was gone. The role stays on file, and roles like it are ranked higher from now on.">You marked it closed</em>}
      </div>
      <p>{opportunity.fitSummary}</p>
      <small>
        <b className="collected-on">Collected {compactDateTime(opportunity.discoveredAt)}</b>
        {opportunity.lastSeenAt && opportunity.lastSeenAt.slice(0, 10) !== opportunity.discoveredAt.slice(0, 10) && <> · still listed {compactDate(opportunity.lastSeenAt)}</>}
        {" · "}{originNote} · {opportunity.sourceType}
      </small>
    </div>
    <div className="opportunity-actions">
      <a href={opportunity.sourceUrl} target="_blank" rel="noreferrer">View original ↗</a>
      {opportunity.status !== "shortlisted" && opportunity.status !== "expired" && <button onClick={() => onStatus(opportunity, "shortlisted")}>Approve for prep</button>}
      {opportunity.status === "shortlisted" && onPrepare && <button className="primary" onClick={() => onPrepare(opportunity)}>Prepare application</button>}
      {opportunity.status !== "dismissed" && <button title="You already applied to this one, or you have seen it before. Hides it without changing what the radar looks for." onClick={() => onStatus(opportunity, "dismissed", "already_applied")}>Saw it / applied</button>}
      {opportunity.status !== "dismissed" && <button title="This is not the kind of role you want. Hides it, and once a few share a pattern V’s ranks similar roles lower." onClick={() => onStatus(opportunity, "dismissed", "not_relevant")}>Not for me</button>}
      {opportunity.status !== "dismissed" && <button className={opportunity.listingLost || opportunity.status === "expired" ? "closed-listing highlight" : "closed-listing"} title="The posting is gone from the employer’s site. Hides it, keeps the record, and teaches V’s to surface roles like this one sooner." onClick={() => onStatus(opportunity, "dismissed", "listing_closed")}>No longer available</button>}
      {opportunity.status !== "archived" && <button onClick={() => onStatus(opportunity, "archived")}>Archive</button>}
      {(opportunity.status === "dismissed" || opportunity.status === "archived") && <button onClick={() => onStatus(opportunity, "reviewing")}>Restore</button>}
    </div>
  </article>;
}
