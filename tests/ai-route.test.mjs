import assert from "node:assert/strict";
import test from "node:test";

async function loadWorker() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("ai-test", `${process.pid}-${Date.now()}-${Math.random()}`);
  return (await import(workerUrl.href)).default;
}

const env = {
  ASSETS: {
    fetch: async () => new Response("Not found", { status: 404 }),
  },
};

const context = {
  waitUntil() {},
  passThroughOnException() {},
};

const validRequestBody = {
  company: "Example",
  role: "Marketing Program Manager",
  jobText: "Lead integrated marketing campaigns from brief through launch. Coordinate design, content, media, agency partners, budgets, risks, and stakeholder communication across several concurrent programs.",
  approvedFacts: [
    "Led integrated marketing campaigns from creative brief through launch.",
    "Coordinated design, content, media, and agency partners across several programs.",
    "Managed campaign budgets, risks, schedules, and stakeholder communication.",
  ],
};

const validProviderRecommendation = {
  decision: "apply_after_edits",
  confidence: "medium",
  summary: "The approved evidence covers several core responsibilities, while a few requirements still need verification.",
  actions: ["Prioritize the strongest approved delivery evidence."],
  priority_fact_indexes: [1],
  evidence_gaps: ["No approved fact confirms the requested certification."],
  cautions: ["Do not infer missing credentials."],
  evidence_items: [
    { requirement: "Coordinate cross-functional campaign delivery", support: "strong", fact_indexes: [1] },
    { requirement: "Requested certification", support: "gap", fact_indexes: [] },
  ],
};

test("AI status endpoint reveals configuration state without revealing secrets", async () => {
  const worker = await loadWorker();
  const response = await worker.fetch(new Request("http://localhost/api/ai/recommend"), env, context);
  const text = await response.text();
  const data = JSON.parse(text);

  assert.equal(response.status, 200);
  assert.equal(typeof data.configured, "boolean");
  assert.equal(typeof data.authenticated, "boolean");
  assert.equal(typeof data.authorized, "boolean");
  assert.equal(typeof data.ready, "boolean");
  assert.equal(data.localFallback, true);
  assert.equal(typeof data.model, "string");
  assert.equal(data.providers.length, 3);
  assert.deepEqual(data.providers.map((provider) => provider.id), ["openai", "anthropic", "google"]);
  assert.ok(data.providers.every((provider) => typeof provider.keyName === "string" && provider.models.length === 3));
  assert.ok(data.providers.every((provider) => provider.models.every((model) => ["reliable", "balanced", "fast"].includes(model.key))));
  assert.match(data.privacy, /approved facts/i);
  assert.doesNotMatch(text, /Bearer\s|sk-[A-Za-z0-9]|test-key-that-is-never-sent/);
});

test("AI endpoint rejects incomplete roles before any provider call", async () => {
  const worker = await loadWorker();
  const response = await worker.fetch(new Request("http://localhost/api/ai/recommend", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ company: "Example", role: "Manager", jobText: "Too short", approvedFacts: ["one", "two", "three"] }),
  }), env, context);
  const data = await response.json();

  assert.equal(response.status, 400);
  assert.equal(data.code, "invalid_request");
  assert.match(data.message, /complete job description/i);
});

test("AI endpoint blocks cross-site attempts before they can spend provider credits", async () => {
  const worker = await loadWorker();
  const response = await worker.fetch(new Request("http://localhost/api/ai/recommend", {
    method: "POST",
    headers: { "content-type": "application/json", origin: "https://attacker.example", "sec-fetch-site": "cross-site", "oai-authenticated-user-email": "owner@example.com" },
    body: JSON.stringify(validRequestBody),
  }), env, context);
  const data = await response.json();
  assert.equal(response.status, 403);
  assert.equal(data.code, "cross_site_request_blocked");
  assert.equal(data.localFallback, true);
});

