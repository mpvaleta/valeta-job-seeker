import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import test from "node:test";
import { Miniflare } from "miniflare";

async function loadWorker() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("workspace-route-test", `${process.pid}-${Date.now()}-${Math.random()}`);
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
const headers = { "content-type": "application/json", "oai-authenticated-user-email": "owner@example.com" };

test("private workspace creates immutable revisions, deduplicates, and restores the latest snapshot", async () => {
  const { mf, db } = await createDatabase();
  const bucket = memoryBucket();
  const worker = await loadWorker();
  const env = { DB: db, BUCKET: bucket, ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } };
  try {
    const empty = await worker.fetch(new Request("http://localhost/api/workspace", { headers }), env, context);
    assert.equal(empty.status, 200);
    assert.equal((await empty.json()).snapshot, null);

    const snapshot = { version: 5, profile: { name: "Test Owner" }, applications: [{ id: "app-1", role: "Producer" }] };
    const first = await worker.fetch(new Request("http://localhost/api/workspace", {
      method: "POST", headers,
      body: JSON.stringify({ sourceBuild: "test-build", snapshot }),
    }), env, context);
    const firstData = await first.json();
    assert.equal(first.status, 200);
    assert.equal(firstData.changed, true);
    assert.equal(bucket.objects.size, 1);

    const duplicate = await worker.fetch(new Request("http://localhost/api/workspace", {
      method: "POST", headers,
      body: JSON.stringify({ sourceBuild: "test-build", snapshot }),
    }), env, context);
    assert.equal((await duplicate.json()).changed, false);
    assert.equal(bucket.objects.size, 1);

    const restored = await worker.fetch(new Request("http://localhost/api/workspace", { headers }), env, context);
    const restoredData = await restored.json();
    assert.deepEqual(restoredData.snapshot, snapshot);
    assert.equal((await db.prepare("SELECT COUNT(*) AS count FROM workspace_revisions").first()).count, 1);

    const second = await worker.fetch(new Request("http://localhost/api/workspace", {
      method: "POST",
      headers,
      body: JSON.stringify({ sourceBuild: "test-2", snapshot: { version: 2, applications: [{ id: "app-2" }] } }),
    }), env, context);
    assert.equal(second.status, 200);
    const history = await worker.fetch(new Request("http://localhost/api/workspace?history=1", { headers }), env, context);
    const historyData = await history.json();
    assert.equal(historyData.revisions.length, 2);
    assert.equal(historyData.revisions[0].isCurrent, true);

    const firstRevision = historyData.revisions[1];
    const oldSnapshot = await worker.fetch(new Request(`http://localhost/api/workspace?revision=${firstRevision.id}`, { headers }), env, context);
    assert.deepEqual((await oldSnapshot.json()).snapshot, snapshot);

    const restoredRevision = await worker.fetch(new Request("http://localhost/api/workspace", {
      method: "POST",
      headers,
      body: JSON.stringify({ action: "restore", revisionId: firstRevision.id, sourceBuild: "test-restore" }),
    }), env, context);
    assert.equal(restoredRevision.status, 200);
    const restoredAgain = await worker.fetch(new Request("http://localhost/api/workspace", { headers }), env, context);
    assert.deepEqual((await restoredAgain.json()).snapshot, snapshot);
    assert.equal((await db.prepare("SELECT COUNT(*) AS count FROM workspace_revisions").first()).count, 3);
  } finally {
    await mf.dispose();
  }
});

test("private workspace rejects anonymous and oversized writes without storing data", async () => {
  const { mf, db } = await createDatabase();
  const bucket = memoryBucket();
  const worker = await loadWorker();
  const env = { DB: db, BUCKET: bucket, ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } };
  try {
    const anonymous = await worker.fetch(new Request("http://localhost/api/workspace", {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ sourceBuild: "test", snapshot: { ok: true } }),
    }), env, context);
    assert.equal(anonymous.status, 401);

    const crossSite = await worker.fetch(new Request("http://localhost/api/workspace", {
      method: "POST", headers: { ...headers, origin: "https://attacker.example", "sec-fetch-site": "cross-site" }, body: JSON.stringify({ sourceBuild: "test", snapshot: { ok: true } }),
    }), env, context);
    assert.equal(crossSite.status, 403);
    assert.equal((await crossSite.json()).code, "cross_site_request_blocked");

    const oversized = await worker.fetch(new Request("http://localhost/api/workspace", {
      method: "POST", headers: { ...headers, "content-length": String(6 * 1024 * 1024) }, body: "{}",
    }), env, context);
    assert.equal(oversized.status, 413);
    assert.equal(bucket.objects.size, 0);
  } finally {
    await mf.dispose();
  }
});
