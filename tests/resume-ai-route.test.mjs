import assert from "node:assert/strict";
import test from "node:test";

async function loadWorker() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("resume-ai-test", `${process.pid}-${Date.now()}-${Math.random()}`);
  return (await import(workerUrl.href)).default;
}

const env = { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } };
const context = { waitUntil() {}, passThroughOnException() {} };
const facts = [
  "SYNTHETIC TEST FACT: Coordinated a fictional product launch for Example Studio.",
  "SYNTHETIC TEST FACT: Led a fictional project team across design, operations, and agency partners.",
  "SYNTHETIC TEST FACT: Managed fictional budgets, vendors, schedules, risks, and stakeholder updates.",
  "SYNTHETIC TEST FACT: Received the fictional Example Award for approved sample work.",
  "SYNTHETIC TEST FACT: Completed a fictional degree at Example University.",
];
const body = {
  action: "generate",
  provider: "openai",
  modelKey: "reliable",
  company: "Example",
  role: "Creative Operations Manager",
  jobText: "Lead creative operations for integrated campaigns. Manage agency partners, budgets, schedules, risks, and cross-functional stakeholder communication while improving production workflows.",
  approvedFacts: facts,
  userRules: ["Keep Education immediately after Professional Experience.", "Keep a short Awards section."],
  curatedRules: ["Use concise accomplishment-oriented bullets."],
  track: { name: "Brand & Creative", headline: "Project and Operations Manager", summary: "Creative operations and cross-functional delivery." },
};
const result = {
  headline: "Project and Operations Manager | Creative Operations",
  summary: "Project and operations leader with approved experience delivering global creative programs and coordinating cross-functional agency partners.",
  summary_fact_indexes: [0, 1],
  skills: [
    { label: "Creative operations", fact_indexes: [1] },
    { label: "Budget and vendor management", fact_indexes: [2] },
  ],
  experience_bullets: [
    { text: "SYNTHETIC TEST FACT: Coordinated a fictional product launch for Example Studio.", fact_indexes: [0] },
    { text: "SYNTHETIC TEST FACT: Led a fictional project team across design, operations, and agency partners.", fact_indexes: [1] },
  ],
  education_bullets: [{ text: "SYNTHETIC TEST FACT: Completed a fictional degree at Example University.", fact_indexes: [4] }],
  awards_bullets: [{ text: "SYNTHETIC TEST FACT: Received the fictional Example Award for approved sample work.", fact_indexes: [3] }],
  omissions: ["No approved fact confirms the requested software certification."],
  playbook_checks: [
    { rule_source: "user", rule_index: 0, status: "followed", note: "Education follows Professional Experience." },
    { rule_source: "user", rule_index: 1, status: "followed", note: "Awards is short." },
    { rule_source: "curated", rule_index: 0, status: "followed", note: "Bullets are concise." },
  ],
};

test("resume generation requires same-origin authentication and a configured provider", async () => {
  const worker = await loadWorker();
  const crossSite = await worker.fetch(new Request("http://localhost/api/ai/resume", {
    method: "POST",
    headers: { "content-type": "application/json", origin: "https://attacker.example", "sec-fetch-site": "cross-site", "oai-authenticated-user-email": "owner@example.com" },
    body: JSON.stringify(body),
  }), env, context);
  assert.equal(crossSite.status, 403);
  assert.equal((await crossSite.json()).code, "cross_site_request_blocked");
});

