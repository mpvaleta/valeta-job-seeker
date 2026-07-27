const DATE_RANGE = /\(?\b((?:19|20)\d{2})\s*[-–—]\s*((?:19|20)\d{2}|present|current|now)\b\)?/i;
const COMPANY = /\b(?:at|for)\s+((?:[A-Z][\w&.'’-]*|of|and|the)(?:\s+(?:[A-Z][\w&.'’-]*|of|and|the))*)/;
const TITLE = /\b(?:as|was)\s+(?:an?\s+)?((?:[A-Z][\w/&'’-]*)(?:\s+(?:of|and|[A-Z][\w/&'’-]*)){0,5})/;
const TOOLS = /\b(?:proficient (?:in|with)|skilled (?:in|with)|experienced with|expert (?:in|with)|tools:)\s+(.{4,220})/i;

const CAPABILITY_PATTERNS = [
  { pattern: /\bbudgets?\b/i, label: "Budget management" },
  { pattern: /\bvendors?\b|\bsuppliers?\b/i, label: "Vendor selection and management" },
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
];

// Deterministic, evidence-only résumé document for the no-cloud path. Returns
// the same shape as the cloud ResumeDocument so the app can render both the
// generated and the local résumé through one renderer. Returns null when the
// approved evidence cannot support a structured document yet.
export function buildLocalResume({ facts, roleText = "", headline = "", summary = "" }) {
  const list = (Array.isArray(facts) ? facts : []).map((fact) => String(fact || "").replace(/\s+/g, " ").trim()).filter(Boolean);
  if (list.length < 3) return null;

  const roleTerms = fullTerms(roleText);
  const classified = list.map((fact, index) => ({ fact, index, kind: classifyFact(fact), employment: parseEmployment(fact) }));

  const sections = { education: [], awards: [], professional_development: [], languages: [] };
  const employers = new Map();
  const unplaced = [];
  let toolsSkill = null;

  for (const item of classified) {
    const toolsMatch = item.fact.match(TOOLS);
    if (toolsMatch && !toolsSkill) {
      const tools = toolsMatch[1].split(/,|\band\b/).map((tool) => tool.replace(/[.]+$/, "").trim()).filter(Boolean).slice(0, 8);
      if (tools.length >= 2) { toolsSkill = { label: tools.join(", "), fact_indexes: [item.index] }; continue; }
    }
    if (item.kind in sections) { sections[item.kind].push({ text: item.fact, fact_indexes: [item.index] }); continue; }
    if (item.employment.company) {
      const key = item.employment.company.toLowerCase();
      if (!employers.has(key)) employers.set(key, { company: item.employment.company, title: "", dates: null, items: [] });
      const group = employers.get(key);
      if (item.employment.title && (!group.title || item.employment.dates)) group.title = item.employment.title;
      if (item.employment.dates && (!group.dates || item.employment.dates.end > group.dates.end)) group.dates = item.employment.dates;
      group.items.push(item);
      continue;
    }
    unplaced.push(item);
  }

  const experience = [...employers.values()]
    .filter((group) => group.title && group.dates)
    .sort((left, right) => right.dates.end - left.dates.end || right.dates.start - left.dates.start)
    .map((group, position) => ({
      company: group.company,
      title: group.title,
      location: "",
      dates: group.dates.text,
      fact_indexes: group.items.map((item) => item.index),
      bullets: group.items
        .map((item) => ({ text: stripEntryHeader(item.fact, group), fact_indexes: [item.index], relevance: relevanceScore(item.fact, roleTerms) }))
        .sort((left, right) => right.relevance - left.relevance)
        .slice(0, position === 0 ? 6 : 4)
        .map(({ text, fact_indexes }) => ({ text, fact_indexes })),
    }));
  if (!experience.length) return null;

  for (const group of employers.values()) {
    if (!group.title || !group.dates) unplaced.push(...group.items);
  }

  const skills = [];
  for (const capability of CAPABILITY_PATTERNS) {
    const supporting = classified.filter((item) => !(item.kind in sections) && capability.pattern.test(item.fact));
    if (!supporting.length) continue;
    skills.push({
      label: capability.label,
      fact_indexes: supporting.map((item) => item.index).slice(0, 4),
      relevance: Math.max(...supporting.map((item) => relevanceScore(item.fact, roleTerms))) + relevanceScore(capability.label, roleTerms),
    });
  }
  skills.sort((left, right) => right.relevance - left.relevance);
  const core_skills = skills.slice(0, toolsSkill ? 13 : 14).map(({ label, fact_indexes }) => ({ label, fact_indexes }));
  if (toolsSkill) core_skills.push(toolsSkill);

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
    omissions: unplaced.map((item) => `Approved fact not placed automatically: ${item.fact}`).slice(0, 15),
    playbook_checks: [],
  };
}

function classifyFact(value) {
  if (/\b(?:award|awarded|honor|honoured|recognized|recognition|cannes|effie|clio|lion)\b/i.test(value)) return "awards";
  if (/\b(?:course|certificate|certification|continuing studies|training|workshop certificate|professional development)\b/i.test(value)) return "professional_development";
  if (/\b(?:bachelor|master|mba|degree|university|college)\b/i.test(value)) return "education";
  if (/\b(?:language|fluent|native speaker|professional proficiency|bilingual|trilingual)\b/i.test(value)) return "languages";
  return "experience";
}

function parseEmployment(value) {
  const dateMatch = value.match(DATE_RANGE);
  const withoutDates = value.replace(DATE_RANGE, " ").replace(/\s+/g, " ");
  const companyMatch = withoutDates.match(COMPANY);
  const titleMatch = withoutDates.match(TITLE);
  const start = dateMatch ? Number(dateMatch[1]) : 0;
  const end = dateMatch ? (/^\d{4}$/.test(dateMatch[2]) ? Number(dateMatch[2]) : 9999) : 0;
  return {
    company: companyMatch ? companyMatch[1].replace(/[.,;:]+$/, "").replace(/\s+(?:of|and|the)$/, "").trim() : "",
    title: titleMatch ? titleMatch[1].replace(/[.,;:]+$/, "").trim() : "",
    dates: dateMatch ? { start, end, text: end === 9999 ? `${dateMatch[1]} – Present` : `${dateMatch[1]} – ${dateMatch[2]}` } : null,
  };
}

// Remove the group's own employer, date range, and title from a bullet — the
// entry header already states them. Only removes verbatim redundancy; if the
// remainder becomes too short to stand alone, the original fact is kept.
function stripEntryHeader(fact, group) {
  let cleaned = fact
    .replace(new RegExp(`\\s+(?:at|for)\\s+${escapeRegExp(group.company)}(?=[\\s.,;]|$)`, "g"), "")
    .replace(DATE_RANGE, "")
    .replace(new RegExp(`\\s+as\\s+(?:an?\\s+)?${escapeRegExp(group.title)}(?=[\\s.,;]|$)`, "g"), "")
    .replace(/\s{2,}/g, " ").replace(/\s+([.,;])/g, "$1").trim();
  if (!/[.!?]$/.test(cleaned)) cleaned = `${cleaned}.`;
  return cleaned.split(/\s+/).length >= 5 ? cleaned : fact;
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