test("AI endpoint fails safely to the local engine when no server key exists", async (t) => {
  const worker = await loadWorker();
  const statusResponse = await worker.fetch(new Request("http://localhost/api/ai/recommend"), env, context);
  const status = await statusResponse.json();
  if (status.configured) {
    t.skip("A server key is present; avoiding a live provider call in the automated test.");
    return;
  }

  const response = await worker.fetch(new Request("http://localhost/api/ai/recommend", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(validRequestBody),
  }), env, context);
  const data = await response.json();

  assert.equal(response.status, 503);
  assert.equal(data.code, "provider_not_configured");
  assert.equal(data.localFallback, true);
  assert.equal(data.provider, "openai");
  assert.equal(typeof data.model, "string");
});

test("AI endpoint rejects provider and model values outside the server allowlist", async () => {
  const worker = await loadWorker();
  const badProvider = await worker.fetch(new Request("http://localhost/api/ai/recommend", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ ...validRequestBody, provider: "custom-url-provider", modelKey: "reliable" }),
  }), env, context);
  const badProviderData = await badProvider.json();
  assert.equal(badProvider.status, 400);
  assert.equal(badProviderData.code, "invalid_request");
  assert.match(badProviderData.message, /available AI provider/i);

  const badModel = await worker.fetch(new Request("http://localhost/api/ai/recommend", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ ...validRequestBody, provider: "openai", modelKey: "arbitrary-model-id" }),
  }), env, context);
  const badModelData = await badModel.json();
  assert.equal(badModel.status, 400);
  assert.equal(badModelData.code, "invalid_request");
  assert.match(badModelData.message, /available model/i);
});

test("an unconfigured selected provider fails safely without trying a different provider", async () => {
  const originalKey = process.env.ANTHROPIC_API_KEY;
  delete process.env.ANTHROPIC_API_KEY;
  try {
    const worker = await loadWorker();
    const response = await worker.fetch(new Request("http://localhost/api/ai/recommend", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ...validRequestBody, provider: "anthropic", modelKey: "balanced" }),
    }), env, context);
    const data = await response.json();
    assert.equal(response.status, 503);
    assert.equal(data.code, "provider_not_configured");
    assert.equal(data.provider, "anthropic");
    assert.match(data.model, /^claude-/);
    assert.equal(data.localFallback, true);
  } finally {
    if (originalKey === undefined) delete process.env.ANTHROPIC_API_KEY;
    else process.env.ANTHROPIC_API_KEY = originalKey;
  }
});

test("all allowlisted provider adapters validate structured output and preserve exact approved facts", async () => {
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
  globalThis.fetch = async (input, init) => {
    const url = String(input);
    calls.push({ url, init });
    const text = JSON.stringify(validProviderRecommendation);
    if (url.includes("api.openai.com")) return Response.json({ id: "resp_test", output_text: text }, { headers: { "x-request-id": "openai-request" } });
    if (url.includes("api.anthropic.com")) return Response.json({ id: "msg_test", content: [{ type: "text", text }] }, { headers: { "request-id": "anthropic-request" } });
    if (url.includes("generativelanguage.googleapis.com")) return Response.json({ output_text: text, response_id: "gemini-test" }, { headers: { "x-goog-request-id": "gemini-request" } });
    throw new Error(`Unexpected provider URL: ${url}`);
  };

  try {
    const scenarios = [
      { provider: "openai", modelKey: "reliable", host: "api.openai.com" },
      { provider: "anthropic", modelKey: "balanced", host: "api.anthropic.com" },
      { provider: "google", modelKey: "fast", host: "generativelanguage.googleapis.com" },
    ];
    for (const scenario of scenarios) {
      const worker = await loadWorker();
      const response = await worker.fetch(new Request("http://localhost/api/ai/recommend", {
        method: "POST",
        headers: { "content-type": "application/json", "oai-authenticated-user-email": "owner@example.com" },
        body: JSON.stringify({ ...validRequestBody, provider: scenario.provider, modelKey: scenario.modelKey }),
      }), env, context);
      const data = await response.json();
      assert.equal(response.status, 200);
      assert.equal(data.ok, true);
      assert.equal(data.provider, scenario.provider);
      assert.deepEqual(data.recommendation.priorityFacts, [validRequestBody.approvedFacts[1]]);
      assert.equal(data.guardrails.approvedFactsOnly, true);
      assert.equal(data.guardrails.allowlistedModel, true);
      assert.equal(data.guardrails.evidenceIndexesValidated, true);
      assert.deepEqual(data.recommendation.evidenceMap[0].facts, [validRequestBody.approvedFacts[1]]);
      assert.match(calls.at(-1).url, new RegExp(scenario.host.replaceAll(".", "\\.")));
      assert.doesNotMatch(JSON.stringify(data), /test-(openai|anthropic|gemini)-key/);
    }
  } finally {
    globalThis.fetch = originals.fetch;
    for (const [name, value] of [["OPENAI_API_KEY", originals.openai], ["ANTHROPIC_API_KEY", originals.anthropic], ["GEMINI_API_KEY", originals.gemini], ["AI_ALLOWED_EMAILS", originals.allowed]]) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  }
});

