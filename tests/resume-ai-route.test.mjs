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
  "SYNTHETIC TEST FACT: Worked at Example Studio as Creative Operations Manager in Fremont from 2024 to present, coordinating a fictional product launch.",
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
  userRuleLibrary: ["Keep Education immediately after Professional Experience.", "Keep a short Awards section.", "Use a focused professional summary."],
  curatedRules: ["Use concise accomplishment-oriented bullets."],
  track: { name: "Brand & Creative", headline: "Project and Operations Manager", summary: "Creative operations and cross-functional delivery." },
};
const result = {
  headline: "Project and Operations Manager | Creative Operations",
  headline_fact_indexes: [0, 1],
  summary: "Project and operations leader with approved experience delivering global creative programs and coordinating cross-functional agency partners.",
  summary_fact_indexes: [0, 1],
  core_skills: [
    { label: "Creative operations", fact_indexes: [1] },
    { label: "Budget and vendor management", fact_indexes: [2] },
  ],
  experience: [{
    company: "Example Studio",
    title: "Creative Operations Manager",
    location: "Fremont",
    dates: "2024–Present",
    fact_indexes: [0],
    bullets: [
      { text: "Coordinated a fictional product launch for Example Studio.", fact_indexes: [0] },
      { text: "Led a fictional project team across design, operations, and agency partners.", fact_indexes: [1] },
    ],
  }],
  education: [{ text: "Completed a fictional degree at Example University.", fact_indexes: [4] }],
  awards: [{ text: "Received the fictional Example Award for approved sample work.", fact_indexes: [3] }],
  professional_development: [],
  languages: [],
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
    assert.equal(data.result.experience[0].company, "Example Studio");
    assert.equal(data.result.experience[0].dates, "2024–Present");
    assert.equal(data.guardrails.factIndexesValidated, true);
    assert.equal(data.guardrails.userPlaybookPriority, true);
    assert.ok(data.quality.score >= 70);
    assert.equal(data.quality.skillCount, 2);
    assert.deepEqual(data.usage, { inputTokens: 100, outputTokens: 200, cachedTokens: 0, totalTokens: 300 });
    assert.match(requestBody.instructions, /uploaded résumé playbook is the primary editorial authority/i);
    assert.ok(requestBody.input.indexOf("mandatory_user_rules") < requestBody.input.indexOf("cleaned_user_rule_library"));
    assert.ok(requestBody.input.indexOf("cleaned_user_rule_library") < requestBody.input.indexOf("secondary_curated_rules"));
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
  globalThis.fetch = async () => Response.json({ output_text: JSON.stringify({ ...result, experience: [{ ...result.experience[0], bullets: [{ text: "Invented claim", fact_indexes: [999] }] }] }) });
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
    assert.equal(data.guardrailStage, "evidence");
  } finally {
    globalThis.fetch = originalFetch;
    if (originalKey === undefined) delete process.env.OPENAI_API_KEY; else process.env.OPENAI_API_KEY = originalKey;
  }
});

