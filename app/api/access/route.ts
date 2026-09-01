// Sign-in for the app: pasted token, passkey (Face ID), and sign-out.
//
// Every path that succeeds ends the same way — the server sets the session
// cookies itself. Before this route existed the login JS wrote the token
// cookie with document.cookie, which meant any script that ever ran on the
// page could read the long-lived secret back out. The cookie is now HttpOnly:
// the browser sends it, nothing in page JS can read it. A second, valueless
// marker cookie (no secret, not HttpOnly) exists only so the client can tell
// "probably signed in" from "definitely not" without a network round trip.
//
// Passkey verification lives in lib/webauthn.mjs; this file owns the flows:
// challenges are single-use, purpose-bound, and expire server-side, and a
// passkey can only ever be REGISTERED from a session that already
// authenticated with the token — the token stays the root of trust and the
// recovery path, Face ID is a convenience on top.

import { NextResponse } from "next/server";
import { getRuntimeDatabase } from "@/lib/runtime-bindings";
import { isTrustedSameOriginMutation } from "@/lib/request-security";
import {
  AccessAuthError,
  accessConfigured,
  identityForToken,
  resolveAccessIdentity,
  tokenForEmail,
} from "@/lib/access-auth";
import { fromBase64Url, verifyAssertion, verifyRegistration, WebAuthnError } from "@/lib/webauthn.mjs";
import {
  consumePasskeyChallenge,
  deletePasskeyCredential,
  findPasskeyCredential,
  issuePasskeyChallenge,
  listPasskeyCredentials,
  savePasskeyCredential,
  updatePasskeyUsage,
} from "@/lib/passkey-store";
import { ensureRadarUser } from "@/lib/radar-store";

export const dynamic = "force-dynamic";

const TOKEN_COOKIE = "vjobs_token";
const MARKER_COOKIE = "vjobs_signed_in";
const COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

export async function GET(request: Request) {
  try {
    const identity = await resolveAccessIdentity(request);
    const db = getRuntimeDatabase();
    const user = await ensureRadarUser(db, identity.email);
    const passkeys = await listPasskeyCredentials(db, user.id);
    return json({ ok: true, passkeys });
  } catch (cause) {
    return routeError(cause);
  }
}

export async function POST(request: Request) {
  if (!isTrustedSameOriginMutation(request)) {
    return json({ ok: false, code: "cross_site_request_blocked", message: "This protected action must start inside V’s Job Seeker." }, 403);
  }
  let input: Record<string, unknown>;
  try {
    input = (await request.json()) as Record<string, unknown>;
  } catch {
    return json({ ok: false, code: "invalid_request", message: "The sign-in request could not be read." }, 400);
  }
  const action = text(input.action, 40);
  const url = new URL(request.url);

  try {
    if (action === "token_login") {
      if (!accessConfigured()) throw new AccessAuthError("not_configured", "App access token is not configured yet.");
      const token = text(input.token, 500);
      const identity = token ? identityForToken(token) : null;
      if (!identity) throw new AccessAuthError("invalid_token", "Your access token is invalid.");
      const response = json({ ok: true, email: identity.email });
      setAuthCookies(response, url, token);
      return response;
    }

    if (action === "logout") {
      const response = json({ ok: true });
      clearAuthCookies(response, url);
      return response;
    }

    if (action === "login_options") {
      if (!accessConfigured()) throw new AccessAuthError("not_configured", "App access token is not configured yet.");
      const db = getRuntimeDatabase();
      const issued = await issuePasskeyChallenge(db, "login");
      // No allowCredentials on purpose: passkeys are discoverable, and naming
      // credential ids to an anonymous caller would confirm they exist.
      return json({ ok: true, challengeId: issued.id, options: { challenge: issued.challenge, rpId: url.hostname, userVerification: "required", timeout: 120_000 } });
    }

    if (action === "login") {
      const db = getRuntimeDatabase();
      const challengeId = text(input.challengeId, 100);
      const credential = credentialInput(input.credential);
      const issued = await consumePasskeyChallenge(db, challengeId, "login");
      if (!issued) return json({ ok: false, code: "challenge_expired", message: "The sign-in prompt expired. Try Face ID again." }, 400);
      const stored = await findPasskeyCredential(db, credential.id);
      if (!stored) return json({ ok: false, code: "unknown_passkey", message: "That passkey is not registered here. Sign in with your access token, then add it." }, 400);
      const result = await verifyAssertion({
        authenticatorData: fromBase64Url(credential.authenticatorData),
        clientDataJSON: fromBase64Url(credential.clientDataJSON),
        signature: fromBase64Url(credential.signature),
        challenge: fromBase64Url(issued.challenge),
        origin: url.origin,
        rpId: url.hostname,
        publicKeyJwk: stored.publicKeyJwk,
        storedSignCount: stored.signCount,
      });
      // The authenticator reports which user it thinks it is; if it says so,
      // it has to agree with who the credential belongs to.
      if (credential.userHandle && text(credential.userHandle, 200) !== stored.userId) {
        return json({ ok: false, code: "user_mismatch", message: "The passkey does not belong to this account." }, 400);
      }
      const token = tokenForEmail(stored.email);
      if (!token) {
        // The credential outlived its token (an EXTRA_ACCESS_TOKENS entry was
        // removed). Authentication succeeded; authorization no longer exists.
        return json({ ok: false, code: "no_token_for_identity", message: "This passkey's access has been revoked." }, 403);
      }
      await updatePasskeyUsage(db, stored.id, result.signCount);
      const response = json({ ok: true, email: stored.email });
      setAuthCookies(response, url, token);
      return response;
    }

    if (action === "register_options") {
      const identity = await resolveAccessIdentity(request);
      const db = getRuntimeDatabase();
      const user = await ensureRadarUser(db, identity.email);
      const issued = await issuePasskeyChallenge(db, "register", identity.email);
      const existing = await listPasskeyCredentials(db, user.id);
      return json({
        ok: true,
        challengeId: issued.id,
        options: {
          challenge: issued.challenge,
          rp: { id: url.hostname, name: "V’s Job Seeker" },
          user: { id: user.id, name: identity.email, displayName: user.display_name || identity.email },
          pubKeyCredParams: [{ type: "public-key", alg: -7 }],
          authenticatorSelection: { residentKey: "required", userVerification: "required" },
          // Stops the same phone from silently double-registering.
          excludeCredentials: existing.map((item) => ({ type: "public-key", id: item.id })),
          attestation: "none",
          timeout: 120_000,
        },
      });
    }

    if (action === "register") {
      const identity = await resolveAccessIdentity(request);
      const db = getRuntimeDatabase();
      const user = await ensureRadarUser(db, identity.email);
      const challengeId = text(input.challengeId, 100);
      const credential = credentialInput(input.credential);
      const issued = await consumePasskeyChallenge(db, challengeId, "register");
      if (!issued) return json({ ok: false, code: "challenge_expired", message: "The registration prompt expired. Try again." }, 400);
      // The challenge was minted for a specific authenticated email; a
      // different session must not be able to finish it.
      if (issued.email !== identity.email) return json({ ok: false, code: "challenge_mismatch", message: "This registration belongs to a different sign-in." }, 400);
      const verified = await verifyRegistration({
        attestationObject: fromBase64Url(credential.attestationObject),
        clientDataJSON: fromBase64Url(credential.clientDataJSON),
        challenge: fromBase64Url(issued.challenge),
        origin: url.origin,
        rpId: url.hostname,
      });
      if (await findPasskeyCredential(db, verified.credentialId)) {
        return json({ ok: false, code: "already_registered", message: "This passkey is already registered." }, 400);
      }
      const label = text(input.label, 120) || "Passkey";
      await savePasskeyCredential(db, { credentialId: verified.credentialId, userId: user.id, publicKeyJwk: verified.publicKeyJwk, signCount: verified.signCount, label });
      const passkeys = await listPasskeyCredentials(db, user.id);
      return json({ ok: true, passkeys });
    }

    if (action === "delete_passkey") {
      const identity = await resolveAccessIdentity(request);
      const db = getRuntimeDatabase();
      const user = await ensureRadarUser(db, identity.email);
      const removed = await deletePasskeyCredential(db, user.id, text(input.credentialId, 400));
      const passkeys = await listPasskeyCredentials(db, user.id);
      return json({ ok: removed, ...(removed ? {} : { code: "not_found", message: "That passkey was not found." }), passkeys }, removed ? 200 : 404);
    }

    return json({ ok: false, code: "unknown_action", message: "That sign-in action is not recognized." }, 400);
  } catch (cause) {
    return routeError(cause);
  }
}

