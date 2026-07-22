import assert from "node:assert/strict";
import test from "node:test";
import { authorizationUrl, signPayload, verifyPayload } from "../lib/linkedin-oauth.ts";

test("LinkedIn OpenID state is signed, expires, and requests only identity scopes", async () => {
  const secret = "a-secure-test-secret-with-more-than-32-characters";
  const state = await signPayload({ owner: "owner@example.com", nonce: "one", exp: Math.floor(Date.now() / 1000) + 60 }, secret);
  assert.equal((await verifyPayload(state, secret)).owner, "owner@example.com");
  assert.equal(await verifyPayload(`${state}changed`, secret), null);
  const expired = await signPayload({ owner: "owner@example.com", exp: 1 }, secret);
  assert.equal(await verifyPayload(expired, secret), null);

  const url = new URL(authorizationUrl({ clientId: "client", clientSecret: "secret", redirectUri: "https://example.com/api/linkedin/callback", sessionSecret: secret, configured: true }, state));
  assert.equal(url.hostname, "www.linkedin.com");
  assert.equal(url.searchParams.get("scope"), "openid profile email");
  assert.equal(url.searchParams.get("redirect_uri"), "https://example.com/api/linkedin/callback");
});
