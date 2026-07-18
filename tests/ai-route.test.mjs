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
  assert.match(data.privacy, /approved facts/i);
  assert.doesNotMatch(text, /OPENAI_API_KEY|Bearer\s|sk-[A-Za-z0-9]/);
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
  assert.equal(data.code, "not_configured");
  assert.equal(data.localFallback, true);
  assert.equal(typeof data.model, "string");
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
