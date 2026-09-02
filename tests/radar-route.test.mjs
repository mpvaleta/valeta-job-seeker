import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { Miniflare } from "miniflare";
import { accessHeaders, installAccessEnv } from "./helpers/access-token.mjs";
import { DEFAULT_RADAR_MONITORS } from "../lib/default-radar-monitors.ts";

await installAccessEnv();

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
const headers = { "content-type": "application/json", ...(await accessHeaders("owner@example.com")) };

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
        // On target but junior: it belongs in the inbox under the threshold, so
        // a scan that finds only near misses still shows its work.
        title: "Creative Services Assistant",
        location: { name: "Oakland, CA" },
        content: "<p>Support the studio calendar and vendor invoices.</p>",
        absolute_url: "https://boards.greenhouse.io/example/jobs/102",
        updated_at: "2026-07-18T00:00:00Z",
      }, {
        // Neither the right work nor the right market — nothing the owner could
        // adjust would make this a match, so it must not be stored at all.
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
    assert.equal(scannedData.result.discovered, 3);
    assert.equal(scannedData.result.found, 1);
    // Two roles were read and scored, but only the on-target one is written to
    // the inbox. "Accounting Analyst" shares no line of work with any saved
    // target, so no slider the owner can move would ever turn it into a match
    // and keeping it would only be clutter.
    assert.equal(scannedData.result.added, 2);
    assert.equal(scannedData.result.matchedAdded, 1);
    assert.equal(scannedData.result.belowThreshold, 2);
    assert.ok(!scannedData.opportunities.some((item) => item.title === "Accounting Analyst"), "an off-target role must not be stored");
    assert.equal(scannedData.result.repairedSources, 1);
    const discovered = scannedData.opportunities.find((item) => item.title === "Creative Operations Manager");
    assert.ok(discovered);
    assert.equal(discovered.status, "new");
    assert.equal(discovered.sourceType, "greenhouse");
    assert.ok(discovered.fitScore >= 55);
    assert.equal(scannedData.profile.minScore, 55);
    assert.equal(scannedData.monitors[0].lastRunStatus, "completed");
    assert.equal(scannedData.monitors[0].lastRunFoundCount, 1);
    assert.match(scannedData.monitors[0].lastRunSummary, /^Manual scan · /);
    assert.match(scannedData.monitors[0].lastRunSummary, /filtered out by the role\/market gates/);
    assert.equal(scannedData.monitors[0].careersUrl, "https://boards.greenhouse.io/example");
    assert.ok(Number.isFinite(new Date(scannedData.monitors[0].nextDueAt).getTime()), `nextDueAt missing: ${scannedData.monitors[0].nextDueAt}`);
    assert.equal(scannedData.monitors[0].due, false);
    assert.equal(scannedData.automation.backgroundScheduler, "enabled");

    // A catch-up scan is fired from the client's mount effect, whose closure can
    // still hold the pre-load default form state. If the route honoured that
    // profile it would wipe the saved one on every app open, so a profile sent
    // with trigger "catch_up" must be ignored entirely.
    const catchUp = await worker.fetch(new Request("http://localhost/api/radar", {
      method: "POST", headers,
      body: JSON.stringify({ action: "scan", trigger: "catch_up", profile: {
        titles: ["Creative Operations", "Project Manager", "Producer"],
        skills: ["creative operations", "project management"],
        locations: ["San Francisco Bay Area", "California", "United States"],
        workModes: ["Hybrid", "On-site", "Remote"],
        goals: "Generic default goals that must never replace the saved profile.",
        exclusions: [],
        minScore: 45,
      } }),
    }), env, context);
    const catchUpData = await catchUp.json();
    assert.equal(catchUp.status, 200);
    assert.match(catchUpData.monitors[0].lastRunSummary, /^App-open catch-up scan · /);
    assert.equal(catchUpData.profile.minScore, 55, "a catch-up scan must not overwrite the saved profile");
    assert.deepEqual(catchUpData.profile.titles, ["Creative Operations Manager"]);
    assert.deepEqual(catchUpData.profile.locations, ["San Francisco Bay Area"]);
    const below = scannedData.opportunities.find((item) => item.title === "Creative Services Assistant");
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
    // Nothing responded and nothing was read, so the run is a failure rather
    // than a quiet success. Recorded as "completed · 0 found", it read on the
    // Targets tab exactly like a healthy board with no matching roles, and the
    // scan queue had no way to tell a dead source from a quiet one.
    assert.equal(dashboardData.monitors[0].lastRunStatus, "failed");
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

test("saved LinkedIn jobs enter the inbox from the official export without fetching LinkedIn", async () => {
  const { mf, db } = await createDatabase();
  const originalFetch = globalThis.fetch;
  let fetched = 0;
  globalThis.fetch = async (url) => { fetched += 1; throw new Error(`No page should be fetched, but got ${url}`); };
  try {
    const worker = await loadWorker();
    const env = { DB: db, ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } };

    const imported = await worker.fetch(new Request("http://localhost/api/radar", {
      method: "POST", headers,
      body: JSON.stringify({ action: "import_linkedin_saved_jobs", rows: [
        { title: "Creative Operations Manager", company: "Meta", url: "https://www.linkedin.com/jobs/view/222", savedAt: "2026-07-19" },
        { title: "Producer, Brand Studio", company: "Northwind Agency", url: "https://www.linkedin.com/jobs/view/111", savedAt: "2026-07-18" },
      ] }),
    }), env, context);
    const data = await imported.json();
    assert.equal(imported.status, 200);
    assert.equal(data.result.added, 2);
    assert.equal(fetched, 0, "importing an official export must not open any LinkedIn page");

    const role = data.opportunities.find((item) => item.title === "Creative Operations Manager");
    assert.ok(role, "saved LinkedIn roles must be visible in the inbox");
    assert.equal(role.origin, "linkedin-saved");
    assert.equal(role.company, "Meta");
    // The score is honest about resting on title and company alone.
    assert.match(role.fitSummary, /title and company only/i);

    const again = await worker.fetch(new Request("http://localhost/api/radar", {
      method: "POST", headers,
      body: JSON.stringify({ action: "import_linkedin_saved_jobs", rows: [
        { title: "Creative Operations Manager", company: "Meta", url: "https://www.linkedin.com/jobs/view/222", savedAt: "2026-07-19" },
      ] }),
    }), env, context);
    const againData = await again.json();
    assert.equal(againData.result.added, 0);
    assert.equal(againData.result.updated, 1);
    assert.equal(againData.opportunities.filter((item) => item.title === "Creative Operations Manager").length, 1);
  } finally {
    globalThis.fetch = originalFetch;
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

test("seeding default monitors fills the radar once and skips a company already monitored", async () => {
  const { mf, db } = await createDatabase();
  const worker = await loadWorker();
  const env = { DB: db, ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } };
  try {
    const manual = await worker.fetch(new Request("http://localhost/api/radar", {
      method: "POST", headers,
      body: JSON.stringify({ action: "add_monitor", monitor: { company: "anthropic", careersUrl: "https://job-boards.greenhouse.io/anthropic-custom" } }),
    }), env, context);
    assert.equal(manual.status, 200);

    const first = await worker.fetch(new Request("http://localhost/api/radar", {
      method: "POST", headers,
      body: JSON.stringify({ action: "seed_default_monitors" }),
    }), env, context);
    const firstData = await first.json();
    assert.equal(first.status, 200);
    assert.ok(firstData.result.added >= 15, `expected most defaults to be added, got ${firstData.result.added}`);
    assert.equal(firstData.result.skipped, DEFAULT_RADAR_MONITORS.length - firstData.result.added);
    // Case-insensitive match against the manually added "anthropic" means the
    // seed's own "Anthropic" entry is skipped, not duplicated.
    assert.equal(firstData.monitors.filter((monitor) => monitor.company.toLowerCase() === "anthropic").length, 1);
    const totalAfterFirst = firstData.monitors.length;
    assert.equal(totalAfterFirst, DEFAULT_RADAR_MONITORS.length);

    const second = await worker.fetch(new Request("http://localhost/api/radar", {
      method: "POST", headers,
      body: JSON.stringify({ action: "seed_default_monitors" }),
    }), env, context);
    const secondData = await second.json();
    assert.equal(second.status, 200);
    assert.equal(secondData.result.added, 0);
    assert.equal(secondData.monitors.length, totalAfterFirst);
  } finally {
    await mf.dispose();
  }
});

// "Radar duplicity": the same posting reached by a slightly different link used
// to become a second inbox row, because dedup compared source_url as an exact
// string. A role found by a scan, then by Job Watch, then imported was three rows.
test("one posting stays one inbox row however its link is written", async () => {
  const { mf, db } = await createDatabase();
  const originalFetch = globalThis.fetch;
  try {
    const worker = await loadWorker();
    const env = { DB: db, ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } };

    const posting = (url) => `<html><head><title>Creative Operations Manager | Acme</title>
      <script type="application/ld+json">${JSON.stringify({
        "@type": "JobPosting",
        title: "Creative Operations Manager",
        hiringOrganization: { name: "Acme Studios" },
        jobLocation: { address: { addressLocality: "Fremont", addressRegion: "CA" } },
        description: "<p>Lead integrated campaign delivery, budgets, vendors, and cross-functional production schedules.</p>",
        url,
        datePosted: "2026-07-20",
      })}</script></head><body>Role</body></html>`;

    // Each variant reports its own URL, exactly as a real page would.
    globalThis.fetch = async (url) => new Response(posting(String(url)), { headers: { "content-type": "text/html" } });

    await worker.fetch(new Request("http://localhost/api/radar", {
      method: "POST", headers,
      body: JSON.stringify({ action: "save_profile", profile: {
        titles: ["Creative Operations Manager"], skills: ["campaign delivery"], locations: ["Fremont"],
        workModes: ["Hybrid"], goals: "Lead creative delivery.", exclusions: [], minScore: 30,
      } }),
    }), env, context);

    const variants = [
      "https://boards.greenhouse.io/acme/jobs/4012",
      "https://boards.greenhouse.io/acme/jobs/4012/",
      "https://boards.greenhouse.io/acme/jobs/4012?gh_src=abc123",
      "http://boards.greenhouse.io/acme/jobs/4012",
      "https://boards.greenhouse.io/acme/jobs/4012#apply",
      "https://boards.greenhouse.io/acme/jobs/4012?utm_source=linkedin&utm_medium=social",
    ];

    let data;
    for (const url of variants) {
      const response = await worker.fetch(new Request("http://localhost/api/radar", {
        method: "POST", headers, body: JSON.stringify({ action: "import_job_links", links: [url] }),
      }), env, context);
      data = await response.json();
      assert.equal(response.status, 200, JSON.stringify(data));
    }

    const rows = data.opportunities.filter((item) => item.title === "Creative Operations Manager");
    assert.equal(rows.length, 1, `six links to one posting produced ${rows.length} rows: ${JSON.stringify(rows.map((r) => r.sourceUrl))}`);

    // All six variants in a single request also collapse to the one row.
    const batch = await worker.fetch(new Request("http://localhost/api/radar", {
      method: "POST", headers, body: JSON.stringify({ action: "import_job_links", links: variants }),
    }), env, context);
    const batchData = await batch.json();
    assert.equal(batchData.opportunities.filter((item) => item.title === "Creative Operations Manager").length, 1);
  } finally {
    globalThis.fetch = originalFetch;
    await mf.dispose();
  }
});

test("a distinct posting at the same employer is never merged away", async () => {
  const { mf, db } = await createDatabase();
  const originalFetch = globalThis.fetch;
  try {
    const worker = await loadWorker();
    const env = { DB: db, ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } };
    globalThis.fetch = async (url) => {
      const id = String(url).match(/jobs\/(\d+)/)?.[1] || "0";
      return new Response(`<html><head><title>Role ${id}</title>
        <script type="application/ld+json">${JSON.stringify({
          "@type": "JobPosting",
          title: id === "4012" ? "Creative Operations Manager" : "Integrated Producer",
          hiringOrganization: { name: "Acme Studios" },
          description: "<p>Deliver integrated campaigns across cross-functional teams and manage vendor schedules.</p>",
          url: String(url),
        })}</script></head><body>Role</body></html>`, { headers: { "content-type": "text/html" } });
    };

    const response = await worker.fetch(new Request("http://localhost/api/radar", {
      method: "POST", headers,
      body: JSON.stringify({ action: "import_job_links", links: [
        "https://boards.greenhouse.io/acme/jobs/4012",
        "https://boards.greenhouse.io/acme/jobs/4013",
      ] }),
    }), env, context);
    const data = await response.json();
    assert.equal(response.status, 200, JSON.stringify(data));
    assert.equal(data.result.imported.length, 2);
    assert.equal(data.opportunities.length, 2, "two different jobs must stay two rows");
  } finally {
    globalThis.fetch = originalFetch;
    await mf.dispose();
  }
});

