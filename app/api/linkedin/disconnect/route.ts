import { NextResponse } from "next/server";
import { authenticatedEmail, clearCookie, LINKEDIN_SESSION_COOKIE, LINKEDIN_STATE_COOKIE } from "@/lib/linkedin-oauth";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  if (!authenticatedEmail(request)) return NextResponse.json({ ok: false, message: "Open V’s through your signed-in ChatGPT account." }, { status: 401 });
  const response = NextResponse.json({ ok: true, message: "Official LinkedIn identity disconnected." });
  response.headers.append("Set-Cookie", clearCookie(LINKEDIN_SESSION_COOKIE));
  response.headers.append("Set-Cookie", clearCookie(LINKEDIN_STATE_COOKIE));
  return response;
}
