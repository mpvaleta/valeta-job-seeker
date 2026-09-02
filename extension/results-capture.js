/*
 * Reading the result list on a job-search page the user is already looking at.
 *
 * This is its own module because two companions need it: the Chrome extension,
 * which loads it before content.js, and the bookmarklet, which embeds it
 * verbatim the way it already embeds the field-mapping rules. The iPhone has no
 * extension and no developer mode, so without this the phone had no way to file
 * a role at all — and a second, drifting copy of these selectors would have been
 * worse than none.
 *
 * The posture is the same on both: nothing is fetched, nothing is crawled, no
 * page is opened that the user did not open. It reads the rendered DOM of the
 * tab in front of them.
 */
(function (root) {
  const clean = (value) => (value || "").replace(/\s+/g, " ").trim();

  function captureLinkedIn(rows) {
    // LinkedIn renames its list classes often, so the anchor's href is the
    // anchor of this extraction, not any one class name: every result links to
    // /jobs/view/<id>, and that link sits inside the card.
    for (const link of document.querySelectorAll('a[href*="/jobs/view/"]')) {
      const id = (link.getAttribute("href") || "").match(/\/jobs\/view\/(\d+)/);
      if (!id) continue;
      const card = link.closest("li, .job-card-container, [data-job-id]") || link.parentElement;
      const title = clean(link.getAttribute("aria-label")) || clean(link.innerText).split("\n")[0];
      if (!title) continue;
      const cardText = clean(card?.innerText || "");
      const subtitle = card?.querySelector(".job-card-container__primary-description, .artdeco-entity-lockup__subtitle, .job-card-container__company-name");
      const meta = card?.querySelector(".job-card-container__metadata-item, .artdeco-entity-lockup__caption, .job-card-container__metadata-wrapper");
      rows.push({
        title,
        company: clean(subtitle?.innerText),
        location: clean(meta?.innerText),
        url: `https://www.linkedin.com/jobs/view/${id[1]}/`,
        description: cardText.slice(0, 600),
      });
    }
  }

  function captureIndeed(rows) {
    for (const card of document.querySelectorAll(".job_seen_beacon, [data-testid='slider_item']")) {
      const link = card.querySelector("a[id^='job_'], a[data-jk], h2 a");
      const key = link?.getAttribute("data-jk") || (link?.getAttribute("id") || "").replace(/^job_/, "");
      const title = clean(card.querySelector("h2")?.innerText);
      if (!title || !key) continue;
      rows.push({
        title,
        company: clean(card.querySelector("[data-testid='company-name']")?.innerText),
        location: clean(card.querySelector("[data-testid='text-location']")?.innerText),
        url: `https://www.indeed.com/viewjob?jk=${encodeURIComponent(key)}`,
        description: clean(card.innerText).slice(0, 600),
      });
    }
  }

  function captureAnyBoard(rows) {
    // Every link that looks like a job-details page, deduped by URL further
    // down. Weaker than a purpose-built extractor, but it means a board nobody
    // anticipated still produces something usable.
    for (const link of document.querySelectorAll('a[href*="/job"], a[href*="/jobs/"], a[href*="/careers/"]')) {
      const href = link.href;
      if (!/^https?:/i.test(href) || !/\d|\/jobs?\/[a-z0-9-]{8,}/i.test(href)) continue;
      const title = clean(link.innerText).split("\n")[0];
      if (!title || title.length < 6) continue;
      rows.push({ title, company: "", location: "", url: href, description: "" });
    }
  }

  function captureVisibleList() {
    const host = location.hostname.toLowerCase();
    const rows = [];
    if (host.includes("linkedin.com")) captureLinkedIn(rows);
    else if (host.includes("indeed.")) captureIndeed(rows);
    else captureAnyBoard(rows);
    return {
      schema: "v-jobs-list-capture-v1",
      sourceUrl: location.href,
      pageTitle: document.title,
      // Which board this came from, so the app can record honest provenance
      // rather than filing every capture as a LinkedIn one.
      source: host.includes("linkedin.com") ? "linkedin" : host.includes("indeed.") ? "indeed" : "other",
      capturedAt: new Date().toISOString(),
      rows: root.VJobsAutofill.normalizeCapturedRows(rows),
    };
  }

  root.VJobsCapture = { captureVisibleList };
})(typeof globalThis === "undefined" ? this : globalThis);
