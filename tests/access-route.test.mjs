import assert from "node:assert/strict";
import crypto from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import test from "node:test";
import { Miniflare } from "miniflare";
import { accessHeaders, installAccessEnv } from "./helpers/access-token.mjs";
import { fromBase64Url, toBase64Url } from "../lib/webauthn.mjs";

await installAccessEnv();

// ---------------------------------------------------------------------------
// The same synthetic authenticator as tests/webauthn.test.mjs, here driving
// the REAL /api/access route end to end through Miniflare: register a passkey
// from an authenticated session, sign in with it anonymously, and watch the
// server set the HttpOnly session cookie — plus every way that must not work.

const HOST = "http://localhost";
const RP_ID = "localhost";
const ORIGIN = HOST;

async function loadWorker() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("access-route-test", `${process.pid}-${Date.now()}-${Math.random()}`);
  return (await import(workerUrl.href)).default;
}

async function createDatabase() {
  const mf = new Miniflare({
    compatibilityDate: "2026-05-22",
    modules: true,
    script: "export default { fetch() { return new Response('ok') } }",
    d1Databases: ["DB"],
  });
  const db = await mf.getD1Database("DB");
  const directory = new URL("../drizzle/", import.meta.url);
  const migrations = (await readdir(directory)).filter((name) => /^\d+.*\.sql$/.test(name)).sort();
  for (const name of migrations) {
    const migration = await readFile(new URL(name, directory), "utf8");
    for (const statement of migration.split("--> statement-breakpoint").map((value) => value.trim()).filter(Boolean)) await db.prepare(statement).run();
  }
  return { mf, db };
}

const context = { waitUntil() {}, passThroughOnException() {} };

function cborEncode(value) {
  const chunks = [];
  const head = (major, length) => {
    if (length < 24) chunks.push(Uint8Array.of((major << 5) | length));
    else if (length < 256) chunks.push(Uint8Array.of((major << 5) | 24, length));
    else chunks.push(Uint8Array.of((major << 5) | 25, length >> 8, length & 0xff));
  };
  const encode = (item) => {
    if (typeof item === "number" && Number.isInteger(item)) { if (item >= 0) head(0, item); else head(1, -1 - item); }
    else if (item instanceof Uint8Array) { head(2, item.length); chunks.push(item); }
    else if (typeof item === "string") { const bytes = new TextEncoder().encode(item); head(3, bytes.length); chunks.push(bytes); }
    else if (item instanceof Map) { head(5, item.size); for (const [key, entry] of item) { encode(key); encode(entry); } }
    else throw new Error("unsupported");
  };
  encode(value);
  const total = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const merged = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) { merged.set(chunk, offset); offset += chunk.length; }
  return merged;
}

const sha256Sync = (input) => new Uint8Array(crypto.createHash("sha256").update(input).digest());

function makeAuthenticator() {
  const { publicKey, privateKey } = crypto.generateKeyPairSync("ec", { namedCurve: "P-256" });
  return { privateKey, jwk: publicKey.export({ format: "jwk" }), credentialId: new Uint8Array(crypto.randomBytes(32)), signCount: 0 };
}

function buildAuthData({ flags, signCount = 0, credentialId, coseKey }) {
  const parts = [sha256Sync(RP_ID), Uint8Array.of(flags), Uint8Array.of((signCount >>> 24) & 0xff, (signCount >>> 16) & 0xff, (signCount >>> 8) & 0xff, signCount & 0xff)];
  if (credentialId && coseKey) {
    parts.push(new Uint8Array(16), Uint8Array.of(credentialId.length >> 8, credentialId.length & 0xff), credentialId, cborEncode(coseKey));
  }
  const merged = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
  let offset = 0;
  for (const part of parts) { merged.set(part, offset); offset += part.length; }
  return merged;
}

function registrationResponse(authenticator, challengeB64) {
  const coseKey = new Map([[1, 2], [3, -7], [-1, 1], [-2, fromBase64Url(authenticator.jwk.x)], [-3, fromBase64Url(authenticator.jwk.y)]]);
  const clientDataJSON = new TextEncoder().encode(JSON.stringify({ type: "webauthn.create", challenge: challengeB64, origin: ORIGIN, crossOrigin: false }));
  const authData = buildAuthData({ flags: 0x45, credentialId: authenticator.credentialId, coseKey });
  const attestationObject = cborEncode(new Map([["fmt", "none"], ["attStmt", new Map()], ["authData", authData]]));
  return {
    id: toBase64Url(authenticator.credentialId),
    response: { clientDataJSON: toBase64Url(clientDataJSON), attestationObject: toBase64Url(attestationObject) },
  };
}

