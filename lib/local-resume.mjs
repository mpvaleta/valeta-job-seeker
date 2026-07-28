// Deterministic, evidence-only résumé document for the no-cloud path. Returns
// the same shape as the cloud ResumeDocument so the app renders both through
// one renderer. Returns null when the approved evidence cannot support a
// structured document yet.
//
// Approved facts arrive in the order they appeared in the uploaded résumé, and
// real résumés are written as a job header followed by its accomplishment
// bullets. The builder therefore reads facts as a sequence rather than
// scoring each one in isolation: a header fact opens an entry, and the
// accomplishment facts that follow attach to it.

const MONTH_NAME = "jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sept?(?:ember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?";
const YEAR = "(?:19|20)\\d{2}";
const DATE_POINT = `(?:(?:${MONTH_NAME})\\.?\\s+)?${YEAR}`;
const STILL_THERE = "present|current|now|ongoing|to date";
const RANGE_SEPARATOR = "\\s*(?:[-–—]|to|through|until)\\s*";
const DATE_RANGE = new RegExp(`\\(?\\b(${DATE_POINT})${RANGE_SEPARATOR}(${DATE_POINT}|${STILL_THERE})\\b\\)?`, "i");
const MONTH_ORDER = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

// "at <Employer>" asserts employment outright. "for <Name>" is ambiguous — it
// reads as either an employer or a client — so it is only trusted when the same
// fact names no "at" employer to prefer, and never over an entry that already
// covers the same title and dates.
const EMPLOYER_AT = /\bat\s+((?:[A-Z][\w&.'’-]*|of|and|the)(?:\s+(?:[A-Z][\w&.'’-]*|of|and|the))*)/;
const EMPLOYER_FOR = /\bfor\s+((?:[A-Z][\w&.'’-]*|of|and|the)(?:\s+(?:[A-Z][\w&.'’-]*|of|and|the))*)/;
const TITLE_AS = /\b(?:as|was)\s+(?:an?\s+)?((?:[A-Z][\w/&'’-]*)(?:\s+(?:of|and|[A-Z][\w/&'’-]*)){0,5})/;
const LOCATION = /\bin\s+([A-Z][a-zA-Z.'’-]+(?:\s+[A-Z][a-zA-Z.'’-]+)*,\s*(?:[A-Z]{2}\b|[A-Z][a-z]+))/;
const TOOLS = /\b(?:proficient (?:in|with)|skilled (?:in|with)|experienced with|expert (?:in|with)|tools:)\s+(.{4,220})/i;

const TITLE_WORD = /\b(?:manager|director|producer|coordinator|lead|specialist|analyst|engineer|designer|head|vp|vice\s+president|president|officer|associate|assistant|consultant|strategist|supervisor|executive|architect|editor|planner|buyer|recruiter|controller|principal|partner|chief|founder|owner|intern|technician|administrator|representative|advisor|writer|developer|scientist|marketer|generalist)\b/i;
const COMPANY_HINT = /\b(?:inc|llc|ltd|corp|corporation|company|studios?|agency|agencies|group|media|partners?|labs?|works|collective|productions?|creative|communications?|consulting|solutions|systems|technologies|network|foundation|institute|associates|brands?|ventures|holdings|international|global|worldwide)\b\.?/i;

// A fact that opens with an accomplishment verb is a bullet, even when it also
// names the employer; a fact without one may be a standalone job header.
const ACTION_VERB = /^(?:led|managed|coordinated|delivered|built|ran|created|directed|oversaw|developed|launched|drove|owned|supported|maintained|produced|executed|improved|reduced|increased|negotiated|partnered|established|streamlined|implemented|designed|planned|supervised|trained|mentored|presented|analyzed|tracked|reported|scheduled|booked|handled|organized|facilitated|collaborated|contributed|spearheaded|championed|introduced|standardized|automated|migrated|scaled|grew|cut|saved|won|secured|acquired|onboarded|hired|recruited|completed|achieved|earned|received|awarded|worked|serving|served|serves|responsible|selected|promoted|appointed)\b/i;

