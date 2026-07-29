/*
 * The résumé-tailor standards, implemented as deterministic checks.
 *
 * These rules come from Marcos's own `resume-tailor` Claude skill — its style
 * guide, best-practices notes, and 10-point rubric. Everything encoded here is
 * mechanically checkable, so the audit runs entirely offline: no API key, no
 * provider call, no token cost. It grades the résumé text the user is already
 * looking at, which means it works on a local draft, a cloud draft, and a draft
 * the user has hand-edited, all the same way.
 *
 * What it deliberately does NOT do is rewrite anything. The skill's first rule
 * is never to invent, and a rewrite without evidence is exactly that. Every
 * finding names a specific line and leaves the wording to the user.
 */

import { parseResumeText } from "./resume-document.mjs";

// From the skill's banned-phrase list, plus the near-synonyms that show up in
// the same sentences. Matching is word-boundary anchored so "passionate" is
// caught but "compassionate" is not.
const JARGON = [
  { pattern: /\bsynerg(?:y|ies|istic)\b/i, label: "synergy" },
  { pattern: /\bresults[- ]driven\b/i, label: "results-driven" },
  { pattern: /\bgo[- ]getter\b/i, label: "go-getter" },
  { pattern: /\bteam player\b/i, label: "team player" },
  { pattern: /\bthink(?:ing)? outside the box\b/i, label: "think outside the box" },
  { pattern: /\bpassionate\b/i, label: "passionate" },
  { pattern: /\b(?:ninja|guru|rockstar|rock star|wizard)\b/i, label: "ninja/guru/rockstar" },
  { pattern: /\bdynamic self[- ]starter\b/i, label: "dynamic self-starter" },
  { pattern: /\bself[- ]starter\b/i, label: "self-starter" },
  { pattern: /\bhard[- ]working\b/i, label: "hard-working" },
  { pattern: /\bdetail[- ]oriented\b/i, label: "detail-oriented" },
  { pattern: /\bthought leader(?:ship)?\b/i, label: "thought leadership" },
  { pattern: /\bbest[- ]in[- ]class\b/i, label: "best-in-class" },
  { pattern: /\bmove the needle\b/i, label: "move the needle" },
  { pattern: /\bwear(?:s|ing)? many hats\b/i, label: "wears many hats" },
  { pattern: /\bproven track record\b/i, label: "proven track record" },
  { pattern: /\bexcellent communication skills\b/i, label: "excellent communication skills" },
  { pattern: /\bout[- ]of[- ]the[- ]box think(?:er|ing)\b/i, label: "out-of-the-box thinker" },
];

const FIRST_PERSON = /\b(?:I|I'm|I've|I'd|I'll|me|my|mine|myself)\b/;

// Duty language the skill calls out as weak when it stands in for an outcome.
const DUTY_OPENER = /^(?:responsible for|helped(?: with)?|worked on|assisted (?:with|in)|participated in|involved in|tasked with|duties included)\b/i;

// Section names ATS parsers are known to recognize. The skill is explicit that
// creative renaming ("What I Bring", "My Journey") costs parsed content.
const ATS_SECTION_NAMES = [
  /^(?:professional |work |relevant )?experience$/i,
  /^employment(?: history)?$/i,
  /^education$/i,
  /^(?:core |key |technical )?skills$/i,
  /^areas of expertise$/i,
  /^certifications?$/i,
  /^licenses? (?:&|and) certifications?$/i,
  /^(?:professional )?summary$/i,
  /^profile$/i,
  /^awards?(?: (?:&|and) honors?)?$/i,
  /^professional development$/i,
  /^languages$/i,
  /^volunteer(?: experience)?$/i,
  /^projects$/i,
  /^publications$/i,
];

const MONTH = "(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*";
const YEAR = /(?:19|20)\d{2}/;

function endYear(dates) {
  const value = String(dates || "");
  if (/present|current|now|ongoing/i.test(value)) return 9999;
  const years = value.match(new RegExp(YEAR.source, "g"));
  return years ? Number(years[years.length - 1]) : 0;
}

function hasNumber(text) {
  return /\d/.test(text);
}

function words(text) {
  return String(text || "").trim().split(/\s+/).filter(Boolean);
}

/*
 * Audit a résumé against the standards.
 *
 * `roleText` is the target job posting, used only for keyword coverage — never
 * as a source of claims. Returns a 0-10 score built from the skill's five
 * rubric dimensions, each scored 0-2, plus the specific findings behind them.
 */
