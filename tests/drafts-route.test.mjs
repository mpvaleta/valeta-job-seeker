import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import test from "node:test";
import { Miniflare } from "miniflare";
import { accessHeaders, installAccessEnv } from "./helpers/access-token.mjs";

await installAccessEnv();

async function loadWorker() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("drafts-route-test", `${process.pid}-${Date.now()}-${Math.random()}`);
  return (await import(workerUrl.href)).default;
}

async function createDatabase() {
  const mf = new Miniflare({
    compatibilityDate: "2026-05-22",
    modules: true,
    script: "export default { fetch() { return new Response('ok') } }",
    d1Databases: ["DB"],
  });
  const db = await mf.getD1Database("DB");
  const directory = new URL("../drizzle/", import.meta.url);
  const migrations = (await readdir(directory)).filter((name) => /^\d+.*\.sql$/.test(name)).sort();
  for (const name of migrations) {
    const migration = await readFile(new URL(name, directory), "utf8");
    for (const statement of migration.split("--> statement-breakpoint").map((value) => value.trim()).filter(Boolean)) await db.prepare(statement).run();
  }
  return { mf, db };
}

function memoryBucket() {
  const objects = new Map();
  return {
    async get(key) {
      const value = objects.get(key);
      return value == null ? null : { text: async () => value };
    },
    async put(key, value) { objects.set(key, String(value)); },
    objects,
  };
}

const context = { waitUntil() {}, passThroughOnException() {} };
const headers = { "content-type": "application/json", ...(await accessHeaders("owner@example.com")) };

const RESUME_TEXT = [
  "Marcos Valeta",
  "Creative Operations Leader",
  "San Francisco, CA | marcos@example.com",
  "",
  "SUMMARY",
  "Creative operations leader with experience running integrated production across brand programs.",
  "",
  "EXPERIENCE",
  "- Led integrated production across cross-functional brand teams.",
].join("\n");

test("automation draft delivery appends a versioned draft without touching existing records", async () => {
  const { mf, db } = await createDatabase();
  const bucket = memoryBucket();
  const worker = await loadWorker();
  const env = { DB: db, BUCKET: bucket, ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } };
  try {
    // Existing workspace with one application and one draft the delivery must preserve.
    const seeded = await worker.fetch(new Request("http://localhost/api/workspace", {
      method: "POST", headers,
      body: JSON.stringify({ sourceBuild: "test-build", snapshot: {
        version: 5,
        applications: [{ id: "app-1", role: "Producer", company: "Acme" }],
        generatedDrafts: [{ id: "draft-1", type: "resume", title: "Old", content: "old content", company: "Acme", role: "Producer", versionNumber: 1 }],
      } }),
    }), env, context);
    assert.equal(seeded.status, 200);

    const delivered = await worker.fetch(new Request("http://localhost/api/drafts", {
      method: "POST", headers,
      body: JSON.stringify({ type: "resume", title: "Anthropic — Marketing Events Lead", company: "Anthropic", role: "Marketing Events Lead", content: RESUME_TEXT, note: "test delivery" }),
    }), env, context);
    const deliveredData = await delivered.json();
    assert.equal(delivered.status, 200);
    assert.equal(deliveredData.ok, true);
    assert.equal(deliveredData.changed, true);
    assert.equal(deliveredData.versionNumber, 1);

    // Same content again is idempotent — no duplicate version piles up.
    const repeat = await worker.fetch(new Request("http://localhost/api/drafts", {
      method: "POST", headers,
      body: JSON.stringify({ type: "resume", title: "Anthropic — Marketing Events Lead", company: "Anthropic", role: "Marketing Events Lead", content: RESUME_TEXT }),
    }), env, context);
    const repeatData = await repeat.json();
    assert.equal(repeatData.ok, true);
    assert.equal(repeatData.changed, false);
    assert.equal(repeatData.draftId, deliveredData.draftId);

    const after = await worker.fetch(new Request("http://localhost/api/workspace", { headers }), env, context);
    const snapshot = (await after.json()).snapshot;
    assert.equal(snapshot.generatedDrafts.length, 2);
    const added = snapshot.generatedDrafts.find((draft) => draft.id === deliveredData.draftId);
    assert.equal(added.origin, "uploaded");
    assert.equal(added.provider, "claude-subscription");
    assert.equal(added.trackId, "auto");
    assert.equal(snapshot.applications.length, 1, "existing records must survive delivery untouched");
    assert.equal(snapshot.generatedDrafts.some((draft) => draft.id === "draft-1"), true);
  } finally {
    await mf.dispose();
  }
});

test("draft delivery rejects anonymous, tiny, and malformed requests", async () => {
  const { mf, db } = await createDatabase();
  const bucket = memoryBucket();
  const worker = await loadWorker();
  const env = { DB: db, BUCKET: bucket, ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } };
  try {
    const anonymous = await worker.fetch(new Request("http://localhost/api/drafts", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ type: "resume", content: RESUME_TEXT }),
    }), env, context);
    assert.equal(anonymous.status, 401);

    const tiny = await worker.fetch(new Request("http://localhost/api/drafts", {
      method: "POST", headers,
      body: JSON.stringify({ type: "resume", content: "too short" }),
    }), env, context);
    assert.equal(tiny.status, 400);

    const badType = await worker.fetch(new Request("http://localhost/api/drafts", {
      method: "POST", headers,
      body: JSON.stringify({ type: "poem", content: RESUME_TEXT }),
    }), env, context);
    assert.equal(badType.status, 400);
  } finally {
    await mf.dispose();
  }
});