// Nothing in the radar ever retired a row, so a filled role stayed in the inbox
// next to live ones forever. A role the employer's board no longer lists is no
// longer open — but a role the user has acted on keeps its status regardless.
// Delisting is reported, never enforced by a status write. An earlier local
// branch flipped the row to status "expired"; that was dropped because a
// truncated or failed board read makes a live role look absent, and the write
// would then bury a role the user had already shortlisted. The row keeps its
// status and gains a derived listingLost flag instead.
test("a role the employer stopped listing is flagged, and the user's own decision is untouched", async () => {
  const { mf, db } = await createDatabase();
  const originalFetch = globalThis.fetch;
  try {
    const worker = await loadWorker();
    const env = { DB: db, ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } };
    // Distinct titles per id on purpose: the radar merges rows that read alike,
    // so three same-titled postings would collapse into one and this test would
    // be asserting against a merged row rather than three separate requisitions.
    const titleFor = { 200: "Creative Operations Manager", 201: "Brand Programs Manager", 202: "Integrated Producer" };
    let openJobIds = ["200", "201", "202"];
    globalThis.fetch = async (url) => {
      assert.match(String(url), /greenhouse\.io/);
      return Response.json({ jobs: openJobIds.map((id) => ({
        title: titleFor[id],
        location: { name: "Oakland, CA" },
        content: "<p>Lead integrated production and brand programs across cross-functional teams.</p>",
        absolute_url: `https://boards.greenhouse.io/example/jobs/${id}`,
        updated_at: "2026-08-01T00:00:00Z",
      })) });
    };

    const post = async (body) => {
      const response = await worker.fetch(new Request("http://localhost/api/radar", { method: "POST", headers, body: JSON.stringify(body) }), env, context);
      const data = await response.json();
      assert.equal(response.status, 200, JSON.stringify(data));
      return data;
    };

    await post({ action: "save_profile", profile: {
      titles: ["Creative Operations Manager", "Integrated Producer"],
      skills: ["integrated production", "brand programs"],
      locations: ["San Francisco Bay Area"],
      workModes: ["Hybrid"],
      goals: "Lead creative and brand delivery.",
      exclusions: [],
      minScore: 40,
    } });
    await post({ action: "add_monitor", monitor: {
      company: "Example Studio",
      kind: "Creative / Advertising Agency",
      careersUrl: "https://boards.greenhouse.io/example",
      targetPosition: "Creative Operations Manager",
      cadence: "daily",
    } });

    // A scan also imports the hand-verified V's Job Watch batch, so the inbox
    // holds those rows alongside this employer's three. Assert on this board's
    // rows specifically rather than on the total.
    const first = await post({ action: "scan" });
    const boardRows = (payload) => payload.opportunities.filter((item) => item.sourceUrl.startsWith("https://boards.greenhouse.io/example/"));
    assert.equal(boardRows(first).length, 3);
    assert.ok(boardRows(first).every((item) => item.status === "new"));

    // The user approves one of the roles that is about to disappear.
    const doomedShortlist = boardRows(first).find((item) => item.sourceUrl.endsWith("/201"));
    await post({ action: "set_opportunity_status", opportunityId: doomedShortlist.id, status: "shortlisted" });

    // Both scans run inside the same second here, and last_seen_at /
    // last_listing_read_at are both second-granularity, so the strict
    // less-than that detects absence cannot separate them. Real scans are
    // hours apart. Age these rows by an hour to stand in for that gap — the
    // still-listed one gets refreshed by the next scan, the dropped ones do not.
    await db.prepare("UPDATE job_opportunities SET last_seen_at = datetime('now', '-1 hour') WHERE source_url LIKE 'https://boards.greenhouse.io/example/%'").run();

    openJobIds = ["200"];
    const second = await post({ action: "scan" });

    const byUrl = new Map(second.opportunities.map((item) => [item.sourceUrl, item]));
    const still = byUrl.get("https://boards.greenhouse.io/example/jobs/200");
    const dropped = byUrl.get("https://boards.greenhouse.io/example/jobs/202");
    const shortlisted = byUrl.get("https://boards.greenhouse.io/example/jobs/201");

    // No status anywhere is rewritten by the board going quiet.
    assert.equal(still.status, "new", "a still-listed role is untouched");
    assert.equal(dropped.status, "new", "a delisted role keeps its status — delisting is reported, not enforced");
    assert.equal(shortlisted.status, "shortlisted", "the user's own decision survives the posting closing");

    // The role the board dropped is the one flagged, and only it.
    assert.equal(dropped.listingLost, true, "the delisted role is flagged as gone from the board");
    assert.ok(!still.listingLost, "a role still on the board is not flagged");

    assert.equal(boardRows(second).length, 3, "flagging never deletes a row");
  } finally {
    globalThis.fetch = originalFetch;
    await mf.dispose();
  }
});