export function auditResume(text, options = {}) {
  const parsed = parseResumeText(text);
  const roleTerms = keywordSet(options.roleText || "");
  const findings = [];

  const experience = parsed.sections.find((section) => section.kind === "experience");
  const entries = experience ? experience.entries : [];
  const bullets = entries.flatMap((entry) => entry.bullets);
  const summarySection = parsed.sections.find((section) => section.kind === "paragraph");
  const summary = summarySection ? summarySection.paragraphs.join(" ") : "";
  const skillsSection = parsed.sections.find((section) => section.kind === "skills");
  const skills = skillsSection ? skillsSection.items : [];
  const body = [summary, ...skills, ...bullets].join("\n");

  // ---- Clarity: no jargon, no first person, no duty-only phrasing ----
  const jargonHits = [];
  for (const entry of JARGON) {
    for (const line of [summary, ...bullets, ...skills]) {
      if (entry.pattern.test(line)) { jargonHits.push({ phrase: entry.label, line }); break; }
    }
  }
  for (const hit of jargonHits) {
    findings.push({ dimension: "clarity", severity: "high", message: `Remove the phrase "${hit.phrase}" — it states nothing a recruiter can verify.`, line: hit.line });
  }
  const firstPersonLines = [summary, ...bullets].filter((line) => FIRST_PERSON.test(line));
  for (const line of firstPersonLines) {
    findings.push({ dimension: "clarity", severity: "medium", message: "Drop the first-person pronoun — US résumés are written without them.", line });
  }
  const dutyBullets = bullets.filter((bullet) => DUTY_OPENER.test(bullet.trim()));
  for (const bullet of dutyBullets) {
    findings.push({ dimension: "clarity", severity: "medium", message: "Lead with what changed, not the duty — this bullet opens by describing a responsibility.", line: bullet });
  }

  // ---- Evidence: outcomes and scope, not just activity ----
  const quantified = bullets.filter((bullet) => hasNumber(bullet));
  const quantifiedShare = bullets.length ? quantified.length / bullets.length : 0;
  if (bullets.length && quantifiedShare < 0.3) {
    findings.push({
      dimension: "evidence",
      severity: "high",
      message: `Only ${quantified.length} of ${bullets.length} bullets carry a number. Add scope — team size, budget, volume, timeframe — wherever your approved facts already state one.`,
    });
  }

  // ---- ATS: recognizable structure ----
  const unusualSections = parsed.sections.filter((section) => !ATS_SECTION_NAMES.some((pattern) => pattern.test(section.title.trim())));
  for (const section of unusualSections) {
    findings.push({ dimension: "ats", severity: "medium", message: `"${section.title}" is not a section name ATS parsers reliably recognize. Use a standard header such as Experience, Skills, or Education.` });
  }
  const missingDates = entries.filter((entry) => !entry.dates);
  for (const entry of missingDates) {
    findings.push({ dimension: "ats", severity: "high", message: `${entry.employer || entry.title || "An experience entry"} has no dates. Parsers use them to build your timeline.` });
  }
  if (!parsed.contact || !/@/.test(parsed.contact)) {
    findings.push({ dimension: "ats", severity: "high", message: "No email address in the header — parsers look there first for contact details." });
  }

  // ---- Relevance: does the draft answer this posting ----
  const covered = [...roleTerms].filter((term) => body.toLowerCase().includes(term));
  const coverage = roleTerms.size ? covered.length / roleTerms.size : 0;
  const missingTerms = [...roleTerms].filter((term) => !body.toLowerCase().includes(term)).slice(0, 8);
  if (roleTerms.size && coverage < 0.4) {
    findings.push({
      dimension: "relevance",
      severity: "high",
      message: `The posting emphasizes terms this draft does not use: ${missingTerms.join(", ")}. Mirror the ones your approved facts genuinely support — leave the rest out.`,
    });
  }

  // ---- Market fit: US conventions and length ----
  const outOfOrder = entries.filter((entry, position) => position > 0 && endYear(entry.dates) > endYear(entries[position - 1].dates));
  if (outOfOrder.length) {
    findings.push({ dimension: "market", severity: "high", message: "Experience is not in reverse-chronological order, which is the expected US format." });
  }
  const totalWords = words(text).length;
  if (totalWords > 1_100) {
    findings.push({ dimension: "market", severity: "medium", message: `At roughly ${totalWords} words this will run past two pages. Trim the least relevant real experience rather than shrinking the type.` });
  }
  if (bullets.length && totalWords < 250) {
    findings.push({ dimension: "market", severity: "medium", message: `At roughly ${totalWords} words this reads thin for a US résumé. Add supported detail to the most relevant roles.` });
  }
  if (/\b(?:date of birth|marital status|nationality|photo(?:graph)?\b|age:)\b/i.test(text)) {
    findings.push({ dimension: "market", severity: "high", message: "Remove personal details US résumés omit — date of birth, marital status, nationality, or a photo." });
  }
  if (skills.length && skills.length < 9) {
    findings.push({ dimension: "market", severity: "low", message: `${skills.length} skills listed; 9–12 is the usual range and gives recruiters more to scan.` });
  }

  const scores = {
    relevance: roleTerms.size ? band(coverage, 0.4, 0.65) : 1,
    evidence: bullets.length ? band(quantifiedShare, 0.25, 0.5) : 0,
    ats: penaltyBand(findings.filter((item) => item.dimension === "ats")),
    clarity: penaltyBand(findings.filter((item) => item.dimension === "clarity")),
    market: penaltyBand(findings.filter((item) => item.dimension === "market")),
  };
  const score = Object.values(scores).reduce((total, value) => total + value, 0);

  return {
    score,
    scores,
    findings,
    stats: {
      words: totalWords,
      bullets: bullets.length,
      quantifiedBullets: quantified.length,
      skills: skills.length,
      entries: entries.length,
      keywordCoverage: roleTerms.size ? Math.round(coverage * 100) : null,
      missingKeywords: missingTerms,
    },
  };
}