function assertionResponse(authenticator, challengeB64, { signCount = 0, origin = ORIGIN } = {}) {
  const clientDataJSON = new TextEncoder().encode(JSON.stringify({ type: "webauthn.get", challenge: challengeB64, origin, crossOrigin: false }));
  const authenticatorData = buildAuthData({ flags: 0x05, signCount });
  const signature = new Uint8Array(crypto.sign("sha256", Buffer.concat([authenticatorData, sha256Sync(clientDataJSON)]), { key: authenticator.privateKey, dsaEncoding: "der" }));
  return {
    id: toBase64Url(authenticator.credentialId),
    response: {
      clientDataJSON: toBase64Url(clientDataJSON),
      authenticatorData: toBase64Url(authenticatorData),
      signature: toBase64Url(signature),
      userHandle: "",
    },
  };
}

function makeEnvironment(db) {
  return { DB: db, ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } };
}

async function post(worker, env, body, headers = {}) {
  const response = await worker.fetch(new Request(`${HOST}/api/access`, {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
  }), env, context);
  return { response, data: await response.json() };
}

const ownerHeaders = await accessHeaders("owner@example.com");

// ---------------------------------------------------------------------------

test("token login sets an HttpOnly session cookie; a wrong token gets nothing", async () => {
  const { mf, db } = await createDatabase();
  try {
    const worker = await loadWorker();
    const env = makeEnvironment(db);

    const good = await post(worker, env, { action: "token_login", token: "test-app-token" });
    assert.equal(good.response.status, 200, JSON.stringify(good.data));
    const cookies = good.response.headers.getSetCookie();
    const tokenCookie = cookies.find((cookie) => cookie.startsWith("vjobs_token="));
    const marker = cookies.find((cookie) => cookie.startsWith("vjobs_signed_in="));
    assert.ok(tokenCookie && /HttpOnly/i.test(tokenCookie), "the session cookie must be HttpOnly");
    assert.ok(marker && !/HttpOnly/i.test(marker), "the marker must stay readable and carries no secret");
    assert.equal(good.data.email, "owner@example.com");

    const bad = await post(worker, env, { action: "token_login", token: "wrong" });
    assert.equal(bad.response.status, 401);
    assert.equal(bad.data.code, "invalid_token");
    assert.equal(bad.response.headers.getSetCookie().length, 0, "a failed login must set no cookies");

    const out = await post(worker, env, { action: "logout" });
    assert.ok(out.response.headers.getSetCookie().every((cookie) => /Max-Age=0/i.test(cookie)), "logout must expire both cookies");
  } finally {
    await mf.dispose();
  }
});

test("a passkey registered from an authenticated session signs in anonymously afterwards", async () => {
  const { mf, db } = await createDatabase();
  try {
    const worker = await loadWorker();
    const env = makeEnvironment(db);
    const authenticator = makeAuthenticator();

    // Registration demands an authenticated session.
    const anonymousOptions = await post(worker, env, { action: "register_options" });
    assert.equal(anonymousOptions.response.status, 401, "registration options must require the token");

    const options = await post(worker, env, { action: "register_options" }, ownerHeaders);
    assert.equal(options.response.status, 200, JSON.stringify(options.data));
    assert.equal(options.data.options.rp.id, RP_ID);
    assert.equal(options.data.options.attestation, "none");

    const registered = await post(worker, env, {
      action: "register",
      challengeId: options.data.challengeId,
      label: "Test iPhone",
      credential: registrationResponse(authenticator, options.data.options.challenge),
    }, ownerHeaders);
    assert.equal(registered.response.status, 200, JSON.stringify(registered.data));
    assert.equal(registered.data.passkeys.length, 1);
    assert.equal(registered.data.passkeys[0].label, "Test iPhone");

    // Sign-in: anonymous, exactly as a fresh device would.
    const loginOptions = await post(worker, env, { action: "login_options" });
    assert.equal(loginOptions.response.status, 200);
    assert.ok(!("allowCredentials" in loginOptions.data.options), "credential ids must not be named to anonymous callers");

    const login = await post(worker, env, {
      action: "login",
      challengeId: loginOptions.data.challengeId,
      credential: assertionResponse(authenticator, loginOptions.data.options.challenge),
    });
    assert.equal(login.response.status, 200, JSON.stringify(login.data));
    assert.equal(login.data.email, "owner@example.com");
    const sessionCookie = login.response.headers.getSetCookie().find((cookie) => cookie.startsWith("vjobs_token="));
    assert.ok(sessionCookie && /HttpOnly/i.test(sessionCookie), "passkey login must set the HttpOnly session cookie");
    assert.ok(sessionCookie.includes(encodeURIComponent("test-app-token")), "the cookie must carry the owner's real token");
  } finally {
    await mf.dispose();
  }
});

