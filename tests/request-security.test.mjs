import assert from "node:assert/strict";
import test from "node:test";
import { isTrustedSameOriginMutation } from "../lib/request-security.ts";

const post = (headers) => new Request("https://app.example.com/api/radar", { method: "POST", headers });

test("a same-origin request from the app itself is trusted", () => {
  assert.equal(isTrustedSameOriginMutation(post({ origin: "https://app.example.com", "sec-fetch-site": "same-origin" })), true);
});

test("a cross-site request carrying only cookies is blocked", () => {
  assert.equal(isTrustedSameOriginMutation(post({ origin: "https://evil.example.com", "sec-fetch-site": "cross-site", cookie: "vjobs_token=secret" })), false);
  assert.equal(isTrustedSameOriginMutation(post({ origin: "https://evil.example.com" })), false);
});

test("a form post with no origin header at all is trusted", () => {
  // curl and the automation bridge send neither Origin nor Sec-Fetch-Site.
  assert.equal(isTrustedSameOriginMutation(post({})), true);
});

test("a bearer-authenticated caller is trusted only where a route opts in", () => {
  // The extension posts from chrome-extension://<id>, which is cross-site. It
  // proves itself with a header no browser will attach on a victim's behalf.
  const extension = post({ authorization: "Bearer app-token", origin: "chrome-extension://abcdef", "sec-fetch-site": "cross-site" });
  assert.equal(isTrustedSameOriginMutation(extension, { allowBearerClients: true }), true);
  // Routes without a header-authenticated browser client keep the strict rule.
  assert.equal(isTrustedSameOriginMutation(extension), false);
});

test("an empty Authorization header does not buy a cross-site request any trust", () => {
  assert.equal(isTrustedSameOriginMutation(post({ authorization: "   ", origin: "https://evil.example.com", "sec-fetch-site": "cross-site" }), { allowBearerClients: true }), false);
});
