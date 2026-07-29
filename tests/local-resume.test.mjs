import assert from "node:assert/strict";
import test from "node:test";
import { buildLocalResume } from "../lib/local-resume.mjs";

const FACTS = [
  "Managed end-to-end delivery of 12 integrated brand campaigns per year at Example Agency (2019-2024) as Senior Project Manager.",
  "Coordinated cross-functional teams of up to 15 designers, copywriters, and producers at Example Agency.",
  "Reduced average creative revision cycles from 4 rounds to 2 at Example Agency by introducing structured creative briefs.",
  "Managed production budgets up to $250,000 per campaign at Example Agency.",
  "Worked as Production Coordinator at Sample Studios (2016-2019) supporting broadcast commercial shoots.",
  "Scheduled crews, booked locations, and tracked call sheets for 30+ commercial shoots per year at Sample Studios.",
  "Bachelor of Arts in Communications, Example State University, 2016.",
  "Proficient in Asana, Trello, Frame.io, Airtable, and Google Workspace.",
  "Completed Google Project Management Certificate in 2023.",
];

const ROLE = "Brand Project Manager leading campaign budgets, vendors, creative reviews, and production schedules.";

test("local résumé groups experience by employer in reverse chronological order", () => {
  const resume = buildLocalResume({ facts: FACTS, roleText: ROLE, headline: "Brand-focused Project Manager", summary: "Summary." });
  assert.equal(resume.experience.length, 2);
  assert.equal(resume.experience[0].company, "Example Agency");
  assert.equal(resume.experience[0].title, "Senior Project Manager");
  assert.equal(resume.experience[0].dates, "2019 – 2024");
  assert.equal(resume.experience[1].company, "Sample Studios");
  assert.equal(resume.experience[1].title, "Production Coordinator");
  assert.equal(resume.experience[1].dates, "2016 – 2019");
  assert.ok(resume.experience[0].bullets.length >= 3);
});

test("education, certifications, and tools leave the experience section", () => {
  const resume = buildLocalResume({ facts: FACTS, roleText: ROLE });
  const bulletText = resume.experience.flatMap((entry) => entry.bullets.map((bullet) => bullet.text)).join(" ");
  assert.doesNotMatch(bulletText, /Bachelor of Arts|Certificate|Proficient in/);
  assert.equal(resume.education.length, 1);
  assert.match(resume.education[0].text, /Bachelor of Arts/);
  assert.equal(resume.professional_development.length, 1);
  assert.match(resume.professional_development[0].text, /Certificate/);
});

test("core skills are readable capabilities, never keyword stems", () => {
  const resume = buildLocalResume({ facts: FACTS, roleText: ROLE });
  assert.ok(resume.core_skills.length >= 6);
  for (const skill of resume.core_skills) {
    assert.ok(skill.label.split(/\s+/).length >= 2, `stem-like skill: ${skill.label}`);
    assert.ok(skill.fact_indexes.length >= 1, `uncited skill: ${skill.label}`);
    for (const index of skill.fact_indexes) assert.ok(index >= 0 && index < FACTS.length);
  }
  const labels = resume.core_skills.map((skill) => skill.label.toLowerCase());
  assert.equal(new Set(labels).size, labels.length);
  assert.match(labels.join(" "), /asana/);
});

test("every bullet cites its approved fact and only removes header redundancy", () => {
  const resume = buildLocalResume({ facts: FACTS, roleText: ROLE });
  for (const entry of resume.experience) {
    for (const bullet of entry.bullets) {
      const fact = FACTS[bullet.fact_indexes[0]].replace(/[.,;]/g, "");
      const bulletWords = bullet.text.replace(/[.,;]/g, "").split(/\s+/);
      for (const word of bulletWords) assert.ok(fact.includes(word), `bullet adds "${word}" beyond its fact`);
      assert.doesNotMatch(bullet.text, new RegExp(`at ${entry.company}`));
    }
  }
  const numbers = resume.experience.flatMap((entry) => entry.bullets.flatMap((bullet) => bullet.text.match(/[$\d][\d,.]*/g) || []));
  for (const number of numbers) assert.ok(FACTS.join(" ").includes(number), `invented number ${number}`);
});

