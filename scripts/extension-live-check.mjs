// Live check of the browser companion's capture paths against Adobe's two
// hiring surfaces: the Workday tenant (adobe.wd5.myworkdayjobs.com) and the
// Phenom careers site (careers.adobe.com). It loads the real pages in
// Chromium, injects the actual extension files with a stubbed chrome.runtime,
// invokes the same message handlers the popup sends, and prints the captures
// as JSON so a human can judge whether the extractors still match the DOM.
//
// This is a manual tool, not part of `npm test`: it needs the network, and it
// needs Playwright with a Chromium — neither is a project dependency.
//   npm install --no-save playwright && npx playwright install chromium
//   node scripts/extension-live-check.mjs
// CHROMIUM_PATH overrides the browser binary. When HTTPS_PROXY is set (as in
// a proxied sandbox), page requests are fulfilled through Node's HTTP stack,
// because some TLS-terminating proxies reject Chromium's ClientHello.
import { readFile } from "node:fs/promises";

let chromium;
try {
  ({ chromium } = await import("playwright"));
} catch {
  console.error("Playwright is not installed. Run: npm install --no-save playwright && npx playwright install chromium");
  process.exit(69);
}

const extensionDir = new URL("../extension/", import.meta.url);
const mapping = await readFile(new URL("autofill-mapping.js", extensionDir), "utf8");
const content = await readFile(new URL("content.js", extensionDir), "utf8");

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || undefined,
  args: ["--no-sandbox"],
  proxy: process.env.HTTPS_PROXY ? { server: process.env.HTTPS_PROXY } : undefined,
});
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });

if (process.env.HTTPS_PROXY) {
  await ctx.route("**/*", async (route) => {
    try {
      const isNavigation = route.request().isNavigationRequest();
      const response = await ctx.request.fetch(route.request(), { maxRedirects: isNavigation ? 0 : 20, timeout: 45000 });
      await route.fulfill({ response });
    } catch {
      await route.abort("failed").catch(() => {});
    }
  });
}

// The content script is injected exactly as Chrome would run it, except that
// chrome.runtime is stubbed so the checks can call its message listener.
async function injectExtension(page) {
  await page.evaluate(() => {
    window.__valetaListener = null;
    window.chrome = window.chrome || {};
    window.chrome.runtime = window.chrome.runtime || {};
    window.chrome.runtime.onMessage = { addListener(fn) { window.__valetaListener = fn; } };
  });
  await page.addScriptTag({ content: mapping });
  await page.addScriptTag({ content: content });
}

async function send(page, type) {
  return page.evaluate((messageType) => {
    let result = null;
    window.__valetaListener({ type: messageType }, null, (response) => { result = response; });
    return result;
  }, type);
}

const trimmed = (capture) => capture && {
  ...capture,
  text: capture.text ? `${capture.text.slice(0, 200)}… (${capture.text.length} chars)` : capture.text,
  description: capture.description?.slice(0, 200),
  rows: capture.rows?.slice(0, 5),
  rowCount: capture.rows?.length,
};

const report = {};
const page = await ctx.newPage();

await page.goto("https://adobe.wd5.myworkdayjobs.com/en-US/external_experienced", { waitUntil: "domcontentloaded", timeout: 60000 });
await page.waitForSelector('a[data-automation-id="jobTitle"]', { timeout: 30000 }).catch(() => {});
await injectExtension(page);
report.workdayList = trimmed(await send(page, "VJOBS_CAPTURE_LIST"));

const jobLink = await page.evaluate(() => document.querySelector('a[data-automation-id="jobTitle"]')?.href || null);
if (jobLink) {
  await page.goto(jobLink, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForSelector('[data-automation-id="jobPostingHeader"]', { timeout: 30000 }).catch(() => {});
  await injectExtension(page);
  report.workdayDetail = trimmed(await send(page, "VJOBS_CAPTURE_ROLE"));
}

await page.goto("https://careers.adobe.com/us/en/search-results", { waitUntil: "domcontentloaded", timeout: 60000 });
await page.waitForSelector('a[data-ph-at-id="job-link"]', { timeout: 30000 }).catch(() => {});
await injectExtension(page);
report.phenomList = trimmed(await send(page, "VJOBS_CAPTURE_LIST"));

const phenomLink = await page.evaluate(() => document.querySelector('a[data-ph-at-id="job-link"]')?.href || null);
if (phenomLink) {
  await page.goto(phenomLink, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForTimeout(5000);
  await injectExtension(page);
  report.phenomDetail = trimmed(await send(page, "VJOBS_CAPTURE_ROLE"));
}

console.log(JSON.stringify(report, null, 2));
await browser.close();

// What good output looks like: workdayList has ~20 rows with company "Adobe"
// and a location on each, source "workday"; workdayDetail names the role,
// "Adobe", a clean location, and a several-thousand-character text;
// phenomList rows carry locations; phenomDetail gets "Adobe" from the page's
// schema.org JobPosting block. Empty captures mean the board's markup moved.
