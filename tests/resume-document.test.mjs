import assert from "node:assert/strict";
import test from "node:test";

import { parseResumeText, proseToHtml, resumeToHtml } from "../lib/resume-document.mjs";

const RESUME = `Marcos Valeta
Project and Operations Manager
Fremont, CA | marcos@example.com | 555-123-4567 | linkedin.com/in/example

PROFESSIONAL SUMMARY
Creative operations leader who plans integrated campaigns and keeps delivery predictable.

CORE SKILLS
Budget management • Vendor selection and management • Cross-functional team coordination

PROFESSIONAL EXPERIENCE
Acme Studio | San Francisco, CA
Senior Project Manager | 2019 – Present
• Led cross-functional campaign delivery across brand, design, and media teams.
• Managed integrated budgets and vendor contracts for national launches.

Northwind Agency | Oakland, CA
Producer | 2015 – 2019
• Coordinated production schedules, crews, and location logistics.

EDUCATION
• B.A. Communications, State University

LANGUAGES
• English (native), Portuguese (native)`;

test("parses the résumé header into name, headline, and contact", () => {
  const parsed = parseResumeText(RESUME);
  assert.equal(parsed.name, "Marcos Valeta");
  assert.equal(parsed.headline, "Project and Operations Manager");
  assert.match(parsed.contact, /marcos@example\.com/);
});

test("a headline containing a pipe is not mistaken for the contact line", () => {
  const parsed = parseResumeText(`Marcos Valeta
Project Manager | Cross-functional Delivery
Fremont, CA | marcos@example.com | 555-123-4567

PROFESSIONAL SUMMARY
Delivery leader.`);
  assert.equal(parsed.headline, "Project Manager | Cross-functional Delivery");
  assert.match(parsed.contact, /marcos@example\.com/);
});

test("splits each section into the right kind", () => {
  const parsed = parseResumeText(RESUME);
  const kinds = Object.fromEntries(parsed.sections.map((section) => [section.title, section.kind]));
  assert.equal(kinds["PROFESSIONAL SUMMARY"], "paragraph");
  assert.equal(kinds["CORE SKILLS"], "skills");
  assert.equal(kinds["PROFESSIONAL EXPERIENCE"], "experience");
  assert.equal(kinds.EDUCATION, "list");
});

test("keeps employer, location, title, dates, and bullets together per entry", () => {
  const experience = parseResumeText(RESUME).sections.find((section) => section.kind === "experience");
  assert.equal(experience.entries.length, 2);
  const [first, second] = experience.entries;
  assert.equal(first.employer, "Acme Studio");
  assert.equal(first.location, "San Francisco, CA");
  assert.equal(first.title, "Senior Project Manager");
  assert.equal(first.dates, "2019 – Present");
  assert.equal(first.bullets.length, 2);
  assert.equal(second.employer, "Northwind Agency");
  assert.equal(second.dates, "2015 – 2019");
  assert.equal(second.bullets.length, 1);
});

test("splits skills on the bullet separator rather than on commas inside a skill", () => {
  const skills = parseResumeText(RESUME).sections.find((section) => section.kind === "skills");
  assert.deepEqual(skills.items, ["Budget management", "Vendor selection and management", "Cross-functional team coordination"]);
});

test("exports real résumé markup instead of a preformatted text dump", () => {
  const html = resumeToHtml(RESUME, { title: "Marcos Valeta — Résumé" });
  assert.doesNotMatch(html, /<pre[\s>]/, "the exported document must not wrap the résumé in <pre>");
  assert.match(html, /<h1 class="resume-name">Marcos Valeta<\/h1>/);
  assert.match(html, /<h2>Professional Experience<\/h2>/);
  assert.match(html, /<li>Led cross-functional campaign delivery/);
  assert.match(html, /page-break-inside: avoid/, "experience entries must not split across pages");
  // The old export printed a "Name — Tailored Resume" title above the résumé.
  assert.doesNotMatch(html.replace(/<title>[\s\S]*?<\/title>/, ""), /Tailored Resume/);
});

test("escapes user content so an edited draft cannot inject markup", () => {
  const html = resumeToHtml("Marcos <script>alert(1)</script>\nManager\n\nPROFESSIONAL SUMMARY\nSafe & sound.");
  assert.doesNotMatch(html.replace(/<script>window\.onload[\s\S]*?<\/script>/, ""), /<script>alert/);
  assert.match(html, /Safe &amp; sound\./);
});

test("survives an edited draft that drops the contact line or a section", () => {
  const edited = `Marcos Valeta
Producer

PROFESSIONAL EXPERIENCE
Acme Studio
Producer | 2019 – Present
• Ran production schedules.`;
  const parsed = parseResumeText(edited);
  assert.equal(parsed.name, "Marcos Valeta");
  assert.equal(parsed.contact, "");
  const entry = parsed.sections[0].entries[0];
  assert.equal(entry.employer, "Acme Studio");
  assert.equal(entry.location, "");
  assert.equal(entry.title, "Producer");
});

test("handles the flat fallback résumé that lists bullets with no employer header", () => {
  const flat = `Candidate name
Project and Operations Manager

PROFESSIONAL EXPERIENCE
• Managed campaign budgets end to end.
• Coordinated vendors across workstreams.`;
  const experience = parseResumeText(flat).sections.find((section) => section.kind === "experience");
  assert.equal(experience.entries.length, 1);
  assert.equal(experience.entries[0].employer, "");
  assert.equal(experience.entries[0].bullets.length, 2);
  assert.match(resumeToHtml(flat), /<li>Managed campaign budgets end to end\.<\/li>/);
});

test("keeps an employer name that itself contains a pipe", () => {
  const parsed = parseResumeText(`Name
Title

PROFESSIONAL EXPERIENCE
Foo | Bar Studio | Austin, TX
Producer | 2020 – 2024
• Did the work.`);
  const entry = parsed.sections[0].entries[0];
  assert.equal(entry.employer, "Foo | Bar Studio");
  assert.equal(entry.location, "Austin, TX");
});

test("does not mistake a date range or bulleted line for a section heading", () => {
  const parsed = parseResumeText(`Name
Title

PROFESSIONAL EXPERIENCE
ACME CORP | NY
Manager | 2019 – 2024
• SHOUTED ACHIEVEMENT IN CAPS`);
  assert.equal(parsed.sections.length, 1);
  assert.equal(parsed.sections[0].entries[0].bullets[0], "SHOUTED ACHIEVEMENT IN CAPS");
});

test("renders a cover letter as prose without résumé section rules", () => {
  const html = proseToHtml("Dear Hiring Team,\n\nI am interested in the role.\n\nBest,\nMarcos");
  assert.doesNotMatch(html, /<pre[\s>]/);
  assert.match(html, /<p>Dear Hiring Team,<\/p>/);
  assert.match(html, /Best,<br \/>Marcos/);
});
