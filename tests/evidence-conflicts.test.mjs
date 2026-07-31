import test from "node:test";
import assert from "node:assert/strict";
import { auditEvidence } from "../lib/evidence-conflicts.mjs";

function entry(id, text, sourceId, sourceTitle) {
  return { id, text, sourceId, sourceTitle };
}

test("flags a title conflict when two sources disagree about the role at the same employer and years", () => {
  const audit = auditEvidence([
    entry("a", "Senior Producer at Acme Studios, 2019–2021, led national broadcast campaigns from brief to delivery.", "doc-1", "Résumé 2023"),
    entry("b", "Marketing Coordinator at Acme Studios, 2019–2021, supported campaign logistics and vendor scheduling.", "doc-2", "LinkedIn export"),
  ]);
  assert.equal(audit.conflicts.length, 1);
  assert.equal(audit.conflicts[0].kind, "title");
  assert.match(audit.conflicts[0].detail, /Acme Studios/);
  assert.match(audit.conflicts[0].detail, /producer/i);
  assert.match(audit.conflicts[0].detail, /coordinator/i);
});

test("flags a metric conflict when two sources describe the same result with different numbers", () => {
  const audit = auditEvidence([
    entry("a", "Increased quarterly revenue by 20% through targeted campaign optimization at Beacon Corp, 2020–2022.", "doc-1", "Résumé 2023"),
    entry("b", "Increased quarterly revenue by 45% through targeted campaign optimization at Beacon Corp, 2020–2022.", "doc-2", "Custom GPT export"),
  ]);
  assert.equal(audit.conflicts.length, 1);
  assert.equal(audit.conflicts[0].kind, "metric");
  assert.match(audit.conflicts[0].detail, /20%/);
  assert.match(audit.conflicts[0].detail, /45%/);
});

test("does not flag a conflict across different employers", () => {
  const audit = auditEvidence([
    entry("a", "Producer at Acme Studios, 2019–2021, ran national broadcast production schedules.", "doc-1", "Résumé A"),
    entry("b", "Producer at Beacon Corp, 2019–2021, ran national broadcast production schedules.", "doc-2", "Résumé B"),
  ]);
  assert.equal(audit.conflicts.length, 0);
});

test("does not flag a conflict for non-overlapping years at the same employer (a promotion, not a contradiction)", () => {
  const audit = auditEvidence([
    entry("a", "Coordinator at Acme Studios, 2015–2017, supported production logistics for regional shoots.", "doc-1", "Résumé A"),
    entry("b", "Manager at Acme Studios, 2018–2021, led production logistics for national shoots.", "doc-2", "Résumé B"),
  ]);
  assert.equal(audit.conflicts.length, 0);
});

test("does not flag two facts from the same source against each other", () => {
  const audit = auditEvidence([
    entry("a", "Producer at Acme Studios, 2019–2021, led national broadcast campaigns.", "doc-1", "Résumé A"),
    entry("b", "Coordinator at Acme Studios, 2019–2021, supported campaign logistics.", "doc-1", "Résumé A"),
  ]);
  assert.equal(audit.conflicts.length, 0, "a single source disagreeing with itself is out of scope for this pass");
});

test("a year is never mistaken for a metric", () => {
  const audit = auditEvidence([
    entry("a", "Ran 20 campaigns at Acme Studios in 2019 with measurable lift in engagement.", "doc-1", "Résumé A"),
    entry("b", "Ran 20 campaigns at Acme Studios in 2019 with measurable lift in engagement, per year-end report.", "doc-2", "LinkedIn export"),
  ]);
  // Near-identical text -- lands as a duplicate, not a spurious 2019-vs-20 metric conflict.
  assert.equal(audit.conflicts.length, 0);
  assert.ok(audit.duplicates.length >= 1);
});

test("groups near-duplicate facts across sources into a cross-source cluster with a canonical fact", () => {
  const audit = auditEvidence([
    entry("a", "Led cross-functional creative production programs across the US, Brazil, and Australia for global partners.", "doc-1", "Résumé 2023"),
    entry("b", "Led cross functional creative production programs across the United States, Brazil and Australia for global partners.", "doc-2", "Résumé 2024"),
    entry("c", "Managed a completely unrelated vendor onboarding process for finance systems.", "doc-3", "Custom GPT export"),
  ]);
  assert.equal(audit.duplicates.length, 1);
  const cluster = audit.duplicates[0];
  assert.equal(cluster.members.length, 2);
  assert.equal(cluster.crossSource, true);
  assert.ok(["a", "b"].includes(cluster.members[0].id));
});

test("a fact already claimed by a duplicate cluster is never also reported as a conflict", () => {
  const audit = auditEvidence([
    entry("a", "Senior Producer at Acme Studios, 2019–2021, led national broadcast campaigns end to end.", "doc-1", "Résumé 2023"),
    entry("b", "Senior Producer at Acme Studios, 2019–2021, led national broadcast campaigns end to end.", "doc-2", "LinkedIn export"),
  ]);
  assert.equal(audit.duplicates.length, 1);
  assert.equal(audit.conflicts.length, 0);
});

test("short fragments and empty entries are ignored rather than crashing the audit", () => {
  const audit = auditEvidence([
    entry("a", "ok", "doc-1", "Résumé A"),
    entry("b", "", "doc-2", "Résumé B"),
    entry("c", null, "doc-3", "Résumé C"),
  ]);
  assert.deepEqual(audit, { duplicates: [], conflicts: [] });
});

test("auditEvidence tolerates a non-array input", () => {
  assert.deepEqual(auditEvidence(undefined), { duplicates: [], conflicts: [] });
  assert.deepEqual(auditEvidence(null), { duplicates: [], conflicts: [] });
});

test("real-looking distinct roles at the same company in the same window are not falsely flagged just for sharing an employer", () => {
  const audit = auditEvidence([
    entry("a", "Freelance Photographer for Acme Studios, 2020–2021, delivered brand photography for seasonal campaigns.", "doc-1", "Résumé A"),
    entry("b", "Freelance Photographer for Acme Studios, 2020–2021, delivered brand photography for seasonal campaigns.", "doc-2", "Résumé B"),
  ]);
  // Identical claim from two sources -- this is a duplicate to canonicalize, not a conflict.
  assert.equal(audit.conflicts.length, 0);
  assert.equal(audit.duplicates.length, 1);
});
