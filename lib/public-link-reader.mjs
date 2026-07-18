const MAX_FETCH_BYTES = 1_500_000;
const MAX_EXTRACTED_TEXT = 300_000;
const MAX_REDIRECTS = 4;

const BLOCKED_HOSTS = new Set([
  "localhost",
  "localhost.localdomain",
  "metadata.google.internal",
  "metadata",
]);

const HTML_ENTITIES = {
  amp: "&",
  apos: "'",
  gt: ">",
  lt: "<",
  nbsp: " ",
  quot: '"',
};

export class PublicLinkError extends Error {
  constructor(code, message, status = 422) {
    super(message);
    this.name = "PublicLinkError";
    this.code = code;
    this.status = status;
  }
}

export function validatePublicUrl(value) {
  let url;
  try {
    url = new URL(String(value || "").trim());
  } catch {
    throw new PublicLinkError("invalid_url", "Enter a complete public URL beginning with https://.", 400);
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new PublicLinkError("unsupported_protocol", "Only public http and https links can be read.", 400);
  }
  if (url.username || url.password) {
    throw new PublicLinkError("embedded_credentials", "Links containing usernames or passwords are not accepted.", 400);
  }
  if (url.port && url.port !== "80" && url.port !== "443") {
    throw new PublicLinkError("blocked_port", "Only standard public web ports can be read.", 400);
  }
  const host = url.hostname.toLowerCase().replace(/\.$/, "");
  if (!host || BLOCKED_HOSTS.has(host) || host.endsWith(".local") || host.endsWith(".internal") || host.endsWith(".localhost")) {
    throw new PublicLinkError("private_host", "Private or local network links cannot be read.", 400);
  }
  if (isIpLiteral(host)) {
    throw new PublicLinkError("ip_literal_blocked", "For safety, enter a public website name rather than an IP address.", 400);
  }
  url.hash = "";
  return url;
}

export function isLinkedInUrl(value) {
  try {
    const host = validatePublicUrl(value).hostname.toLowerCase();
    return host === "linkedin.com" || host.endsWith(".linkedin.com");
  } catch {
    return false;
  }
}

export function extractYouTubeVideoId(value) {
  let url;
  try {
    url = validatePublicUrl(value);
  } catch {
    return null;
  }
  const host = url.hostname.toLowerCase().replace(/^www\./, "");
  let id = "";
  if (host === "youtu.be") id = url.pathname.split("/").filter(Boolean)[0] || "";
  if (host === "youtube.com" || host.endsWith(".youtube.com")) {
    if (url.pathname === "/watch") id = url.searchParams.get("v") || "";
    else if (/^\/(shorts|embed|live)\//.test(url.pathname)) id = url.pathname.split("/")[2] || "";
  }
  return /^[A-Za-z0-9_-]{11}$/.test(id) ? id : null;
}

export function decodeHtml(value) {
  return String(value || "").replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (match, entity) => {
    const normalized = entity.toLowerCase();
    if (normalized[0] === "#") {
      const hex = normalized[1] === "x";
      const parsed = Number.parseInt(normalized.slice(hex ? 2 : 1), hex ? 16 : 10);
      return Number.isFinite(parsed) ? String.fromCodePoint(parsed) : match;
    }
    return HTML_ENTITIES[normalized] ?? match;
  });
}

