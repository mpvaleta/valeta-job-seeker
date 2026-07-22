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
