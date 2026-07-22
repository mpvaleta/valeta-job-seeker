import { NextResponse } from "next/server";
import { authenticatedEmail, authorizationUrl, getLinkedInConfig, LINKEDIN_STATE_COOKIE, secureCookie, signPayload } from "@/lib/linkedin-oauth";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const owner = authenticatedEmail(request);
  if (!owner) return NextResponse.json({ ok: false, code: "authentication_required", message: "Open V’s through your signed-in ChatGPT account before connecting LinkedIn." }, { status: 401 });
  const config = getLinkedInConfig();
  if (!config.configured) return NextResponse.json({ ok: false, code: "linkedin_not_configured", message: "Official LinkedIn sign-in needs protected deployment credentials. ZIP import remains available." }, { status: 503 });
  const state = await signPayload({ owner, nonce: crypto.randomUUID(), exp: Math.floor(Date.now() / 1000) + 10 * 60 }, config.sessionSecret);
  const response = NextResponse.redirect(authorizationUrl(config, state));
  response.headers.append("Set-Cookie", secureCookie(LINKEDIN_STATE_COOKIE, state, 10 * 60));
  return response;
}
