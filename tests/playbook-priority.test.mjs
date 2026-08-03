import assert from "node:assert/strict";
import test from "node:test";
import { prioritizeResumePlaybookRules } from "../lib/playbook-priority.mjs";

test("playbook prioritization removes overlapping rules without changing the source library", () => {
  const library = [
    "Always keep Education immediately after Professional Experience.",
    "Always keep education immediately after professional experience.",
    "Use concise accomplishment-oriented bullets.",
    "Never invent metrics.",
  ];
  const selected = prioritizeResumePlaybookRules(library, "Creative operations manager", 24);
  assert.equal(library.length, 4);
  assert.deepEqual(selected, [
    "Always keep Education immediately after Professional Experience.",
    "Use concise accomplishment-oriented bullets.",
    "Never invent metrics.",
  ]);
});

test("playbook prioritization keeps the strongest role-relevant rules within a bounded model budget", () => {
  const rules = Array.from({ length: 50 }, (_, index) => `General writing observation number ${index}.`);
  rules.push("Always use ATS-readable section labels.");
  rules.push("Prioritize creative operations achievements that match the role.");
  const selected = prioritizeResumePlaybookRules(rules, "Creative operations and ATS resume", 24);
  assert.ok(selected.length <= 24);
  assert.ok(selected.includes("Always use ATS-readable section labels."));
  assert.ok(selected.includes("Prioritize creative operations achievements that match the role."));
});
