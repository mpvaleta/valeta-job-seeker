import assert from "node:assert/strict";
import test from "node:test";

async function loadWorker() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("link-test", `${process.pid}-${Date.now()}-${Math.random()}`);
  return (await import(workerUrl.href)).default;
}

const env = {
  ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) },
};
const context = { waitUntil() {}, passThroughOnException() {} };

test("public link and radar APIs require the signed-in Sites identity", async () => {
  const worker = await loadWorker();
  const link = await worker.fetch(new Request("http://localhost/api/link/read", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ url: "https://example.com/article", purpose: "knowledge" }),
  }), env, context);
  assert.equal(link.status, 401);
  assert.equal((await link.json()).code, "authentication_required");

  const radar = await worker.fetch(new Request("http://localhost/api/radar"), env, context);
  assert.equal(radar.status, 401);
  assert.equal((await radar.json()).code, "authentication_required");
});

test("authenticated public-link import returns bounded readable content", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response("<!doctype html><title>Resume Guidance</title><main><h1>Resume Guidance</h1><p>Tailor the résumé to the role while preserving truthful, verified evidence.</p><p>Use concise bullets and make every important claim reviewable by the candidate.</p></main>", { headers: { "content-type": "text/html" } });
  try {
    const worker = await loadWorker();
    const response = await worker.fetch(new Request("http://localhost/api/link/read", {
      method: "POST",
      headers: { "content-type": "application/json", "oai-authenticated-user-email": "owner@example.com" },
      body: JSON.stringify({ url: "https://career.example/resume-guidance", purpose: "knowledge" }),
    }), env, context);
    const data = await response.json();
    assert.equal(response.status, 200);
    assert.equal(data.ok, true);
    assert.equal(data.purpose, "knowledge");
    assert.match(data.source.text, /verified evidence/i);
    assert.equal(data.safety.credentialsSent, false);
    assert.equal(data.safety.linkedinAutomation, false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("authenticated LinkedIn URLs are refused before network access", async () => {
  const originalFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => { calls += 1; return new Response("Unexpected"); };
  try {
    const worker = await loadWorker();
    const response = await worker.fetch(new Request("http://localhost/api/link/read", {
      method: "POST",
      headers: { "content-type": "application/json", "oai-authenticated-user-email": "owner@example.com" },
      body: JSON.stringify({ url: "https://www.linkedin.com/jobs/view/123", purpose: "role" }),
    }), env, context);
    const data = await response.json();
    assert.equal(response.status, 422);
    assert.equal(data.code, "linkedin_automation_blocked");
    assert.equal(calls, 0);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
