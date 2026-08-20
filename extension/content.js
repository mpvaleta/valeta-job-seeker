const { RULES: rules, decideField } = globalThis.VJobsAutofill;

function platformName() {
  const host = location.hostname.toLowerCase();
  if (host.includes("greenhouse")) return "Greenhouse";
  if (host.includes("lever.co")) return "Lever";
  if (host.includes("myworkdayjobs") || host.includes("workday")) return "Workday";
  if (host.includes("ashbyhq")) return "Ashby";
  if (host.includes("icims")) return "iCIMS";
  if (host.includes("smartrecruiters")) return "SmartRecruiters";
  return "Application page";
}

// The field's own labelling. Only this may trigger a fill.
function strongLabel(field) {
  const ownLabels = field.labels ? [...field.labels].map((label) => label.innerText) : [];
  return [field.name, field.id, field.placeholder, field.getAttribute("aria-label"), ...ownLabels]
    .filter(Boolean).join(" ").replace(/\s+/g, " ").trim().slice(0, 300);
}

// Ambient context: a section heading referenced by aria-labelledby, or an
// enclosing label block. On ATS forms one of these routinely covers several
// inputs, so it informs review but never a fill.
function weakLabel(field) {
  const labelledBy = (field.getAttribute("aria-labelledby") || "")
    .split(/\s+/).map((id) => document.getElementById(id)?.innerText || "").filter(Boolean);
  const enclosing = field.closest("label")?.innerText?.slice(0, 180) || "";
  const fieldset = field.closest("fieldset")?.querySelector("legend")?.innerText || "";
  return [...labelledBy, enclosing, fieldset].filter(Boolean).join(" ").replace(/\s+/g, " ").trim().slice(0, 300);
}

/*
 * Whether the page already carries an answer.
 *
 * Reading `field.value` for this was wrong for two whole control families: an
 * unchecked checkbox still reports "on", and an untouched dropdown reports its
 * placeholder option. Both were therefore classified as already answered and
 * dropped from the preview, so the fields most likely to need attention were
 * the ones the user never saw.
 */
function isAnswered(field) {
  const type = (field.getAttribute("type") || "").toLowerCase();
  if (type === "checkbox" || type === "radio") return field.checked;
  if (field.tagName === "SELECT") {
    const option = field.selectedOptions?.[0];
    if (!option) return false;
    const text = `${option.value} ${option.textContent || ""}`.trim();
    // Placeholder rows carry no answer: "", "Select...", "-- Choose --".
    return Boolean(text) && !/^[\s-]*$/.test(text) && !/^(?:--|\u2014)?\s*(?:please\s+)?(?:select|choose|pick|none)\b/i.test(text.trim());
  }
  if (type === "file") return Boolean(field.files?.length);
  return Boolean(field.value);
}

function shortLabel(value, fallback) {
  const cleaned = value.replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim();
  return (cleaned || fallback).slice(0, 100);
}

function candidateFields() {
  return [...document.querySelectorAll("input:not([type=hidden]):not([type=submit]):not([type=button]), textarea, select")]
    .filter((field) => !field.disabled && !field.readOnly);
}

function clearMarks() {
  document.querySelectorAll("[data-valeta-state]").forEach((field) => {
    field.style.outline = "";
    delete field.dataset.valetaState;
    delete field.dataset.valetaReview;
    delete field.dataset.valetaFilled;
    delete field.dataset.valetaRule;
    delete field.dataset.valetaIndex;
  });
}

// The exact field set + decision the user reviewed in their last explicit
// Scan, kept as live element references (not indexes or a selector string) so
// a field that gets removed or replaced is detected as gone rather than
// silently matched to whatever now sits at the same position. Fill reads
// ONLY from this -- see the comment on fill() for why.
let lastScan = null;

function decideCandidate(field, data) {
  return decideField({
    strong: strongLabel(field),
    weak: weakLabel(field),
    type: (field.getAttribute("type") || field.tagName).toLowerCase(),
    tag: field.tagName,
    answered: isAnswered(field),
  }, data);
}

function scan(data, mark = true) {
  clearMarks();
  const fields = [];
  const counts = { fillable: 0, review: 0, unknown: 0, existing: 0 };
  const marked = new Map();

  candidateFields().forEach((field, index) => {
    const strong = strongLabel(field);
    const weak = weakLabel(field);
    const fallback = field.name || field.id || `${field.tagName.toLowerCase()} ${index + 1}`;
    const decision = decideCandidate(field, data);

    counts[decision.status] = (counts[decision.status] || 0) + 1;
    field.dataset.valetaIndex = String(index);
    field.dataset.valetaState = decision.status;
    if (decision.ruleKey) field.dataset.valetaRule = decision.ruleKey;
    if (mark && decision.status === "fillable") field.style.outline = "3px dashed #3155ff";
    if (mark && decision.status === "review") {
      field.style.outline = "3px solid #ff9e36";
      field.dataset.valetaReview = decision.reason;
    }
    marked.set(field, { status: decision.status, ruleKey: decision.ruleKey, label: shortLabel(strong || weak, fallback), reason: decision.reason, confidence: decision.confidence });
    // Everything the user still has to deal with is reported, including the
    // dropdowns and checkboxes an earlier build hid as "already answered".
    if (decision.status !== "existing") {
      fields.push({ index, label: shortLabel(strong || weak, fallback), status: decision.status, reason: decision.reason, ruleKey: decision.ruleKey, confidence: decision.confidence });
    }
  });

  if (mark) lastScan = marked;

  const reported = fields.slice(0, 60);
  return {
    platform: platformName(),
    title: document.title,
    fillable: counts.fillable,
    review: counts.review,
    unknown: counts.unknown,
    existing: counts.existing,
    fields: reported,
    // Say so rather than letting a truncated list read as the whole form.
    hiddenFieldCount: fields.length - reported.length,
    appearedSinceScan: 0,
  };
}

