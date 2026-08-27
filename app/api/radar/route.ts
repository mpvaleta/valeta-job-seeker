import { NextResponse } from "next/server";
import { isTrustedSameOriginMutation } from "@/lib/request-security";
import {
  addRadarMonitor,
  deleteRadarMonitor,
  ensureRadarUser,
  importJobWatchBatch,
  importLinkedInSavedJobs,
  importRadarOpportunities,
  readRadarDashboard,
  saveRadarProfile,
  scanRadar,
  seedDefaultRadarMonitors,
  seedRadarMonitorPack,
  setRadarOpportunityStatus,
  updateRadarMonitor,
} from "@/lib/radar-store";
import { isLinkedInUrl, validatePublicUrl } from "@/lib/public-link-reader.mjs";
import { getRuntimeDatabase } from "@/lib/runtime-bindings";
import { AccessAuthError, resolveAccessIdentity } from "@/lib/access-auth";
import { AGENCY_PACK_GROUPS, AGENCY_RADAR_PACK } from "@/lib/agency-radar-pack";
import { BRAND_RADAR_PACK } from "@/lib/brand-radar-pack";

export const dynamic = "force-dynamic";

function automationState() {
  // wrangler.toml checks in a native Cloudflare Cron Trigger (twice daily)
  // wired to the Worker's scheduled() handler, so background scans run
  // whenever this app is deployed to Cloudflare — independent of
  // RADAR_CRON_SECRET, which only guards the separate /api/radar/cron HTTP
  // fallback for hosts without native cron support.
  return {
    dailyCatchUp: true,
    backgroundScheduler: "enabled",
  };
}

const MAX_BODY_BYTES = 30_000;
const SCAN_WINDOW_MS = 30 * 60 * 1_000;
const SCAN_LIMIT = 8;
const scanRequests = new Map<string, number[]>();

export async function GET(request: Request) {
  try {
    const identity = await requireIdentity(request);
    const db = getRuntimeDatabase();
    const user = await ensureRadarUser(db, identity.email, identity.name);
    const dashboard = await readRadarDashboard(db, user.id);
    return NextResponse.json({ ok: true, ...dashboard, automation: automationState() });
  } catch (cause) {
    return routeError(cause);
  }
}

