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
