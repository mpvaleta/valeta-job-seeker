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
        kind: "Creative / Advertising Agency",
        websiteUrl: "https://example.com",
        careersUrl: "https://broken.example/old-careers",
        focus: "creative operations, integrated production",
        targetPosition: "Creative Operations Manager",
        cadence: "daily",
      } }),
    }), env, context);
    const addedData = await added.json();
    assert.equal(added.status, 200);
    assert.equal(addedData.monitors.length, 1);
    assert.equal(addedData.monitors[0].cadence, "daily");
    assert.equal(addedData.monitors[0].targetPosition, "Creative Operations Manager");
    assert.equal(addedData.dueCount, 1);

    globalThis.fetch = async (url) => {
      if (String(url).includes("broken.example")) return new Response("gone", { status: 404 });
      if (String(url) === "https://example.com/") {
        return new Response('<html><body><a href="https://boards.greenhouse.io/example">Open jobs</a></body></html>', { headers: { "content-type": "text/html" } });
      }
      assert.match(String(url), /boards-api\.greenhouse\.io/);
      return Response.json({ jobs: [{
        title: "Creative Operations Manager",
        location: { name: "San Francisco, CA" },
        content: "<p>Lead integrated production and brand programs across cross-functional teams.</p>",
        absolute_url: "https://boards.greenhouse.io/example/jobs/100",
        updated_at: "2026-07-18T00:00:00Z",
      }, {
        title: "Accounting Analyst",
        location: { name: "Austin, TX" },
        content: "<p>Prepare monthly statements and reconciliations.</p>",
        absolute_url: "https://boards.greenhouse.io/example/jobs/101",
        updated_at: "2026-07-18T00:00:00Z",
      }] });
    };
    const scanned = await worker.fetch(new Request("http://localhost/api/radar", {
      method: "POST", headers,
      body: JSON.stringify({ action: "scan", profile: {
        titles: ["Creative Operations Manager"],
        skills: ["integrated production", "brand programs"],
        locations: ["San Francisco Bay Area"],
        workModes: ["Hybrid"],
        goals: "Lead creative and brand delivery.",
        exclusions: [],
        minScore: 55,
      } }),
    }), env, context);
    const scannedData = await scanned.json();
    assert.equal(scanned.status, 200);
    assert.equal(scannedData.result.checked, 1);
    assert.equal(scannedData.result.discovered, 2);
    assert.equal(scannedData.result.found, 1);
    assert.equal(scannedData.result.added, 2);
    assert.equal(scannedData.result.matchedAdded, 1);
    assert.equal(scannedData.result.belowThreshold, 1);
    assert.equal(scannedData.result.repairedSources, 1);
    const discovered = scannedData.opportunities.find((item) => item.sourceType === "greenhouse");
    assert.ok(discovered);
    assert.equal(discovered.status, "new");
    assert.ok(discovered.fitScore >= 55);
    assert.equal(scannedData.profile.minScore, 55);
    assert.equal(scannedData.monitors[0].lastRunStatus, "completed");
    assert.equal(scannedData.monitors[0].lastRunFoundCount, 1);
    assert.match(scannedData.monitors[0].lastRunSummary, /^Manual scan · /);
    assert.match(scannedData.monitors[0].lastRunSummary, /saved below threshold/);
    assert.equal(scannedData.monitors[0].careersUrl, "https://boards.greenhouse.io/example");
    assert.ok(Number.isFinite(new Date(scannedData.monitors[0].nextDueAt).getTime()), `nextDueAt missing: ${scannedData.monitors[0].nextDueAt}`);
    assert.equal(scannedData.monitors[0].due, false);
    assert.equal(scannedData.automation.backgroundScheduler, "prepared");

    const catchUp = await worker.fetch(new Request("http://localhost/api/radar", {
      method: "POST", headers,
      body: JSON.stringify({ action: "scan", trigger: "catch_up" }),
    }), env, context);
    const catchUpData = await catchUp.json();
    assert.equal(catchUp.status, 200);
    assert.match(catchUpData.monitors[0].lastRunSummary, /^App-open catch-up scan · /);
    const below = scannedData.opportunities.find((item) => item.title === "Accounting Analyst");
    assert.ok(below);
    assert.equal(below.alignmentPasses, false);
    assert.equal(below.companyCategory, "Creative / Advertising Agency");
    assert.equal(below.origin, "monitored");
    assert.equal(below.targetPosition, "Creative Operations Manager");

    const owner = await db.prepare("SELECT id FROM users WHERE email = ? LIMIT 1").bind("owner@example.com").first();
    const companyRow = await db.prepare("SELECT id FROM companies WHERE name = ? LIMIT 1").bind("Example Studio").first();
    await db.prepare("INSERT INTO job_opportunities (id, user_id, company_id, title, source_url, source_type, fit_score, fit_summary, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)")
      .bind(crypto.randomUUID(), owner.id, companyRow.id, "Search roles", "https://example.com/careers/search-roles", "public-careers-page", 48, "Navigation label captured by an earlier build.", "new").run();
    const cleanedDashboard = await worker.fetch(new Request("http://localhost/api/radar", { headers }), env, context);
    const cleanedDashboardData = await cleanedDashboard.json();
    assert.equal(cleanedDashboardData.excludedNavigationCount, 1);
    assert.equal(cleanedDashboardData.opportunities.some((item) => item.title === "Search roles"), false);

    const shortlisted = await worker.fetch(new Request("http://localhost/api/radar", {
      method: "POST", headers,
      body: JSON.stringify({ action: "set_opportunity_status", opportunityId: discovered.id, status: "shortlisted" }),
    }), env, context);
    const shortlistedData = await shortlisted.json();
    assert.equal(shortlisted.status, 200);
    assert.equal(shortlistedData.opportunities.find((item) => item.id === discovered.id).status, "shortlisted");
  } finally {
    globalThis.fetch = originalFetch;
    await mf.dispose();
  }
});

