"use client";

import { useEffect, useState } from "react";
import { HttpJsonError, readJsonResponse } from "@/lib/http-json.mjs";
import { JobSeekerApp } from "./job-seeker-app";

const TOKEN_COOKIE = "vjobs_token";
const TOKEN_MAX_AGE = 60 * 60 * 24 * 365;

function readCookie(name: string): string | null {
  for (const part of document.cookie.split(/;\s*/)) {
    if (part.startsWith(`${name}=`)) return decodeURIComponent(part.slice(name.length + 1));
  }
  return null;
}

function writeTokenCookie(token: string) {
  document.cookie = `${TOKEN_COOKIE}=${encodeURIComponent(token)}; path=/; max-age=${TOKEN_MAX_AGE}; SameSite=Lax`;
}

function clearTokenCookie() {
  document.cookie = `${TOKEN_COOKIE}=; path=/; max-age=0; SameSite=Lax`;
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

type TokenCheck =
  | { outcome: "authenticated" }
  | { outcome: "invalid" | "not_configured" | "network"; message: string };

// The auth-specific codes resolveAccessIdentity produces (lib/access-auth.ts).
// Anything else — 200 OK, or an unrelated backend error like a storage binding
// hiccup — means identity resolution itself succeeded.
const AUTH_FAILURE_CODES = new Set(["invalid_token", "authentication_required"]);

/**
 * Verifies a token against the API before trusting it, rather than writing it
 * to a cookie and finding out on the next request. GET /api/workspace already
 * accepts the token as a bare Authorization header (see extractAccessToken in
 * lib/access-auth.ts), so this needs no dedicated endpoint.
 *
 * This only asks "does this token authenticate" — it deliberately does not
 * require the whole workspace read to succeed. The route can fail for reasons
 * that have nothing to do with the token (a storage binding not ready, a
 * transient R2 problem), and conflating those with "wrong token" would send
 * someone back to a blank login box for a problem retyping the token can
 * never fix. That class of failure is JobSeekerApp's own workspace-load
 * banner to show, once past this gate.
 */
async function verifyToken(token: string): Promise<TokenCheck> {
  try {
    const response = await fetch("/api/workspace", { headers: { Authorization: token }, cache: "no-store" });
    const data = await readJsonResponse<{ ok?: boolean; code?: string; message?: string }>(response, "The access token could not be checked.");
    if (data.code === "not_configured") return { outcome: "not_configured", message: data.message || "" };
    if (data.code && AUTH_FAILURE_CODES.has(data.code)) return { outcome: "invalid", message: data.message || "That access token isn't valid." };
    return { outcome: "authenticated" };
  } catch (cause) {
    if (cause instanceof HttpJsonError) {
      if (cause.code === "not_configured") return { outcome: "not_configured", message: cause.message };
      if (AUTH_FAILURE_CODES.has(cause.code)) return { outcome: "invalid", message: cause.message };
      // An empty or non-JSON body means the request never reached the route
      // as expected (proxy, offline, dev-server hiccup) — the token itself
      // was never actually checked, so this cannot be reported as invalid.
      return { outcome: "network", message: "Could not verify the token right now. Check your connection and try again." };
    }
    return { outcome: "network", message: "Could not reach V’s to check the token. Check your connection and try again." };
  }
}

type Stage = "checking" | "login" | "app";

/**
 * Gates the app behind the shared access token.
 *
 * Before this, the only way in was a link carrying ?token=... — reasonable
 * from a computer with the link saved somewhere, unworkable to type or
 * remember on a phone. This adds an actual entry screen: a token field that
 * verifies before it commits to a cookie, so a mistyped token is caught here
 * rather than three screens deep into a broken app.
 *
 * A ?token= link still works and is upgraded through the same verification
 * path, so old bookmarks and any link already shared keep working.
 */
export function AccessGate() {
  const [stage, setStage] = useState<Stage>("checking");
  const [tokenInput, setTokenInput] = useState("");
  const [showToken, setShowToken] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [notConfigured, setNotConfigured] = useState(false);

  useEffect(() => {
    let active = true;
    (async () => {
      const params = new URLSearchParams(window.location.search);
      const urlToken = params.get("token")?.trim();
      if (urlToken) {
        const result = await verifyToken(urlToken);
        if (!active) return;
        // The token is stripped from the visible URL either way, valid or
        // not — it must never linger in history or get shared onward.
        params.delete("token");
        const nextSearch = params.toString();
        window.history.replaceState(null, "", window.location.pathname + (nextSearch ? `?${nextSearch}` : "") + window.location.hash);
        if (result.outcome === "authenticated") {
          writeTokenCookie(urlToken);
          setStage("app");
          return;
        }
        setNotConfigured(result.outcome === "not_configured");
        setError(result.outcome === "not_configured" ? "" : result.message);
        setStage("login");
        return;
      }
      // A cookie already present is trusted optimistically — verifying it here
      // too would mean every page load pays for a check that JobSeekerApp's
      // own workspace load performs a moment later anyway. If the cookie has
      // gone stale, onAccessRevoked below bounces back to this screen with a
      // clear reason instead of leaving a broken app on screen.
      setStage(readCookie(TOKEN_COOKIE) ? "app" : "login");
    })();
    return () => { active = false; };
  }, []);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    const token = extractToken(tokenInput);
    if (!token) { setError("Enter your access token."); return; }
    setSubmitting(true);
    setError("");
    setNotConfigured(false);
    const result = await verifyToken(token);
    setSubmitting(false);
    if (result.outcome === "authenticated") {
      writeTokenCookie(token);
      setTokenInput("");
      setStage("app");
      return;
    }
    if (result.outcome === "not_configured") { setNotConfigured(true); return; }
    setError(result.message);
  }

  function handleAccessRevoked(message: string) {
    clearTokenCookie();
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
      <p>This is a private, single-owner workspace. Enter the access token to continue — the same one that used to go at the end of the link.</p>
      {notConfigured
        ? <div className="access-warning">This deployment has no access token configured yet. If you administer it, set <code>APP_TOKEN</code> and <code>APP_OWNER_EMAIL</code>.</div>
        : <>
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
                autoFocus
                value={tokenInput}
                onChange={(event) => { setTokenInput(event.target.value); if (error) setError(""); }}
                placeholder="Paste or type your token"
              />
              <button type="button" className="access-toggle" onClick={() => setShowToken((current) => !current)}>{showToken ? "Hide" : "Show"}</button>
            </div>
          </label>
          {error && <p className="access-error">{error}</p>}
          <button type="submit" className="primary" disabled={submitting || !tokenInput.trim()}>{submitting ? "Checking…" : "Enter"}</button>
        </>}
    </form>
  </div>;
}