test("a challenge is single-use, purpose-bound, and a foreign signature is refused", async () => {
  const { mf, db } = await createDatabase();
  try {
    const worker = await loadWorker();
    const env = makeEnvironment(db);
    const authenticator = makeAuthenticator();

    const options = await post(worker, env, { action: "register_options" }, ownerHeaders);
    await post(worker, env, { action: "register", challengeId: options.data.challengeId, credential: registrationResponse(authenticator, options.data.options.challenge) }, ownerHeaders);

    // Replaying the SAME login challenge: first use succeeds, second finds nothing.
    const loginOptions = await post(worker, env, { action: "login_options" });
    const assertion = assertionResponse(authenticator, loginOptions.data.options.challenge);
    const first = await post(worker, env, { action: "login", challengeId: loginOptions.data.challengeId, credential: assertion });
    assert.equal(first.response.status, 200);
    const replay = await post(worker, env, { action: "login", challengeId: loginOptions.data.challengeId, credential: assertion });
    assert.equal(replay.response.status, 400);
    assert.equal(replay.data.code, "challenge_expired");

    // A REGISTER challenge presented to the login path is worthless.
    const registerChallenge = await post(worker, env, { action: "register_options" }, ownerHeaders);
    const crossPurpose = await post(worker, env, {
      action: "login",
      challengeId: registerChallenge.data.challengeId,
      credential: assertionResponse(authenticator, registerChallenge.data.options.challenge),
    });
    assert.equal(crossPurpose.response.status, 400);
    assert.equal(crossPurpose.data.code, "challenge_expired");

    // An imposter key signing over the right challenge still fails.
    const imposter = makeAuthenticator();
    imposter.credentialId = authenticator.credentialId; // claims to be the registered credential
    const imposterOptions = await post(worker, env, { action: "login_options" });
    const forged = await post(worker, env, {
      action: "login",
      challengeId: imposterOptions.data.challengeId,
      credential: assertionResponse(imposter, imposterOptions.data.options.challenge),
    });
    assert.equal(forged.response.status, 400);
    assert.match(forged.data.message, /signature does not verify/i);

    // An unregistered credential id is turned away before any cryptography.
    const strangerOptions = await post(worker, env, { action: "login_options" });
    const stranger = await post(worker, env, {
      action: "login",
      challengeId: strangerOptions.data.challengeId,
      credential: assertionResponse(makeAuthenticator(), strangerOptions.data.options.challenge),
    });
    assert.equal(stranger.response.status, 400);
    assert.equal(stranger.data.code, "unknown_passkey");
  } finally {
    await mf.dispose();
  }
});

test("passkeys are listed and removed only by their owner, and removal is scoped", async () => {
  const { mf, db } = await createDatabase();
  try {
    const worker = await loadWorker();
    const env = makeEnvironment(db);
    const authenticator = makeAuthenticator();

    const options = await post(worker, env, { action: "register_options" }, ownerHeaders);
    await post(worker, env, { action: "register", challengeId: options.data.challengeId, label: "Owner phone", credential: registrationResponse(authenticator, options.data.options.challenge) }, ownerHeaders);

    const listed = await worker.fetch(new Request(`${HOST}/api/access`, { headers: ownerHeaders }), env, context);
    const listedData = await listed.json();
    assert.equal(listedData.passkeys.length, 1);
    const credentialId = listedData.passkeys[0].id;

    // A different identity cannot remove the owner's passkey.
    const otherHeaders = await accessHeaders("other@example.com");
    const foreign = await post(worker, env, { action: "delete_passkey", credentialId }, otherHeaders);
    assert.equal(foreign.response.status, 404, "someone else's delete must not find the credential");

    const removed = await post(worker, env, { action: "delete_passkey", credentialId }, ownerHeaders);
    assert.equal(removed.response.status, 200);
    assert.equal(removed.data.passkeys.length, 0);

    // With the credential gone, its sign-in path is gone too.
    const loginOptions = await post(worker, env, { action: "login_options" });
    const late = await post(worker, env, { action: "login", challengeId: loginOptions.data.challengeId, credential: assertionResponse(authenticator, loginOptions.data.options.challenge) });
    assert.equal(late.data.code, "unknown_passkey");
  } finally {
    await mf.dispose();
  }
});

test("cross-site posts and malformed bodies are rejected before any work happens", async () => {
  const { mf, db } = await createDatabase();
  try {
    const worker = await loadWorker();
    const env = makeEnvironment(db);
    const crossSite = await worker.fetch(new Request(`${HOST}/api/access`, {
      method: "POST",
      headers: { "content-type": "application/json", origin: "https://attacker.example", "sec-fetch-site": "cross-site" },
      body: JSON.stringify({ action: "token_login", token: "test-app-token" }),
    }), env, context);
    assert.equal(crossSite.status, 403);

    const garbage = await worker.fetch(new Request(`${HOST}/api/access`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "not json",
    }), env, context);
    assert.equal(garbage.status, 400);

    const unknown = await post(worker, env, { action: "become_admin" });
    assert.equal(unknown.response.status, 400);
    assert.equal(unknown.data.code, "unknown_action");
  } finally {
    await mf.dispose();
  }
});