// Rows an earlier build already duplicated must be repaired, not just prevented.
test("pre-existing duplicate rows merge on the next scan and keep the user's decision", async () => {
  const { mf, db } = await createDatabase();
  const originalFetch = globalThis.fetch;
  try {
    const worker = await loadWorker();
    const env = { DB: db, ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } };

    await worker.fetch(new Request("http://localhost/api/radar", { headers }), env, context);
    const owner = await db.prepare("SELECT id FROM users WHERE email = ? LIMIT 1").bind("owner@example.com").first();
    await db.prepare("INSERT INTO companies (id, name, company_type, primary_market) VALUES (?, ?, ?, ?)")
      .bind("company-acme", "Acme Studios", "Creative / Advertising Agency", "United States").run();
    await worker.fetch(new Request("http://localhost/api/radar", {
      method: "POST", headers,
      body: JSON.stringify({ action: "add_monitor", monitor: { company: "Acme Studios", careersUrl: "https://boards.greenhouse.io/acme", cadence: "manual" } }),
    }), env, context);

    // Three rows for one posting, as the exact-string dedup used to produce.
    const variants = [
      ["dup-1", "https://boards.greenhouse.io/acme/jobs/4012", "new", "2026-07-01 10:00:00"],
      ["dup-2", "https://boards.greenhouse.io/acme/jobs/4012/", "shortlisted", "2026-07-05 10:00:00"],
      ["dup-3", "https://boards.greenhouse.io/acme/jobs/4012?gh_src=x", "new", "2026-07-09 10:00:00"],
    ];
    for (const [id, url, status, discovered] of variants) {
      await db.prepare("INSERT INTO job_opportunities (id, user_id, company_id, title, source_url, source_type, fit_score, fit_summary, status, discovered_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
        .bind(id, owner.id, "company-acme", "Creative Operations Manager", url, "greenhouse", 72, "Strong alignment with integrated campaign delivery.", status, discovered, discovered).run();
    }

    globalThis.fetch = async () => Response.json({ jobs: [] });
    const scanned = await worker.fetch(new Request("http://localhost/api/radar", {
      method: "POST", headers, body: JSON.stringify({ action: "scan" }),
    }), env, context);
    const data = await scanned.json();
    assert.equal(scanned.status, 200, JSON.stringify(data));
    assert.equal(data.result.mergedDuplicates, 2, "two redundant rows should merge away");

    const rows = data.opportunities.filter((item) => item.title === "Creative Operations Manager");
    assert.equal(rows.length, 1);
    // The earliest row survives, so the original discovery date is preserved…
    assert.equal(rows[0].id, "dup-1");
    assert.match(rows[0].discoveredAt, /2026-07-01/);
    // …carrying the decision the user actually made on one of the copies.
    assert.equal(rows[0].status, "shortlisted");

    // Idempotent: a second scan finds nothing left to merge.
    const again = await worker.fetch(new Request("http://localhost/api/radar", {
      method: "POST", headers, body: JSON.stringify({ action: "scan" }),
    }), env, context);
    assert.equal((await again.json()).result.mergedDuplicates, 0);
  } finally {
    globalThis.fetch = originalFetch;
    await mf.dispose();
  }
});

// The company's own stored type (set once, e.g. via the monitor's Type
// dropdown) must keep winning on every later import of that same company,
// even when the imported posting's own text/URL carries no startup language
// at all -- otherwise re-importing a known startup would silently disagree
// with what is already on file.
test("startups-only preference passes a monitored startup's role and filters out an established company's role", async () => {
  const { mf, db } = await createDatabase();
  const originalFetch = globalThis.fetch;
  try {
    const worker = await loadWorker();
    const env = { DB: db, ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } };

    await worker.fetch(new Request("http://localhost/api/radar", {
      method: "POST", headers,
      body: JSON.stringify({ action: "save_profile", profile: {
        titles: ["Creative Operations Manager"],
        skills: ["integrated production"],
        locations: [],
        workModes: [],
        goals: "Lead creative delivery.",
        exclusions: [],
        minScore: 40,
        companyStagePreference: "startups_only",
      } }),
    }), env, context);

    // Mark "Acme Startup" as Startup / Early-stage the same way a user would:
    // picking it in the add-monitor Type field.
    await worker.fetch(new Request("http://localhost/api/radar", {
      method: "POST", headers,
      body: JSON.stringify({ action: "add_monitor", monitor: { company: "Acme Startup", kind: "Startup / Early-stage", careersUrl: "https://boards.greenhouse.io/acmestartup", cadence: "manual" } }),
    }), env, context);
    await worker.fetch(new Request("http://localhost/api/radar", {
      method: "POST", headers,
      body: JSON.stringify({ action: "add_monitor", monitor: { company: "Acme Enterprises", kind: "Technology", careersUrl: "https://boards.greenhouse.io/acmeenterprises", cadence: "manual" } }),
    }), env, context);

    const posting = (company, url) => `<html><head><title>Creative Operations Manager</title>
      <script type="application/ld+json">${JSON.stringify({
        "@type": "JobPosting",
        title: "Creative Operations Manager",
        hiringOrganization: { name: company },
        jobLocation: { address: { addressLocality: "San Francisco", addressRegion: "CA" } },
        description: "<p>Lead integrated production across cross-functional teams.</p>",
        url,
        datePosted: "2026-07-20",
      })}</script></head><body>Role details</body></html>`;

    globalThis.fetch = async (url) => {
      if (String(url).includes("/acme-startup-role")) return new Response(posting("Acme Startup", String(url)), { headers: { "content-type": "text/html" } });
      if (String(url).includes("/acme-enterprise-role")) return new Response(posting("Acme Enterprises", String(url)), { headers: { "content-type": "text/html" } });
      throw new Error(`Unexpected URL ${url}`);
    };

    const imported = await worker.fetch(new Request("http://localhost/api/radar", {
      method: "POST", headers,
      body: JSON.stringify({ action: "import_job_links", links: [
        "https://boards.greenhouse.io/acmestartup/acme-startup-role",
        "https://boards.greenhouse.io/acmeenterprises/acme-enterprise-role",
      ] }),
    }), env, context);
    const data = await imported.json();
    assert.equal(imported.status, 200, JSON.stringify(data));
    assert.equal(data.result.imported.length, 2, JSON.stringify(data.result));

    const startupRole = data.opportunities.find((item) => item.company === "Acme Startup");
    const enterpriseRole = data.opportunities.find((item) => item.company === "Acme Enterprises");
    assert.ok(startupRole, "the startup's role must appear in the inbox");
    assert.ok(enterpriseRole, "the established company's role must still appear in the inbox, just below threshold");
    assert.equal(startupRole.alignmentPasses, true, JSON.stringify(startupRole));
    assert.equal(enterpriseRole.alignmentPasses, false, JSON.stringify(enterpriseRole));
    assert.match(enterpriseRole.fitSummary, /not early-stage \(Technology\)/i);
  } finally {
    globalThis.fetch = originalFetch;
    await mf.dispose();
  }
});

