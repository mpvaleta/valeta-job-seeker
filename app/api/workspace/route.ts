import { NextResponse } from "next/server";
import { getRuntimeBucket, getRuntimeDatabase } from "@/lib/runtime-bindings";
import { listWorkspaceRevisions, MAX_WORKSPACE_BYTES, readLatestWorkspace, readWorkspaceRevision, restoreWorkspaceRevision, saveWorkspaceRevision, WorkspaceRevisionNotFoundError } from "@/lib/workspace-store";
import { isTrustedSameOriginMutation } from "@/lib/request-security";
import { AccessAuthError, resolveAccessIdentity } from "@/lib/access-auth";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const identity = await requireIdentity(request);
    const url = new URL(request.url);
    const revisionId = url.searchParams.get("revision")?.trim();
    if (url.searchParams.get("history") === "1") {
      const revisions = await listWorkspaceRevisions(getRuntimeDatabase(), identity.email, identity.name);
      return json({ ok: true, revisions });
    }
    const result = revisionId
      ? await readWorkspaceRevision(getRuntimeDatabase(), getRuntimeBucket(), identity.email, revisionId, identity.name)
      : await readLatestWorkspace(getRuntimeDatabase(), getRuntimeBucket(), identity.email, identity.name);
    return json({ ok: true, ...result });
  } catch (cause) {
    return routeError(cause);
  }
}

export async function POST(request: Request) {
  if (!isTrustedSameOriginMutation(request)) return json({ ok: false, code: "cross_site_request_blocked", message: "This protected action must start inside V’s Job Seeker." }, 403);
  const contentLength = Number(request.headers.get("content-length") || "0");
  if (contentLength > MAX_WORKSPACE_BYTES) return json({ ok: false, code: "workspace_too_large", message: "The private workspace is larger than the 5 MB backup limit." }, 413);
  try {
    const identity = await requireIdentity(request);
    const raw = await request.text();
    if (new TextEncoder().encode(raw).byteLength > MAX_WORKSPACE_BYTES) return json({ ok: false, code: "workspace_too_large", message: "The private workspace is larger than the 5 MB backup limit." }, 413);
    const envelope = JSON.parse(raw) as { action?: unknown; revisionId?: unknown; sourceBuild?: unknown; snapshot?: unknown };
    if (!envelope || typeof envelope !== "object" || typeof envelope.sourceBuild !== "string") {
      return json({ ok: false, code: "invalid_workspace", message: "The private workspace backup is incomplete." }, 400);
    }
    if (envelope.action === "restore") {
      if (typeof envelope.revisionId !== "string" || !/^[a-z0-9-]{8,80}$/i.test(envelope.revisionId)) {
        return json({ ok: false, code: "invalid_revision", message: "Choose a valid private workspace revision." }, 400);
      }
      const result = await restoreWorkspaceRevision(getRuntimeDatabase(), getRuntimeBucket(), identity.email, identity.name, envelope.revisionId, envelope.sourceBuild);
      return json({ ok: true, ...result });
    }
    if (!envelope.snapshot || typeof envelope.snapshot !== "object" || Array.isArray(envelope.snapshot)) {
      return json({ ok: false, code: "invalid_workspace", message: "The private workspace backup is incomplete." }, 400);
    }
    const snapshotRaw = JSON.stringify(envelope.snapshot);
    const result = await saveWorkspaceRevision(getRuntimeDatabase(), getRuntimeBucket(), identity.email, identity.name, snapshotRaw, envelope.sourceBuild);
    return json({ ok: true, ...result });
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
      throw new WorkspaceHttpError(status, cause.code, cause.message);
    }
    throw cause;
  }
}

class WorkspaceHttpError extends Error {
  constructor(public status: number, public code: string, message: string) { super(message); }
}

function routeError(cause: unknown) {
  if (cause instanceof WorkspaceHttpError) return json({ ok: false, code: cause.code, message: cause.message }, cause.status);
  if (cause instanceof WorkspaceRevisionNotFoundError) return json({ ok: false, code: "revision_not_found", message: cause.message }, 404);
  const message = cause instanceof Error ? cause.message : "The private workspace could not be backed up.";
  if (/no such table|D1_ERROR|binding is unavailable/i.test(message)) return json({ ok: false, code: "workspace_storage_unavailable", message: "Durable private backup is still being prepared. Browser autosave remains active." }, 503);
  if (/JSON|workspace backup/i.test(message)) return json({ ok: false, code: "invalid_workspace", message: "The private workspace backup could not be read." }, 400);
  return json({ ok: false, code: "workspace_error", message: "The private workspace could not be backed up. Browser autosave remains active." }, 500);
}

function json(value: Record<string, unknown>, status = 200) {
  return NextResponse.json(value, { status, headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" } });
}
