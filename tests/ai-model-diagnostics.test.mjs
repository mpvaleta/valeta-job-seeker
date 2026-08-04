import assert from "node:assert/strict";
import test from "node:test";
import { accessHeaders, installAccessEnv } from "./helpers/access-token.mjs";

await installAccessEnv();
const ACCESS_HEADER = await accessHeaders("owner@example.com");

async function loadWorker() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("model-diagnostic-test", `${process.pid}-${Date.now()}-${Math.random()}`);
  return (await import(workerUrl.href)).default;
}

const env = { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } };
const context = { waitUntil() {}, passThroughOnException() {} };

test("model diagnostics require same-origin authenticated access", async () => {
  const worker = await loadWorker();
  const anonymous = await worker.fetch(new Request("http://localhost/api/ai/models", { method: "POST", headers: { "content-type": "application/json" }, body: "{}" }), env, context);
  assert.equal(anonymous.status, 401);
  const crossSite = await worker.fetch(new Request("http://localhost/api/ai/models", { method: "POST", headers: { "content-type": "application/json", origin: "https://attacker.example", "sec-fetch-site": "cross-site", ...ACCESS_HEADER }, body: "{}" }), env, context);
  assert.equal(crossSite.status, 403);
});

test("model diagnostics verify exact configured IDs without generating content", async () => {
  const originals = {
    openai: process.env.OPENAI_API_KEY,
    anthropic: process.env.ANTHROPIC_API_KEY,
    gemini: process.env.GEMINI_API_KEY,
    allowed: process.env.AI_ALLOWED_EMAILS,
    fetch: globalThis.fetch,
  };
  process.env.OPENAI_API_KEY = "test-openai-key";
  process.env.ANTHROPIC_API_KEY = "test-anthropic-key";
  process.env.GEMINI_API_KEY = "test-gemini-key";
  process.env.AI_ALLOWED_EMAILS = "owner@example.com";
  const calls = [];
  globalThis.fetch = async (url) => {
    calls.push(String(url));
    if (String(url).includes("api.openai.com/v1/models")) return Response.json({ data: [{ id: "gpt-5.6-sol" }] });
    if (String(url).includes("api.anthropic.com/v1/models")) return Response.json({ data: [{ id: "claude-sonnet-5" }] });
    if (String(url).includes("generativelanguage.googleapis.com")) return Response.json({ models: [{ name: "models/gemini-3.5-flash", supportedGenerationMethods: ["generateContent"] }] });
    throw new Error(`Unexpected URL ${url}`);
  };
  try {
    const worker = await loadWorker();
    const response = await worker.fetch(new Request("http://localhost/api/ai/models", { method: "POST", headers: { "content-type": "application/json", ...ACCESS_HEADER }, body: "{}" }), env, context);
    const data = await response.json();
    assert.equal(response.status, 200);
    assert.equal(data.ok, true);
    assert.equal(data.providers.find((provider) => provider.id === "openai").models.find((model) => model.key === "reliable").available, true);
    assert.equal(data.providers.find((provider) => provider.id === "openai").models.find((model) => model.key === "balanced").available, false);
    assert.equal(data.providers.find((provider) => provider.id === "google").models.find((model) => model.key === "balanced").available, true);
    assert.ok(calls.every((url) => !/responses|generateContent|messages$/.test(url)));
    assert.doesNotMatch(JSON.stringify(data), /test-(openai|anthropic|gemini)-key/);
  } finally {
    globalThis.fetch = originals.fetch;
    for (const [name, value] of [["OPENAI_API_KEY", originals.openai], ["ANTHROPIC_API_KEY", originals.anthropic], ["GEMINI_API_KEY", originals.gemini], ["AI_ALLOWED_EMAILS", originals.allowed]]) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  }
});

test("selected-model diagnostics distinguish catalog access from billable generation quota", async () => {
  const originals = {
    openai: process.env.OPENAI_API_KEY,
    allowed: process.env.AI_ALLOWED_EMAILS,
    fetch: globalThis.fetch,
  };
  process.env.OPENAI_API_KEY = "test-openai-key";
  process.env.AI_ALLOWED_EMAILS = "owner@example.com";
  globalThis.fetch = async (url) => {
    if (String(url).endsWith("/v1/models")) return Response.json({ data: [{ id: "gpt-5.6-luna" }] });
    if (String(url).endsWith("/v1/responses")) return Response.json({ error: { code: "insufficient_quota", message: "No quota" } }, { status: 429 });
    if (String(url).includes("anthropic.com") || String(url).includes("generativelanguage.googleapis.com")) return new Response("unauthorized", { status: 401 });
    throw new Error(`Unexpected URL ${url}`);
  };
  try {
    const worker = await loadWorker();
    const response = await worker.fetch(new Request("http://localhost/api/ai/models", {
      method: "POST",
      headers: { "content-type": "application/json", ...ACCESS_HEADER },
      body: JSON.stringify({ live: true, provider: "openai", modelKey: "fast" }),
    }), env, context);
    const data = await response.json();
    const openai = data.providers.find((provider) => provider.id === "openai");
    const luna = openai.models.find((model) => model.key === "fast");
    assert.equal(response.status, 200);
    assert.equal(luna.available, true);
    assert.equal(luna.generationAvailable, false);
    assert.match(luna.generationReason, /quota/i);
    assert.match(data.note, /generation request/i);
    assert.doesNotMatch(JSON.stringify(data), /test-openai-key/);
  } finally {
    globalThis.fetch = originals.fetch;
    for (const [name, value] of [["OPENAI_API_KEY", originals.openai], ["AI_ALLOWED_EMAILS", originals.allowed]]) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  }
});
