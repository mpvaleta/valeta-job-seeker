import assert from "node:assert/strict";
import test from "node:test";

import { analyzeRole, extractRequirements, overlapScore } from "../lib/recommendation-engine.mjs";

const alignedJob = `
Lead cross-functional marketing programs from creative brief through launch.
Manage integrated campaign timelines, budgets, delivery risks, and stakeholder communication.
Coordinate creative production with design, content, media, agencies, and external vendors.
Use project management systems to report status and resolve delivery blockers.
Partner with brand marketing and agency teams across multiple workstreams.
`;

const alignedFacts = [
  "Led cross-functional marketing programs from creative brief through launch with brand, design, content, and media teams.",
  "Managed integrated campaign timelines, budgets, delivery risks, and stakeholder status reporting in project management systems.",
  "Coordinated creative production with agencies and external vendors and resolved blockers across multiple workstreams.",
];

const readyProfile = {
  name: "Test Candidate",
  email: "candidate@example.com",
  headline: "Creative operations and marketing program leader",
  summary: "Cross-functional leader focused on clear planning and reliable delivery.",
};

test("waits for a complete role instead of manufacturing a fit score", () => {
  const analysis = analyzeRole({ jobText: "Brand project manager", facts: alignedFacts, profile: readyProfile });
  assert.equal(analysis.fit, 0);
  assert.equal(analysis.recommendation.label, "Add the complete role");
  assert.equal(analysis.requirements.length, 0);
});

test("requires an approved evidence base before recommending an application", () => {
  const analysis = analyzeRole({ jobText: alignedJob, facts: alignedFacts.slice(0, 2), profile: readyProfile });
  assert.equal(analysis.recommendation.label, "Build evidence first");
  assert.equal(analysis.recommendation.tone, "hold");
});

test("prioritizes a strongly supported role and preserves source provenance", () => {
  const analysis = analyzeRole({
    jobText: alignedJob,
    facts: alignedFacts,
    profile: readyProfile,
    sources: [{ title: "Approved resume", approved: [alignedFacts[1]] }],
  });

  assert.equal(analysis.recommendation.label, "Prioritize and apply");
  assert.ok(analysis.evidenceCoverage >= 65);
  assert.ok(analysis.counts.strong >= 1);
  assert.ok(analysis.evidenceMap.some((item) => item.evidence.some((match) => match.fact === alignedFacts[1] && match.source === "Approved resume")));
});

test("holds a role when the approved evidence does not support its requirements", () => {
  const gapJob = `
Design flight-control algorithms for autonomous aerospace systems.
Develop embedded C++ software for safety-critical avionics hardware.
Validate control systems with MATLAB, Simulink, and hardware-in-the-loop testing.
Maintain FAA certification evidence and DO-178C compliance documentation.
`;
  const analysis = analyzeRole({ jobText: gapJob, facts: alignedFacts, profile: readyProfile });

  assert.equal(analysis.recommendation.label, "Hold and investigate");
  assert.ok(analysis.counts.gaps >= 3);
});

test("never places evidence outside the supplied approved fact list", () => {
  const analysis = analyzeRole({ jobText: alignedJob, facts: alignedFacts, profile: readyProfile });
  const allowed = new Set(alignedFacts);
  for (const item of analysis.evidenceMap) {
    for (const evidence of item.evidence) assert.ok(allowed.has(evidence.fact));
  }
  for (const fact of analysis.matchedFacts) assert.ok(allowed.has(fact));
});

test("analysis is deterministic and every score stays bounded", () => {
  const input = { jobText: alignedJob, facts: alignedFacts, profile: readyProfile };
  const first = analyzeRole(input);
  const second = analyzeRole(input);

  assert.deepEqual(first, second);
  for (const score of [first.fit, first.profileReadiness, first.evidenceCoverage, first.sourceQuality]) {
    assert.ok(score >= 0 && score <= 100);
  }
});

test("requirement extraction deduplicates lines and overlap is explicit", () => {
  const requirements = extractRequirements(`${alignedJob}\nLead cross-functional marketing programs from creative brief through launch.`);
  assert.equal(requirements.filter((item) => item === "Lead cross-functional marketing programs from creative brief through launch.").length, 1);
  assert.ok(overlapScore(alignedJob, alignedFacts[0]).shared > 0);
  assert.deepEqual(overlapScore("aerospace avionics certification", alignedFacts[0]), { shared: 0, score: 0 });
});
