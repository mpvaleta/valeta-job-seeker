import assert from "node:assert/strict";
import test from "node:test";

import { auditResume } from "../lib/resume-standards.mjs";

const STRONG = `Marcos Valeta
Project and Operations Manager
Fremont, CA | marcos@example.com | 555-123-4567 | linkedin.com/in/mvaleta

PROFESSIONAL SUMMARY
Creative operations leader who plans integrated brand campaigns and keeps cross-functional delivery predictable across agency and in-house teams. Manages campaign budgets and vendor relationships from brief through launch.

CORE SKILLS
Budget management • Vendor selection and management • Cross-functional team coordination • Structured creative briefs • Status reporting and project tracking • Integrated campaign delivery • Creative review management • Production scheduling • Stakeholder communication

PROFESSIONAL EXPERIENCE
Acme Studio | San Francisco, CA
Senior Project Manager | 2019 – Present
• Delivered 12 integrated brand campaigns per year across brand, design, and media teams.
• Managed campaign budgets up to $250,000 and 14 vendor contracts through launch.
• Reduced creative revision cycles from 4 rounds to 2 by introducing structured briefs.
• Coordinated cross-functional stakeholder reporting across 8 concurrent workstreams.

Northwind Agency | Oakland, CA
Producer | 2015 – 2018
• Scheduled crews and locations for 30 national broadcast shoots per year.
• Maintained production paperwork and compliance records for 200 shoot days.

EDUCATION
• B.A. Communications, State University`;

const ROLE = `We are hiring a Brand Project Manager to lead integrated campaign delivery.
Manage campaign budgets, timelines, and vendor relationships end to end.
Coordinate creative production with designers, copywriters, and external agencies.
Run stakeholder reporting and keep cross-functional teams aligned on campaign delivery.
Improve creative review and revision workflows. Vendor management and budgets are central.`;

test("a strong tailored résumé scores near the top of the rubric", () => {
  const audit = auditResume(STRONG, { roleText: ROLE });
  assert.ok(audit.score >= 8, `expected a high score, got ${audit.score}: ${JSON.stringify(audit.findings, null, 1)}`);
  assert.equal(audit.scores.clarity, 2);
  assert.equal(audit.scores.evidence, 2);
  assert.equal(audit.scores.ats, 2);
});

test("banned jargon is flagged with the phrase named", () => {
  const audit = auditResume(STRONG.replace(
    "Creative operations leader who plans",
    "Passionate, results-driven team player and self-starter who plans",
  ), { roleText: ROLE });
  const clarity = audit.findings.filter((item) => item.dimension === "clarity");
  const phrases = clarity.map((item) => item.message).join(" ");
  assert.match(phrases, /passionate/i);
  assert.match(phrases, /results-driven/i);
  assert.match(phrases, /team player/i);
  assert.match(phrases, /self-starter/i);
  assert.equal(audit.scores.clarity, 0, "jargon should zero the clarity dimension");
});

test("a word that merely contains a banned phrase is not flagged", () => {
  // "compassionate" contains "passionate"; the check is word-boundary anchored.
  const audit = auditResume(STRONG.replace("Creative operations leader", "Compassionate operations leader"), { roleText: ROLE });
  assert.ok(!audit.findings.some((item) => /passionate/i.test(item.message)), JSON.stringify(audit.findings));
});

test("first-person pronouns are flagged", () => {
  const audit = auditResume(STRONG.replace(
    "• Delivered 12 integrated brand campaigns",
    "• I delivered 12 integrated brand campaigns",
  ), { roleText: ROLE });
  assert.ok(audit.findings.some((item) => /first-person/i.test(item.message)));
});

test("duty-opening bullets are flagged as weak", () => {
  const audit = auditResume(STRONG.replace(
    "• Coordinated cross-functional stakeholder reporting across 8 concurrent workstreams.",
    "• Responsible for cross-functional stakeholder reporting across 8 concurrent workstreams.",
  ), { roleText: ROLE });
  assert.ok(audit.findings.some((item) => /Lead with what changed/i.test(item.message)));
});

test("a résumé with almost no numbers loses the evidence dimension", () => {
  const vague = STRONG
    .replace(/\d+ integrated brand campaigns per year/, "integrated brand campaigns")
    .replace(/up to \$250,000 and \d+ vendor contracts/, "and vendor contracts")
    .replace(/from 4 rounds to 2 /, "")
    .replace(/across 8 concurrent workstreams/, "across concurrent workstreams")
    .replace(/for 30 national broadcast shoots per year/, "for national broadcast shoots")
    .replace(/for 200 shoot days/, "");
  const audit = auditResume(vague, { roleText: ROLE });
  assert.equal(audit.scores.evidence, 0);
  assert.ok(audit.findings.some((item) => item.dimension === "evidence" && /carry a number/i.test(item.message)));
});

test("non-standard section names are flagged for ATS parsers", () => {
  const audit = auditResume(STRONG.replace("PROFESSIONAL SUMMARY", "WHAT I BRING"), { roleText: ROLE });
  assert.ok(audit.findings.some((item) => item.dimension === "ats" && /WHAT I BRING/.test(item.message)));
});

test("a missing email in the header is an ATS failure", () => {
  const audit = auditResume(STRONG.replace(" | marcos@example.com", ""), { roleText: ROLE });
  assert.ok(audit.findings.some((item) => item.dimension === "ats" && /email/i.test(item.message)));
  assert.equal(audit.scores.ats, 0);
});

