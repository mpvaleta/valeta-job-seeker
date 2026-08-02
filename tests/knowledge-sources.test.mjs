import assert from "node:assert/strict";
import test from "node:test";
import { classifyKnowledgeSource, mergeWritingSample, removeWritingSample, scopeForCategory, sourceScope, sourceScopeLabel } from "../lib/knowledge-sources.mjs";
import { CURATED_RESUME_PLAYBOOK } from "../lib/resume-playbook.mjs";

test("knowledge categories keep résumé guidance, voice, research, and evidence separate", () => {
  assert.equal(scopeForCategory("Résumé"), "evidence");
  assert.equal(scopeForCategory("Custom GPT export"), "evidence");
  assert.equal(scopeForCategory("Résumé playbook"), "guidance");
  assert.equal(scopeForCategory("Writing sample"), "voice");
  assert.equal(scopeForCategory("Company research"), "research");
  assert.equal(sourceScope({ category: "Writing sample" }), "voice");
  assert.equal(sourceScope({ category: "Résumé playbook" }), "guidance");
  assert.equal(sourceScope({ scope: "research", category: "Résumé" }), "research");
  assert.equal(sourceScopeLabel("guidance"), "Résumé playbook");
});

test("content classification corrects a confidently misfiled résumé playbook without deleting it", () => {
  const result = classifyKnowledgeSource({
    selectedCategory: "Résumé",
    title: "Resume do and don't guide",
    text: "Resume best practices checklist. Use action verbs in bullet points. Tailor your resume for the ATS. Avoid writing long paragraphs.",
  });
  assert.equal(result.scope, "guidance");
  assert.equal(result.category, "Résumé playbook");
  assert.equal(result.confidence, "high");
  assert.equal(sourceScope({ category: "Résumé", scope: "evidence", title: "Resume tips", text: "Resume best practices and ATS checklist. Use action verbs in bullet points. Tailor your resume. Avoid writing long paragraphs." }), "guidance");
});

test("writing samples can be added and removed without entering the career fact bank", () => {
  const first = mergeWritingSample("Manual voice notes", "Email sample", "Hello—this sounds like me.");
  assert.match(first, /Manual voice notes/);
  assert.match(first, /--- Email sample ---/);
  assert.match(first, /Hello—this sounds like me\./);
  assert.equal(mergeWritingSample(first, "Email sample", "Duplicate"), first);
  const removed = removeWritingSample(first, "Email sample");
  assert.equal(removed, "Manual voice notes");
});

test("the bundled résumé playbook is source-linked, dated, and structurally valid", () => {
  assert.match(CURATED_RESUME_PLAYBOOK.version, /^\d{4}\.\d{2}\.\d{2}$/);
  assert.match(CURATED_RESUME_PLAYBOOK.lastReviewed, /^\d{4}-\d{2}-\d{2}$/);
  assert.ok(CURATED_RESUME_PLAYBOOK.sources.length >= 3);
  assert.ok(CURATED_RESUME_PLAYBOOK.rules.length >= 10);
  const sourceIds = new Set(CURATED_RESUME_PLAYBOOK.sources.map((source) => source.id));
  const ruleIds = new Set(CURATED_RESUME_PLAYBOOK.rules.map((rule) => rule.id));
  assert.equal(ruleIds.size, CURATED_RESUME_PLAYBOOK.rules.length);
  assert.ok(CURATED_RESUME_PLAYBOOK.sources.every((source) => /^https:\/\//.test(source.url)));
  assert.ok(CURATED_RESUME_PLAYBOOK.rules.every((rule) => ["do", "dont"].includes(rule.kind) && rule.text.length > 35 && rule.sourceIds.length > 0 && rule.sourceIds.every((id) => sourceIds.has(id))));
});
