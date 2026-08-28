import { validatePublicUrl } from "./public-link-reader.mjs";

const ATS_DOMAINS = [
  "job-boards.greenhouse.io",
  "boards.greenhouse.io",
  "jobs.lever.co",
  "jobs.ashbyhq.com",
  "myworkdayjobs.com",
  "smartrecruiters.com",
  "apply.workable.com",
  "recruitee.com",
  "jobs.apple.com",
  "google.com",
  "metacareers.com",
];
const SECONDARY_JOB_DOMAINS = [
  "linkedin.com",
  "indeed.com",
  "builtin.com",
  "ziprecruiter.com",
  "simplyhired.com",
  "mediabistro.com",
];
const MAX_SOURCES = 12;

export async function searchCompanyJobSources(target = {}, options = {}) {
  const fetchImpl = options.fetchImpl || fetch;
  const openAiKey = String(options.openAiKey || "").trim();
  const geminiKey = String(options.geminiKey || "").trim();
  if (!openAiKey && !geminiKey) {
    return { sources: [], provider: "none", status: "unavailable", message: "Connect OpenAI or Gemini to enable company-name public-web recovery." };
  }
  const errors = [];
  if (openAiKey) {
    try {
      const sources = await searchWithOpenAI(target, openAiKey, fetchImpl);
      if (sources.length) return { sources, provider: "openai", status: "completed", message: `${sources.length} public source ${sources.length === 1 ? "was" : "were"} returned for validation.` };
      errors.push("OpenAI web search returned no direct job sources.");
    } catch (cause) {
      errors.push(`OpenAI: ${safeProviderMessage(cause)}`);
    }
  }
  if (geminiKey) {
    try {
      const sources = await searchWithGemini(target, geminiKey, fetchImpl);
      if (sources.length) return { sources, provider: "google", status: "completed", message: `${sources.length} Google-grounded source ${sources.length === 1 ? "was" : "were"} returned for validation.` };
      errors.push("Gemini Google Search returned no direct job sources.");
    } catch (cause) {
      errors.push(`Gemini: ${safeProviderMessage(cause)}`);
    }
  }
  return { sources: [], provider: openAiKey ? "openai" : "google", status: "failed", message: errors.join(" · ").slice(0, 420) };
}

async function searchWithOpenAI(target, apiKey, fetchImpl) {
  const allowedDomains = searchDomains(target);
  const response = await boundedFetch("https://api.openai.com/v1/responses", fetchImpl, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: "gpt-5.6",
      store: false,
      reasoning: { effort: "low" },
      tools: [{ type: "web_search", filters: { allowed_domains: allowedDomains } }],
      tool_choice: "required",
      include: ["web_search_call.action.sources"],
      max_output_tokens: 1_600,
      input: searchPrompt(target),
    }),
  });
  const payload = await readProviderJson(response, "OpenAI web search");
  return normalizeSources(openAiSources(payload), allowedDomains);
}

async function searchWithGemini(target, apiKey, fetchImpl) {
  const model = "gemini-3.5-flash";
  const response = await boundedFetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, fetchImpl, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
    body: JSON.stringify({
      contents: [{ role: "user", parts: [{ text: `${searchPrompt(target)}\nReturn the direct URLs in the answer.` }] }],
      tools: [{ google_search: {} }],
      generationConfig: { temperature: 0, maxOutputTokens: 1_600 },
    }),
  });
  const payload = await readProviderJson(response, "Gemini Google Search");
  const text = (payload?.candidates?.[0]?.content?.parts || []).map((part) => part?.text || "").join("\n");
  const chunks = payload?.candidates?.[0]?.groundingMetadata?.groundingChunks || [];
  const sources = [
    ...chunks.map((chunk) => ({ url: chunk?.web?.uri, title: chunk?.web?.title })),
    ...urlsFromText(text).map((url) => ({ url, title: "" })),
  ];
  return normalizeSources(sources, searchDomains(target));
}