export function htmlToText(html) {
  return decodeHtml(String(html || "")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<(script|style|svg|noscript|template|nav|footer|header)[^>]*>[\s\S]*?<\/\1>/gi, " ")
    .replace(/<\/?(p|div|section|article|main|aside|h[1-6]|li|tr|br|blockquote)[^>]*>/gi, "\n")
    .replace(/<[^>]+>/g, " "))
    .replace(/\r/g, "")
    .replace(/[ \t\f\v]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function extractJobPostings(html, baseUrl) {
  const scripts = [...String(html || "").matchAll(/<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)];
  const jobs = [];
  for (const match of scripts) {
    const raw = decodeHtml(match[1]).trim();
    if (!raw) continue;
    try {
      visitJson(JSON.parse(raw), (entry) => {
        const types = Array.isArray(entry?.["@type"]) ? entry["@type"] : [entry?.["@type"]];
        if (!types.some((type) => String(type || "").toLowerCase() === "jobposting")) return;
        const title = cleanText(entry.title || entry.name, 240);
        if (!title) return;
        const location = jobLocation(entry.jobLocation, entry.jobLocationType, entry.applicantLocationRequirements);
        const sourceUrl = resolveUrl(entry.url || entry.sameAs || baseUrl, baseUrl);
        jobs.push({
          title,
          company: cleanText(entry.hiringOrganization?.name, 180),
          location,
          description: htmlToText(entry.description || "").slice(0, 80_000),
          sourceUrl,
          employmentType: cleanText(Array.isArray(entry.employmentType) ? entry.employmentType.join(", ") : entry.employmentType, 120),
          datePosted: cleanText(entry.datePosted, 40),
        });
      });
    } catch {
      // A malformed JSON-LD block should not prevent the rest of the page from being read.
    }
  }
  return uniqueBy(jobs, (job) => `${job.sourceUrl}|${job.title}`);
}

export function extractPageLinks(html, baseUrl) {
  const links = [];
  for (const match of String(html || "").matchAll(/<a\b[^>]*href\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)) {
    const href = resolveUrl(decodeHtml(match[1]), baseUrl);
    const label = htmlToText(match[2]).replace(/\s+/g, " ").trim().slice(0, 240);
    if (!href || !label || !/^https?:\/\//i.test(href)) continue;
    links.push({ href, label });
  }
  return uniqueBy(links, (link) => link.href).slice(0, 1_000);
}

export function extractPublicPage(html, finalUrl) {
  const source = String(html || "");
  const title = firstMatch(source, [
    /<meta\b[^>]*property=["']og:title["'][^>]*content=["']([^"']+)["'][^>]*>/i,
    /<meta\b[^>]*content=["']([^"']+)["'][^>]*property=["']og:title["'][^>]*>/i,
    /<title[^>]*>([\s\S]*?)<\/title>/i,
    /<h1[^>]*>([\s\S]*?)<\/h1>/i,
  ]);
  const description = firstMatch(source, [
    /<meta\b[^>]*name=["']description["'][^>]*content=["']([^"']+)["'][^>]*>/i,
    /<meta\b[^>]*property=["']og:description["'][^>]*content=["']([^"']+)["'][^>]*>/i,
  ]);
  const main = firstMatch(source, [
    /<main\b[^>]*>([\s\S]*?)<\/main>/i,
    /<article\b[^>]*>([\s\S]*?)<\/article>/i,
    /<body\b[^>]*>([\s\S]*?)<\/body>/i,
  ]) || source;
  const text = htmlToText(main).slice(0, MAX_EXTRACTED_TEXT);
  const jobs = extractJobPostings(source, finalUrl);
  return {
    title: cleanText(htmlToText(title), 300) || new URL(finalUrl).hostname,
    description: cleanText(htmlToText(description), 600),
    text,
    jobs,
    links: extractPageLinks(source, finalUrl),
  };
}

export function extractYouTubeCaptionTracks(html) {
  const marker = '"captionTracks":';
  const start = String(html || "").indexOf(marker);
  if (start < 0) return [];
  const json = extractBalancedJson(String(html), start + marker.length, "[", "]");
  if (!json) return [];
  try {
    const tracks = JSON.parse(json);
    return Array.isArray(tracks) ? tracks.filter((track) => track && typeof track.baseUrl === "string") : [];
  } catch {
    return [];
  }
}

export function parseYouTubeTranscript(value) {
  const body = String(value || "").trim();
  if (!body) return "";
  try {
    const payload = JSON.parse(body);
    if (Array.isArray(payload.events)) {
      return payload.events
        .flatMap((event) => Array.isArray(event?.segs) ? event.segs.map((segment) => segment?.utf8 || "") : [])
        .join(" ")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, MAX_EXTRACTED_TEXT);
    }
  } catch {
    // Fall through to the XML caption format.
  }
  return decodeHtml([...body.matchAll(/<text\b[^>]*>([\s\S]*?)<\/text>/gi)].map((match) => match[1]).join(" "))
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, MAX_EXTRACTED_TEXT);
}

export async function readPublicLink(value, options = {}) {
  const fetchImpl = options.fetchImpl || fetch;
  const requestedUrl = validatePublicUrl(value);
  if (isLinkedInUrl(requestedUrl.href)) {
    throw new PublicLinkError("linkedin_automation_blocked", "LinkedIn does not permit this kind of automated page reading. Import your official LinkedIn data export or paste the job text instead.", 422);
  }
  const youtubeId = extractYouTubeVideoId(requestedUrl.href);
  if (youtubeId) return readYouTube(requestedUrl, youtubeId, fetchImpl);

  const fetched = await fetchTextFollowingRedirects(requestedUrl, fetchImpl);
  if (!/(text\/html|application\/xhtml\+xml|text\/plain|application\/json)/i.test(fetched.contentType)) {
    throw new PublicLinkError("unsupported_content", "This link is not a readable public article or job page.", 415);
  }
  const page = /html|xhtml/i.test(fetched.contentType) ? extractPublicPage(fetched.body, fetched.finalUrl) : {
    title: new URL(fetched.finalUrl).hostname,
    description: "",
    text: fetched.body.slice(0, MAX_EXTRACTED_TEXT),
    jobs: [],
    links: [],
  };
  if (page.text.length < 80 && !page.jobs.length) {
    throw new PublicLinkError("not_enough_public_text", "The page did not expose enough readable public text. It may require a login or block automated access; paste the content instead.", 422);
  }
  return {
    requestedUrl: requestedUrl.href,
    finalUrl: fetched.finalUrl,
    sourceType: page.jobs.length ? "job-page" : "article",
    title: page.title,
    description: page.description,
    text: page.text,
    jobs: page.jobs,
    links: page.links,
  };
}

async function readYouTube(requestedUrl, videoId, fetchImpl) {
  const watchUrl = new URL(`https://www.youtube.com/watch?v=${videoId}&hl=en`);
  const fetched = await fetchTextFollowingRedirects(watchUrl, fetchImpl);
  const page = extractPublicPage(fetched.body, fetched.finalUrl);
  const tracks = extractYouTubeCaptionTracks(fetched.body);
  if (!tracks.length) {
    throw new PublicLinkError("youtube_captions_unavailable", "This YouTube video does not expose public captions. Open the transcript in YouTube and paste it into the knowledge source instead.", 422);
  }
  const track = tracks.find((candidate) => String(candidate.languageCode || "").toLowerCase().startsWith("en") && candidate.kind !== "asr")
    || tracks.find((candidate) => String(candidate.languageCode || "").toLowerCase().startsWith("en"))
    || tracks.find((candidate) => candidate.kind !== "asr")
    || tracks[0];
  const captionUrl = validatePublicUrl(track.baseUrl);
  captionUrl.searchParams.set("fmt", "json3");
  const captions = await fetchTextFollowingRedirects(captionUrl, fetchImpl);
  const transcript = parseYouTubeTranscript(captions.body);
  if (transcript.length < 40) {
    throw new PublicLinkError("youtube_transcript_empty", "Public captions were found, but no readable transcript could be extracted. Paste the YouTube transcript instead.", 422);
  }
  return {
    requestedUrl: requestedUrl.href,
    finalUrl: `https://www.youtube.com/watch?v=${videoId}`,
    sourceType: "youtube-transcript",
    title: page.title.replace(/\s*-\s*YouTube\s*$/i, "") || `YouTube video ${videoId}`,
    description: page.description,
    text: transcript,
    jobs: [],
    links: [],
    metadata: {
      videoId,
      language: String(track.languageCode || "unknown"),
      captions: track.kind === "asr" ? "automatic" : "creator-provided",
    },
  };
}

async function fetchTextFollowingRedirects(initialUrl, fetchImpl) {
  let current = validatePublicUrl(initialUrl.href);
  for (let redirect = 0; redirect <= MAX_REDIRECTS; redirect += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15_000);
    let response;
    try {
      response = await fetchImpl(current.href, {
        redirect: "manual",
        signal: controller.signal,
        headers: {
          Accept: "text/html,application/xhtml+xml,text/plain,application/json;q=0.9,*/*;q=0.1",
          "User-Agent": "VJobsSeeker/1.0 public-link-reader",
        },
      });
    } catch (cause) {
      const timedOut = cause instanceof Error && cause.name === "AbortError";
      throw new PublicLinkError(timedOut ? "link_timeout" : "link_fetch_failed", timedOut ? "The public page took too long to respond." : "The public page could not be reached.", 502);
    } finally {
      clearTimeout(timeout);
    }

    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const location = response.headers.get("location");
      if (!location) throw new PublicLinkError("invalid_redirect", "The public page returned an invalid redirect.", 502);
      current = validatePublicUrl(new URL(location, current).href);
      continue;
    }
    if (!response.ok) {
      throw new PublicLinkError(response.status === 401 || response.status === 403 ? "login_or_access_required" : "link_http_error", response.status === 401 || response.status === 403 ? "This page requires a login or blocks automated reading. Paste the content instead." : `The public page returned HTTP ${response.status}.`, response.status >= 500 ? 502 : 422);
    }

    const declaredLength = Number(response.headers.get("content-length") || "0");
    if (declaredLength > MAX_FETCH_BYTES) throw new PublicLinkError("page_too_large", "This page is too large to import safely.", 413);
    const body = await readLimitedBody(response, MAX_FETCH_BYTES);
    return { body, finalUrl: current.href, contentType: response.headers.get("content-type") || "text/html" };
  }
  throw new PublicLinkError("too_many_redirects", "The public page redirected too many times.", 422);
}

async function readLimitedBody(response, limit) {
  if (!response.body?.getReader) {
    const text = await response.text();
    if (new TextEncoder().encode(text).byteLength > limit) throw new PublicLinkError("page_too_large", "This page is too large to import safely.", 413);
    return text;
  }
  const reader = response.body.getReader();
  const chunks = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > limit) {
      await reader.cancel();
      throw new PublicLinkError("page_too_large", "This page is too large to import safely.", 413);
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(bytes);
}

function firstMatch(value, patterns) {
  for (const pattern of patterns) {
    const match = String(value || "").match(pattern);
    if (match?.[1]) return decodeHtml(match[1]);
  }
  return "";
}

function extractBalancedJson(value, offset, open, close) {
  const start = value.indexOf(open, offset);
  if (start < 0) return "";
  let depth = 0;
  let quoted = false;
  let escaped = false;
  for (let index = start; index < value.length; index += 1) {
    const character = value[index];
    if (quoted) {
      if (escaped) escaped = false;
      else if (character === "\\") escaped = true;
      else if (character === '"') quoted = false;
      continue;
    }
    if (character === '"') quoted = true;
    else if (character === open) depth += 1;
    else if (character === close) {
      depth -= 1;
      if (depth === 0) return value.slice(start, index + 1);
    }
  }
  return "";
}

function jobLocation(jobLocationValue, jobLocationType, applicantLocationRequirements) {
  if (String(jobLocationType || "").toUpperCase() === "TELECOMMUTE") return "Remote";
  const entries = Array.isArray(jobLocationValue) ? jobLocationValue : jobLocationValue ? [jobLocationValue] : [];
  const locations = entries.map((entry) => {
    const address = entry?.address || entry;
    return [address?.addressLocality, address?.addressRegion, address?.addressCountry].filter(Boolean).join(", ");
  }).filter(Boolean);
  if (locations.length) return locations.join(" / ").slice(0, 300);
  const allowed = Array.isArray(applicantLocationRequirements) ? applicantLocationRequirements : applicantLocationRequirements ? [applicantLocationRequirements] : [];
  return allowed.map((entry) => entry?.name).filter(Boolean).join(" / ").slice(0, 300);
}

function visitJson(value, visitor) {
  if (Array.isArray(value)) {
    value.forEach((item) => visitJson(item, visitor));
    return;
  }
  if (!value || typeof value !== "object") return;
  visitor(value);
  if (Array.isArray(value["@graph"])) visitJson(value["@graph"], visitor);
}

function cleanText(value, maxLength) {
  return String(value || "").replace(/\s+/g, " ").trim().slice(0, maxLength);
}

function resolveUrl(value, baseUrl) {
  try {
    return new URL(String(value || ""), baseUrl).href;
  } catch {
    return "";
  }
}

function uniqueBy(items, key) {
  const seen = new Set();
  return items.filter((item) => {
    const value = key(item).toLowerCase();
    if (!value || seen.has(value)) return false;
    seen.add(value);
    return true;
  });
}

function isIpLiteral(host) {
  if (host.includes(":")) return true;
  if (!/^\d{1,3}(\.\d{1,3}){3}$/.test(host)) return false;
  const parts = host.split(".").map(Number);
  return parts.every((part) => part >= 0 && part <= 255);
}
