import assert from "node:assert/strict";
import test from "node:test";

const developmentPreviewMeta =
  /<meta(?=[^>]*\bname=["']codex-preview["'])(?=[^>]*\bcontent=["']development["'])[^>]*>/i;

async function renderHome() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}-${Math.random()}`);
  const { default: worker } = await import(workerUrl.href);
  const response = await worker.fetch(
    new Request("http://localhost/", { headers: { accept: "text/html" } }),
    { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } },
    { waitUntil() {}, passThroughOnException() {} },
  );
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);
  return await response.text();
}

test("renders development preview metadata", async () => {
  const html = await renderHome();
  assert.match(html, developmentPreviewMeta);
  assert.match(html, /V(?:&#x27;|&apos;|')s/);
});

// AccessGate decides what to show (login form vs. the app) client-side, after
// checking for the access-token cookie in a useEffect — document.cookie does
// not exist during server rendering. So the very first HTML any request gets,
// authenticated or not, is only the gate's placeholder shell: no nav item
// labels, no view copy, nothing about what the private app contains.
//
// This used to be the opposite on purpose: the full JobSeekerApp — every nav
// label, "VERIFIED LOCAL RECOMMENDATION", all of it — rendered into the HTML
// of a plain, unauthenticated GET /. The token gated the *data* underneath,
// not the structure of the app itself, so anyone with the bare URL and no
// token learned the entire feature set on the first request. That is the
// leak this test now guards against, not a should-have-been-caught
// regression.
test("an unauthenticated request never receives the private app's structure", async () => {
  const html = await renderHome();
  for (const leak of ["AI & reliability", "AI &amp; reliability", "Knowledge sources", "Job radar", "Open job search", "Connections", "VERIFIED LOCAL RECOMMENDATION", "Autofill assistant", "Target directory"]) {
    assert.doesNotMatch(html, new RegExp(leak.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")), `"${leak}" must not appear before the access gate approves a request`);
  }
});
