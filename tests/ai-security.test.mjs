import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import test from "node:test";
import { Miniflare } from "miniflare";

async function loadWorker() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("ai-security-test", `${process.pid}-${Date.now()}-${Math.random()}`);
  return (await import(workerUrl.href)).default;
}

async function createDatabase() {
  const mf = new Miniflare({ compatibilityDate: "2026-05-22", modules: true, script: "export default { fetch() { return new Response('ok') } }", d1Databases: ["DB"] });
  const db = await mf.getD1Database("DB");
  const directory = new URL("../drizzle/", import.meta.url);
  for (const name of (await readdir(directory)).filter((value) => /^\d+.*\.sql$/.test(value)).sort()) {
    const sql = await readFile(new URL(name, directory), "utf8");
    for (const statement of sql.split("--> statement-breakpoint").map((value) => value.trim()).filter(Boolean)) await db.prepare(statement).run();
  }
  return { mf, db };
}

const recommendation = {
  decision: "apply_after_edits",
  confidence: "medium",
  summary: "Approved evidence supports the main delivery requirements, with one explicit evidence gap.",
  actions: ["Use the strongest approved delivery fact."],
  priority_fact_indexes: [0],
  evidence_gaps: ["No approved fact confirms a certification."],
  cautions: ["Do not infer the certification."],
  evidence_items: [
    { requirement: "Lead delivery", support: "strong", fact_indexes: [0] },
    { requirement: "Certification", support: "gap", fact_indexes: [] },
  ],
};

test("cloud AI records a durable usage audit without storing prompts or career facts", async () => {
  const originalKey = process.env.OPENAI_API_KEY;
  const originalAllowed = process.env.AI_ALLOWED_EMAILS;
  const originalFetch = globalThis.fetch;
  const { mf, db } = await createDatabase();
  process.env.OPENAI_API_KEY = "test-key-never-exposed";
  process.env.AI_ALLOWED_EMAILS = "owner@example.com";
  globalThis.fetch = async () => Response.json({
    id: "resp_audit",
    output_text: JSON.stringify(recommendation),
    usage: { input_tokens: 120, output_tokens: 40, total_tokens: 160, input_tokens_details: { cached_tokens: 20 } },
  }, { headers: { "x-request-id": "request-audit" } });
  const worker = await loadWorker();
  const env = { DB: db, ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } };
  try {
    const response = await worker.fetch(new Request("http://localhost/api/ai/recommend", {
      method: "POST",
      headers: { "content-type": "application/json", "oai-authenticated-user-email": "owner@example.com" },
      body: JSON.stringify({
        provider: "openai",
        modelKey: "reliable",
        company: "Example",
        role: "Program Manager",
        jobText: "Lead complex creative programs across teams, schedules, budgets, risks, vendors, and stakeholder communications from planning through launch and retrospective.",
        approvedFacts: ["Led complex programs from planning through launch.", "Managed schedules, budgets, risks, and vendors.", "Coordinated stakeholders across creative teams."],
      }),
    }), env, { waitUntil() {}, passThroughOnException() {} });
    assert.equal(response.status, 200);
    const row = await db.prepare("SELECT provider, status, input_tokens, output_tokens, cached_tokens, total_tokens, guardrail_status FROM ai_usage_events LIMIT 1").first();
    assert.deepEqual(row, { provider: "openai", status: "succeeded", input_tokens: 120, output_tokens: 40, cached_tokens: 20, total_tokens: 160, guardrail_status: "passed" });
    const columns = await db.prepare("PRAGMA table_info(ai_usage_events)").all();
    const names = columns.results.map((column) => column.name);
    assert.equal(names.includes("prompt"), false);
    assert.equal(names.includes("facts"), false);
  } finally {
    globalThis.fetch = originalFetch;
    if (originalKey === undefined) delete process.env.OPENAI_API_KEY; else process.env.OPENAI_API_KEY = originalKey;
    if (originalAllowed === undefined) delete process.env.AI_ALLOWED_EMAILS; else process.env.AI_ALLOWED_EMAILS = originalAllowed;
    await mf.dispose();
  }
});