const CAPABILITY_PATTERNS = [
  { pattern: /\bbudgets?\b|\bp&l\b|\bforecast/i, label: "Budget management" },
  { pattern: /\bvendors?\b|\bsuppliers?\b|\bcontracts?\b/i, label: "Vendor selection and management" },
  { pattern: /\bcross-functional\b|\bteams? of \d+/i, label: "Cross-functional team coordination" },
  { pattern: /\bcreative briefs?\b/i, label: "Structured creative briefs" },
  { pattern: /\bstatus (?:meetings?|reports?|reporting)\b|\btrackers?\b/i, label: "Status reporting and project tracking" },
  { pattern: /\bcampaigns?\b/i, label: "Integrated campaign delivery" },
  { pattern: /\brevision cycles?\b|\bcreative reviews?\b/i, label: "Creative review management" },
  { pattern: /\bworkshops?\b|\bretrospectives?\b|\bpresent(?:ed|ations?)\b/i, label: "Stakeholder workshops and presentations" },
  { pattern: /\bmentor(?:ed|ing)?\b|\bonboard(?:ed|ing)?\b/i, label: "Onboarding and mentoring" },
  { pattern: /\b(?:shoots?|crews?|call sheets?|locations?|broadcast|production schedul)/i, label: "Production scheduling and logistics" },
  { pattern: /\binvoices?\b|\breleases?\b|\bcompliance\b/i, label: "Production paperwork and compliance" },
  { pattern: /\bstakeholders?\b|\bclient accounts?\b/i, label: "Stakeholder and client communication" },
  { pattern: /\bsponsorship\b|\bpartnerships?\b/i, label: "Partnership and sponsorship coordination" },
  { pattern: /\bevents?\b|\bexperiential\b|\bactivations?\b/i, label: "Event and activation support" },
  { pattern: /\bprint\b|\bvideo\b|\bdigital\b/i, label: "Print, video, and digital production" },
  { pattern: /\bprocess(?:es)?\b|\bworkflows?\b|\bstreamlin/i, label: "Process and workflow improvement" },
  // Tracks beyond brand/creative: marketing operations, sports, and analytics
  // roles are shipped résumé tracks and need their own capability vocabulary.
  { pattern: /\bmarketing automation\b|\bcrm\b|\bhubspot\b|\bmarketo\b|\bsalesforce\b/i, label: "Marketing operations and CRM" },
  { pattern: /\bsegmentation\b|\blifecycle\b|\bemail (?:campaigns?|marketing)\b/i, label: "Lifecycle and email programs" },
  { pattern: /\banalytics\b|\bdashboards?\b|\breporting\b|\bkpis?\b|\bmetrics\b/i, label: "Analytics and performance reporting" },
  // Deliberately narrow: generic words like "teams" appear in every résumé and
  // would claim sports experience the evidence never supports.
  { pattern: /\bsports?\b|\bathletes?\b|\bleagues?\b|\bfan (?:engagement|experience)\b|\bsponsorship activation\b/i, label: "Sports and fan engagement" },
  { pattern: /\bsocial media\b|\bcontent calendars?\b|\beditorial\b/i, label: "Social and content programs" },
  { pattern: /\bmedia buy\b|\bpaid media\b|\badvertising\b|\bmedia plans?\b/i, label: "Media planning and buying" },
  { pattern: /\bagile\b|\bscrum\b|\bsprints?\b|\broadmaps?\b/i, label: "Agile delivery and roadmapping" },
  { pattern: /\bstrategy\b|\bgo-to-market\b|\bpositioning\b/i, label: "Strategy and go-to-market planning" },
];