test("Meta search remains saved with an explicit reference-only coverage state", async () => {
  const { mf, db } = await createDatabase();
  const worker = await loadWorker();
  const env = { DB: db, ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } };
  try {
    const added = await worker.fetch(new Request("http://localhost/api/radar", {
      method: "POST", headers,
      body: JSON.stringify({ action: "add_monitor", monitor: {
        company: "Meta",
        kind: "Technology",
        careersUrl: "https://www.metacareers.com/jobsearch/",
        targetPosition: "Creative Operations Manager",
        cadence: "twice_daily",
      } }),
    }), env, context);
    assert.equal(added.status, 200);

    const scanned = await worker.fetch(new Request("http://localhost/api/radar", {
      method: "POST", headers,
      body: JSON.stringify({ action: "scan" }),
    }), env, context);
    const data = await scanned.json();
    assert.equal(scanned.status, 200);
    assert.equal(data.result.checked, 1);
    assert.equal(data.result.failures.length, 0);
    assert.equal(data.monitors[0].lastRunStatus, "limited");
    assert.match(data.monitors[0].lastRunSummary, /Direct public Meta job pages/i);
  } finally {
    await mf.dispose();
  }
});

test("Meta monitoring retains a direct secondary job lead when the official search blocks indexing", async () => {
  const originalKey = process.env.OPENAI_API_KEY;
  const originalFetch = globalThis.fetch;
  process.env.OPENAI_API_KEY = "test-openai-key";
  globalThis.fetch = async (url) => {
    if (String(url) === "https://api.openai.com/v1/responses") {
      return Response.json({ output: [{
        type: "web_search_call",
        action: { sources: [{
          url: "https://www.linkedin.com/jobs/view/creative-operations-manager-at-meta-1234567890",
          title: "Meta hiring Creative Operations Manager in Menlo Park, CA | LinkedIn",
        }] },
      }] });
    }
    throw new Error(`Unexpected URL ${url}`);
  };
  const { mf, db } = await createDatabase();
  try {
    const worker = await loadWorker();
    const env = { DB: db, ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } };
    const added = await worker.fetch(new Request("http://localhost/api/radar", {
      method: "POST", headers,
      body: JSON.stringify({ action: "add_monitor", monitor: {
        company: "Meta",
        kind: "Technology",
        careersUrl: "https://www.metacareers.com/jobsearch/",
        targetPosition: "Creative Operations Manager",
        cadence: "twice_daily",
      } }),
    }), env, context);
    assert.equal(added.status, 200);

    const scanned = await worker.fetch(new Request("http://localhost/api/radar", {
      method: "POST", headers,
      body: JSON.stringify({ action: "scan" }),
    }), env, context);
    const data = await scanned.json();
    const metaRole = data.opportunities.find((item) => item.company === "Meta" && item.title === "Creative Operations Manager");
    assert.equal(scanned.status, 200);
    assert.equal(data.result.checked, 1);
    assert.equal(data.result.failures.length, 0);
    assert.equal(data.monitors[0].lastRunStatus, "completed");
    assert.match(data.monitors[0].lastRunSummary, /direct public job lead/i);
    assert.ok(metaRole);
    assert.equal(metaRole.sourceType, "openai-web-search");
    assert.equal(metaRole.origin, "monitored");
  } finally {
    globalThis.fetch = originalFetch;
    if (originalKey === undefined) delete process.env.OPENAI_API_KEY; else process.env.OPENAI_API_KEY = originalKey;
    await mf.dispose();
  }
});

