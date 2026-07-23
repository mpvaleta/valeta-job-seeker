import { NextResponse } from "next/server";
import { authenticatedEmail, getLinkedInConfig, LINKEDIN_SESSION_COOKIE, readCookie } from "@/lib/linkedin-oauth";
import { readLinkedInSession } from "@/lib/oauth-store";
import { getRuntimeDatabase } from "@/lib/runtime-bindings";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const owner = authenticatedEmail(request);
  if (!owner) return NextResponse.json({ ok: false, configured: false, connected: false, message: "Open V’s through your signed-in ChatGPT account to use official LinkedIn sign-in." }, { status: 401 });
  const config = getLinkedInConfig();
  if (!config.configured) return NextResponse.json({ ok: true, configured: false, connected: false, message: "Add the four protected LinkedIn deployment secrets to activate official sign-in. ZIP import works without them." });
  const identity = await readLinkedInSession(getRuntimeDatabase(), owner, readCookie(request, LINKEDIN_SESSION_COOKIE), config.sessionSecret);
  if (!identity) return NextResponse.json({ ok: true, configured: true, connected: false, message: "Official LinkedIn identity sign-in is ready but not connected." });
  return NextResponse.json({ ok: true, configured: true, connected: true, message: "Official LinkedIn identity connected. Job pages and recommendation data remain outside the sign-in API.", identity: { name: identity.display_name, email: identity.email, picture: identity.picture_url } });
}
