"use client";

import { useEffect, useState } from "react";
import { HttpJsonError, readJsonResponse } from "@/lib/http-json.mjs";
import { fromBase64Url, toBase64Url } from "@/lib/webauthn.mjs";
import { JobSeekerApp } from "./job-seeker-app";

const TOKEN_COOKIE = "vjobs_token";
// Set alongside the real session cookie, which is HttpOnly and therefore
// invisible to this code. The marker carries no secret — its only job is
// letting the gate skip the login screen without a network round trip.
const MARKER_COOKIE = "vjobs_signed_in";

function hasCookie(name: string): boolean {
  return document.cookie.split(/;\s*/).some((part) => part.startsWith(`${name}=`) && part.length > name.length + 1);
}

type AccessResult = { ok?: boolean; code?: string; message?: string; challengeId?: string; options?: Record<string, unknown> };

async function postAccess(body: Record<string, unknown>): Promise<AccessResult> {
  const response = await fetch("/api/access", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    cache: "no-store",
  });
  return await readJsonResponse<AccessResult>(response, "The sign-in request could not be completed.");
}

// A pasted share link ("https://…/?token=abc123") is a natural mistake on a
// phone, where copying "the link" rather than "just the token" is the more
// obvious gesture. If what was pasted parses as a URL carrying ?token=, that
// value is used instead of the raw paste.
function extractToken(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return "";
  try {
    const url = new URL(trimmed);
    const fromQuery = url.searchParams.get("token");
    if (fromQuery) return fromQuery.trim();
  } catch {
    // Not a URL — use the raw input.
  }
  return trimmed;
}

type Stage = "checking" | "login" | "app";

/**
 * Gates the app behind sign-in: a passkey (Face ID / fingerprint) when one is
 * registered, or the access token.
 *
 * Both paths end with the SERVER setting the session cookie, HttpOnly — page
 * JS can no longer read the long-lived secret back out, which it could when
 * the login code wrote document.cookie itself. A ?token= link still works and
 * is upgraded through the same server-side path, so old bookmarks keep
 * working; the token is stripped from the visible URL either way.
 */