// scoreRadarOpportunity caps a startups-only mismatch at score 20, and the
// UI's minimum-alignment slider goes as low as 20 -- right at that boundary,
// a plain "fitScore >= minScore" recheck would show a filtered-out role as
// passing. readRadarDashboard's text-sniffed exclusionHit must catch this
// the same way it already catches a plain exclusion-term hit.
test("startups-only mismatch stays filtered out even when minScore is set to the lowest allowed value", async () => {
  const { mf, db } = await createDatabase();
  const originalFetch = globalThis.fetch;
  try {
    const worker = await loadWorker();
    const env = { DB: db, ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } };

    await worker.fetch(new Request("http://localhost/api/radar", {
      method: "POST", headers,
      body: JSON.stringify({ action: "save_profile", profile: {
        // Enough matching signal (exact title + a skill match + no location
        // preference to weigh against) to land pre-penalty score at/above 60,
        // so the startups-only penalty (score - 40, capped at 20) actually
        // lands AT 20 instead of below it -- otherwise this test would not
        // exercise the boundary it's named for.
        titles: ["Creative Operations Manager"],
        skills: ["integrated production"],
        locations: [],
        workModes: [],
        goals: "",
        exclusions: [],
        minScore: 20,
        companyStagePreference: "startups_only",
      } }),
    }), env, context);

    await worker.fetch(new Request("http://localhost/api/radar", {
      method: "POST", headers,
      body: JSON.stringify({ action: "add_monitor", monitor: { company: "Acme Enterprises", kind: "Technology", careersUrl: "https://boards.greenhouse.io/acmeenterprises", cadence: "manual" } }),
    }), env, context);

    globalThis.fetch = async (url) => {
      if (String(url).includes("/acme-enterprise-role")) {
        return new Response(`<html><head><title>Creative Operations Manager</title>
          <script type="application/ld+json">${JSON.stringify({
            "@type": "JobPosting",
            title: "Creative Operations Manager",
            hiringOrganization: { name: "Acme Enterprises" },
            jobLocation: { address: { addressLocality: "San Francisco", addressRegion: "CA" } },
            description: "<p>Lead integrated production across cross-functional teams.</p>",
            url: String(url),
            datePosted: "2026-07-20",
          })}</script></head><body>Role details</body></html>`, { headers: { "content-type": "text/html" } });
      }
      throw new Error(`Unexpected URL ${url}`);
    };

    const imported = await worker.fetch(new Request("http://localhost/api/radar", {
      method: "POST", headers,
      body: JSON.stringify({ action: "import_job_links", links: ["https://boards.greenhouse.io/acmeenterprises/acme-enterprise-role"] }),
    }), env, context);
    const data = await imported.json();
    const enterpriseRole = data.opportunities.find((item) => item.company === "Acme Enterprises");
    assert.ok(enterpriseRole);
    assert.ok(enterpriseRole.fitScore >= 20, "the capped score should sit at or above this profile's minScore");
    assert.equal(enterpriseRole.alignmentPasses, false, "a startups-only mismatch must stay filtered out even at the score/minScore boundary");
  } finally {
    globalThis.fetch = originalFetch;
    await mf.dispose();
  }
});

// A Worker request has a finite subrequest budget. Scanning every target at
// once burned through it and stamped the tail of the list "completed · 0
// found" without ever fetching them — the same five companies reported zero
// on every run for weeks. A run must now cover only what it can finish.
const greenhouseJob = (index) => ({
  jobs: [{
    id: 1000 + index,
    title: "Senior Creative Producer",
    absolute_url: `https://boards.greenhouse.io/company${index}/jobs/${1000 + index}`,
    location: { name: "San Francisco, CA" },
    updated_at: new Date().toISOString(),
    content: "Lead integrated production for brand campaigns.",
  }],
});

async function addMonitors(worker, env, count) {
  for (let index = 0; index < count; index += 1) {
    const added = await worker.fetch(new Request("http://localhost/api/radar", {
      method: "POST", headers,
      body: JSON.stringify({ action: "add_monitor", monitor: { company: `Company ${index}`, careersUrl: `https://boards.greenhouse.io/company${index}`, cadence: "manual" } }),
    }), env, context);
    assert.equal(added.status, 200);
  }
}

test("a full scan is bounded, covers the longest-waiting targets first, and reports the rest", async () => {
  const { mf, db } = await createDatabase();
  const worker = await loadWorker();
  const env = { DB: db, ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } };
  const originalFetch = globalThis.fetch;
  try {
    await addMonitors(worker, env, 9);

    // Every source comes back empty, which is the expensive shape: each
    // company falls through careers-page recovery and the web-search
    // fallback before giving up.
    globalThis.fetch = async () => Response.json({ jobs: [] });
    const scanned = await worker.fetch(new Request("http://localhost/api/radar", {
      method: "POST", headers, body: JSON.stringify({ action: "scan" }),
    }), env, context);
    const data = await scanned.json();
    assert.equal(scanned.status, 200);
    // The exact count depends on what each company costs, but a run must
    // never try to take the whole list — that is the bug this guards.
    assert.ok(data.result.checked > 0 && data.result.checked < 9, `expected a partial slice, got ${data.result.checked}`);
    assert.equal(data.result.deferred, 9 - data.result.checked, "the remaining targets are reported, not silently zeroed");

    // Never-checked targets sort first, so later runs reach the rest instead
    // of re-scanning the same few forever.
    let reached = 0;
    for (let run = 0; run < 4 && reached < 9; run += 1) {
      const next = await worker.fetch(new Request("http://localhost/api/radar", {
        method: "POST", headers, body: JSON.stringify({ action: "scan" }),
      }), env, context);
      reached = (await next.json()).monitors.filter((monitor) => monitor.lastCheckedAt).length;
    }
    assert.equal(reached, 9, "every target is reached by repeated runs");

    // A single-target "Check now" is never throttled.
    const dashboard = await worker.fetch(new Request("http://localhost/api/radar", { headers }), env, context);
    const monitors = (await dashboard.json()).monitors;
    const single = await worker.fetch(new Request("http://localhost/api/radar", {
      method: "POST", headers, body: JSON.stringify({ action: "scan", monitorId: monitors[0].id }),
    }), env, context);
    const singleData = await single.json();
    assert.equal(singleData.result.checked, 1);
    assert.equal(singleData.result.deferred, 0);
  } finally {
    globalThis.fetch = originalFetch;
    await mf.dispose();
  }
});

