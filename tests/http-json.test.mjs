import assert from "node:assert/strict";
import test from "node:test";
import { readJsonResponse } from "../lib/http-json.mjs";

test("JSON response reader explains HTML and empty responses without leaking parser errors", async () => {
  await assert.rejects(
    () => readJsonResponse(new Response("<!doctype html><title>Sign in</title>", { status: 401, headers: { "content-type": "text/html" } }), "The link could not be read."),
    /sign-in or hosting page/i,
  );
  await assert.rejects(
    () => readJsonResponse(new Response("", { status: 502 }), "The link could not be read."),
    /empty response/i,
  );
  const value = await readJsonResponse(new Response(JSON.stringify({ ok: true })), "Failed.");
  assert.deepEqual(value, { ok: true });
});

// A caller that wants the HTTP status or the API's own error code on an
// ordinary error response cannot get it from the thrown error, because
// nothing is thrown here: a 401 or 503 with a valid JSON body parses
// successfully and is returned like any other response. AccessGate's login
// check and the workspace bootstrap's revoked-token detection both depend on
// this — losing sight of it once cost a revoked token its own bounce back to
// the login screen, silently falling through to a generic failure banner
// instead. The caller must inspect response.status/response.ok itself and
// build its own error carrying that information forward.
test("an ordinary error response with a valid JSON body is returned, not thrown", async () => {
  const response = new Response(JSON.stringify({ ok: false, code: "invalid_token", message: "Your access token is invalid." }), { status: 401 });
  const value = await readJsonResponse(response, "Failed.");
  assert.deepEqual(value, { ok: false, code: "invalid_token", message: "Your access token is invalid." });
});