test("background cron route requires the scheduler secret and labels runs as background scans", async () => {
  const originalSecret = process.env.RADAR_CRON_SECRET;
  const originalFetch = globalThis.fetch;
  delete process.env.RADAR_CRON_SECRET;
  const { mf, db } = await createDatabase();
  try {
    const worker = await loadWorker();
    const env = { DB: db, ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } };

    const unconfigured = await worker.fetch(new Request("http://localhost/api/radar/cron"), env, context);
    assert.equal(unconfigured.status, 503);
    assert.equal((await unconfigured.json()).code, "scheduler_not_configured");

    process.env.RADAR_CRON_SECRET = "test-cron-secret-0123456789abcdef";

    const wrong = await worker.fetch(new Request("http://localhost/api/radar/cron", {
      headers: { authorization: "Bearer wrong-secret" },
    }), env, context);
    assert.equal(wrong.status, 401);
    assert.equal((await wrong.json()).code, "scheduler_unauthorized");

    const added = await worker.fetch(new Request("http://localhost/api/radar", {
      method: "POST", headers,
      body: JSON.stringify({ action: "add_monitor", monitor: {
        company: "Quiet Studio",
        kind: "Technology",
        careersUrl: "https://quiet.example/careers",
        cadence: "twice_daily",
      } }),
    }), env, context);
    assert.equal(added.status, 200);

    globalThis.fetch = async () => new Response("gone", { status: 404 });
    const scheduled = await worker.fetch(new Request("http://localhost/api/radar/cron", {
      method: "POST",
      headers: { "x-radar-cron-secret": "test-cron-secret-0123456789abcdef" },
    }), env, context);
    const scheduledData = await scheduled.json();
    assert.equal(scheduled.status, 200);
    assert.equal(scheduledData.ok, true);
    assert.equal(scheduledData.trigger, "background");
    assert.equal(scheduledData.totals.users, 1);
    assert.equal(scheduledData.totals.checked, 1);

    const dashboard = await worker.fetch(new Request("http://localhost/api/radar", { headers }), env, context);
    const dashboardData = await dashboard.json();
    assert.equal(dashboardData.automation.backgroundScheduler, "enabled");
    assert.equal(dashboardData.monitors[0].lastRunStatus, "completed");
    assert.match(dashboardData.monitors[0].lastRunSummary, /^Background scheduled scan · /);
    assert.match(dashboardData.monitors[0].lastRunSummary, /Zero-result reason: no public source responded/);
    assert.ok(Number.isFinite(new Date(dashboardData.monitors[0].nextDueAt).getTime()));
    assert.equal(dashboardData.monitors[0].due, false);
  } finally {
    globalThis.fetch = originalFetch;
    if (originalSecret === undefined) delete process.env.RADAR_CRON_SECRET; else process.env.RADAR_CRON_SECRET = originalSecret;
    await mf.dispose();
  }
});