export function buildLocalResume({ facts, roleText = "", headline = "", summary = "" }) {
  const list = (Array.isArray(facts) ? facts : []).map((fact) => String(fact || "").replace(/\s+/g, " ").trim()).filter(Boolean);
  if (list.length < 3) return null;

  const roleTerms = fullTerms(roleText);
  const sections = { education: [], awards: [], professional_development: [], languages: [] };
  const entries = [];
  const unplaced = [];
  let toolsSkill = null;
  let openEntry = null;

  list.forEach((fact, index) => {
    const item = { fact, index };

    const toolsMatch = fact.match(TOOLS);
    if (toolsMatch && !toolsSkill) {
      const tools = toolsMatch[1].split(/,|\band\b/).map((tool) => tool.replace(/[.]+$/, "").trim()).filter(Boolean).slice(0, 8);
      if (tools.length >= 2) { toolsSkill = { label: tools.join(", "), fact_indexes: [index] }; return; }
    }

    const kind = classifyFact(fact);
    if (kind !== "experience") { sections[kind].push({ text: fact, fact_indexes: [index] }); return; }

    const parsed = parseEmployment(fact);
    // An ambiguous "for <Name>" never outranks an entry that already covers the
    // same title and dates: that entry's employer came from a stronger signal,
    // and the name here is far more likely to be its client.
    if (!parsed.company && parsed.clientCompany && parsed.dates) {
      const sameRole = entries.find((candidate) => candidate.title.toLowerCase() === parsed.title.toLowerCase() && candidate.dates.text === parsed.dates.text);
      if (sameRole) { sameRole.items.push(item); openEntry = sameRole; return; }
      parsed.company = parsed.clientCompany;
    }
    if (parsed.company && parsed.dates) {
      // Keyed by company + title + dates so a promotion at one employer stays
      // two entries instead of overwriting the earlier role.
      const key = `${parsed.company} ${parsed.title} ${parsed.dates.text}`.toLowerCase();
      let entry = entries.find((candidate) => candidate.key === key);
      if (!entry) {
        entry = {
          key,
          company: parsed.company,
          title: parsed.title,
          location: parsed.location,
          dates: parsed.dates,
          standalone: parsed.standalone,
          items: [],
          headerIndexes: [],
        };
        entries.push(entry);
      }
      if (!entry.location && parsed.location) entry.location = parsed.location;
      openEntry = entry;
      // A pure header line states the job; it is not itself an achievement.
      if (parsed.standalone) entry.headerIndexes.push(index);
      else entry.items.push(item);
      return;
    }

    // No dates: attach by explicit employer mention, else to the open entry —
    // but only when that entry came from a standalone header, the layout where
    // following bullets legitimately omit the employer name.
    const named = parsed.company && entries.find((candidate) => candidate.company.toLowerCase() === parsed.company.toLowerCase());
    if (named) { named.items.push(item); openEntry = named; return; }
    if (openEntry && openEntry.standalone) { openEntry.items.push(item); return; }
    if (parsed.company && openEntry && openEntry.company.toLowerCase() === parsed.company.toLowerCase()) { openEntry.items.push(item); return; }
    unplaced.push(item);
  });

  const experience = entries
    .filter((entry) => entry.title && entry.dates)
    .sort((left, right) => right.dates.end - left.dates.end || right.dates.endMonth - left.dates.endMonth || right.dates.start - left.dates.start)
    .map((entry, position) => {
      const limit = position === 0 ? 6 : 4;
      const ranked = entry.items
        .map((item) => ({ item, text: stripEntryHeader(item.fact, entry), relevance: relevanceScore(item.fact, roleTerms) }))
        .filter((candidate) => candidate.text)
        .sort((left, right) => right.relevance - left.relevance || left.item.index - right.item.index);
      // Anything past the cap is recorded rather than silently discarded.
      for (const dropped of ranked.slice(limit)) unplaced.push(dropped.item);
      return {
        company: entry.company,
        title: entry.title,
        location: entry.location,
        dates: entry.dates.text,
        fact_indexes: [...entry.headerIndexes, ...entry.items.map((item) => item.index)],
        bullets: ranked.slice(0, limit).map((candidate) => ({ text: candidate.text, fact_indexes: [candidate.item.index] })),
      };
    })
    .filter((entry) => entry.bullets.length || entry.fact_indexes.length);
  if (!experience.length) return null;

  for (const entry of entries) {
    if (!entry.title || !entry.dates) unplaced.push(...entry.items);
  }

  // Only a fact that reached the header or a printed bullet counts as placed;
  // an entry's fact_indexes also lists achievements the bullet cap dropped, and
  // those are exactly what the omissions list needs to surface.
  const placedIndexes = new Set(experience.flatMap((entry) => entry.bullets.flatMap((bullet) => bullet.fact_indexes)));
  for (const entry of entries) for (const index of entry.headerIndexes) placedIndexes.add(index);
  const skills = [];
  for (const capability of CAPABILITY_PATTERNS) {
    const supporting = list
      .map((fact, index) => ({ fact, index }))
      .filter((item) => classifyFact(item.fact) === "experience" && capability.pattern.test(item.fact));
    if (!supporting.length) continue;
    skills.push({
      label: capability.label,
      fact_indexes: supporting.map((item) => item.index).slice(0, 4),
      relevance: Math.max(...supporting.map((item) => relevanceScore(item.fact, roleTerms))) + relevanceScore(capability.label, roleTerms),
    });
  }
  skills.sort((left, right) => right.relevance - left.relevance || left.label.localeCompare(right.label));
  const core_skills = skills.slice(0, toolsSkill ? 13 : 14).map(({ label, fact_indexes }) => ({ label, fact_indexes }));
  if (toolsSkill) core_skills.push(toolsSkill);

  const omissions = [...new Map(unplaced.filter((item) => !placedIndexes.has(item.index)).map((item) => [item.index, item])).values()]
    .sort((left, right) => left.index - right.index)
    .map((item) => `Approved fact not placed automatically: ${item.fact}`)
    .slice(0, 15);

  return {
    headline: String(headline || "").trim() || "Project and Operations Manager",
    headline_fact_indexes: [],
    summary: String(summary || "").trim(),
    summary_fact_indexes: [],
    core_skills,
    experience,
    education: sections.education,
    awards: sections.awards,
    professional_development: sections.professional_development,
    languages: sections.languages,
    omissions,
    playbook_checks: [],
  };
}

