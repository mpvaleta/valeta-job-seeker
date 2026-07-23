import { NextResponse } from "next/server";
import { authenticatedEmail, clearCookie, getLinkedInConfig, LINKEDIN_SESSION_COOKIE, LINKEDIN_STATE_COOKIE, readCookie } from "@/lib/linkedin-oauth";
import { revokeLinkedInSession } from "@/lib/oauth-store";
import { getRuntimeDatabase } from "@/lib/runtime-bindings";
import { isTrustedSameOriginMutation } from "@/lib/request-security";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  if (!isTrustedSameOriginMutation(request)) return NextResponse.json({ ok: false, code: "cross_site_request_blocked", message: "This protected action must start inside V’s Job Seeker." }, { status: 403 });
  const owner = authenticatedEmail(request);
  if (!owner) return NextResponse.json({ ok: false, message: "Open V’s through your signed-in ChatGPT account." }, { status: 401 });
  const config = getLinkedInConfig();
  if (config.configured) await revokeLinkedInSession(getRuntimeDatabase(), owner, readCookie(request, LINKEDIN_SESSION_COOKIE), config.sessionSecret);
  const response = NextResponse.json({ ok: true, message: "Official LinkedIn identity disconnected." });
  response.headers.append("Set-Cookie", clearCookie(LINKEDIN_SESSION_COOKIE));
  response.headers.append("Set-Cookie", clearCookie(LINKEDIN_STATE_COOKIE));
  return response;
}