test("output is deterministic and current dates render as Present", () => {
  const first = buildLocalResume({ facts: FACTS, roleText: ROLE });
  const second = buildLocalResume({ facts: FACTS, roleText: ROLE });
  assert.deepEqual(first, second);
  const ongoing = buildLocalResume({ facts: ["Managed campaign operations at Ongoing Co (2022-present) as Program Manager.", "Ran budgets at Ongoing Co.", "Coordinated vendors at Ongoing Co."], roleText: ROLE });
  assert.equal(ongoing.experience[0].dates, "2022 – Present");
});

test("insufficient or unstructured evidence returns null instead of a fake document", () => {
  assert.equal(buildLocalResume({ facts: [] }), null);
  assert.equal(buildLocalResume({ facts: ["One fact.", "Two facts."] }), null);
  assert.equal(buildLocalResume({ facts: ["Worked hard.", "Did many things.", "Was very reliable."] }), null);
});

test("facts that cannot be placed are reported as omissions, not dropped silently", () => {
  const facts = [...FACTS, "Improved internal documentation quality across several projects."];
  const resume = buildLocalResume({ facts, roleText: ROLE });
  assert.ok(resume.omissions.some((entry) => entry.includes("internal documentation")));
});

// The phrasing a real uploaded résumé produces: a standalone job header line
// followed by its accomplishment bullets. This shape used to parse to zero
// employers, collapsing the whole structured path to a flat fact dump.
const HEADER_STYLE_FACTS = [
  "Senior Project Manager, Acme Studios — Jan 2019 to Present",
  "Led cross-functional marketing programs from creative brief through launch.",
  "Managed integrated campaign timelines, budgets, and delivery risks.",
  "Producer, Northwind Agency — March 2015 – December 2018",
  "Ran production schedules, crews, and location logistics for broadcast shoots.",
  "B.A. Communications, State University",
  "Fluent in English and Portuguese",
];

test("standalone job headers with month-qualified dates build real experience entries", () => {
  const resume = buildLocalResume({ facts: HEADER_STYLE_FACTS, roleText: ROLE });
  assert.ok(resume, "header-style evidence must not collapse to the flat fallback");
  assert.equal(resume.experience.length, 2);
  assert.equal(resume.experience[0].company, "Acme Studios");
  assert.equal(resume.experience[0].title, "Senior Project Manager");
  assert.equal(resume.experience[0].dates, "2019 – Present");
  assert.equal(resume.experience[1].company, "Northwind Agency");
  assert.equal(resume.experience[1].dates, "2015 – 2018");
});

test("bullets after a standalone header attach to it without repeating the header", () => {
  const resume = buildLocalResume({ facts: HEADER_STYLE_FACTS, roleText: ROLE });
  const [current] = resume.experience;
  assert.equal(current.bullets.length, 2);
  for (const bullet of current.bullets) {
    assert.doesNotMatch(bullet.text, /Acme Studios|Senior Project Manager|2019/);
  }
  // The header line itself is the entry, never also a bullet.
  assert.ok(!current.bullets.some((bullet) => /^Senior Project Manager,/.test(bullet.text)));
});

test("education and languages are recognized from abbreviated evidence", () => {
  const resume = buildLocalResume({ facts: HEADER_STYLE_FACTS, roleText: ROLE });
  assert.equal(resume.education.length, 1);
  assert.match(resume.education[0].text, /B\.A\. Communications/);
  assert.equal(resume.languages.length, 1);
});

test("a short fact is stripped to its accomplishment rather than repeating the entry header", () => {
  const resume = buildLocalResume({
    facts: [
      "Managed integrated campaigns at Acme Studios as a Senior Project Manager (2019-2024).",
      "Coordinated vendors and budgets at Acme Studios as a Senior Project Manager (2019-2024).",
      "Reduced revision cycles at Acme Studios as a Senior Project Manager (2019-2024).",
    ],
    roleText: ROLE,
  });
  for (const bullet of resume.experience[0].bullets) {
    assert.doesNotMatch(bullet.text, /at Acme Studios|as a Senior Project Manager|2019-2024/, `bullet repeats the header: ${bullet.text}`);
  }
});