export async function POST(request: Request) {
  // The browser companion posts captured roles here from its extension
  // origin, proving itself with the access token in an Authorization header.
  if (!isTrustedSameOriginMutation(request, { allowBearerClients: true })) return NextResponse.json({ ok: false, code: "cross_site_request_blocked", message: "This protected action must start inside V’s Job Seeker." }, { status: 403 });
  const contentLength = Number(request.headers.get("content-length") || "0");
  if (contentLength > MAX_BODY_BYTES) return error(413, "request_too_large", "The radar request is too large.");
  const raw = await request.text();
  if (new TextEncoder().encode(raw).byteLength > MAX_BODY_BYTES) return error(413, "request_too_large", "The radar request is too large.");

  try {
    const identity = await requireIdentity(request);
    const db = getRuntimeDatabase();
    const user = await ensureRadarUser(db, identity.email, identity.name);
    const input = JSON.parse(raw) as Record<string, unknown>;
    const action = text(input.action, 80);
    let result: unknown = null;

    if (action === "save_profile") {
      result = await saveRadarProfile(db, user.id, object(input.profile));
    } else if (action === "add_monitor") {
      const monitor = object(input.monitor);
      const careersUrl = monitor.careersUrl ? publicScanUrl(optionalText(monitor.careersUrl, 4_000)) : "";
      const websiteUrl = monitor.websiteUrl ? publicScanUrl(optionalText(monitor.websiteUrl, 4_000)) : "";
      if (!careersUrl && !websiteUrl && !process.env.OPENAI_API_KEY?.trim() && !process.env.GEMINI_API_KEY?.trim()) {
        throw new RadarHttpError(400, "scan_source_required", "Add the company website or careers page, or connect OpenAI/Gemini for company-name public-web discovery.");
      }
      const referenceUrl = monitor.referenceUrl ? validatePublicUrl(optionalText(monitor.referenceUrl, 4_000)).href : "";
      result = await addRadarMonitor(db, user.id, {
        company: text(monitor.company, 180),
        kind: optionalText(monitor.kind, 80),
        websiteUrl,
        careersUrl,
        referenceUrl,
        sourceKind: optionalText(monitor.sourceKind, 80),
        focus: optionalText(monitor.focus, 1_000),
        targetPosition: optionalText(monitor.targetPosition, 180),
        market: optionalText(monitor.market, 180),
        cadence: monitor.cadence === "manual" ? "manual" : monitor.cadence === "daily" ? "daily" : "twice_daily",
      });
    } else if (action === "update_monitor") {
      const monitorId = text(input.monitorId, 100);
      const patch = object(input.patch);
      await updateRadarMonitor(db, user.id, monitorId, {
        active: typeof patch.active === "boolean" ? patch.active : undefined,
        cadence: patch.cadence === "manual" || patch.cadence === "twice_daily" || patch.cadence === "daily" || patch.cadence === "weekly" ? String(patch.cadence) : undefined,
        focus: typeof patch.focus === "string" ? patch.focus : undefined,
        targetPosition: typeof patch.targetPosition === "string" ? patch.targetPosition : undefined,
      });
    } else if (action === "delete_monitor") {
      await deleteRadarMonitor(db, user.id, text(input.monitorId, 100));
    } else if (action === "seed_default_monitors") {
      result = await seedDefaultRadarMonitors(db, user.id);
    } else if (action === "seed_agency_pack") {
      // No group named means every discipline, which is what this action
      // meant before the packs were split.
      const groupId = text(input.group, 40);
      const group = groupId ? AGENCY_PACK_GROUPS.find((entry) => entry.id === groupId) : null;
      if (groupId && !group) return error(400, "invalid_request", "That agency discipline is not one V’s knows.");
      result = await seedRadarMonitorPack(db, user.id, group ? group.entries : AGENCY_RADAR_PACK);
    } else if (action === "seed_brand_pack") {
      result = await seedRadarMonitorPack(db, user.id, BRAND_RADAR_PACK);
    } else if (action === "set_opportunity_status") {
      // reason is only meaningful on a dismissal, and the store discards
      // anything it does not recognise rather than defaulting, so a client that
      // omits it can never accidentally teach the scorer.
      result = await setRadarOpportunityStatus(db, user.id, text(input.opportunityId, 100), text(input.status, 40), typeof input.reason === "string" ? input.reason.slice(0, 40) : undefined);
    } else if (action === "scan") {
      if (isScanRateLimited(identity.email)) return error(429, "scan_rate_limited", "The radar has run several times recently. Wait a little before scanning again.");
      // "background" is reserved for the secret-protected cron route.
      const trigger = input.trigger === "catch_up" ? "catch_up" : "manual";
      // Only a scan the user started by hand may rewrite the saved profile. An
      // app-open catch-up scan fires from a mount effect whose closure can still
      // hold the pre-load form state, so honouring its profile would silently
      // overwrite the user's saved roles, skills, and locations with defaults.
      // saveRadarProfile is a full-column write with no merge, so this is a
      // total replacement, not a partial one.
      if (input.profile && trigger === "manual") await saveRadarProfile(db, user.id, object(input.profile));
      result = await scanRadar(db, user.id, {
        monitorId: typeof input.monitorId === "string" ? input.monitorId.slice(0, 100) : undefined,
        dueOnly: Boolean(input.dueOnly),
        trigger,
      });
    } else if (action === "import_watch_batch") {
      result = await importJobWatchBatch(db, user.id);
    } else if (action === "import_job_links") {
      if (isScanRateLimited(identity.email)) return error(429, "scan_rate_limited", "Several radar reads have run recently. Wait a little before importing more links.");
      const links = Array.isArray(input.links) ? input.links : [];
      if (!links.length) return error(400, "invalid_request", "Paste at least one public job link.");
      // Each link is validated the same way a saved scan source is, so a
      // private-network address or a LinkedIn URL is rejected before any fetch.
      const urls: string[] = [];
      for (const link of links.slice(0, 25)) {
        if (typeof link !== "string" || !link.trim()) continue;
        urls.push(publicScanUrl(link.trim().slice(0, 4_000)));
      }
      if (!urls.length) return error(400, "invalid_request", "None of those links could be read as a public job page.");
      result = await importRadarOpportunities(db, user.id, urls);
    } else if (action === "import_linkedin_saved_jobs") {
      // Rows come from the owner's own official LinkedIn export, or from a
      // page they were already looking at in their own browser. Either way the
      // rows are used as given — the server never fetches a LinkedIn page, so
      // no scan budget is consumed and no automated collection takes place.
      const rows = Array.isArray(input.rows) ? input.rows : [];
      if (!rows.length) return error(400, "invalid_request", "No saved jobs were found in that LinkedIn export.");
      result = await importLinkedInSavedJobs(db, user.id, rows.slice(0, 200).map((row) => {
        const entry = object(row);
        return {
          title: optionalText(entry.title, 240),
          company: optionalText(entry.company, 180),
          url: optionalText(entry.url, 4_000),
          savedAt: optionalText(entry.savedAt, 40),
          // Present when the row came from a browser capture rather than an
          // export file; absent rows still score exactly as they did before.
          location: optionalText(entry.location, 240),
          description: optionalText(entry.description, 8_000),
        };
      }), input.source === "captured" ? "imported" : "linkedin-saved");
    } else {
      return error(400, "invalid_action", "Choose a valid radar action.");
    }

    const dashboard = await readRadarDashboard(db, user.id);
    return NextResponse.json({ ok: true, action, result, ...dashboard, automation: automationState() });
  } catch (cause) {
    return routeError(cause);
  }
}