function setFieldValue(field, value) {
  const prototype = field instanceof HTMLTextAreaElement
    ? HTMLTextAreaElement.prototype
    : field instanceof HTMLSelectElement
      ? HTMLSelectElement.prototype
      : HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(prototype, "value")?.set;
  if (setter) setter.call(field, value); else field.value = value;
  field.dispatchEvent(new Event("input", { bubbles: true }));
  field.dispatchEvent(new Event("change", { bubbles: true }));
  field.dispatchEvent(new Event("blur", { bubbles: true }));
}

/*
 * Fills ONLY the fields the user actually previewed in their last explicit
 * Scan -- it never re-scans the live page first.
 *
 * The old version called scan() again right before filling, so "preview"
 * and "act" were only ever consistent with EACH OTHER inside that one call,
 * never with what the user saw in the popup after clicking Scan. A
 * multi-step ATS form advancing, or a page adding an "Add another employer"
 * section, between the Scan click and the Fill click meant the fill could
 * silently write into fields the user never reviewed -- exactly what the
 * preview-first design exists to prevent.
 */
function fill(data) {
  if (!lastScan) {
    return { platform: platformName(), title: document.title, fillable: 0, review: 0, unknown: 0, existing: 0, fields: [], hiddenFieldCount: 0, appearedSinceScan: 0, filled: 0, staleScan: true };
  }

  const currentFields = candidateFields();
  const currentFieldSet = new Set(currentFields);
  let filled = 0;

  lastScan.forEach((entry, field) => {
    if (entry.status !== "fillable") return;
    if (!currentFieldSet.has(field) || !document.contains(field)) return;
    // Reuse the rule the reviewed scan settled on, so the preview the user
    // approved and the value actually written can never come from a
    // different rule than what was shown.
    const rule = rules.find((item) => item.key === entry.ruleKey);
    const value = rule?.read(data);
    if (!value) return;
    setFieldValue(field, value);
    field.style.outline = "3px solid #3155ff";
    field.dataset.valetaFilled = "true";
    field.dataset.valetaState = "filled";
    entry.status = "filled";
    filled += 1;
  });

  // Anything fillable- or review-looking now that the reviewed scan never
  // saw is reported, never filled sight-unseen -- the user rescans to bring
  // it into a reviewed preview first.
  let appearedSinceScan = 0;
  currentFields.forEach((field) => {
    if (lastScan.has(field)) return;
    const decision = decideCandidate(field, data);
    if (decision.status === "fillable" || decision.status === "review") appearedSinceScan += 1;
  });

  const counts = { fillable: 0, review: 0, unknown: 0, existing: 0, filled: 0 };
  const fields = [];
  lastScan.forEach((entry) => {
    counts[entry.status] = (counts[entry.status] || 0) + 1;
    if (entry.status !== "existing") fields.push({ label: entry.label, status: entry.status, reason: entry.reason, ruleKey: entry.ruleKey, confidence: entry.confidence });
  });
  const reported = fields.slice(0, 60);

  return {
    platform: platformName(),
    title: document.title,
    fillable: counts.fillable,
    review: counts.review,
    unknown: counts.unknown,
    existing: counts.existing,
    fields: reported,
    hiddenFieldCount: fields.length - reported.length,
    appearedSinceScan,
    filled,
  };
}

