"use client";

// Sign-in & devices — the management card for passkeys, shown inside the
// authenticated app (Data & versions). Registration deliberately lives here
// and not on the login screen: creating a passkey requires an
// already-authenticated session, so the token remains the root of trust and
// the unlosable recovery path.

import { useCallback, useEffect, useState } from "react";
import { readJsonResponse } from "@/lib/http-json.mjs";
import { fromBase64Url, toBase64Url } from "@/lib/webauthn.mjs";

type PasskeyRow = { id: string; label: string; createdAt: string; lastUsedAt: string | null };

type AccessPayload = {
  ok?: boolean;
  code?: string;
  message?: string;
  passkeys?: PasskeyRow[];
  challengeId?: string;
  options?: Record<string, unknown>;
};

async function postAccess(body: Record<string, unknown>): Promise<AccessPayload> {
  const response = await fetch("/api/access", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    cache: "no-store",
  });
  return await readJsonResponse<AccessPayload>(response, "The passkey request could not be completed.");
}

function deviceLabel(): string {
  const agent = navigator.userAgent;
  const device = /iPhone/.test(agent) ? "iPhone"
    : /iPad/.test(agent) ? "iPad"
      : /Android/.test(agent) ? "Android"
        : /Macintosh/.test(agent) ? "Mac"
          : /Windows/.test(agent) ? "Windows PC"
            : "This device";
  return `${device} · added ${new Date().toISOString().slice(0, 10)}`;
}

export function PasskeyCard({ onNotice }: { onNotice: (message: string) => void }) {
  const [passkeys, setPasskeys] = useState<PasskeyRow[]>([]);
  const [state, setState] = useState<"loading" | "ready" | "unavailable">("loading");
  const [busy, setBusy] = useState("");
  const supported = typeof window !== "undefined" && typeof window.PublicKeyCredential === "function";

  const refresh = useCallback(async () => {
    try {
      const response = await fetch("/api/access", { cache: "no-store" });
      const data = await readJsonResponse<AccessPayload>(response, "Passkeys could not be listed.");
      if (!response.ok || !data.ok) throw new Error(data.message || "Passkeys could not be listed.");
      setPasskeys(data.passkeys || []);
      setState("ready");
    } catch {
      setState("unavailable");
    }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  async function addPasskey() {
    setBusy("add");
    try {
      const issued = await postAccess({ action: "register_options" });
      if (!issued.ok || !issued.options || !issued.challengeId) throw new Error(issued.message || "Registration could not start.");
      const options = issued.options as {
        challenge: string;
        rp: { id: string; name: string };
        user: { id: string; name: string; displayName: string };
        pubKeyCredParams: PublicKeyCredentialParameters[];
        authenticatorSelection: AuthenticatorSelectionCriteria;
        excludeCredentials: { type: "public-key"; id: string }[];
        timeout: number;
      };
      const credential = (await navigator.credentials.create({
        publicKey: {
          challenge: fromBase64Url(options.challenge) as unknown as BufferSource,
          rp: options.rp,
          user: {
            id: new TextEncoder().encode(options.user.id) as unknown as BufferSource,
            name: options.user.name,
            displayName: options.user.displayName,
          },
          pubKeyCredParams: options.pubKeyCredParams,
          authenticatorSelection: options.authenticatorSelection,
          excludeCredentials: options.excludeCredentials.map((item) => ({ type: "public-key" as const, id: fromBase64Url(item.id) as unknown as BufferSource })),
          attestation: "none",
          timeout: options.timeout,
        },
      })) as PublicKeyCredential | null;
      if (!credential) throw new Error("No passkey was created.");
      const attestation = credential.response as AuthenticatorAttestationResponse;
      const data = await postAccess({
        action: "register",
        challengeId: issued.challengeId,
        label: deviceLabel(),
        credential: {
          id: credential.id,
          response: {
            clientDataJSON: toBase64Url(new Uint8Array(attestation.clientDataJSON)),
            attestationObject: toBase64Url(new Uint8Array(attestation.attestationObject)),
          },
        },
      });
      if (!data.ok) throw new Error(data.message || "The passkey could not be saved.");
      setPasskeys(data.passkeys || []);
      onNotice("Passkey added. From now on this device can sign in with Face ID, Touch ID, or its screen lock — the access token still works as backup.");
    } catch (cause) {
      if (cause instanceof DOMException && (cause.name === "NotAllowedError" || cause.name === "AbortError")) {
        onNotice("Passkey setup was cancelled.");
      } else if (cause instanceof DOMException && cause.name === "InvalidStateError") {
        onNotice("This device already has a passkey registered here.");
      } else {
        onNotice(cause instanceof Error ? cause.message : "The passkey could not be added.");
      }
    } finally {
      setBusy("");
    }
  }

  async function removePasskey(row: PasskeyRow) {
    setBusy(row.id);
    try {
      const data = await postAccess({ action: "delete_passkey", credentialId: row.id });
      setPasskeys(data.passkeys || []);
      onNotice(data.ok ? `Removed "${row.label}". That device can no longer sign in with Face ID; the access token still works everywhere.` : data.message || "The passkey could not be removed.");
    } catch (cause) {
      onNotice(cause instanceof Error ? cause.message : "The passkey could not be removed.");
    } finally {
      setBusy("");
    }
  }

  async function signOut() {
    setBusy("signout");
    try {
      await postAccess({ action: "logout" });
      window.location.reload();
    } catch {
      setBusy("");
      onNotice("Sign-out failed. Try again.");
    }
  }

  return <div className="passkey-card">
    <span>SIGN-IN &amp; DEVICES</span>
    <h2>Face ID instead of the token.</h2>
    <p>A passkey lets this device sign in with Face ID, Touch ID, or its screen lock — no token to remember. The access token keeps working as the backup on any device, so removing a passkey never locks you out.</p>
    {state === "unavailable" && <p className="passkey-empty">Passkeys aren’t available right now. The access token continues to work.</p>}
    {state === "ready" && <>
      {passkeys.length === 0
        ? <p className="passkey-empty">No passkeys yet. Add one on each device you use — your iPhone’s syncs through iCloud to your other Apple devices.</p>
        : <ul className="passkey-list">{passkeys.map((row) => <li key={row.id}>
          <div><strong>{row.label}</strong><small>{row.lastUsedAt ? `Last used ${row.lastUsedAt.slice(0, 10)}` : `Added ${row.createdAt.slice(0, 10)} · not used yet`}</small></div>
          <button onClick={() => void removePasskey(row)} disabled={Boolean(busy)}>{busy === row.id ? "Removing…" : "Remove"}</button>
        </li>)}</ul>}
    </>}
    {/* Sign-out clears cookies and touches no storage, so it must stay
        reachable even when the passkey list cannot load. */}
    {state !== "loading" && <div className="passkey-actions">
      {state === "ready" && (supported
        ? <button className="primary" onClick={() => void addPasskey()} disabled={Boolean(busy)}>{busy === "add" ? "Follow the Face ID prompt…" : "Add a passkey on this device"}</button>
        : <p className="passkey-empty">This browser does not support passkeys.</p>)}
      <button onClick={() => void signOut()} disabled={Boolean(busy)}>{busy === "signout" ? "Signing out…" : "Sign out on this device"}</button>
    </div>}
  </div>;
}