async function requireIdentity(request: Request) {
  try {
    const identity = await resolveAccessIdentity(request);
    return { email: identity.email, name: null as string | null };
  } catch (cause) {
    if (cause instanceof AccessAuthError) {
      const status = cause.code === "not_configured" ? 503 : 401;
      throw new RadarHttpError(status, cause.code, cause.message);
    }
    throw cause;
  }
}

function publicScanUrl(value: string) {
  const url = validatePublicUrl(value);
  if (isLinkedInUrl(url.href)) throw new RadarHttpError(422, "linkedin_monitoring_blocked", "LinkedIn does not permit automated monitoring. Add the company’s public careers page, Greenhouse, Lever, Ashby, or another official job board instead.");
  return url.href;
}

function isScanRateLimited(identity: string) {
  const now = Date.now();
  const recent = (scanRequests.get(identity) || []).filter((timestamp) => now - timestamp < SCAN_WINDOW_MS);
  if (recent.length >= SCAN_LIMIT) {
    scanRequests.set(identity, recent);
    return true;
  }
  scanRequests.set(identity, [...recent, now]);
  return false;
}

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new RadarHttpError(400, "invalid_request", "The radar request is incomplete.");
  return value as Record<string, unknown>;
}

function text(value: unknown, limit: number) {
  if (typeof value !== "string" || !value.trim()) throw new RadarHttpError(400, "invalid_request", "A required radar field is missing.");
  if (value.length > limit) throw new RadarHttpError(400, "invalid_request", "A radar field is too long.");
  return value.trim();
}

function optionalText(value: unknown, limit: number) {
  if (value == null) return "";
  if (typeof value !== "string" || value.length > limit) throw new RadarHttpError(400, "invalid_request", "A radar field is invalid.");
  return value.trim();
}

class RadarHttpError extends Error {
  status: number;
  code: string;
  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

function routeError(cause: unknown) {
  if (cause instanceof RadarHttpError) return error(cause.status, cause.code, cause.message);
  const message = cause instanceof Error ? cause.message : "The radar could not complete this request.";
  const safe = message.replace(/https?:\/\/\S+/gi, "[url]").replace(/\s+/g, " ").trim().slice(0, 500);
  if (/no such table|D1_ERROR/i.test(message)) return error(503, "radar_database_unavailable", "The private radar database is still being prepared. The rest of V’s Job Seeker remains available.");
  return error(500, "radar_error", safe || "The radar could not complete this request.");
}

function error(status: number, code: string, message: string) {
  return NextResponse.json({ ok: false, code, message }, { status });
}