function captureVisibleRole() {
  const firstText = (...selectors) => {
    for (const selector of selectors) {
      const value = document.querySelector(selector)?.innerText?.replace(/\s+/g, " ").trim();
      if (value) return value;
    }
    return "";
  };
  const host = location.hostname.toLowerCase();
  const selectors = host.includes("linkedin.com")
    ? {
        role: [".job-details-jobs-unified-top-card__job-title h1", ".job-details-jobs-unified-top-card__job-title", ".top-card-layout__title", "h1"],
        company: [".job-details-jobs-unified-top-card__company-name a", ".job-details-jobs-unified-top-card__company-name", ".topcard__org-name-link"],
        location: [".job-details-jobs-unified-top-card__primary-description-container", ".topcard__flavor--bullet"],
        description: [".jobs-description__content", ".jobs-box__html-content", ".description__text"],
      }
    : host.includes("indeed.")
      ? {
          role: ['h1[data-testid="jobsearch-JobInfoHeader-title"]', "h1"],
          company: ['[data-testid="inlineHeader-companyName"]', '[data-company-name="true"]'],
          location: ['[data-testid="job-location"]', '[data-testid="jobsearch-JobInfoHeader-companyLocation"]'],
          description: ["#jobDescriptionText", '[data-testid="jobDescriptionText"]'],
        }
      : host.includes("workday")
        ? {
            role: ['[data-automation-id="jobPostingHeader"]', "h1"],
            company: ['[data-automation-id="jobPostingCompany"]'],
            location: ['[data-automation-id="locations"]'],
            description: ['[data-automation-id="jobPostingDescription"]'],
          }
        : host.includes("greenhouse")
          ? { role: [".app-title", "h1"], company: [".company-name"], location: [".location"], description: ["#content", ".job__description"] }
          : host.includes("lever.co")
            ? { role: [".posting-headline h2", "h1"], company: [".main-header-logo img"], location: [".posting-categories .location"], description: [".posting-page .content", ".posting-description"] }
            : host.includes("ashbyhq")
              ? { role: ['[data-testid="JobPostingHeader"] h1', "h1"], company: ['[data-testid="CompanyName"]'], location: ['[data-testid="JobPostingLocation"]'], description: ['[data-testid="JobPostingDescription"]', "main"] }
              : host.includes("icims")
                ? { role: [".iCIMS_Header h1", "h1"], company: [".iCIMS_CompanyName"], location: [".iCIMS_JobHeaderField"], description: [".iCIMS_JobContent"] }
                : host.includes("smartrecruiters")
                  ? { role: [".job-title", "h1"], company: [".company-name"], location: [".job-location"], description: [".job-sections"] }
                  : { role: ["h1"], company: ['[itemprop="hiringOrganization"]', '[class*="company"]'], location: ['[itemprop="jobLocation"]', '[class*="location"]'], description: ['[itemprop="description"]', "main", "article"] };
  const headings = [...document.querySelectorAll("h1, h2")].map((element) => element.innerText.trim()).filter(Boolean);
  const metaTitle = document.querySelector('meta[property="og:title"], meta[name="twitter:title"]')?.getAttribute("content") || "";
  const description = document.querySelector('meta[property="og:description"], meta[name="description"]')?.getAttribute("content") || "";
  const role = firstText(...selectors.role);
  const companyElement = selectors.company.map((selector) => document.querySelector(selector)).find(Boolean);
  const company = companyElement instanceof HTMLImageElement ? companyElement.alt.trim() : companyElement?.innerText?.replace(/\s+/g, " ").trim() || "";
  const locationText = firstText(...selectors.location);
  const jobDescription = firstText(...selectors.description);
  const text = (jobDescription || document.querySelector("main, [role=main], article")?.innerText || document.body.innerText || "").replace(/\s+/g, " ").trim().slice(0, 120_000);
  return {
    schema: "v-jobs-role-capture-v1",
    sourceUrl: location.href,
    pageTitle: document.title,
    title: role || headings[0] || metaTitle || "",
    role: role || headings[0] || "",
    company,
    location: locationText,
    description,
    text,
    capturedAt: new Date().toISOString(),
  };
}

/**
 * Read the result list on a job-search page the user is already looking at.
 *
 * This is the same posture as captureVisibleRole, widened from one job to the
 * list: nothing is fetched, nothing is crawled, no page is opened that the
 * user did not open. It reads the rendered DOM of the tab in front of them and
 * hands back the rows, so filing twenty-five roles costs one click instead of
 * twenty-five round trips through the clipboard.
 */
function captureVisibleList() {
  const host = location.hostname.toLowerCase();
  const clean = (value) => (value || "").replace(/\s+/g, " ").trim();
  const rows = [];

  if (host.includes("linkedin.com")) {
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
  } else if (host.includes("indeed.")) {
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
  } else {
    // Any other board: every link that looks like a job-details page, deduped
    // by URL. Weaker than a purpose-built extractor, but it means a board
    // nobody anticipated still produces something usable.
    for (const link of document.querySelectorAll('a[href*="/job"], a[href*="/jobs/"], a[href*="/careers/"]')) {
      const href = link.href;
      if (!/^https?:/i.test(href) || !/\d|\/jobs?\/[a-z0-9-]{8,}/i.test(href)) continue;
      const title = clean(link.innerText).split("\n")[0];
      if (!title || title.length < 6) continue;
      rows.push({ title, company: "", location: "", url: href, description: "" });
    }
  }

  return {
    schema: "v-jobs-list-capture-v1",
    sourceUrl: location.href,
    pageTitle: document.title,
    capturedAt: new Date().toISOString(),
    rows: VJobsAutofill.normalizeCapturedRows(rows),
  };
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === "VALETA_SCAN") sendResponse(scan(message.payload, true));
  if (message.type === "VALETA_FILL") sendResponse(fill(message.payload));
  if (message.type === "VJOBS_CAPTURE_ROLE") sendResponse(captureVisibleRole());
  if (message.type === "VJOBS_CAPTURE_LIST") sendResponse(captureVisibleList());
});