test("resume generation validates every candidate claim against approved fact indexes and prioritizes user rules", async () => {
  const originalKey = process.env.OPENAI_API_KEY;
  const originalAllowed = process.env.AI_ALLOWED_EMAILS;
  const originalFetch = globalThis.fetch;
  process.env.OPENAI_API_KEY = "test-openai-key";
  process.env.AI_ALLOWED_EMAILS = "owner@example.com";
  let requestBody;
  globalThis.fetch = async (_url, init) => {
    requestBody = JSON.parse(init.body);
    return Response.json({ output_text: JSON.stringify(result), usage: { input_tokens: 100, output_tokens: 200, total_tokens: 300 } });
  };
  try {
    const worker = await loadWorker();
    const response = await worker.fetch(new Request("http://localhost/api/ai/resume", {
      method: "POST",
      headers: { "content-type": "application/json", "oai-authenticated-user-email": "owner@example.com" },
      body: JSON.stringify(body),
    }), env, context);
    const data = await response.json();
    assert.equal(response.status, 200);
    assert.equal(data.ok, true);
    assert.equal(data.result.experience_bullets[0].text, facts[0]);
    assert.equal(data.guardrails.factIndexesValidated, true);
    assert.equal(data.guardrails.userPlaybookPriority, true);
    assert.deepEqual(data.usage, { inputTokens: 100, outputTokens: 200, cachedTokens: 0, totalTokens: 300 });
    assert.match(requestBody.instructions, /user's uploaded résumé playbook rules are mandatory/i);
    assert.ok(requestBody.input.indexOf("user_uploaded_rules") < requestBody.input.indexOf("secondary_curated_rules"));
    assert.doesNotMatch(JSON.stringify(data), /test-openai-key/);
  } finally {
    globalThis.fetch = originalFetch;
    if (originalKey === undefined) delete process.env.OPENAI_API_KEY; else process.env.OPENAI_API_KEY = originalKey;
    if (originalAllowed === undefined) delete process.env.AI_ALLOWED_EMAILS; else process.env.AI_ALLOWED_EMAILS = originalAllowed;
  }
});

test("resume generation rejects any out-of-range evidence citation", async () => {
  const originalKey = process.env.OPENAI_API_KEY;
  const originalFetch = globalThis.fetch;
  process.env.OPENAI_API_KEY = "test-openai-key";
  globalThis.fetch = async () => Response.json({ output_text: JSON.stringify({ ...result, experience_bullets: [{ text: "Invented claim", fact_indexes: [999] }] }) });
  try {
    const worker = await loadWorker();
    const response = await worker.fetch(new Request("http://localhost/api/ai/resume", {
      method: "POST",
      headers: { "content-type": "application/json", "oai-authenticated-user-email": "owner@example.com" },
      body: JSON.stringify(body),
    }), env, context);
    const data = await response.json();
    assert.equal(response.status, 503);
    assert.equal(data.code, "guardrail_rejected");
  } finally {
    globalThis.fetch = originalFetch;
    if (originalKey === undefined) delete process.env.OPENAI_API_KEY; else process.env.OPENAI_API_KEY = originalKey;
  }
});

test("Gemini adapter uses generateContent so free-tier API projects can use supported models", async () => {
  const originalKey = process.env.GEMINI_API_KEY;
  const originalFetch = globalThis.fetch;
  process.env.GEMINI_API_KEY = "test-gemini-key";
  let calledUrl = "";
  let calledHeaders = {};
  globalThis.fetch = async (url, init) => {
    calledUrl = String(url);
    calledHeaders = init?.headers ?? {};
    return Response.json({ candidates: [{ content: { parts: [{ text: JSON.stringify(result) }] } }], usageMetadata: { promptTokenCount: 90, candidatesTokenCount: 150, totalTokenCount: 240 } });
  };
  try {
    const worker = await loadWorker();
    const response = await worker.fetch(new Request("http://localhost/api/ai/resume", {
      method: "POST",
      headers: { "content-type": "application/json", "oai-authenticated-user-email": "owner@example.com" },
      body: JSON.stringify({ ...body, provider: "google", modelKey: "fast" }),
    }), env, context);
    assert.equal(response.status, 200);
    assert.match(calledUrl, /gemini-3\.5-flash-lite:generateContent/);
    assert.doesNotMatch(calledUrl, /test-gemini-key/);
    assert.equal(calledHeaders["x-goog-api-key"], "test-gemini-key");
  } finally {
    globalThis.fetch = originalFetch;
    if (originalKey === undefined) delete process.env.GEMINI_API_KEY; else process.env.GEMINI_API_KEY = originalKey;
  }
});