function classifyFact(value) {
  if (/\b(?:award|awarded|honor|honoured|recognized|recognition|cannes|effie|clio|lion)\b/i.test(value)) return "awards";
  if (/\b(?:course|certificate|certification|continuing studies|training|workshop certificate|professional development)\b/i.test(value)) return "professional_development";
  if (/\b(?:bachelor|master|mba|b\.?a\.?|b\.?s\.?|m\.?a\.?|m\.?s\.?|degree|university|college)\b/i.test(value)) return "education";
  if (/\b(?:language|fluent|native speaker|professional proficiency|bilingual|trilingual)\b/i.test(value)) return "languages";
  return "experience";
}

function monthIndex(value) {
  if (!value) return 0;
  const found = MONTH_ORDER.indexOf(value.slice(0, 3).toLowerCase());
  return found === -1 ? 0 : found + 1;
}

function parseDates(value) {
  const match = value.match(DATE_RANGE);
  if (!match) return null;
  const startYear = Number(match[1].match(/\d{4}/)?.[0]);
  const startMonth = monthIndex(match[1].match(new RegExp(MONTH_NAME, "i"))?.[0]);
  const ongoing = new RegExp(`^(?:${STILL_THERE})$`, "i").test(match[2].trim());
  const endYear = ongoing ? 9999 : Number(match[2].match(/\d{4}/)?.[0]);
  const endMonth = ongoing ? 12 : monthIndex(match[2].match(new RegExp(MONTH_NAME, "i"))?.[0]);
  if (!Number.isFinite(startYear) || !Number.isFinite(endYear)) return null;
  return { start: startYear, startMonth, end: endYear, endMonth, text: ongoing ? `${startYear} – Present` : `${startYear} – ${endYear}` };
}

