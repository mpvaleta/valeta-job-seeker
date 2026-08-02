import test from "node:test";
import assert from "node:assert/strict";
import { preparePlaybookLibrary, prepareResumeEvidence } from "../lib/career-evidence.mjs";

test("resume evidence removes contacts, code, chatter, keyword dumps, and overlaps without deleting source data", () => {
  const result = prepareResumeEvidence([
    "marcos.valeta@gmail.com",
    "const result = JSON.parse(payload);",
    "tamo junto",
    "adobe • market • customer • product • sale • message • performance",
    "Led cross-functional creative production programs across the United States, Brazil, and Australia.",
    "Led cross functional creative production programs across the United States, Brazil and Australia for global partners.",
    "Google | Project Manager | 2020–2024",
  ]);
  assert.equal(result.facts.length, 2);
  assert.match(result.facts.join("\n"), /Led cross functional creative production programs/);
  assert.match(result.facts.join("\n"), /Google \| Project Manager/);
  assert.ok(result.duplicatesCollapsed >= 1);
  assert.ok(result.omitted.some((item) => item.reason === "code"));
  assert.ok(result.omitted.some((item) => item.reason === "contact"));
});

// The résumé builder reads approved facts as a sequence, attaching each
// accomplishment to the job header above it. Reordering by quality would put a
// terse header line below the bullets that belong to it.
test("cleaned evidence keeps the original résumé order", () => {
  const ordered = [
    "Senior Project Manager, Acme Studios — Jan 2019 to Present",
    "Led cross-functional marketing programs from creative brief through launch with brand and media teams.",
    "Managed integrated campaign timelines, budgets, and delivery risks across multiple workstreams.",
    "Producer, Northwind Agency — March 2015 – December 2018",
    "Ran production schedules, crews, call sheets, and location logistics for national broadcast shoots.",
  ];
  const result = prepareResumeEvidence(ordered);
  assert.deepEqual(result.facts, ordered, "hygiene must not reorder approved facts");
});

test("facts kept under a tight limit still appear in their original order", () => {
  const facts = [
    "Managed vendor contracts and procurement for national broadcast productions.",
    "Ran weekly status reporting for eight concurrent brand workstreams.",
    "Reduced creative revision cycles by introducing structured briefs.",
    "Booked crews, locations, and call sheets across three regional markets.",
    "Owned the annual production budget and quarterly forecast reconciliation.",
    "Mentored two junior coordinators through their first year of delivery work.",
  ];
  const result = prepareResumeEvidence(facts, 4);
  assert.equal(result.facts.length, 4);
  // Whichever four survive on quality, they appear in original relative order.
  const positions = result.facts.map((fact) => facts.indexOf(fact));
  assert.deepEqual(positions, [...positions].sort((left, right) => left - right));
});

test("playbook preparation keeps useful rules and removes code and duplicate guidance", () => {
  const rules = preparePlaybookLibrary([
    "Use specific accomplishment bullets supported by verified evidence.",
    "Use specific accomplishment bullets that are supported by verified evidence.",
    "return JSON.stringify(output)",
    "Never invent metrics, employers, dates, or outcomes.",
  ]);
  assert.equal(rules.length, 2);
  assert.match(rules.join("\n"), /Never invent metrics/);
});
