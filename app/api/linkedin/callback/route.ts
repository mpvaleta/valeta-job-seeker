import { NextResponse } from "next/server";
import { authenticatedEmail, clearCookie, exchangeLinkedInCode, getLinkedInConfig, LINKEDIN_SESSION_COOKIE, LINKEDIN_STATE_COOKIE, readCookie, secureCookie, signPayload, verifyPayload } from "@/lib/linkedin-oauth";

export const dynamic = "force-dynamic";

type StatePayload = { owner: string; nonce: string; exp: number };

export async function GET(request: Request) {
  const config = getLinkedInConfig();
  const url = new URL(request.url);
  const destination = new URL("/", url.origin);
  const fail = (code: string) => {
    destination.searchParams.set("linkedin", code);
    const response = NextResponse.redirect(destination);
    response.headers.append("Set-Cookie", clearCookie(LINKEDIN_STATE_COOKIE));
    return response;
  };
  if (!config.configured) return fail("not-configured");
  if (url.searchParams.get("error")) return fail("denied");
  const code = url.searchParams.get("code") || "";
  const returnedState = url.searchParams.get("state") || "";
  const storedState = readCookie(request, LINKEDIN_STATE_COOKIE);
  if (!code || !returnedState || returnedState !== storedState) return fail("invalid-state");
  const state = await verifyPayload<StatePayload>(returnedState, config.sessionSecret);
  if (!state?.owner) return fail("expired-state");
  const currentOwner = authenticatedEmail(request);
  if (currentOwner && currentOwner !== state.owner) return fail("account-mismatch");
  try {
    const user = await exchangeLinkedInCode(config, code);
    const session = await signPayload({ ...user, owner: state.owner, exp: Math.floor(Date.now() / 1000) + 7 * 24 * 60 * 60 }, config.sessionSecret);
    destination.searchParams.set("linkedin", "connected");
    const response = NextResponse.redirect(destination);
    response.headers.append("Set-Cookie", secureCookie(LINKEDIN_SESSION_COOKIE, session, 7 * 24 * 60 * 60));
    response.headers.append("Set-Cookie", clearCookie(LINKEDIN_STATE_COOKIE));
    return response;
  } catch {
    return fail("connection-failed");
  }
}
