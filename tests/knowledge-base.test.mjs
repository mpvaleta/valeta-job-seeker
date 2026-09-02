import assert from "node:assert/strict";
import test from "node:test";
import { buildKnowledgeBase, knowledgeBasePlainText } from "../lib/knowledge-base.mjs";

const input = {
  profile: { name: "Marcos Valeta", headline: "Creative Operations", location: "Fremont, CA", summary: "Producer turned operator." },
  facts: ["Led integrated production for a fourteen-person studio.", "Managed a $2.4M annual production budget."],
  collapsed: 3,
  setAside: 2,
  conflicts: [{ kind: "metric", detail: "18% vs 22% vendor reduction", a: { text: "Reduced vendor spend by 18%.", source: "Résumé 2024" }, b: { text: "Reduced vendor spend by 22%.", source: "Résumé 2026" } }],
  playbookRules: ["Keep it to one page unless you have more than ten years of experience."],
  voice: { ready: true, tone: "Direct.", prefer: "Short sentences.", avoid: "Hype.", words: 1200 },
  tracks: [{ name: "Operations", headline: "Creative Operations Lead", focus: ["intake", "resourcing"] }],
  research: [{ title: "Giant Spoon", sourceUrl: "https://giantspoon.com", importedAt: "2026-09-01", excerpt: "Experiential agency in LA and NYC." }],
  sources: [
    { title: "Résumé 2026", type: "Word document", scope: "Career evidence", importedAt: "2026-09-02", candidates: 40, approved: 31 },
    { title: "Résumé tips talk", type: "YouTube transcript", scope: "Résumé playbook", importedAt: "2026-09-02", candidates: 6, approved: 6 },
  ],
  generatedAt: "2026-09-02",
};

test("the knowledge base carries every kind of knowledge, each under its own heading", () => {
  const markdown = buildKnowledgeBase(input);
  for (const heading of ["# Marcos Valeta — everything V’s knows", "## Profile", "## Career facts (2, deduplicated)", "## Facts that disagree (1)", "## Résumé playbook (1 rule)", "## Writing voice", "## Résumé tracks (1)", "## Research notes (1)", "## Sources (2)", "## Not in this document"]) {
    assert.ok(markdown.includes(heading), `missing ${heading}`);
  }
  assert.match(markdown, /1\. Led integrated production/);
  assert.match(markdown, /3 near-duplicates from overlapping sources collapsed/);
  assert.match(markdown, /2 lines set aside/);
  assert.match(markdown, /Different number.*18% vs 22%/);
  assert.match(markdown, /Résumé 2024/);
  assert.match(markdown, /31\/40 facts approved/);
  assert.match(markdown, /6\/6 rules active/);
  // The order the résumé builder depends on is the order the facts arrived in.
  assert.ok(markdown.indexOf("Led integrated") < markdown.indexOf("Managed a \\$2.4M") || markdown.indexOf("Led integrated") < markdown.indexOf("Managed a $2.4M"));
});

test("an empty workspace still produces a readable document that says what is missing", () => {
  const markdown = buildKnowledgeBase({ generatedAt: "2026-09-02" });
  assert.match(markdown, /# Candidate — everything V’s knows/);
  assert.match(markdown, /No approved facts yet/);
  assert.match(markdown, /No uploaded rules yet/);
  assert.match(markdown, /Not learned yet/);
  assert.match(markdown, /Nothing imported yet/);
  assert.ok(!markdown.includes("## Facts that disagree"), "no conflicts section when there are none");
});

test("the plain-text form loses the marks and keeps the words", () => {
  const plain = knowledgeBasePlainText(buildKnowledgeBase(input));
  assert.ok(!/^#/m.test(plain));
  assert.ok(!plain.includes("**"));
  assert.match(plain, /Career facts \(2, deduplicated\)/);
  assert.match(plain, /• Keep it to one page/);
});