test("AI guardrails reject a provider response that cites a fact outside the approved list", async () => {
  const originalKey = process.env.OPENAI_API_KEY;
  const originalAllowed = process.env.AI_ALLOWED_EMAILS;
  const originalFetch = globalThis.fetch;
  process.env.OPENAI_API_KEY = "test-openai-key";
  process.env.AI_ALLOWED_EMAILS = "owner@example.com";
  globalThis.fetch = async () => Response.json({ output_text: JSON.stringify({
    ...validProviderRecommendation,
    priority_fact_indexes: [99],
  }) });
  try {
    const worker = await loadWorker();
    const response = await worker.fetch(new Request("http://localhost/api/ai/recommend", {
      method: "POST",
      headers: { "content-type": "application/json", "oai-authenticated-user-email": "owner@example.com" },
      body: JSON.stringify({ ...validRequestBody, provider: "openai", modelKey: "reliable" }),
    }), env, context);
    const data = await response.json();
    assert.equal(response.status, 503);
    assert.equal(data.code, "guardrail_rejected");
    assert.equal(data.localFallback, true);
  } finally {
    globalThis.fetch = originalFetch;
    if (originalKey === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = originalKey;
    if (originalAllowed === undefined) delete process.env.AI_ALLOWED_EMAILS;
    else process.env.AI_ALLOWED_EMAILS = originalAllowed;
  }
});

test("a configured server key is not usable by anonymous requests", async () => {
  const originalKey = process.env.OPENAI_API_KEY;
  process.env.OPENAI_API_KEY = "test-key-that-is-never-sent";
  try {
    const worker = await loadWorker();
    const response = await worker.fetch(new Request("http://localhost/api/ai/recommend", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(validRequestBody),
    }), env, context);
    const data = await response.json();

    assert.equal(response.status, 401);
    assert.equal(data.code, "authentication_required");
    assert.equal(data.localFallback, true);
  } finally {
    if (originalKey === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = originalKey;
  }
});

test("the optional account allowlist blocks an authenticated but unapproved visitor", async () => {
  const originalKey = process.env.OPENAI_API_KEY;
  const originalAllowed = process.env.AI_ALLOWED_EMAILS;
  process.env.OPENAI_API_KEY = "test-key-that-is-never-sent";
  process.env.AI_ALLOWED_EMAILS = "owner@example.com,friend@example.com";
  try {
    const worker = await loadWorker();
    const response = await worker.fetch(new Request("http://localhost/api/ai/recommend", {
      method: "POST",
      headers: { "content-type": "application/json", "oai-authenticated-user-email": "visitor@example.com" },
      body: JSON.stringify(validRequestBody),
    }), env, context);
    const data = await response.json();

    assert.equal(response.status, 403);
    assert.equal(data.code, "access_not_allowed");
    assert.equal(data.localFallback, true);
  } finally {
    if (originalKey === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = originalKey;
    if (originalAllowed === undefined) delete process.env.AI_ALLOWED_EMAILS;
    else process.env.AI_ALLOWED_EMAILS = originalAllowed;
  }
});
