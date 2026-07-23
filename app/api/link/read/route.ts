import { NextResponse } from "next/server";
import { PublicLinkError, readPublicLink } from "@/lib/public-link-reader.mjs";

export const dynamic = "force-dynamic";

const USER_EMAIL_HEADER = "oai-authenticated-user-email";
const MAX_BODY_BYTES = 12_000;
const RATE_WINDOW_MS = 10 * 60 * 1_000;
const RATE_LIMIT = 30;
const recentRequests = new Map<string, number[]>();

type LinkPurpose = "knowledge" | "radar" | "role";

export async function POST(request: Request) {
  const identity = request.headers.get(USER_EMAIL_HEADER)?.trim().toLowerCase();
  if (!identity) return error(401, "authentication_required", "Open V’s Job Seeker through your signed-in ChatGPT account before reading a public link.");
  const retryAfterSeconds = rateLimitRetryAfter(identity);
  if (retryAfterSeconds > 0) return error(429, "rate_limited", `Too many links were requested. Try again in about ${Math.ceil(retryAfterSeconds / 60)} minutes, or paste the text instead.`, { "Retry-After": String(retryAfterSeconds) });

  const contentLength = Number(request.headers.get("content-length") || "0");
  if (contentLength > MAX_BODY_BYTES) return error(413, "request_too_large", "The link request is too large.");
  const raw = await request.text();
  if (new TextEncoder().encode(raw).byteLength > MAX_BODY_BYTES) return error(413, "request_too_large", "The link request is too large.");

  let url = "";
  let purpose: LinkPurpose = "knowledge";
  try {
    const input = JSON.parse(raw) as { url?: unknown; purpose?: unknown };
    if (typeof input.url !== "string" || !input.url.trim()) throw new Error("Paste a public link first.");
    if (input.url.length > 4_000) throw new Error("The link is too long.");
    if (input.purpose != null && !["knowledge", "radar", "role"].includes(String(input.purpose))) throw new Error("Choose a valid link purpose.");
    url = input.url.trim();
    purpose = (input.purpose || "knowledge") as LinkPurpose;
  } catch (cause) {
    return error(400, "invalid_request", cause instanceof Error ? cause.message : "The link request is invalid.");
  }

  try {
    const source = await readPublicLink(url);
    return NextResponse.json({
      ok: true,
      purpose,
      source: {
        ...source,
        text: source.text.slice(0, 300_000),
        links: purpose === "radar" ? source.links.slice(0, 500) : [],
      },
      safety: {
        publicOnly: true,
        credentialsSent: false,
        linkedinAutomation: false,
        userReviewRequired: true,
      },
    });
  } catch (cause) {
    if (cause instanceof PublicLinkError) return error(cause.status, cause.code, cause.message);
    return error(502, "link_read_failed", "The public link could not be read. Paste the text instead.");
  }
}

function rateLimitRetryAfter(identity: string) {
  const now = Date.now();
  const recent = (recentRequests.get(identity) || []).filter((timestamp) => now - timestamp < RATE_WINDOW_MS);
  if (recent.length >= RATE_LIMIT) {
    recentRequests.set(identity, recent);
    return Math.max(1, Math.ceil((RATE_WINDOW_MS - (now - recent[0])) / 1_000));
  }
  recentRequests.set(identity, [...recent, now]);
  return 0;
}

function error(status: number, code: string, message: string, headers?: HeadersInit) {
  return NextResponse.json({ ok: false, code, message }, { status, headers });
}