test("a promotion at one employer keeps both roles instead of overwriting the earlier one", () => {
  const resume = buildLocalResume({
    facts: [
      "Worked at Acme Studios as a Coordinator (2015-2018) supporting campaign delivery.",
      "Worked at Acme Studios as a Senior Project Manager (2018-2024) leading campaign delivery.",
      "Managed budgets at Acme Studios as a Senior Project Manager (2018-2024).",
    ],
    roleText: ROLE,
  });
  assert.equal(resume.experience.length, 2);
  assert.deepEqual(resume.experience.map((entry) => entry.title), ["Senior Project Manager", "Coordinator"]);
  assert.equal(resume.experience[1].dates, "2015 – 2018");
});

test("a client named with 'for' never becomes the employer when the fact names a real one", () => {
  const resume = buildLocalResume({
    facts: [
      "Delivered a national campaign for Nike as a Producer (2019-2021) while employed at Northwind Agency.",
      "Managed vendor contracts for Nike as a Producer (2019-2021).",
      "Coordinated creative reviews for Nike as a Producer (2019-2021).",
    ],
    roleText: ROLE,
  });
  assert.equal(resume.experience.length, 1, "Nike must not become a second employer");
  assert.equal(resume.experience[0].company, "Northwind Agency");
  // The client is still legitimate evidence and stays visible in the bullets.
  assert.match(resume.experience[0].bullets.map((bullet) => bullet.text).join(" "), /Nike/);
});

test("an employer is still recovered from 'for' when no other employer is named", () => {
  const resume = buildLocalResume({
    facts: [
      "Ran production schedules for Northwind Agency as a Producer (2015-2019).",
      "Booked crews and locations for Northwind Agency as a Producer (2015-2019).",
      "Tracked call sheets for Northwind Agency as a Producer (2015-2019).",
    ],
    roleText: ROLE,
  });
  assert.equal(resume.experience.length, 1);
  assert.equal(resume.experience[0].company, "Northwind Agency");
});

test("a city stated in the evidence becomes the entry location", () => {
  const resume = buildLocalResume({
    facts: [
      "Managed campaigns at Acme Studios in San Francisco, CA as a Senior Project Manager (2019-2024).",
      "Coordinated vendors at Acme Studios as a Senior Project Manager (2019-2024).",
      "Reduced revision cycles at Acme Studios as a Senior Project Manager (2019-2024).",
    ],
    roleText: ROLE,
  });
  assert.equal(resume.experience[0].location, "San Francisco, CA");
  assert.doesNotMatch(resume.experience[0].bullets[0].text, /San Francisco/);
});

test("achievements dropped by the per-entry bullet cap are recorded as omissions", () => {
  const facts = ["Senior Project Manager, Acme Studios — 2019 to 2024"];
  for (let index = 0; index < 9; index += 1) facts.push(`Delivered distinct campaign workstream number ${index} across teams.`);
  const resume = buildLocalResume({ facts, roleText: ROLE });
  assert.equal(resume.experience[0].bullets.length, 6);
  assert.ok(resume.omissions.length >= 3, `dropped achievements must be reported: ${JSON.stringify(resume.omissions)}`);
});

test("capability labels never claim a domain the evidence does not support", () => {
  const resume = buildLocalResume({
    facts: [
      "Senior Project Manager, Acme Studios — Jan 2019 to Present",
      "Led cross-functional marketing programs with brand, design, and media teams.",
      "Managed integrated campaign timelines, budgets, and delivery risks.",
    ],
    roleText: ROLE,
  });
  const labels = resume.core_skills.map((skill) => skill.label).join(" ");
  assert.doesNotMatch(labels, /Sports/, "the bare word 'teams' must not imply sports experience");
});

test("capability vocabulary covers tracks beyond brand and creative work", () => {
  const resume = buildLocalResume({
    facts: [
      "Marketing Operations Manager, Example Corp — 2020 to 2024",
      "Built lifecycle email campaigns and CRM segmentation in Salesforce.",
      "Reported weekly KPIs and channel dashboards to leadership.",
    ],
    roleText: "Marketing operations manager lifecycle CRM analytics",
  });
  const labels = resume.core_skills.map((skill) => skill.label).join(" ");
  assert.match(labels, /Marketing operations and CRM|Lifecycle and email programs|Analytics and performance reporting/);
});