function searchPrompt(target) {
  const company = clean(target?.company || target?.name, 180);
  const focus = clean(target?.focus, 700) || "creative operations, project management, marketing production, program management, or sports marketing";
  const locations = clean(target?.locations || "San Francisco Bay Area, California, remote United States, or United States", 500);
  return `Search the live public web for current job-detail pages at ${company} matching: ${focus}. Prioritize ${locations}. Search the official company careers domain and the employer's verified Greenhouse, Lever, Ashby, Workday, SmartRecruiters, Workable, Recruitee, Apple Jobs, Google Careers, or Meta Careers pages first. If the official search page blocks indexing, use a direct LinkedIn Jobs, Indeed, Built In, ZipRecruiter, SimplyHired, or Mediabistro job-detail page as a clearly secondary discovery lead. Return direct current job-detail URLs only. Exclude job-search pages, company profiles, category pages, “learn more,” “working here,” benefits, culture, talent-community, expired, and generic careers pages.`;
}

function searchDomains(target) {
  const hosts = [target?.websiteUrl, target?.website, target?.careersUrl, target?.careers]
    .map((value) => host(value))
    .filter(Boolean);
  return [...new Set([...hosts, ...ATS_DOMAINS, ...SECONDARY_JOB_DOMAINS])].slice(0, 40);
}

function openAiSources(payload) {
  const sources = [];
  for (const item of Array.isArray(payload?.output) ? payload.output : []) {
    for (const source of Array.isArray(item?.action?.sources) ? item.action.sources : []) {
      sources.push({ url: source?.url, title: source?.title });
    }
    for (const content of Array.isArray(item?.content) ? item.content : []) {
      for (const annotation of Array.isArray(content?.annotations) ? content.annotations : []) {
        sources.push({ url: annotation?.url || annotation?.url_citation?.url, title: annotation?.title || annotation?.url_citation?.title });
      }
    }
  }
  return sources;
}

function normalizeSources(sources, allowedDomains) {
  const allowed = new Set(allowedDomains.map((domain) => domain.replace(/^www\./, "").toLowerCase()));
  const seen = new Set();
  const normalized = [];
  for (const source of sources) {
    let url;
    try { url = validatePublicUrl(source?.url).href; } catch { continue; }
    const hostname = new URL(url).hostname.toLowerCase().replace(/^www\./, "");
    if (![...allowed].some((domain) => hostname === domain || hostname.endsWith(`.${domain}`))) continue;
    const key = url.replace(/[?#].*$/, "").replace(/\/$/, "").toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    normalized.push({ url, title: normalizeJobTitle(source?.title) });
    if (normalized.length >= MAX_SOURCES) break;
  }
  return normalized;
}

function normalizeJobTitle(value) {
  return clean(value, 300)
    .replace(/^.+?\s+hiring\s+/i, "")
    .replace(/\s+in\s+[^|]+(?:\|\s*LinkedIn)?$/i, "")
    .replace(/\s+(?:[-–—|]\s*)?(?:job post|LinkedIn|Indeed(?:\.com)?|Built In|ZipRecruiter|SimplyHired|Mediabistro)$/i, "")
    .replace(/\s+(?:at|@)\s+[^|–—-]+$/i, "")
    .trim();
}

function urlsFromText(value) {
  return [...String(value || "").matchAll(/https?:\/\/[^\s<>"')\]}]+/gi)].map((match) => match[0].replace(/[.,;:]+$/, ""));
}

async function boundedFetch(url, fetchImpl, init) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30_000);
  try {
    return await fetchImpl(url, { ...init, signal: controller.signal });
  } catch (cause) {
    if (cause instanceof Error && cause.name === "AbortError") throw new Error("The provider search timed out.");
    throw cause;
  } finally {
    clearTimeout(timeout);
  }
}

async function readProviderJson(response, label) {
  const text = await response.text();
  let payload = {};
  try { payload = text ? JSON.parse(text) : {}; } catch { throw new Error(`${label} returned an unreadable response.`); }
  if (!response.ok) {
    const message = payload?.error?.message || payload?.message || `${label} returned HTTP ${response.status}.`;
    const code = payload?.error?.code || payload?.error?.status || "";
    throw new Error([code, message].filter(Boolean).join(": "));
  }
  return payload;
}

function host(value) {
  try { return validatePublicUrl(value).hostname.toLowerCase().replace(/^www\./, ""); } catch { return ""; }
}

function clean(value, limit) {
  return String(value || "").replace(/\s+/g, " ").trim().slice(0, limit);
}

function safeProviderMessage(value) {
  return (value instanceof Error ? value.message : "The provider search failed.")
    .replace(/https?:\/\/\S+/gi, "[url]")
    .replace(/\b(?:sk|AIza)[A-Za-z0-9_-]{12,}\b/g, "[secret]")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 180);
}
