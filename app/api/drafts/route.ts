import { NextResponse } from "next/server";
import { getRuntimeBucket, getRuntimeDatabase } from "@/lib/runtime-bindings";
import { MAX_WORKSPACE_BYTES, readLatestWorkspace, saveWorkspaceRevision } from "@/lib/workspace-store";
import { isTrustedSameOriginMutation } from "@/lib/request-security";
import { AccessAuthError, resolveAccessIdentity } from "@/lib/access-auth";

export const dynamic = "force-dynamic";

/*
 * Deposit one finished draft (résumé or cover letter) into the owner's
 * workspace from outside the browser — the write path that lets a scheduled
 * Claude session (running on the owner's subscription, no API key) deliver
 * tailored documents into the same version history the app itself uses.
 *
 * The draft is appended to generatedDrafts in the latest snapshot and saved
 * as a new immutable revision; the browser's merge-by-id restore picks it up
 * on the next load without overwriting anything local.
 */

const MAX_DRAFT_BYTES = 120_000;

type StoredDraft = {
  id: string;
  type: "resume" | "cover";
  title: string;
  content: string;
  createdAt: string;
  updatedAt: string;
  company: string;
  role: string;
  trackId: string;
  origin: "uploaded";
  provider: string;
  modelLabel: string;
  versionNumber: number;
  inputSummary?: string;
};

export async function POST(request: Request) {
  if (!isTrustedSameOriginMutation(request)) return json({ ok: false, code: "cross_site_request_blocked", message: "This protected action must start inside V’s Job Seeker." }, 403);
  const contentLength = Number(request.headers.get("content-length") || "0");
  if (contentLength > MAX_DRAFT_BYTES) return json({ ok: false, code: "draft_too_large", message: "The draft is larger than the 120 KB import limit." }, 413);
  try {
    const identity = await requireIdentity(request);
    const raw = await request.text();
    if (new TextEncoder().encode(raw).byteLength > MAX_DRAFT_BYTES) return json({ ok: false, code: "draft_too_large", message: "The draft is larger than the 120 KB import limit." }, 413);
    const input = JSON.parse(raw) as Record<string, unknown>;
    const type = input.type === "cover" ? "cover" : input.type === "resume" ? "resume" : null;
    if (!type) return json({ ok: false, code: "invalid_draft", message: "Set type to \"resume\" or \"cover\"." }, 400);
    const content = text(input.content, 100_000);
    if (content.length < 120) return json({ ok: false, code: "invalid_draft", message: "The draft content looks too short to be a complete document." }, 400);
    const company = text(input.company, 180);
    const role = text(input.role, 180);
    const title = text(input.title, 200) || `${company || "General"} — ${role || (type === "resume" ? "Résumé" : "Cover letter")}`;
    const note = text(input.note, 500);

    const db = getRuntimeDatabase();
    const bucket = getRuntimeBucket();
    const latest = await readLatestWorkspace(db, bucket, identity.email, identity.name);
    const snapshot = (latest.snapshot && typeof latest.snapshot === "object" && !Array.isArray(latest.snapshot)
      ? latest.snapshot
      : { version: 5 }) as Record<string, unknown>;
    const drafts = (Array.isArray(snapshot.generatedDrafts) ? snapshot.generatedDrafts : []) as StoredDraft[];

    // Idempotent delivery: the same document sent twice (a retried workflow,
    // a re-run session) must not pile up as duplicate versions.
    const existing = drafts.find((draft) => draft && typeof draft === "object" && draft.content === content);
    if (existing) return json({ ok: true, changed: false, draftId: existing.id, message: "An identical draft is already saved." });

    const now = new Date().toISOString();
    const versionNumber = Math.max(0, ...drafts
      .filter((draft) => draft && draft.type === type && draft.company === company && draft.role === role)
      .map((draft) => draft.versionNumber || 0)) + 1;
    const draft: StoredDraft = {
      id: crypto.randomUUID(),
      type,
      title,
      content,
      createdAt: now,
      updatedAt: now,
      company,
      role,
      trackId: "auto",
      origin: "uploaded",
      provider: "claude-subscription",
      modelLabel: "Claude (subscription)",
      versionNumber,
      inputSummary: note || "Delivered automatically by the scheduled Claude session.",
    };
    const nextSnapshot = { ...snapshot, generatedDrafts: [draft, ...drafts] };
    const rawSnapshot = JSON.stringify(nextSnapshot);
    if (new TextEncoder().encode(rawSnapshot).byteLength > MAX_WORKSPACE_BYTES) {
      return json({ ok: false, code: "workspace_too_large", message: "Adding this draft would push the workspace past the 5 MB backup limit. Remove older sources or drafts first." }, 413);
    }
    const result = await saveWorkspaceRevision(db, bucket, identity.email, identity.name, rawSnapshot, "automation-draft-delivery");
    return json({ ok: true, changed: true, draftId: draft.id, versionNumber, revision: result.revision });
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
      throw new DraftHttpError(status, cause.code, cause.message);
    }
    throw cause;
  }
}

function text(value: unknown, limit: number) {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, limit);
}

class DraftHttpError extends Error {
  constructor(public status: number, public code: string, message: string) { super(message); }
}

function routeError(cause: unknown) {
  if (cause instanceof DraftHttpError) return json({ ok: false, code: cause.code, message: cause.message }, cause.status);
  const message = cause instanceof Error ? cause.message : "The draft could not be saved.";
  if (/no such table|D1_ERROR|binding is unavailable/i.test(message)) return json({ ok: false, code: "workspace_storage_unavailable", message: "Durable storage is still being prepared." }, 503);
  if (/JSON/i.test(message)) return json({ ok: false, code: "invalid_draft", message: "The draft request could not be read." }, 400);
  return json({ ok: false, code: "draft_error", message: "The draft could not be saved." }, 500);
}

function json(value: Record<string, unknown>, status = 200) {
  return NextResponse.json(value, { status, headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" } });
}