// A fact carrying its own date range, whose title word was not recognized,
// used to be silently absorbed as a bullet under whichever job was still
// "open" — misattributing an entire second job's work to the wrong employer
// with no omission recorded at all. This is the most serious defect a résumé
// builder can have: it does not invent a fact, but it reassigns a real one.
test("a second concurrent job never gets absorbed into the first one's bullets", () => {
  const resume = buildLocalResume({
    facts: [
      "Part-time Marketing Coordinator, Acme Retail — Mar 2021 to present, 20 hours per week.",
      "Managed social media scheduling for Acme Retail.",
      "Part-time Barista, Blue Cup Cafe — Jun 2019 to present, weekends.",
      "Trained new baristas on espresso equipment at Blue Cup Cafe.",
    ],
    roleText: ROLE,
  });
  assert.equal(resume.experience.length, 2, "each concurrent job must get its own entry");
  const acme = resume.experience.find((entry) => entry.company === "Acme Retail");
  const cafe = resume.experience.find((entry) => entry.company === "Blue Cup Cafe");
  assert.ok(acme && cafe, "both employers must be recognized");
  assert.equal(acme.bullets.length, 1);
  assert.doesNotMatch(acme.bullets[0].text, /Blue Cup Cafe|barista/i, "Acme's bullets must not contain the other job's work");
  assert.equal(cafe.bullets.length, 1);
  assert.match(cafe.bullets[0].text, /espresso/i);
});

test("a fact naming a different 'at' employer than the open entry is reported as an omission, not merged in", () => {
  // "for <Name>" stays deliberately ambiguous elsewhere in this file (it can
  // describe a client the current employer serves), but "at <Name>" asserts
  // employment outright -- a fact naming a second "at" employer with no dates
  // of its own must never be folded into a different, already-open job.
  const resume = buildLocalResume({
    facts: [
      "Senior Project Manager, Acme Studios — 2019 to Present.",
      "Managed integrated campaigns and budgets.",
      "Advised the founding team at Nimbus Robotics on hiring practices.",
    ],
    roleText: ROLE,
  });
  assert.equal(resume.experience.length, 1);
  assert.doesNotMatch(resume.experience[0].bullets.map((b) => b.text).join(" "), /Nimbus Robotics/);
  assert.ok(resume.omissions.some((entry) => entry.includes("Nimbus Robotics")));
});

test("a 'for <client>' mention with no dates of its own stays attached to the open job, since it may describe work performed within that role", () => {
  const resume = buildLocalResume({
    facts: [
      "Senior Project Manager, Acme Studios — 2019 to Present.",
      "Managed integrated campaigns and budgets.",
      "Consulted for Zeta Ventures as part of an Acme Studios engagement.",
    ],
    roleText: ROLE,
  });
  assert.equal(resume.experience.length, 1);
  assert.match(resume.experience[0].bullets.map((b) => b.text).join(" "), /Zeta Ventures/);
});

test("'since <year>' with no end date is read as an ongoing role", () => {
  const resume = buildLocalResume({
    facts: [
      "Senior Project Manager, Acme Studios — since 2019.",
      "Led cross-functional campaign delivery across brand and media teams.",
      "Managed integrated budgets and vendor contracts.",
    ],
    roleText: ROLE,
  });
  assert.ok(resume, "'since <year>' must produce a structured résumé, not the flat fallback");
  assert.equal(resume.experience[0].dates, "2019 – Present");
  assert.doesNotMatch(resume.experience[0].bullets[0].text, /since 2019/i);
});

test("freelance work with no proper-noun employer still gets its own entry", () => {
  const resume = buildLocalResume({
    facts: [
      "Freelance Producer, various clients — 2020 to 2022.",
      "Produced video content for five different consumer brands.",
      "Managed production budgets and crews across multiple projects.",
    ],
    roleText: ROLE,
  });
  assert.ok(resume, "freelance phrasing with no company name must not collapse to the flat fallback");
  assert.equal(resume.experience[0].title, "Freelance Producer");
  assert.match(resume.experience[0].company, /various clients/i);
  assert.equal(resume.experience[0].dates, "2020 – 2022");
});

test("the widened title vocabulary recognizes common early-career and service roles", () => {
  for (const title of ["Barista", "Server", "Cashier", "Receptionist", "Bookkeeper"]) {
    const resume = buildLocalResume({
      facts: [
        `${title}, Acme Shop — 2019 to 2021.`,
        "Handled daily operations and customer service tasks.",
        "Trained new team members on store procedures.",
      ],
      roleText: ROLE,
    });
    assert.ok(resume, `${title} must be recognized as a title, not fall back to null`);
    assert.equal(resume.experience[0].title, title, title);
  }
});