// ---------------------------------------------------------------------------

function credentialInput(value: unknown) {
  const source = (value && typeof value === "object" ? value : {}) as Record<string, unknown>;
  const response = (source.response && typeof source.response === "object" ? source.response : {}) as Record<string, unknown>;
  return {
    id: text(source.id, 400),
    clientDataJSON: text(response.clientDataJSON, 10_000),
    attestationObject: text(response.attestationObject, 40_000),
    authenticatorData: text(response.authenticatorData, 10_000),
    signature: text(response.signature, 2_000),
    userHandle: text(response.userHandle, 200),
  };
}

function setAuthCookies(response: NextResponse, url: URL, token: string) {
  const secure = url.protocol === "https:" ? "; Secure" : "";
  response.headers.append("Set-Cookie", `${TOKEN_COOKIE}=${encodeURIComponent(token)}; Path=/; Max-Age=${COOKIE_MAX_AGE}; SameSite=Lax; HttpOnly${secure}`);
  response.headers.append("Set-Cookie", `${MARKER_COOKIE}=1; Path=/; Max-Age=${COOKIE_MAX_AGE}; SameSite=Lax${secure}`);
}

function clearAuthCookies(response: NextResponse, url: URL) {
  const secure = url.protocol === "https:" ? "; Secure" : "";
  response.headers.append("Set-Cookie", `${TOKEN_COOKIE}=; Path=/; Max-Age=0; SameSite=Lax; HttpOnly${secure}`);
  response.headers.append("Set-Cookie", `${MARKER_COOKIE}=; Path=/; Max-Age=0; SameSite=Lax${secure}`);
}

function text(value: unknown, limit: number) {
  return typeof value === "string" ? value.trim().slice(0, limit) : "";
}

function routeError(cause: unknown) {
  if (cause instanceof AccessAuthError) {
    return json({ ok: false, code: cause.code, message: cause.message }, cause.code === "not_configured" ? 503 : 401);
  }
  if (cause instanceof WebAuthnError) {
    return json({ ok: false, code: "webauthn_failed", message: cause.message }, 400);
  }
  const message = cause instanceof Error ? cause.message : "Sign-in failed.";
  if (/no such table|D1_ERROR|binding is unavailable/i.test(message)) {
    return json({ ok: false, code: "storage_unavailable", message: "Sign-in storage is still being prepared. Use your access token for now." }, 503);
  }
  return json({ ok: false, code: "access_error", message: "Sign-in failed. Use your access token instead." }, 500);
}

function json(value: Record<string, unknown>, status = 200) {
  return NextResponse.json(value, { status, headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" } });
}