// Reads either an inline accomplishment that names its employer, or a
// standalone header line such as "Senior Project Manager, Acme Studios — 2019 to Present".
function parseEmployment(value) {
  const dates = parseDates(value);
  const withoutDates = value.replace(DATE_RANGE, " ").replace(/\s+/g, " ").trim();
  const locationMatch = withoutDates.match(LOCATION);
  const location = locationMatch ? locationMatch[1].trim() : "";
  const employerMatch = withoutDates.match(EMPLOYER_AT);
  const titleMatch = withoutDates.match(TITLE_AS);
  const company = employerMatch ? cleanEdge(employerMatch[1]) : "";
  const title = titleMatch ? cleanEdge(titleMatch[1]) : "";
  const forMatch = company ? null : withoutDates.match(EMPLOYER_FOR);
  const clientCompany = forMatch ? cleanEdge(forMatch[1]) : "";
  if (company || !dates || ACTION_VERB.test(withoutDates)) {
    return { company, title, location, dates, clientCompany, standalone: false };
  }
  const header = parseHeaderLine(withoutDates, location);
  if (header.company && header.title) return { ...header, location, dates, clientCompany: "", standalone: true };
  return { company, title, location, dates, clientCompany, standalone: false };
}

// Splits "Senior Project Manager, Acme Studios — San Francisco, CA" into its
// title and employer by asking which segment reads like a job title.
function parseHeaderLine(value, location) {
  const cleaned = location ? value.replace(LOCATION, " ") : value;
  const segments = cleaned
    .split(/\s*[,|·—–]\s*|\s+[-]\s+/)
    .map((segment) => cleanEdge(segment))
    .filter((segment) => segment && segment.length <= 70 && /[A-Za-z]/.test(segment));
  if (segments.length < 2 || segments.length > 4) return { company: "", title: "" };
  const titleIndex = segments.findIndex((segment) => TITLE_WORD.test(segment));
  if (titleIndex === -1) return { company: "", title: "" };
  const rest = segments.filter((_, index) => index !== titleIndex);
  const companySegment = rest.find((segment) => COMPANY_HINT.test(segment))
    || rest.find((segment) => /^[A-Z]/.test(segment) && !/^[a-z]/.test(segment));
  if (!companySegment) return { company: "", title: "" };
  return { company: companySegment, title: segments[titleIndex] };
}

function cleanEdge(value) {
  return String(value || "").replace(/^[\s.,;:|·—–-]+|[\s.,;:|·—–-]+$/g, "").replace(/\s+(?:of|and|the)$/i, "").trim();
}

// Remove the entry's own employer, dates, title, and location from a bullet —
// the entry header already states them. Returns "" when nothing but the header
// remains, since that bullet would only repeat the line directly above it.
function stripEntryHeader(fact, entry) {
  let cleaned = fact;
  if (entry.company) cleaned = cleaned.replace(new RegExp(`\\s*\\b(?:at|for|with)\\s+${escapeRegExp(entry.company)}(?=[\\s.,;)]|$)`, "gi"), "");
  if (entry.title) cleaned = cleaned.replace(new RegExp(`\\s*\\bas\\s+(?:an?\\s+)?${escapeRegExp(entry.title)}(?=[\\s.,;)]|$)`, "gi"), "");
  if (entry.location) cleaned = cleaned.replace(new RegExp(`\\s*\\bin\\s+${escapeRegExp(entry.location)}(?=[\\s.,;)]|$)`, "gi"), "");
  cleaned = cleaned
    .replace(DATE_RANGE, "")
    .replace(/\(\s*\)/g, "")
    .replace(/\s{2,}/g, " ")
    .replace(/\s+([.,;)])/g, "$1")
    .replace(/^[\s,;:-]+/, "")
    .trim();
  if (!cleaned || cleaned.split(/\s+/).length < 3) return "";
  if (!/[.!?]$/.test(cleaned)) cleaned = `${cleaned}.`;
  return cleaned;
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function relevanceScore(value, roleTerms) {
  if (!roleTerms.size) return 0;
  return [...fullTerms(value)].filter((term) => roleTerms.has(term)).length;
}

function fullTerms(value) {
  return new Set((String(value || "").toLowerCase().match(/[a-z0-9][a-z0-9+#&/-]{2,}/g) || []).filter((term) => term.length >= 4));
}
