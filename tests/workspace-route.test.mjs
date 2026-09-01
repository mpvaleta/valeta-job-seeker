import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import test from "node:test";
import zlib from "node:zlib";
import { Miniflare } from "miniflare";
import { accessHeaders, installAccessEnv } from "./helpers/access-token.mjs";
import { memoryBucket } from "./helpers/memory-bucket.mjs";

await installAccessEnv();

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

const context = { waitUntil() {}, passThroughOnException() {} };
const headers = { "content-type": "application/json", ...(await accessHeaders("owner@example.com")) };

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

// The workspace is saved every eight seconds and a heavy one is around 2 MB,
// so what actually lands in the bucket matters for both cost and the ceiling.
test("revisions are stored compressed, and a gzipped upload is accepted", async () => {
  const { mf, db } = await createDatabase();
  const bucket = memoryBucket();
  const worker = await loadWorker();
  const env = { DB: db, BUCKET: bucket, ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } };
  try {
    const snapshot = { version: 5, profile: { name: "Marcos Valeta", facts: "Led production at Google.".repeat(40) }, applications: [] };
    const envelope = JSON.stringify({ sourceBuild: "test", snapshot });

    // Sent the way the browser sends it: gzip bytes plus the encoding header.
    const compressed = zlib.gzipSync(Buffer.from(envelope, "utf8"));
    const saved = await worker.fetch(new Request("http://localhost/api/workspace", {
      method: "POST",
      headers: { ...headers, "content-type": "application/octet-stream", "x-workspace-encoding": "gzip" },
      body: compressed,
    }), env, context);
    const savedData = await saved.json();
    assert.equal(saved.status, 200, JSON.stringify(savedData));
    assert.equal(savedData.ok, true);

    // Stored compressed, and labelled so the reader knows which format it is.
    const [entry] = [...bucket.objects.values()];
    assert.equal(entry.bytes[0], 0x1f, "the stored object should begin with the gzip magic bytes");
    assert.equal(entry.bytes[1], 0x8b);
    assert.equal(entry.customMetadata.encoding, "gzip");
    assert.ok(entry.bytes.byteLength < Buffer.byteLength(JSON.stringify(snapshot)), "storing it compressed should be smaller than storing it raw");

    // And it comes back byte-for-byte on read.
    const read = await worker.fetch(new Request("http://localhost/api/workspace", { headers }), env, context);
    const readData = await read.json();
    assert.equal(read.status, 200);
    assert.deepEqual(readData.snapshot, snapshot);

    // The recorded size is the uncompressed one, because that is the number
    // measured against the limit and shown to the owner.
    assert.equal(savedData.revision.sizeBytes, Buffer.byteLength(JSON.stringify(snapshot), "utf8"));
  } finally {
    await mf.dispose();
  }
});

// Every revision written before compression existed is plain JSON. If those
// stopped opening, the owner would lose their entire history to a format change.
test("a revision written before compression still opens", async () => {
  const { mf, db } = await createDatabase();
  const bucket = memoryBucket();
  const worker = await loadWorker();
  const env = { DB: db, BUCKET: bucket, ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } };
  try {
    // One authenticated call so the user row exists.
    await worker.fetch(new Request("http://localhost/api/workspace", { headers }), env, context);
    const owner = await db.prepare("SELECT id FROM users LIMIT 1").first();
    assert.ok(owner?.id);

    const legacySnapshot = { version: 4, profile: { name: "Marcos Valeta" }, applications: [{ id: "old-1", company: "Monks" }] };
    const legacyRaw = JSON.stringify(legacySnapshot);
    const storageKey = `users/${owner.id}/workspace/legacy-revision.json`;
    // Written the old way: a plain JSON string, no encoding metadata at all.
    await bucket.put(storageKey, legacyRaw, { customMetadata: { owner: owner.id, contentHash: "legacy", sourceBuild: "old" } });
    await db.prepare("INSERT INTO workspace_revisions (id, user_id, storage_key, content_hash, size_bytes, source_build) VALUES (?, ?, ?, ?, ?, ?)")
      .bind("legacy-revision", owner.id, storageKey, "legacy", legacyRaw.length, "old").run();
    await db.prepare("INSERT INTO workspace_heads (user_id, revision_id) VALUES (?, ?) ON CONFLICT(user_id) DO UPDATE SET revision_id = excluded.revision_id")
      .bind(owner.id, "legacy-revision").run();

    const read = await worker.fetch(new Request("http://localhost/api/workspace", { headers }), env, context);
    const data = await read.json();
    assert.equal(read.status, 200, JSON.stringify(data));
    assert.deepEqual(data.snapshot, legacySnapshot, "an uncompressed revision must still be readable");
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
      method: "POST", headers: { ...headers, "content-length": String(26 * 1024 * 1024) }, body: "{}",
    }), env, context);
    assert.equal(oversized.status, 413);
    assert.equal(bucket.objects.size, 0);
  } finally {
    await mf.dispose();
  }
});