// A dead ATS token costs two attempts on every run and can never repair
// itself. It was spending them ahead of boards that return roles.
test("a board that failed its last read waits behind the boards that work", async () => {
  const { mf, db } = await createDatabase();
  const worker = await loadWorker();
  const env = { DB: db, ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } };
  const originalFetch = globalThis.fetch;
  try {
    const post = async (body) => {
      const response = await worker.fetch(new Request("http://localhost/api/radar", { method: "POST", headers, body: JSON.stringify(body) }), env, context);
      assert.equal(response.status, 200);
      return response.json();
    };
    // Thirteen boards against a company cap of twelve, so exactly one is left
    // out of every run and the queue order becomes observable. The dead one is
    // named to sort first, so the first run reaches it and records the failure.
    await post({ action: "add_monitor", monitor: { company: "Aaa Dead Board", careersUrl: "https://boards.greenhouse.io/gone", cadence: "twice_daily" } });
    for (let index = 1; index <= 12; index += 1) {
      await post({ action: "add_monitor", monitor: { company: `Board ${String(index).padStart(2, "0")}`, careersUrl: `https://boards.greenhouse.io/board${index}`, cadence: "twice_daily" } });
    }
    globalThis.fetch = async (input) => {
      if (String(input).includes("/gone")) throw new Error("board not found");
      return Response.json({ jobs: [] });
    };

    const runsFor = async (company) => {
      const row = await db.prepare(`SELECT COUNT(*) AS count FROM monitor_runs mr
        JOIN company_monitors m ON m.id = mr.monitor_id JOIN companies c ON c.id = m.company_id
        WHERE c.name = ?`).bind(company).first();
      return Number(row.count);
    };
    await post({ action: "scan" });
    const deadStatus = await db.prepare(`SELECT mr.run_status FROM monitor_runs mr
      JOIN company_monitors m ON m.id = mr.monitor_id JOIN companies c ON c.id = m.company_id
      WHERE c.name = 'Aaa Dead Board'`).first();
    assert.equal(deadStatus.run_status, "failed", "the dead board must actually record a failure for this to test anything");
    assert.equal(await runsFor("Aaa Dead Board"), 1, "and it is read on the first run, when nothing is known about it");

    // Four more runs. The dead board sorts first by name and was checked at the
    // same second as the rest, so without the demotion it would take a slot in
    // every one of them.
    for (let run = 0; run < 4; run += 1) await post({ action: "scan" });
    assert.equal(await runsFor("Aaa Dead Board"), 1, "a board that just failed never takes a slot from a working one");
    for (let index = 1; index <= 12; index += 1) {
      const company = `Board ${String(index).padStart(2, "0")}`;
      assert.ok(await runsFor(company) >= 1, `${company} must have been read`);
    }
  } finally {
    globalThis.fetch = originalFetch;
    await mf.dispose();
  }
});

test("a throttled scan reads targets with a saved board before it spends on website-only targets", async () => {
  const { mf, db } = await createDatabase();
  const worker = await loadWorker();
  const env = { DB: db, ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } };
  const originalFetch = globalThis.fetch;
  try {
    // Six website-only targets first: each burns the page read plus every
    // common careers path, the expensive shape that starved the real boards
    // for weeks. The board target is added last on purpose.
    for (let index = 0; index < 6; index += 1) {
      const added = await worker.fetch(new Request("http://localhost/api/radar", {
        method: "POST", headers,
        body: JSON.stringify({ action: "add_monitor", monitor: { company: `Site ${index}`, websiteUrl: `https://site-${index}.example.com`, cadence: "manual" } }),
      }), env, context);
      assert.equal(added.status, 200);
    }
    const board = await worker.fetch(new Request("http://localhost/api/radar", {
      method: "POST", headers,
      body: JSON.stringify({ action: "add_monitor", monitor: { company: "Board Co", careersUrl: "https://boards.greenhouse.io/boardco", cadence: "manual" } }),
    }), env, context);
    assert.equal(board.status, 200);

    // A website that answers with a real page but lists no roles is the
    // expensive shape: the page read completes with nothing, so every common
    // careers path is tried too. A source that *fails* outright would be
    // charged the one-attempt floor and not reproduce the starvation.
    const prose = "We are an independent studio making brand work for clients who care about craft. ".repeat(20);
    globalThis.fetch = async (input) => {
      if (String(input).includes("greenhouse.io")) return Response.json({ jobs: [] });
      return new Response(`<html><head><title>Studio</title></head><body><main><h1>About the studio</h1><p>${prose}</p></main></body></html>`, {
        headers: { "content-type": "text/html; charset=utf-8" },
      });
    };
    const scanned = await worker.fetch(new Request("http://localhost/api/radar", {
      method: "POST", headers, body: JSON.stringify({ action: "scan" }),
    }), env, context);
    const data = await scanned.json();
    assert.equal(scanned.status, 200);
    assert.ok(data.result.checked < 7, `expected a partial slice, got ${data.result.checked}`);
    const boardMonitor = data.monitors.find((monitor) => monitor.company === "Board Co");
    assert.ok(boardMonitor?.lastCheckedAt, "the board target is read in the first run even though it was added last");

    // Once read, the board is no longer due and rejoins the rotation, so
    // repeated manual runs still reach every website-only target instead of
    // re-reading the same board forever.
    let reached = 1;
    for (let run = 0; run < 6 && reached < 7; run += 1) {
      const next = await worker.fetch(new Request("http://localhost/api/radar", {
        method: "POST", headers, body: JSON.stringify({ action: "scan" }),
      }), env, context);
      reached = (await next.json()).monitors.filter((monitor) => monitor.lastCheckedAt).length;
    }
    assert.equal(reached, 7, "every target is reached by repeated runs");
  } finally {
    globalThis.fetch = originalFetch;
    await mf.dispose();
  }
});

test("a posting that vanishes from a re-read board is flagged, not deleted", async () => {
  const { mf, db } = await createDatabase();
  const worker = await loadWorker();
  const env = { DB: db, ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } };
  const originalFetch = globalThis.fetch;
  try {
    await addMonitors(worker, env, 1);
    const board = (titles) => Response.json({
      jobs: titles.map((title, index) => ({
        id: 100 + index,
        title,
        absolute_url: `https://boards.greenhouse.io/company0/jobs/${100 + index}`,
        location: { name: "San Francisco, CA" },
        updated_at: new Date().toISOString(),
        content: "Own integrated production for brand campaigns.",
      })),
    });

    globalThis.fetch = async () => board(["Senior Creative Producer", "Brand Program Manager"]);
    const first = await worker.fetch(new Request("http://localhost/api/radar", {
      method: "POST", headers, body: JSON.stringify({ action: "scan" }),
    }), env, context);
    assert.equal((await first.json()).result.added, 2);

    // The board is read again later and only one of the two postings is still
    // on it. Both runs land in the same test second, so the vanished row is
    // backdated the way real time would have separated them.
    globalThis.fetch = async () => board(["Senior Creative Producer"]);
    await worker.fetch(new Request("http://localhost/api/radar", {
      method: "POST", headers, body: JSON.stringify({ action: "scan" }),
    }), env, context);
    await db.prepare("UPDATE job_opportunities SET last_seen_at = '2026-01-01 00:00:00' WHERE title = 'Brand Program Manager'").run();

    const dashboard = await worker.fetch(new Request("http://localhost/api/radar", { headers }), env, context);
    const opportunities = (await dashboard.json()).opportunities;
    const kept = opportunities.find((item) => item.title === "Senior Creative Producer");
    const vanished = opportunities.find((item) => item.title === "Brand Program Manager");
    assert.ok(kept && vanished, "both rows stay in the inbox — nothing is deleted");
    assert.equal(kept.listingLost, false, "a posting the newest read confirmed is not flagged");
    assert.equal(vanished.listingLost, true, "a posting absent from the newest complete read is flagged");

    // A failed read must say nothing about listing freshness: after every
    // source stops responding, the flags stay exactly as they were.
    globalThis.fetch = async () => new Response("gone", { status: 500 });
    await worker.fetch(new Request("http://localhost/api/radar", {
      method: "POST", headers, body: JSON.stringify({ action: "scan" }),
    }), env, context);
    const after = await worker.fetch(new Request("http://localhost/api/radar", { headers }), env, context);
    const keptAfter = (await after.json()).opportunities.find((item) => item.title === "Senior Creative Producer");
    assert.equal(keptAfter.listingLost, false, "a failed read never turns a live posting into a lost one");
  } finally {
    globalThis.fetch = originalFetch;
    await mf.dispose();
  }
});