test("experience out of reverse-chronological order is flagged", () => {
  const swapped = `Marcos Valeta
Project Manager
Fremont, CA | marcos@example.com

PROFESSIONAL EXPERIENCE
Northwind Agency | Oakland, CA
Producer | 2015 – 2018
• Scheduled crews for 30 national broadcast shoots per year.

Acme Studio | San Francisco, CA
Senior Project Manager | 2019 – Present
• Delivered 12 integrated brand campaigns per year.`;
  const audit = auditResume(swapped, { roleText: ROLE });
  assert.ok(audit.findings.some((item) => /reverse-chronological/i.test(item.message)));
});

test("personal details US résumés omit are flagged", () => {
  const audit = auditResume(`${STRONG}\n\nDate of birth: 1985-04-02`, { roleText: ROLE });
  assert.ok(audit.findings.some((item) => /date of birth|marital|nationality|photo/i.test(item.message)));
});

test("keyword coverage reports what the posting emphasizes and the draft misses", () => {
  // The posting repeats campaign, delivery, budgets, vendor, and creative;
  // this draft uses none of them, so coverage should collapse.
  const offTarget = STRONG
    .replace(/campaign/gi, "initiative")
    .replace(/vendor/gi, "supplier")
    .replace(/creative/gi, "editorial")
    .replace(/delivery/gi, "execution")
    .replace(/budgets?/gi, "spend");
  const audit = auditResume(offTarget, { roleText: ROLE });
  assert.ok(audit.stats.keywordCoverage !== null);
  assert.ok(audit.stats.missingKeywords.length > 0);
  assert.ok(audit.findings.some((item) => item.dimension === "relevance"));
});

test("the audit never rewrites the résumé, only reports on it", () => {
  const audit = auditResume(STRONG, { roleText: ROLE });
  assert.ok(!("text" in audit), "the audit must not return replacement text");
  assert.ok(!("rewritten" in audit));
  for (const finding of audit.findings) {
    assert.equal(typeof finding.message, "string");
    assert.ok(["relevance", "evidence", "ats", "clarity", "market"].includes(finding.dimension));
  }
});

test("an empty or unusable draft does not throw", () => {
  for (const value of ["", "   ", "Just a name"]) {
    const audit = auditResume(value, { roleText: ROLE });
    assert.ok(Number.isFinite(audit.score));
    assert.ok(audit.score >= 0 && audit.score <= 10);
  }
});

test("scores stay within the rubric's 0-10 range", () => {
  for (const value of [STRONG, "", "Name\nTitle\n\nEXPERIENCE\nAcme\nPM | 2019 – 2024\n• Did work."]) {
    const audit = auditResume(value, { roleText: ROLE });
    assert.ok(audit.score >= 0 && audit.score <= 10, `${audit.score} out of range`);
    for (const dimension of Object.values(audit.scores)) {
      assert.ok(dimension >= 0 && dimension <= 2, `dimension ${dimension} out of range`);
    }
  }
});

// ---- Truthfulness against approved evidence ----

const FACTS = [
  "Led creative operations at Acme Studios as a Senior Project Manager from 2019 to 2024.",
  "Managed a $1,200,000 annual production budget across 14 vendors.",
  "Cut campaign turnaround time by 35% by standardizing the brief process.",
];

const TRUTHFUL_DRAFT = `Marcos Valeta
Project and Operations Manager
Fremont, CA | marcos@example.com

PROFESSIONAL EXPERIENCE
Acme Studios | San Francisco, CA
Senior Project Manager | 2019 – 2024
• Managed a $1,200,000 annual production budget across 14 vendors.
• Cut campaign turnaround time by 35% by standardizing the brief process.`;

test("a draft whose numbers and employers all trace to approved facts raises no truthfulness flag", () => {
  const audit = auditResume(TRUTHFUL_DRAFT, { approvedFacts: FACTS });
  assert.ok(!audit.findings.some((item) => /does not appear in any approved fact|does not appear in your approved evidence/.test(item.message)),
    JSON.stringify(audit.findings, null, 2));
});

test("a metric that grew in editing is flagged against the approved facts", () => {
  const inflated = TRUTHFUL_DRAFT.replace("35%", "65%");
  const audit = auditResume(inflated, { approvedFacts: FACTS });
  const flagged = audit.findings.filter((item) => /The number "65"/.test(item.message));
  assert.equal(flagged.length, 1, "the inflated number must be flagged exactly once");
  assert.equal(flagged[0].severity, "high");
});

test("an employer the evidence never names is flagged", () => {
  const wrongEmployer = TRUTHFUL_DRAFT.replace("Acme Studios", "Globex Media");
  const audit = auditResume(wrongEmployer, { approvedFacts: FACTS });
  assert.ok(audit.findings.some((item) => /The employer "Globex Media"/.test(item.message)));
});

test("years are never treated as unsupported metrics", () => {
  // "2019 – 2024" appears reformatted in every generated draft; the timeline
  // is checked structurally, not as a numeric claim.
  const audit = auditResume(`Name\nTitle\nname@example.com\n\nPROFESSIONAL EXPERIENCE\nAcme Studios\nSenior Project Manager | 2019 – 2024\n• Standardized the brief process at Acme Studios.`, { approvedFacts: FACTS });
  assert.ok(!audit.findings.some((item) => /The number "(?:2019|2024)"/.test(item.message)));
});

test("the truthfulness check stays silent when no approved facts are supplied", () => {
  const inflated = TRUTHFUL_DRAFT.replace("35%", "65%");
  const audit = auditResume(inflated, {});
  assert.ok(!audit.findings.some((item) => /approved fact|approved evidence/.test(item.message)));
});

test("truthfulness findings never move the score bands", () => {
  const inflated = TRUTHFUL_DRAFT.replace("35%", "65%");
  const withFacts = auditResume(inflated, { approvedFacts: FACTS });
  const withoutFacts = auditResume(inflated, {});
  assert.deepEqual(withFacts.scores, withoutFacts.scores, "flags are review prompts, not grade changes");
});
