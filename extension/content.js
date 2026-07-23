const sensitive = /salary|compensation|pay expectation|authorization|sponsor|visa|gender|pronoun|race|ethnicity|veteran|disability|criminal|legal|ssn|social security|birth|age|marital|citizen/i;

const rules = [
  { key: "firstName", match: /first.?name|given.?name/i, get: (data) => data.profile.fullName?.trim().split(/\s+/)[0] },
  { key: "lastName", match: /last.?name|family.?name|surname/i, get: (data) => data.profile.fullName?.trim().split(/\s+/).slice(1).join(" ") },
  { key: "fullName", match: /full.?name|your.?name|candidate.?name/i, get: (data) => data.profile.fullName },
  { key: "email", match: /e.?mail/i, get: (data) => data.profile.email },
  { key: "phone", match: /phone|mobile|telephone/i, get: (data) => data.profile.phone },
  { key: "location", match: /city|location|street.?address|address.?line/i, get: (data) => data.profile.location },
  { key: "linkedin", match: /linkedin/i, get: (data) => data.profile.linkedin },
  { key: "headline", match: /headline|professional.?title/i, get: (data) => data.answers.headline },
  { key: "summary", match: /about.?you|summary|background|tell.?us.?about|professional.?profile/i, get: (data) => data.answers.summary },
  { key: "interest", match: /why.*(role|position|company)|interest.*(role|position|company)/i, get: (data) => data.answers.interest },
];

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

function descriptor(field) {
  const labels = field.labels ? [...field.labels].map((label) => label.innerText) : [];
  const directLabel = field.closest("label")?.innerText?.slice(0, 180) || "";
  const labelledBy = (field.getAttribute("aria-labelledby") || "")
    .split(/\s+/)
    .map((id) => document.getElementById(id)?.innerText || "")
    .filter(Boolean);
  return [field.name, field.id, field.placeholder, field.getAttribute("aria-label"), ...labels, ...labelledBy, directLabel]
    .filter(Boolean)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}

function shortLabel(value, fallback) {
  const cleaned = value.replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim();
  return (cleaned || fallback).slice(0, 100);
}

function candidateFields() {
  return [...document.querySelectorAll("input:not([type=hidden]):not([type=submit]):not([type=button]), textarea, select")];
}

function clearMarks() {
  document.querySelectorAll("[data-valeta-state]").forEach((field) => {
    field.style.outline = "";
    delete field.dataset.valetaState;
    delete field.dataset.valetaReview;
    delete field.dataset.valetaFilled;
  });
}

function scan(data, mark = true) {
  clearMarks();
  const fields = [];
  let fillable = 0;
  let review = 0;
  let unknown = 0;

  candidateFields().forEach((field, index) => {
    const label = descriptor(field);
    const fallback = field.name || field.id || `${field.tagName.toLowerCase()} ${index + 1}`;
    const type = (field.getAttribute("type") || field.tagName).toLowerCase();
    let status = "unknown";
    let reason = "No approved mapping";
    let ruleKey = null;

    if (type === "file") {
      status = "review";
      reason = "Upload résumé manually";
    } else if (type === "number") {
      status = "review";
      reason = "Numeric field — confirm its meaning and value";
    } else if (sensitive.test(label)) {
      status = "review";
      reason = "Sensitive answer — complete personally";
    } else if (field.tagName === "SELECT") {
      status = "review";
      reason = "Dropdown — confirm the exact option";
    } else {
      const rule = rules.find((item) => item.match.test(label));
      const value = rule?.get(data);
      if (rule && value && !field.value) {
        status = "fillable";
        reason = "Approved profile match";
        ruleKey = rule.key;
      } else if (field.value) {
        status = "existing";
        reason = "Already has a value";
      }
    }

    if (status === "fillable") fillable += 1;
    else if (status === "review") review += 1;
    else if (status === "unknown") unknown += 1;

    field.dataset.valetaIndex = String(index);
    field.dataset.valetaState = status;
    if (mark && status === "fillable") field.style.outline = "3px dashed #3155ff";
    if (mark && status === "review") {
      field.style.outline = "3px solid #ff9e36";
      field.dataset.valetaReview = reason;
    }
    if (status !== "existing") fields.push({ index, label: shortLabel(label, fallback), status, reason, ruleKey });
  });

  return { platform: platformName(), title: document.title, fillable, review, unknown, fields: fields.slice(0, 30) };
}

function setFieldValue(field, value) {
  const prototype = field instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(prototype, "value")?.set;
  if (setter) setter.call(field, value); else field.value = value;
  field.dispatchEvent(new Event("input", { bubbles: true }));
  field.dispatchEvent(new Event("change", { bubbles: true }));
  field.dispatchEvent(new Event("blur", { bubbles: true }));
}

function fill(data) {
  const before = scan(data, true);
  let filled = 0;
  candidateFields().forEach((field) => {
    if (field.dataset.valetaState !== "fillable") return;
    const label = descriptor(field);
    const rule = rules.find((item) => item.match.test(label));
    const value = rule?.get(data);
    if (!value) return;
    setFieldValue(field, value);
    field.style.outline = "3px solid #3155ff";
    field.dataset.valetaFilled = "true";
    field.dataset.valetaState = "filled";
    filled += 1;
  });
  return { ...before, filled };
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

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === "VALETA_SCAN") sendResponse(scan(message.payload, true));
  if (message.type === "VALETA_FILL") sendResponse(fill(message.payload));
  if (message.type === "VJOBS_CAPTURE_ROLE") sendResponse(captureVisibleRole());
});
