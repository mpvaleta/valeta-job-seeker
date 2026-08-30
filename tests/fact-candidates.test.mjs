import assert from "node:assert/strict";
import test from "node:test";
import { candidateQuality, factCandidates, stripInlineMarkdown, toUnits } from "../lib/fact-candidates.mjs";

// The bug this module exists for. A career document opens by explaining itself
// before it says anything about the career, and candidates used to be taken in
// document order and capped at 60 — so a long document surfaced its preamble
// and stopped before reaching a single employer.
test("a long document surfaces its career history, not just its opening pages", () => {
  const preamble = Array.from({ length: 80 }, (_, index) => `This document explains rule ${index + 1} about how the material must be used.`).join("\n\n");
  const history = [
    "## Waymaker Projects — General Manager & Founder",
    "San Francisco Bay Area, CA | Jan 2024 – Present",
    "- Built the full production operating model from scratch for a distributed team.",
    "## Monks — Senior Project Manager, New Business",
    "San Francisco Bay Area, CA | Jul 2021 – Apr 2023",
    "- Led RFPs for net-new global accounts and owned winning-hours validation.",
  ].join("\n");

  const candidates = factCandidates(`${preamble}\n\n${history}`);
  assert.ok(candidates.some((item) => item.includes("Waymaker")), "the first employer must survive");
  assert.ok(candidates.some((item) => item.includes("Monks")), "the last employer must survive too");
  assert.ok(candidates.some((item) => item.includes("Built the full production operating model")));

  // And with a cap tight enough to bite, it is the boilerplate that is dropped.
  const tight = factCandidates(`${preamble}\n\n${history}`, 12);
  assert.ok(tight.some((item) => item.includes("Waymaker")), "ranking must beat document order");
  assert.ok(tight.some((item) => item.includes("Led RFPs")));
});

// Résumés and knowledge bases are hard-wrapped, so a raw line is a fragment
// rather than a sentence.
test("hard-wrapped paragraphs are reassembled before they become candidates", () => {
  const wrapped = [
    "- Coordinated cross-regional teams across up to five countries",
    "  simultaneously, working with 30+ people across time zones including",
    "  resource managers, VPs, and C-level stakeholders.",
  ].join("\n");
  const candidates = factCandidates(wrapped);
  assert.equal(candidates.length, 1, "three wrapped lines are one fact");
  assert.match(candidates[0], /five countries simultaneously, working with 30\+ people/);
  assert.doesNotMatch(candidates[0], /\n/);
});

test("markdown markers never reach the approved text", () => {
  assert.equal(stripInlineMarkdown("**Bold** and *italic* and `code`"), "Bold and italic and code");
  assert.equal(stripInlineMarkdown("See [the profile](https://example.com/x)"), "See the profile");
  const candidates = factCandidates("### Google — Program Manager\n- **Led** creative production for `interactive` exhibits worldwide.");
  assert.ok(candidates.every((item) => !/[*`#]/.test(item)), `markdown leaked: ${JSON.stringify(candidates)}`);
});

// A job header dates and locates everything filed under it, and the résumé
// builder attaches bullets to the header above them — so headers have to
// survive the cap and stay in front of their bullets.
test("job headers survive and keep their position above their bullets", () => {
  const text = [
    "## Monks — Senior Project Manager",
    "San Francisco Bay Area, CA | Jul 2021 – Apr 2023",
    "- Owned project planning and validation of winning hours across pitches.",
  ].join("\n");
  const candidates = factCandidates(text);
  const header = candidates.findIndex((item) => item.includes("Jul 2021"));
  const bullet = candidates.findIndex((item) => item.includes("winning hours"));
  assert.ok(header >= 0 && bullet >= 0);
  assert.ok(header < bullet, "the header must arrive before the bullet it dates");
});

test("an accomplishment outranks an instruction about how to write one", () => {
  const fact = "Led creative and technical production for interactive exhibits at Google in Mountain View.";
  const rule = "Never invent anything. When a needed detail is missing, do not guess.";
  assert.ok(candidateQuality(fact) > candidateQuality(rule), `${candidateQuality(fact)} should beat ${candidateQuality(rule)}`);
});

test("no candidate is emitted twice, in any of its forms", () => {
  const candidates = factCandidates("## Google\n- Managed budgets across the partner centre network.\n- Managed budgets across the partner centre network.");
  const managed = candidates.filter((item) => item.includes("Managed budgets"));
  assert.equal(managed.length, 1);
});

test("toUnits separates headings from bodies", () => {
  const units = toUnits("## Waymaker\nBuilt the operating model from scratch for the distributed team.");
  assert.equal(units[0].kind, "heading");
  assert.equal(units[0].text, "Waymaker");
  assert.equal(units[1].kind, "body");
  assert.equal(units[1].heading, "Waymaker");
});