export function AccessGate() {
  const [stage, setStage] = useState<Stage>("checking");
  const [tokenInput, setTokenInput] = useState("");
  const [showToken, setShowToken] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [passkeyBusy, setPasskeyBusy] = useState(false);
  const [passkeySupported, setPasskeySupported] = useState(false);
  const [error, setError] = useState("");
  const [notConfigured, setNotConfigured] = useState(false);

  useEffect(() => {
    setPasskeySupported(typeof window.PublicKeyCredential === "function");
    let active = true;
    (async () => {
      const params = new URLSearchParams(window.location.search);
      const urlToken = params.get("token")?.trim();
      if (urlToken) {
        const settled = await signInWithToken(urlToken);
        if (!active) return;
        // The token is stripped from the visible URL either way, valid or
        // not — it must never linger in history or get shared onward.
        params.delete("token");
        const nextSearch = params.toString();
        window.history.replaceState(null, "", window.location.pathname + (nextSearch ? `?${nextSearch}` : "") + window.location.hash);
        if (!settled) setStage("login");
        return;
      }
      // A cookie already present is trusted optimistically — verifying it
      // here would make every page load pay for a check the app's own
      // workspace load performs a moment later anyway. If it has gone stale,
      // onAccessRevoked below bounces back here with the reason.
      setStage(hasCookie(TOKEN_COOKIE) || hasCookie(MARKER_COOKIE) ? "app" : "login");
    })();
    return () => { active = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** Returns true when the server accepted the token and set the cookies. */
  async function signInWithToken(token: string): Promise<boolean> {
    try {
      const data = await postAccess({ action: "token_login", token });
      if (data.ok) { setStage("app"); return true; }
      if (data.code === "not_configured") { setNotConfigured(true); setError(""); return false; }
      setError(data.message || "That access token isn't valid.");
      return false;
    } catch (cause) {
      if (cause instanceof HttpJsonError && cause.code === "not_configured") { setNotConfigured(true); return false; }
      setError("Could not reach V’s to sign in. Check your connection and try again.");
      return false;
    }
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    const token = extractToken(tokenInput);
    if (!token) { setError("Enter your access token."); return; }
    setSubmitting(true);
    setError("");
    setNotConfigured(false);
    const settled = await signInWithToken(token);
    setSubmitting(false);
    if (settled) setTokenInput("");
  }

  async function handlePasskey() {
    setPasskeyBusy(true);
    setError("");
    setNotConfigured(false);
    try {
      const issued = await postAccess({ action: "login_options" });
      if (!issued.ok || !issued.options || !issued.challengeId) {
        if (issued.code === "not_configured") { setNotConfigured(true); return; }
        setError(issued.message || "Passkey sign-in is not available right now. Use your access token.");
        return;
      }
      const options = issued.options as { challenge: string; rpId: string; userVerification: string; timeout: number };
      const credential = (await navigator.credentials.get({
        publicKey: {
          challenge: fromBase64Url(options.challenge) as unknown as BufferSource,
          rpId: options.rpId,
          userVerification: options.userVerification as UserVerificationRequirement,
          timeout: options.timeout,
        },
      })) as PublicKeyCredential | null;
      if (!credential) { setError("No passkey was offered. Use your access token instead."); return; }
      const assertion = credential.response as AuthenticatorAssertionResponse;
      const data = await postAccess({
        action: "login",
        challengeId: issued.challengeId,
        credential: {
          id: credential.id,
          response: {
            clientDataJSON: toBase64Url(new Uint8Array(assertion.clientDataJSON)),
            authenticatorData: toBase64Url(new Uint8Array(assertion.authenticatorData)),
            signature: toBase64Url(new Uint8Array(assertion.signature)),
            // The authenticator hands back the user id bytes it was registered
            // with; decoded to the plain id string the server stores.
            userHandle: assertion.userHandle ? new TextDecoder().decode(assertion.userHandle) : "",
          },
        },
      });
      if (data.ok) { setStage("app"); return; }
      setError(data.message || "Passkey sign-in failed. Use your access token instead.");
    } catch (cause) {
      if (cause instanceof DOMException && (cause.name === "NotAllowedError" || cause.name === "AbortError")) {
        setError("Sign-in was cancelled.");
      } else {
        setError("Passkey sign-in failed. Use your access token instead.");
      }
    } finally {
      setPasskeyBusy(false);
    }
  }

  function handleAccessRevoked(message: string) {
    // The real cookie is HttpOnly — only the server can clear it.
    void postAccess({ action: "logout" }).catch(() => {});
    document.cookie = `${MARKER_COOKIE}=; path=/; max-age=0; SameSite=Lax`;
    document.cookie = `${TOKEN_COOKIE}=; path=/; max-age=0; SameSite=Lax`;
    setError(message);
    setStage("login");
  }

  if (stage === "checking") {
    return <div className="access-gate"><div className="access-card checking"><span className="wordmark-standalone">V&apos;S</span></div></div>;
  }

  if (stage === "app") {
    return <JobSeekerApp onAccessRevoked={handleAccessRevoked} />;
  }

  return <div className="access-gate">
    <form className="access-card" onSubmit={handleSubmit}>
      <span className="wordmark-standalone">V&apos;S</span>
      <h1>Private access</h1>
      <p>This is a private, single-owner workspace.</p>
      {notConfigured
        ? <div className="access-warning">This deployment has no access token configured yet. If you administer it, set <code>APP_TOKEN</code> and <code>APP_OWNER_EMAIL</code>.</div>
        : <>
          {passkeySupported && <>
            <button type="button" className="primary access-passkey" onClick={() => void handlePasskey()} disabled={passkeyBusy || submitting}>
              {passkeyBusy ? "Waiting for Face ID…" : "Sign in with Face ID / passkey"}
            </button>
            <div className="access-divider"><span>or use the access token</span></div>
          </>}
          <label className="access-field">
            <span>Access token</span>
            <div className="access-input-row">
              <input
                type={showToken ? "text" : "password"}
                inputMode="text"
                autoComplete="off"
                autoCapitalize="off"
                autoCorrect="off"
                spellCheck={false}
                value={tokenInput}
                onChange={(event) => { setTokenInput(event.target.value); if (error) setError(""); }}
                placeholder="Paste or type your token"
              />
              <button type="button" className="access-toggle" onClick={() => setShowToken((current) => !current)}>{showToken ? "Hide" : "Show"}</button>
            </div>
          </label>
          {error && <p className="access-error">{error}</p>}
          <button type="submit" className="primary" disabled={submitting || passkeyBusy || !tokenInput.trim()}>{submitting ? "Checking…" : "Enter with token"}</button>
          {passkeySupported && <small className="access-hint">Face ID works after you add a passkey once — sign in with the token, then open Data &amp; versions → Sign-in &amp; devices.</small>}
        </>}
    </form>
  </div>;
}