test("a run of healthy boards covers far more companies than a run of broken ones", async () => {
  const { mf, db } = await createDatabase();
  const worker = await loadWorker();
  const env = { DB: db, ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } };
  const originalFetch = globalThis.fetch;
  try {
    await addMonitors(worker, env, 10);

    // A board that answers on the first try costs one source attempt, so the
    // run budget stretches much further than it does over broken sources.
    // Charging per company instead of per attempt used to stop a healthy run
    // early for no reason.
    let index = 0;
    globalThis.fetch = async () => Response.json(greenhouseJob(index++));
    const scanned = await worker.fetch(new Request("http://localhost/api/radar", {
      method: "POST", headers, body: JSON.stringify({ action: "scan" }),
    }), env, context);
    const data = await scanned.json();
    assert.equal(scanned.status, 200);
    assert.equal(data.result.checked, 10, "ten healthy boards fit inside one run");
    assert.equal(data.result.deferred, 0);
  } finally {
    globalThis.fetch = originalFetch;
    await mf.dispose();
  }
});

// The whole path, not just the deriving function: a dismissal reason has to
// survive the HTTP route, land in the column, come back out through the
// history read, and actually move a score on the next scan.
test("a not-relevant dismissal is stored, teaches the next scan, and stops teaching once restored", async () => {
  const { mf, db } = await createDatabase();
  const originalFetch = globalThis.fetch;
  try {
    const worker = await loadWorker();
    const env = { DB: db, ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } };
    // Administrative project roles, not engineering ones. They share "project"
    // with the saved target so they pass the role gate and land in the inbox —
    // which is the only place dismissal learning can operate. "scheduling" is
    // the word that recurs across all four and is not in any saved title or
    // skill, so it is the one thing available to learn.
    let boardTitles = ["Project Scheduling Analyst", "Project Scheduling Clerk", "Project Scheduling Assistant", "Project Scheduling Administrator", "Brand Project Manager"];
    globalThis.fetch = async () => Response.json({ jobs: boardTitles.map((title, index) => ({
      title,
      location: { name: "Oakland, CA" },
      content: "<p>Build and ship product across cross-functional teams.</p>",
      absolute_url: `https://boards.greenhouse.io/example/jobs/${900 + index}`,
      updated_at: "2026-08-01T00:00:00Z",
    })) });

    const post = async (body) => {
      const response = await worker.fetch(new Request("http://localhost/api/radar", { method: "POST", headers, body: JSON.stringify(body) }), env, context);
      const data = await response.json();
      assert.equal(response.status, 200, JSON.stringify(data));
      return data;
    };

    await post({ action: "save_profile", profile: {
      titles: ["Brand Project Manager"],
      skills: ["brand programs"],
      locations: ["San Francisco Bay Area"],
      workModes: ["Hybrid"],
      goals: "Lead brand delivery.",
      exclusions: [],
      minScore: 20,
    } });
    await post({ action: "add_monitor", monitor: {
      company: "Example Studio",
      kind: "Technology",
      careersUrl: "https://boards.greenhouse.io/example",
      cadence: "daily",
    } });

    const first = await post({ action: "scan" });
    const board = (payload) => payload.opportunities.filter((item) => item.sourceUrl.startsWith("https://boards.greenhouse.io/example/"));
    const engineering = board(first).filter((item) => /Scheduling/.test(item.title));
    assert.equal(engineering.length, 4, "four engineering roles to reject");
    const scoreBefore = engineering.find((item) => item.title === "Project Scheduling Analyst").fitScore;

    // Reject all four as not relevant, through the real route.
    for (const role of engineering) {
      await post({ action: "set_opportunity_status", opportunityId: role.id, status: "dismissed", reason: "not_relevant" });
    }

    // The reason actually reached the column — not merely the status.
    const stored = await db.prepare("SELECT COUNT(*) AS count FROM job_opportunities WHERE dismissed_reason = 'not_relevant'").first();
    assert.equal(Number(stored.count), 4, "each dismissal must persist its reason");

    // A brand-new posting of the same kind on the next scan is ranked lower than the
    // identical role was before the radar learned anything.
    boardTitles = [...boardTitles, "Project Scheduling Coordinator"];
    const second = await post({ action: "scan" });
    const learned = board(second).find((item) => item.title === "Project Scheduling Coordinator");
    assert.ok(learned, "the new role should have been discovered");
    assert.ok(learned.fitScore < scoreBefore, `learned score ${learned.fitScore} should be under the pre-learning ${scoreBefore}`);
    assert.match(learned.fitSummary, /dismissed/, "the summary must explain why it sank");

    // The saved target is untouched by any of it.
    const target = board(second).find((item) => item.title === "Brand Project Manager");
    assert.ok(target.fitScore >= scoreBefore, "a saved target title must not be dragged down by learning");

    // Restoring two drops the sample under the threshold, and the signal stops.
    for (const role of engineering.slice(0, 2)) {
      await post({ action: "set_opportunity_status", opportunityId: role.id, status: "reviewing" });
    }
    const cleared = await db.prepare("SELECT COUNT(*) AS count FROM job_opportunities WHERE dismissed_reason = 'not_relevant'").first();
    assert.equal(Number(cleared.count), 2, "restoring a role clears the reason it was teaching from");

    const third = await post({ action: "scan" });
    const unlearned = board(third).find((item) => item.title === "Project Scheduling Coordinator");
    assert.ok(unlearned.fitScore > learned.fitScore, "with the sample below threshold the penalty must lift");
  } finally {
    globalThis.fetch = originalFetch;
    await mf.dispose();
  }
});