// Meta's robots policy forbids collecting its job search, but a person may
// open a role and hand V's the job-details link. That user-directed import is
// the supported path for every employer an automated scan cannot reach.
test("a blocked employer's role enters the inbox through a user-supplied job link", async () => {
  const { mf, db } = await createDatabase();
  const originalFetch = globalThis.fetch;
  try {
    const worker = await loadWorker();
    const env = { DB: db, ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } };

    globalThis.fetch = async (url) => {
      if (String(url).includes("metacareers.com/profile/job_details/")) {
        return new Response(`<html><head><title>Creative Operations Manager | Meta Careers</title>
          <script type="application/ld+json">${JSON.stringify({
            "@type": "JobPosting",
            title: "Creative Operations Manager",
            hiringOrganization: { name: "Meta" },
            jobLocation: { address: { addressLocality: "Menlo Park", addressRegion: "CA" } },
            description: "<p>Lead integrated production and brand programs across cross-functional teams, managing budgets, vendors, and campaign delivery.</p>",
            url: "https://www.metacareers.com/profile/job_details/1234567890/",
            datePosted: "2026-07-20",
          })}</script></head><body>Role details</body></html>`, { headers: { "content-type": "text/html" } });
      }
      throw new Error(`Unexpected URL ${url}`);
    };

    await worker.fetch(new Request("http://localhost/api/radar", {
      method: "POST", headers,
      body: JSON.stringify({ action: "save_profile", profile: {
        titles: ["Creative Operations Manager"],
        skills: ["integrated production", "brand programs"],
        locations: ["Menlo Park"],
        workModes: ["Hybrid"],
        goals: "Lead creative delivery.",
        exclusions: [],
        minScore: 40,
      } }),
    }), env, context);

    const imported = await worker.fetch(new Request("http://localhost/api/radar", {
      method: "POST", headers,
      body: JSON.stringify({ action: "import_job_links", links: ["https://www.metacareers.com/profile/job_details/1234567890/"] }),
    }), env, context);
    const data = await imported.json();
    assert.equal(imported.status, 200);
    assert.equal(data.result.imported.length, 1, JSON.stringify(data.result));
    assert.equal(data.result.imported[0].title, "Creative Operations Manager");
    assert.equal(data.result.imported[0].company, "Meta");

    const role = data.opportunities.find((item) => item.title === "Creative Operations Manager");
    assert.ok(role, "the imported role must appear in the discovery inbox");
    assert.equal(role.origin, "imported");
    assert.equal(role.company, "Meta");
    assert.ok(role.fitScore > 0, "an imported role is scored like a discovered one");

    // Re-importing the same link updates rather than duplicating.
    const again = await worker.fetch(new Request("http://localhost/api/radar", {
      method: "POST", headers,
      body: JSON.stringify({ action: "import_job_links", links: ["https://www.metacareers.com/profile/job_details/1234567890/"] }),
    }), env, context);
    const againData = await again.json();
    assert.equal(againData.result.imported[0].status, "updated");
    assert.equal(againData.opportunities.filter((item) => item.title === "Creative Operations Manager").length, 1);
  } finally {
    globalThis.fetch = originalFetch;
    await mf.dispose();
  }
});

test("importing rejects a LinkedIn link and a Meta search URL with actionable guidance", async () => {
  const { mf, db } = await createDatabase();
  try {
    const worker = await loadWorker();
    const env = { DB: db, ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } };

    const linkedin = await worker.fetch(new Request("http://localhost/api/radar", {
      method: "POST", headers,
      body: JSON.stringify({ action: "import_job_links", links: ["https://www.linkedin.com/jobs/view/1234567890"] }),
    }), env, context);
    assert.equal(linkedin.status, 422);
    assert.match((await linkedin.json()).message, /LinkedIn/i);

    const search = await worker.fetch(new Request("http://localhost/api/radar", {
      method: "POST", headers,
      body: JSON.stringify({ action: "import_job_links", links: ["https://www.metacareers.com/jobsearch/"] }),
    }), env, context);
    const searchData = await search.json();
    assert.equal(search.status, 200);
    assert.equal(searchData.result.imported.length, 0);
    assert.match(searchData.result.failures[0].message, /job-details link/i);
  } finally {
    await mf.dispose();
  }
});

test("V’s Job Watch import is idempotent and preserves the user’s opportunity decision", async () => {
  const { mf, db } = await createDatabase();
  const worker = await loadWorker();
  const env = { DB: db, ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } };
  try {
    const first = await worker.fetch(new Request("http://localhost/api/radar", {
      method: "POST", headers,
      body: JSON.stringify({ action: "import_watch_batch" }),
    }), env, context);
    const firstData = await first.json();
    assert.equal(first.status, 200);
    assert.equal(firstData.result.added, 21);
    assert.equal(firstData.opportunities.length, 21);
    assert.ok(firstData.opportunities.every((role) => role.sourceType === "v-watch"));

    const chosen = firstData.opportunities[0];
    await worker.fetch(new Request("http://localhost/api/radar", {
      method: "POST", headers,
      body: JSON.stringify({ action: "set_opportunity_status", opportunityId: chosen.id, status: "shortlisted" }),
    }), env, context);

    const second = await worker.fetch(new Request("http://localhost/api/radar", {
      method: "POST", headers,
      body: JSON.stringify({ action: "import_watch_batch" }),
    }), env, context);
    const secondData = await second.json();
    assert.equal(second.status, 200);
    assert.equal(secondData.result.added, 0);
    assert.equal(secondData.result.updated, 21);
    assert.equal(secondData.opportunities.length, 21);
    assert.equal(secondData.opportunities.find((role) => role.id === chosen.id).status, "shortlisted");
  } finally {
    await mf.dispose();
  }
});
