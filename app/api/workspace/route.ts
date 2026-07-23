import { NextResponse } from "next/server";
import { getRuntimeBucket, getRuntimeDatabase } from "@/lib/runtime-bindings";
import { MAX_WORKSPACE_BYTES, readLatestWorkspace, saveWorkspaceRevision } from "@/lib/workspace-store";
import { isTrustedSameOriginMutation } from "@/lib/request-security";

export const dynamic = "force-dynamic";

const USER_EMAIL_HEADER = "oai-authenticated-user-email";
const USER_NAME_HEADER = "oai-authenticated-user-full-name";
const USER_NAME_ENCODING_HEADER = "oai-authenticated-user-full-name-encoding";

export async function GET(request: Request) {
  try {
    const identity = requireIdentity(request);
    const result = await readLatestWorkspace(getRuntimeDatabase(), getRuntimeBucket(), identity.email, identity.name);
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
    const identity = requireIdentity(request);
    const raw = await request.text();
    if (new TextEncoder().encode(raw).byteLength > MAX_WORKSPACE_BYTES) return json({ ok: false, code: "workspace_too_large", message: "The private workspace is larger than the 5 MB backup limit." }, 413);
    const envelope = JSON.parse(raw) as { sourceBuild?: unknown; snapshot?: unknown };
    if (!envelope || typeof envelope !== "object" || typeof envelope.sourceBuild !== "string" || !envelope.snapshot || typeof envelope.snapshot !== "object" || Array.isArray(envelope.snapshot)) {
      return json({ ok: false, code: "invalid_workspace", message: "The private workspace backup is incomplete." }, 400);
    }
    const snapshotRaw = JSON.stringify(envelope.snapshot);
    const result = await saveWorkspaceRevision(getRuntimeDatabase(), getRuntimeBucket(), identity.email, identity.name, snapshotRaw, envelope.sourceBuild);
    return json({ ok: true, ...result });
  } catch (cause) {
    return routeError(cause);
  }
}

function requireIdentity(request: Request) {
  const email = request.headers.get(USER_EMAIL_HEADER)?.trim().toLowerCase();
  if (!email) throw new WorkspaceHttpError(401, "authentication_required", "Open V’s through your signed-in ChatGPT account to use durable private backup.");
  const encoded = request.headers.get(USER_NAME_HEADER);
  let name: string | null = null;
  if (encoded && request.headers.get(USER_NAME_ENCODING_HEADER) === "percent-encoded-utf-8") {
    try { name = decodeURIComponent(encoded).slice(0, 160); } catch { name = null; }
  }
  return { email, name };
}

class WorkspaceHttpError extends Error {
  constructor(public status: number, public code: string, message: string) { super(message); }
}

function routeError(cause: unknown) {
  if (cause instanceof WorkspaceHttpError) return json({ ok: false, code: cause.code, message: cause.message }, cause.status);
  const message = cause instanceof Error ? cause.message : "The private workspace could not be backed up.";
  if (/no such table|D1_ERROR|binding is unavailable/i.test(message)) return json({ ok: false, code: "workspace_storage_unavailable", message: "Durable private backup is still being prepared. Browser autosave remains active." }, 503);
  if (/JSON|workspace backup/i.test(message)) return json({ ok: false, code: "invalid_workspace", message: "The private workspace backup could not be read." }, 400);
  return json({ ok: false, code: "workspace_error", message: "The private workspace could not be backed up. Browser autosave remains active." }, 500);
}

function json(value: Record<string, unknown>, status = 200) {
  return NextResponse.json(value, { status, headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" } });
}
