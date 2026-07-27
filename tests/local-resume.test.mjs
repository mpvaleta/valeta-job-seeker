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