test("resume generation rejects an invented claim even when it cites a valid but unrelated fact", async () => {
  const originalKey = process.env.OPENAI_API_KEY;
  const originalFetch = globalThis.fetch;
  process.env.OPENAI_API_KEY = "test-openai-key";
  globalThis.fetch = async () => Response.json({ output_text: JSON.stringify({ ...result, core_skills: [{ label: "Salesforce administration", fact_indexes: [4] }] }) });
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

test("resume generation automatically repairs one guardrail failure and returns the complete validated document", async () => {
  const originalKey = process.env.OPENAI_API_KEY;
  const originalFetch = globalThis.fetch;
  process.env.OPENAI_API_KEY = "test-openai-key";
  let calls = 0;
  globalThis.fetch = async () => {
    calls += 1;
    const response = calls === 1
      ? { ...result, core_skills: [{ label: "Invented certification", fact_indexes: [4] }] }
      : result;
    return Response.json({ output_text: JSON.stringify(response), usage: { input_tokens: 40, output_tokens: 60, total_tokens: 100 } });
  };
  try {
    const worker = await loadWorker();
    const response = await worker.fetch(new Request("http://localhost/api/ai/resume", {
      method: "POST",
      headers: { "content-type": "application/json", "oai-authenticated-user-email": "owner@example.com" },
      body: JSON.stringify({ ...body, userRuleLibraryCount: 47 }),
    }), env, context);
    const data = await response.json();
    assert.equal(response.status, 200);
    assert.equal(data.ok, true);
    assert.equal(data.attempts, 2);
    assert.equal(data.playbookCoverage.selectedUserRules, 2);
    assert.equal(data.playbookCoverage.libraryUserRules, 47);
    assert.deepEqual(data.usage, { inputTokens: 80, outputTokens: 120, cachedTokens: 0, totalTokens: 200 });
    assert.equal(calls, 2);
  } finally {
    globalThis.fetch = originalFetch;
    if (originalKey === undefined) delete process.env.OPENAI_API_KEY; else process.env.OPENAI_API_KEY = originalKey;
  }
});

test("resume generation preserves a useful draft and flags a missing provider playbook check", async () => {
  const originalKey = process.env.OPENAI_API_KEY;
  const originalFetch = globalThis.fetch;
  process.env.OPENAI_API_KEY = "test-openai-key";
  globalThis.fetch = async () => Response.json({ output_text: JSON.stringify({ ...result, playbook_checks: result.playbook_checks.filter((check) => !(check.rule_source === "user" && check.rule_index === 1)) }) });
  try {
    const worker = await loadWorker();
    const response = await worker.fetch(new Request("http://localhost/api/ai/resume", {
      method: "POST",
      headers: { "content-type": "application/json", "oai-authenticated-user-email": "owner@example.com" },
      body: JSON.stringify(body),
    }), env, context);
    const data = await response.json();
    assert.equal(response.status, 200);
    const filled = data.result.playbook_checks.find((check) => check.rule_source === "user" && check.rule_index === 1);
    assert.equal(filled.status, "not_applicable");
    assert.match(filled.note, /human review/i);
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
  let calledBody = {};
  globalThis.fetch = async (url, init) => {
    calledUrl = String(url);
    calledHeaders = init?.headers ?? {};
    calledBody = JSON.parse(init?.body);
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
    assert.match(calledUrl, /gemini-3\.1-flash-lite:generateContent/);
    assert.doesNotMatch(calledUrl, /test-gemini-key/);
    assert.equal(calledHeaders["x-goog-api-key"], "test-gemini-key");
    assert.ok(calledBody.generationConfig.responseJsonSchema);
    assert.equal(calledBody.generationConfig.responseSchema, undefined);
  } finally {
    globalThis.fetch = originalFetch;
    if (originalKey === undefined) delete process.env.GEMINI_API_KEY; else process.env.GEMINI_API_KEY = originalKey;
  }
});

test("resume generation refuses keyword stems and fragments even when a provider cites valid facts", async () => {
  const originalKey = process.env.OPENAI_API_KEY;
  const originalFetch = globalThis.fetch;
  process.env.OPENAI_API_KEY = "test-openai-key";
  const keywordFacts = [...facts, "SYNTHETIC TEST FACT: Used Adobe tools to support creative operations and production delivery."];
  const broken = {
    ...result,
    core_skills: [
      { label: "Adobe", fact_indexes: [5] },
      { label: "Budget and vendor management", fact_indexes: [2] },
    ],
  };
  globalThis.fetch = async () => Response.json({ output_text: JSON.stringify(broken) });
  try {
    const worker = await loadWorker();
    const response = await worker.fetch(new Request("http://localhost/api/ai/resume", {
      method: "POST",
      headers: { "content-type": "application/json", "oai-authenticated-user-email": "owner@example.com" },
      body: JSON.stringify({ ...body, approvedFacts: keywordFacts }),
    }), env, context);
    const data = await response.json();
    assert.equal(response.status, 503);
    assert.equal(data.code, "guardrail_rejected");
    assert.equal(data.guardrailStage, "core_skills");
  } finally {
    globalThis.fetch = originalFetch;
    if (originalKey === undefined) delete process.env.OPENAI_API_KEY; else process.env.OPENAI_API_KEY = originalKey;
  }
});

test("Gemini unavailable models fall back once to the stable compatibility model", async () => {
  const originalKey = process.env.GEMINI_API_KEY;
  const originalFetch = globalThis.fetch;
  process.env.GEMINI_API_KEY = "test-gemini-key";
  const called = [];
  globalThis.fetch = async (url) => {
    called.push(String(url));
    if (called.length === 1) return Response.json({ error: { status: "UNAVAILABLE", message: "temporarily unavailable" } }, { status: 503 });
    return Response.json({ candidates: [{ content: { parts: [{ text: JSON.stringify(result) }] } }], usageMetadata: { promptTokenCount: 90, candidatesTokenCount: 150, totalTokenCount: 240 } });
  };
  try {
    const worker = await loadWorker();
    const response = await worker.fetch(new Request("http://localhost/api/ai/resume", {
      method: "POST",
      headers: { "content-type": "application/json", "oai-authenticated-user-email": "owner@example.com" },
      body: JSON.stringify({ ...body, provider: "google", modelKey: "balanced" }),
    }), env, context);
    const data = await response.json();
    assert.equal(response.status, 200);
    assert.equal(data.model, "gemini-3.1-flash-lite");
    assert.deepEqual(data.providerFallback, { from: "gemini-3.5-flash", to: "gemini-3.1-flash-lite" });
    assert.match(called[1], /gemini-3\.1-flash-lite:generateContent/);
  } finally {
    globalThis.fetch = originalFetch;
    if (originalKey === undefined) delete process.env.GEMINI_API_KEY; else process.env.GEMINI_API_KEY = originalKey;
  }
});