// A false "no longer on the company board" badge is worse than it was: the
// owner acts on it, and the radar now learns from what they mark closed.
test("a posting still on the board keeps its last-seen date even when it no longer scores", async () => {
  const { mf, db } = await createDatabase();
  const originalFetch = globalThis.fetch;
  try {
    const worker = await loadWorker();
    const env = { DB: db, ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } };
    globalThis.fetch = async () => Response.json({ jobs: ["Brand Project Manager", "Brand Project Assistant"].map((title, index) => ({
      title,
      location: { name: "Oakland, CA" },
      content: "<p>Run brand programs with cross-functional partners.</p>",
      absolute_url: `https://boards.greenhouse.io/example/jobs/${500 + index}`,
      updated_at: "2026-08-01T00:00:00Z",
    })) });
    const post = async (body) => {
      const response = await worker.fetch(new Request("http://localhost/api/radar", { method: "POST", headers, body: JSON.stringify(body) }), env, context);
      const data = await response.json();
      assert.equal(response.status, 200, JSON.stringify(data));
      return data;
    };
    const goals = (minScore) => ({
      titles: ["Brand Project Manager"], skills: [], locations: ["San Francisco Bay Area"],
      workModes: ["Hybrid"], goals: "", exclusions: [], minScore,
    });

    await post({ action: "save_profile", profile: goals(20) });
    await post({ action: "add_monitor", monitor: { company: "Example Studio", careersUrl: "https://boards.greenhouse.io/example", cadence: "daily" } });
    const first = await post({ action: "scan" });
    const assistant = first.opportunities.find((item) => item.title === "Brand Project Assistant");
    assert.ok(assistant, "both roles are stored while the bar is low");

    // Backdated so the refresh is observable: CURRENT_TIMESTAMP has one-second
    // resolution, and both scans happen inside the same second here.
    await db.prepare("UPDATE job_opportunities SET last_seen_at = '2020-01-01 00:00:00'").run();

    // Raising the bar puts the assistant role under the near-miss floor, so
    // the scan no longer writes its row — which is exactly the case that used
    // to leave last_seen_at stale and then badge a live posting as withdrawn.
    await post({ action: "save_profile", profile: goals(90) });
    const second = await post({ action: "scan" });
    const stale = second.opportunities.find((item) => item.title === "Brand Project Assistant");
    assert.ok(stale.fitScore < 75, `the fixture needs this role under the floor, scored ${stale.fitScore}`);
    assert.notEqual(stale.lastSeenAt, "2020-01-01 00:00:00", "a posting the read confirmed must have its last-seen date refreshed");
    assert.equal(stale.listingLost, false, "and it must not be badged as gone from the board");
  } finally {
    globalThis.fetch = originalFetch;
    await mf.dispose();
  }
});

// Marking a listing closed is the opposite of rejecting it: the owner wanted
// that role and the employer took it down. The whole path has to carry that —
// the button's reason through the route, into the column, back out as a badge,
// and into the next scan as a lift rather than a penalty.
test("a closed listing is stored, shown back, and teaches the next scan upward", async () => {
  const { mf, db } = await createDatabase();
  const originalFetch = globalThis.fetch;
  try {
    const worker = await loadWorker();
    const env = { DB: db, ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } };
    // All four share "brand" with the saved target, so they pass the role gate
    // and reach the inbox. "experiential" is the word that recurs and appears
    // in no saved title, so it is the one thing available to learn.
    let boardTitles = ["Brand Experiential Producer", "Brand Experiential Lead", "Brand Experiential Marketing Manager", "Brand Project Manager"];
    globalThis.fetch = async () => Response.json({ jobs: boardTitles.map((title, index) => ({
      title,
      location: { name: "Oakland, CA" },
      content: "<p>Run brand programs end to end with cross-functional partners.</p>",
      absolute_url: `https://boards.greenhouse.io/example/jobs/${700 + index}`,
      updated_at: "2026-08-01T00:00:00Z",
    })) });

    const post = async (body) => {
      const response = await worker.fetch(new Request("http://localhost/api/radar", { method: "POST", headers, body: JSON.stringify(body) }), env, context);
      const data = await response.json();
      assert.equal(response.status, 200, JSON.stringify(data));
      return data;
    };

    await post({ action: "save_profile", profile: {
      titles: ["Brand Project Manager"],
      skills: ["brand programs"],
      locations: ["San Francisco Bay Area"],
      workModes: ["Hybrid"],
      goals: "Lead brand delivery.",
      exclusions: [],
      minScore: 20,
    } });
    await post({ action: "add_monitor", monitor: {
      company: "Example Studio",
      kind: "Technology",
      careersUrl: "https://boards.greenhouse.io/example",
      cadence: "daily",
    } });

    const first = await post({ action: "scan" });
    const board = (payload) => payload.opportunities.filter((item) => item.sourceUrl.startsWith("https://boards.greenhouse.io/example/"));
    const experiential = board(first).filter((item) => /Experiential/.test(item.title));
    assert.equal(experiential.length, 3, "three experiential roles to lose");
    const scoreBefore = experiential.find((item) => item.title === "Brand Experiential Producer").fitScore;
    assert.equal(first.learning.closed.ready, false, "nothing marked closed yet");

    let closed;
    for (const role of experiential) {
      closed = await post({ action: "set_opportunity_status", opportunityId: role.id, status: "dismissed", reason: "listing_closed" });
    }

    const stored = await db.prepare("SELECT COUNT(*) AS count FROM job_opportunities WHERE dismissed_reason = 'listing_closed'").first();
    assert.equal(Number(stored.count), 3, "each closed listing must persist its reason");
    // The reason comes back out, so the inbox can badge the row instead of
    // leaving the owner to remember which ones they marked.
    assert.ok(board(closed).filter((item) => item.dismissedReason === "listing_closed").length === 3);
    assert.equal(closed.learning.closed.ready, true, JSON.stringify(closed.learning.closed));
    assert.ok(closed.learning.closed.words.includes("event"), JSON.stringify(closed.learning.closed.words));
    assert.ok(closed.learning.closed.companies.includes("Example Studio"));

    // A new role of the same kind now ranks above where an identical one sat
    // before the radar learned anything.
    boardTitles = [...boardTitles, "Brand Experiential Strategist"];
    const second = await post({ action: "scan" });
    const lifted = board(second).find((item) => item.title === "Brand Experiential Strategist");
    assert.ok(lifted, "the new role should have been discovered");
    assert.ok(lifted.fitScore > scoreBefore, `learned score ${lifted.fitScore} should beat the pre-learning ${scoreBefore}`);
    assert.match(lifted.fitSummary, /roles you missed/, "the summary must say why it rose");
  } finally {
    globalThis.fetch = originalFetch;
    await mf.dispose();
  }
});