// 2 = clears the higher bar, 1 = clears the lower one, 0 = below both.
function band(value, low, high) {
  if (value >= high) return 2;
  if (value >= low) return 1;
  return 0;
}

// A dimension graded by what went wrong: any high-severity finding caps it at
// 0, otherwise each medium finding costs a point.
function penaltyBand(items) {
  if (items.some((item) => item.severity === "high")) return 0;
  const medium = items.filter((item) => item.severity === "medium").length;
  return Math.max(0, 2 - medium);
}

const KEYWORD_STOP_WORDS = new Set([
  "about", "across", "after", "all", "also", "and", "any", "are", "based", "been", "being", "both", "but", "can",
  "company", "each", "experience", "for", "from", "have", "help", "here", "how", "into", "job", "join", "look",
  "looking", "make", "more", "most", "must", "need", "new", "not", "off", "one", "opportunity", "other", "our", "out",
  "over", "position", "role", "should", "some", "strong", "such", "team", "teams", "than", "that", "the", "their",
  "them", "then", "these", "they", "this", "through", "time", "under", "using", "very", "want", "was", "way", "well",
  "were", "what", "when", "where", "which", "while", "who", "will", "with", "within", "work", "working", "would",
  "you", "your", "years", "including", "ability", "candidate", "candidates", "responsibilities", "requirements",
  "preferred", "required", "plus", "etc",
]);

// The posting's own emphasis: terms it repeats are the ones worth mirroring.
function keywordSet(roleText) {
  const counts = new Map();
  for (const token of String(roleText || "").toLowerCase().match(/[a-z][a-z+#.-]{3,}/g) || []) {
    const term = token.replace(/[.]+$/, "");
    if (term.length < 4 || KEYWORD_STOP_WORDS.has(term)) continue;
    counts.set(term, (counts.get(term) || 0) + 1);
  }
  return new Set([...counts.entries()]
    .filter(([, count]) => count >= 2)
    .sort((left, right) => right[1] - left[1])
    .slice(0, 25)
    .map(([term]) => term));
}

export const RESUME_STANDARD_DIMENSIONS = [
  { key: "relevance", label: "Relevance", detail: "Bullets map to what this posting actually asks for." },
  { key: "evidence", label: "Evidence", detail: "Claims carry the scope and numbers your approved facts support." },
  { key: "ats", label: "ATS compatibility", detail: "Standard sections, complete dates, parseable contact details." },
  { key: "clarity", label: "Clarity", detail: "No jargon, no first person, no duty-only bullets." },
  { key: "market", label: "Market fit", detail: "US conventions: reverse-chronological, right length, nothing personal." },
];
