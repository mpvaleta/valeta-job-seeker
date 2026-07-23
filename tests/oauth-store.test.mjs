import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import test from "node:test";
import { Miniflare } from "miniflare";
import { LINKEDIN_SESSION_COOKIE, signPayload } from "../lib/linkedin-oauth.ts";

async function loadWorker() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("oauth-store-test", `${process.pid}-${Date.now()}-${Math.random()}`);
  return (await import(workerUrl.href)).default;
}

async function createDatabase() {
  const mf = new Miniflare({ compatibilityDate: "2026-05-22", modules: true, script: "export default { fetch() { return new Response('ok') } }", d1Databases: ["DB"] });
  const db = await mf.getD1Database("DB");
  const directory = new URL("../drizzle/", import.meta.url);
  for (const name of (await readdir(directory)).filter((value) => /^\d+.*\.sql$/.test(value)).sort()) {
    const sql = await readFile(new URL(name, directory), "utf8");
    for (const statement of sql.split("--> statement-breakpoint").map((value) => value.trim()).filter(Boolean)) await db.prepare(statement).run();
  }
  return { mf, db };
}

test("LinkedIn callback creates an opaque revocable server session and never stores its access token", async () => {
  const originalFetch = globalThis.fetch;
  const original = Object.fromEntries(["LINKEDIN_CLIENT_ID", "LINKEDIN_CLIENT_SECRET", "LINKEDIN_REDIRECT_URI", "LINKEDIN_SESSION_SECRET"].map((name) => [name, process.env[name]]));
  const secret = "test-linkedin-session-secret-longer-than-thirty-two-characters";
  Object.assign(process.env, {
    LINKEDIN_CLIENT_ID: "client-id",
    LINKEDIN_CLIENT_SECRET: "client-secret",
    LINKEDIN_REDIRECT_URI: "https://example.com/api/linkedin/callback",
    LINKEDIN_SESSION_SECRET: secret,
  });
  globalThis.fetch = async (url) => {
    if (String(url).includes("accessToken")) return Response.json({ access_token: "linkedin-access-token-must-not-be-stored" });
    if (String(url).includes("api.linkedin.com/v2/userinfo")) return Response.json({ sub: "linkedin-subject-123", name: "Owner", email: "owner@example.com", picture: "https://example.com/picture.jpg" });
    throw new Error(`Unexpected LinkedIn URL: ${url}`);
  };
  const { mf, db } = await createDatabase();
  try {
    const worker = await loadWorker();
    const env = { DB: db, ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } };
    const context = { waitUntil() {}, passThroughOnException() {} };
    const state = await signPayload({ owner: "owner@example.com", nonce: "oauth-test", exp: Math.floor(Date.now() / 1000) + 60 }, secret);
    const callback = await worker.fetch(new Request(`http://localhost/api/linkedin/callback?code=test-code&state=${encodeURIComponent(state)}`, {
      headers: { cookie: `__Host-vjobs_linkedin_state=${encodeURIComponent(state)}`, "oai-authenticated-user-email": "owner@example.com" },
      redirect: "manual",
    }), env, context);
    assert.ok([302, 303, 307, 308].includes(callback.status));
    const setCookie = callback.headers.get("set-cookie") || "";
    const match = setCookie.match(new RegExp(`${LINKEDIN_SESSION_COOKIE}=([^;,]+)`));
    assert.ok(match, "callback should set an opaque LinkedIn session cookie");
    const token = decodeURIComponent(match[1]);
    assert.doesNotMatch(token, /owner|linkedin|example/i);
    assert.doesNotMatch(setCookie, /linkedin-access-token-must-not-be-stored/);

    const status = await worker.fetch(new Request("http://localhost/api/linkedin/status", { headers: { cookie: `${LINKEDIN_SESSION_COOKIE}=${encodeURIComponent(token)}`, "oai-authenticated-user-email": "owner@example.com" } }), env, context);
    assert.equal((await status.json()).connected, true);
    const otherOwner = await worker.fetch(new Request("http://localhost/api/linkedin/status", { headers: { cookie: `${LINKEDIN_SESSION_COOKIE}=${encodeURIComponent(token)}`, "oai-authenticated-user-email": "other@example.com" } }), env, context);
    assert.equal((await otherOwner.json()).connected, false);

    const stored = await db.prepare("SELECT token_hash FROM oauth_sessions LIMIT 1").first();
    assert.notEqual(stored.token_hash, token);
    const disconnected = await worker.fetch(new Request("http://localhost/api/linkedin/disconnect", { method: "POST", headers: { cookie: `${LINKEDIN_SESSION_COOKIE}=${encodeURIComponent(token)}`, "oai-authenticated-user-email": "owner@example.com" } }), env, context);
    assert.equal(disconnected.status, 200);
    const revoked = await db.prepare("SELECT revoked_at FROM oauth_sessions LIMIT 1").first();
    assert.ok(revoked.revoked_at);

    const sessionColumns = (await db.prepare("PRAGMA table_info(oauth_sessions)").all()).results.map((column) => column.name);
    const identityColumns = (await db.prepare("PRAGMA table_info(oauth_identities)").all()).results.map((column) => column.name);
    assert.equal([...sessionColumns, ...identityColumns].some((name) => /access.*token|password|cookie/i.test(name)), false);
  } finally {
    globalThis.fetch = originalFetch;
    for (const [name, value] of Object.entries(original)) { if (value === undefined) delete process.env[name]; else process.env[name] = value; }
    await mf.dispose();
  }
});