// Rows collected before the role gate existed keep the inflated score the old
// scorer gave them, and there can be thousands of them. Clearing them is a
// delete, so it has to be provably narrow: untouched rows only, never a role
// the owner has approved, dismissed, or archived.
test("clearing the inbox archives only untouched roles that match no target position", async () => {
  const { mf, db } = await createDatabase();
  try {
    const worker = await loadWorker();
    const env = { DB: db, ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } };
    const post = async (body) => {
      const response = await worker.fetch(new Request("http://localhost/api/radar", { method: "POST", headers, body: JSON.stringify(body) }), env, context);
      const data = await response.json();
      assert.equal(response.status, 200, JSON.stringify(data));
      return data;
    };

    await post({ action: "save_profile", profile: {
      titles: ["Brand Project Manager"], skills: ["brand programs"], locations: ["San Francisco Bay Area"],
      workModes: ["Hybrid"], goals: "Lead brand delivery.", exclusions: [], minScore: 45,
    } });
    const owner = await db.prepare("SELECT id FROM users LIMIT 1").first();
    assert.ok(owner?.id);

    // Exactly what the old scorer left behind: a high score and a summary that
    // could not mention a gate which did not exist yet.
    const legacy = [
      ["legacy-1", "Warehouse Associate", "new"],
      ["legacy-2", "Senior Software Engineer", "reviewing"],
      ["legacy-3", "Registered Nurse", "shortlisted"],
      ["legacy-4", "Staff Accountant", "dismissed"],
      ["legacy-5", "Brand Project Manager", "new"],
    ];
    for (const [id, title, status] of legacy) {
      await db.prepare("INSERT INTO job_opportunities (id, user_id, title, location, source_url, source_type, fit_score, fit_summary, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)")
        .bind(id, owner.id, title, "Oakland, CA", `https://boards.greenhouse.io/legacy/jobs/${id}`, "greenhouse", 64, "64% target alignment · skill overlap: brand · location: San Francisco Bay Area", status).run();
    }

    // Before the purge they are already reported as non-matching, because the
    // gate is re-derived from the title at read time rather than read out of
    // the stored summary.
    const before = await post({ action: "save_profile", profile: {
      titles: ["Brand Project Manager"], skills: ["brand programs"], locations: ["San Francisco Bay Area"],
      workModes: ["Hybrid"], goals: "Lead brand delivery.", exclusions: [], minScore: 45,
    } });
    const warehouse = before.opportunities.find((item) => item.id === "legacy-1");
    assert.equal(warehouse.fitScore, 64, "the stored score is left as it was");
    assert.equal(warehouse.offTargetRole, true);
    assert.equal(warehouse.alignmentPasses, false, "a 64 that predates the gate must not read as a match");
    assert.equal(before.opportunities.find((item) => item.id === "legacy-5").offTargetRole, false);

    const cleaned = await post({ action: "cleanup_inbox" });
    assert.equal(cleaned.result.archived, 2, "only the untouched off-target rows go");

    // Cleared out of the inbox, but still on record: the gate is only as good
    // as the titles the owner wrote down, so this has to be reversible.
    const status = new Map(cleaned.opportunities.map((item) => [item.id, item.status]));
    assert.equal(status.get("legacy-1"), "archived", "an untouched off-target role is archived");
    assert.equal(status.get("legacy-2"), "archived", "a reviewing off-target role is archived");
    assert.equal(status.get("legacy-3"), "shortlisted", "a role the owner approved is left alone");
    assert.equal(status.get("legacy-4"), "dismissed", "a dismissal is what the radar learns from and is left alone");
    assert.equal(status.get("legacy-5"), "new", "an on-target role is left alone");
    const stored = await db.prepare("SELECT COUNT(*) AS count FROM job_opportunities").first();
    assert.equal(Number(stored.count), 5, "nothing is deleted");

    // Running it again is a no-op rather than an error: the archived rows are
    // no longer candidates, so it does not keep re-archiving them.
    const again = await post({ action: "cleanup_inbox" });
    assert.equal(again.result.archived, 0);

    // And Restore brings one back to the active inbox.
    const restored = await post({ action: "set_opportunity_status", opportunityId: "legacy-1", status: "reviewing" });
    assert.equal(restored.opportunities.find((item) => item.id === "legacy-1").status, "reviewing");
  } finally {
    await mf.dispose();
  }
});

// "Saw it / applied" is a filing action, not feedback about fit.
test("an already-applied dismissal never changes what the radar looks for", async () => {
  const { mf, db } = await createDatabase();
  const originalFetch = globalThis.fetch;
  try {
    const worker = await loadWorker();
    const env = { DB: db, ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } };
    let boardTitles = ["Project Scheduling Analyst", "Project Scheduling Clerk", "Project Scheduling Assistant", "Project Scheduling Administrator"];
    globalThis.fetch = async () => Response.json({ jobs: boardTitles.map((title, index) => ({
      title,
      location: { name: "Oakland, CA" },
      content: "<p>Build and ship product across cross-functional teams.</p>",
      absolute_url: `https://boards.greenhouse.io/example/jobs/${800 + index}`,
      updated_at: "2026-08-01T00:00:00Z",
    })) });

    const post = async (body) => {
      const response = await worker.fetch(new Request("http://localhost/api/radar", { method: "POST", headers, body: JSON.stringify(body) }), env, context);
      const data = await response.json();
      assert.equal(response.status, 200, JSON.stringify(data));
      return data;
    };

    await post({ action: "save_profile", profile: {
      titles: ["Brand Project Manager"], skills: ["brand programs"], locations: ["San Francisco Bay Area"],
      workModes: ["Hybrid"], goals: "Lead brand delivery.", exclusions: [], minScore: 20,
    } });
    await post({ action: "add_monitor", monitor: {
      company: "Example Studio", kind: "Technology", careersUrl: "https://boards.greenhouse.io/example", cadence: "daily",
    } });

    const first = await post({ action: "scan" });
    const board = (payload) => payload.opportunities.filter((item) => item.sourceUrl.startsWith("https://boards.greenhouse.io/example/"));
    const engineering = board(first).filter((item) => /Scheduling/.test(item.title));
    const scoreBefore = engineering.find((item) => item.title === "Project Scheduling Analyst").fitScore;

    for (const role of engineering) {
      await post({ action: "set_opportunity_status", opportunityId: role.id, status: "dismissed", reason: "already_applied" });
    }
    const stored = await db.prepare("SELECT COUNT(*) AS count FROM job_opportunities WHERE dismissed_reason = 'already_applied'").first();
    assert.equal(Number(stored.count), 4, "the reason is still recorded");

    boardTitles = [...boardTitles, "Project Scheduling Coordinator"];
    const second = await post({ action: "scan" });
    const fresh = board(second).find((item) => item.title === "Project Scheduling Coordinator");
    assert.equal(fresh.fitScore, scoreBefore, "applying to a role must not down-rank its siblings");
    assert.ok(!/dismissed/.test(fresh.fitSummary), "no learned-penalty reason should appear");
  } finally {
    globalThis.fetch = originalFetch;
    await mf.dispose();
  }
});

// The agencies in the directory publish no careers address, so this field
// exists to hold a contact the user already has. It has to survive the route
// and come back on the monitor, and a half-typed entry must not look saved.
test("an agency contact the user supplies is stored, and a malformed one is not", async () => {
  const { mf, db } = await createDatabase();
  try {
    const worker = await loadWorker();
    const env = { DB: db, ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } };
    const post = async (body) => {
      const response = await worker.fetch(new Request("http://localhost/api/radar", { method: "POST", headers, body: JSON.stringify(body) }), env, context);
      const data = await response.json();
      assert.equal(response.status, 200, JSON.stringify(data));
      return data;
    };

    const added = await post({ action: "add_monitor", monitor: {
      company: "Duncan Channon",
      kind: "Creative / Advertising Agency",
      websiteUrl: "https://duncanchannon.com/",
      cadence: "manual",
    } });
    const monitorId = added.monitors[0].id;
    assert.equal(added.monitors[0].contactEmail, "", "a new target starts with no contact");
    assert.equal(added.monitors[0].contactNote, "");

    const saved = await post({ action: "update_monitor", monitorId, patch: {
      contactEmail: "Careers@DuncanChannon.com",
      contactNote: "Met their producer at a portfolio night",
    } });
    const withContact = saved.monitors.find((item) => item.id === monitorId);
    assert.equal(withContact.contactEmail, "careers@duncanchannon.com", "the address is normalised and kept");
    assert.equal(withContact.contactNote, "Met their producer at a portfolio night");

    // Half-typed input is cleared rather than stored, so the UI cannot show a
    // saved-looking value that would fail if the user actually mailed it.
    const rejected = await post({ action: "update_monitor", monitorId, patch: { contactEmail: "careers@" } });
    assert.equal(rejected.monitors.find((item) => item.id === monitorId).contactEmail, "", "an incomplete address is not stored");

    // Clearing the note must not disturb the address, and vice versa.
    const noteOnly = await post({ action: "update_monitor", monitorId, patch: { contactEmail: "jobs@duncanchannon.com" } });
    assert.equal(noteOnly.monitors.find((item) => item.id === monitorId).contactNote, "Met their producer at a portfolio night", "editing one field must leave the other alone");

    // A contact survives a scan, which rewrites the monitor's query blob.
    const rescanned = await post({ action: "scan", monitorId });
    assert.equal(rescanned.monitors.find((item) => item.id === monitorId).contactEmail, "jobs@duncanchannon.com", "a scan must not wipe the stored contact");
  } finally {
    await mf.dispose();
  }
});
