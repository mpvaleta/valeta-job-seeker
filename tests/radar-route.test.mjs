import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { Miniflare } from "miniflare";

async function loadWorker() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("radar-route-test", `${process.pid}-${Date.now()}-${Math.random()}`);
  return (await import(workerUrl.href)).default;
}

async function createDatabase() {
  const mf = new Miniflare({
    // Keep the local Miniflare harness on the newest date supported by its
    // bundled workerd binary. Production compatibility is configured by Sites.
    compatibilityDate: "2026-05-22",
    modules: true,
    script: "export default { fetch() { return new Response('ok') } }",
    d1Databases: ["DB"],
  });
  const db = await mf.getD1Database("DB");
  const migration = await readFile(new URL("../drizzle/0000_loose_nighthawk.sql", import.meta.url), "utf8");
  for (const statement of migration.split("--> statement-breakpoint").map((value) => value.trim()).filter(Boolean)) {
    await db.prepare(statement).run();
  }
  return { mf, db };
}

const context = { waitUntil() {}, passThroughOnException() {} };
const headers = { "content-type": "application/json", "oai-authenticated-user-email": "owner@example.com" };

test("private radar persists goals, targets, discoveries, and approval state", async () => {
  const { mf, db } = await createDatabase();
  const worker = await loadWorker();
  const env = { DB: db, ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } };
  const originalFetch = globalThis.fetch;
  try {
    const initial = await worker.fetch(new Request("http://localhost/api/radar", { headers }), env, context);
    const initialData = await initial.json();
    assert.equal(initial.status, 200);
    assert.equal(initialData.ok, true);
    assert.match(initialData.profile.locations.join(" "), /Bay Area/i);

    const profile = await worker.fetch(new Request("http://localhost/api/radar", {
      method: "POST", headers,
      body: JSON.stringify({ action: "save_profile", profile: {
        titles: ["Creative Operations Manager"],
        skills: ["integrated production", "brand programs"],
        locations: ["San Francisco Bay Area"],
        workModes: ["Hybrid", "Remote"],
        goals: "Lead creative and brand delivery across teams.",
        exclusions: ["commission only"],
        minScore: 40,
      } }),
    }), env, context);
    assert.equal(profile.status, 200);

    const added = await worker.fetch(new Request("http://localhost/api/radar", {
      method: "POST", headers,
      body: JSON.stringify({ action: "add_monitor", monitor: {
        company: "Example Studio",
        kind: "Agency",
        careersUrl: "https://boards.greenhouse.io/example",
        focus: "creative operations, integrated production",
        cadence: "weekly",
      } }),
    }), env, context);
    const addedData = await added.json();
    assert.equal(added.status, 200);
    assert.equal(addedData.monitors.length, 1);
    assert.equal(addedData.dueCount, 1);

    globalThis.fetch = async (url) => {
      assert.match(String(url), /boards-api\.greenhouse\.io/);
      return Response.json({ jobs: [{
        title: "Creative Operations Manager",
        location: { name: "San Francisco, CA" },
        content: "<p>Lead integrated production and brand programs across cross-functional teams.</p>",
        absolute_url: "https://boards.greenhouse.io/example/jobs/100",
        updated_at: "2026-07-18T00:00:00Z",
      }] });
    };
    const scanned = await worker.fetch(new Request("http://localhost/api/radar", {
      method: "POST", headers,
      body: JSON.stringify({ action: "scan" }),
    }), env, context);
    const scannedData = await scanned.json();
    assert.equal(scanned.status, 200);
    assert.equal(scannedData.result.checked, 1);
    assert.equal(scannedData.result.added, 1);
    assert.equal(scannedData.opportunities.length, 1);
    assert.equal(scannedData.opportunities[0].status, "new");
    assert.ok(scannedData.opportunities[0].fitScore >= 40);

    const shortlisted = await worker.fetch(new Request("http://localhost/api/radar", {
      method: "POST", headers,
      body: JSON.stringify({ action: "set_opportunity_status", opportunityId: scannedData.opportunities[0].id, status: "shortlisted" }),
    }), env, context);
    const shortlistedData = await shortlisted.json();
    assert.equal(shortlisted.status, 200);
    assert.equal(shortlistedData.opportunities[0].status, "shortlisted");
  } finally {
    globalThis.fetch = originalFetch;
    await mf.dispose();
  }
});
