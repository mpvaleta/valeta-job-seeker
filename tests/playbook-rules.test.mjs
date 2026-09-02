import assert from "node:assert/strict";
import test from "node:test";
import { normalizeTranscript, playbookRuleCandidates } from "../lib/playbook-rules.mjs";
import { factCandidates } from "../lib/fact-candidates.mjs";

// What YouTube's "Show transcript" actually puts on the clipboard: a timestamp
// on its own line before every caption line, no punctuation anywhere, and the
// channel's own housekeeping mixed in with the advice.
const CAPTIONS = `0:00
hey everyone welcome back to the channel
0:03
if you're new here hit subscribe and ring the bell
0:11
i've reviewed something like four thousand resumes
0:15
so the first thing is keep it to one page
0:19
unless you have more than ten years of experience
0:23
start every bullet with a strong action verb
0:27
not with responsible for
0:30
quantify the outcome whenever you can
0:34
numbers beat adjectives every single time
0:38
don't use a photo on a US resume
0:42
avoid tables and text boxes because the applicant tracking system cannot read them
0:48
i led a team of twelve at google so i know what recruiters skim for
0:54
tailor the summary to the job description three lines maximum
0:59
link in the description to the template i use`;

test("a pasted YouTube transcript becomes playbook rules", () => {
  const rules = playbookRuleCandidates(CAPTIONS);
  assert.ok(rules.length >= 5, `expected the advice to survive, got ${JSON.stringify(rules)}`);
  assert.ok(rules.some((rule) => /one page/i.test(rule)));
  assert.ok(rules.some((rule) => /action verb/i.test(rule)));
  assert.ok(rules.some((rule) => /applicant tracking system/i.test(rule)));
  assert.ok(rules.some((rule) => /three lines/i.test(rule)));
  // Read as sentences, not as caption fragments.
  assert.ok(rules.every((rule) => rule.split(/\s+/).length >= 5));
});

// The whole reason this extractor exists: the evidence extractor, pointed at
// the same transcript, returns nothing at all — it joins consecutive lines into
// one paragraph and drops anything over 900 characters.
test("the career-fact extractor cannot read a transcript, which is why this one exists", () => {
  // It joins consecutive lines into one paragraph, so a transcript arrives as a
  // single blob with the timestamps still in it — never as separate rules.
  const asFacts = factCandidates(CAPTIONS);
  assert.ok(asFacts.length <= 1, `expected one unusable blob, got ${asFacts.length}`);
  assert.ok(!asFacts.some((unit) => /^Keep it to one page/i.test(unit)), "no rule is recovered as its own unit");
  assert.ok(asFacts.every((unit) => /\d:\d\d/.test(unit)), "and the timestamps are still in what it returns");
  assert.ok(playbookRuleCandidates(CAPTIONS).length >= 5);
});

test("the channel's housekeeping and the speaker's own history never become rules", () => {
  const rules = playbookRuleCandidates(CAPTIONS).join(" | ").toLowerCase();
  assert.ok(!rules.includes("subscribe"), rules);
  assert.ok(!rules.includes("welcome back"), rules);
  assert.ok(!rules.includes("link in the description"), rules);
  // A stranger's career claim is neither guidance nor Marcos's evidence, and
  // the playbook outranks every curated rule — so this one matters most.
  assert.ok(!rules.includes("team of twelve"), rules);
  assert.ok(!rules.includes("four thousand"), rules);
});

test("a written article of the same advice reads the same way", () => {
  const prose = `Hey everyone, welcome back to the channel. If you're new here, hit subscribe.
I led recruiting at Google for six years.
Keep it to one page unless you have more than ten years of experience.
Start every bullet with a strong action verb, not with "responsible for".
Don't use a photo on a US resume.
Avoid tables and text boxes, the applicant tracking system cannot read them.
Tailor the summary to the job description, three lines maximum.
Link in the description to the template I use.`;
  const rules = playbookRuleCandidates(prose);
  assert.ok(rules.length >= 4, JSON.stringify(rules));
  assert.ok(!rules.join(" ").toLowerCase().includes("recruiting at google"));
  assert.ok(rules.some((rule) => /one page/i.test(rule)));
});

// A CV filed under the wrong category must not fill the playbook with a
// person's job history dressed up as editorial rules.
test("a résumé pasted into the playbook by mistake yields almost nothing", () => {
  const cv = `Marcos Valeta — Creative Operations

Led integrated production for a fourteen-person studio across three regions.

Managed a $2.4M annual production budget and reduced vendor spend by 18%.

Coordinated brand campaigns with agency partners from brief to delivery.

Education: BA Communications, 2009.`;
  assert.ok(playbookRuleCandidates(cv).length <= 1, JSON.stringify(playbookRuleCandidates(cv)));
  // And the extractor that is meant to read it still does.
  assert.ok(factCandidates(cv).length >= 3);
});

test("timestamps, speaker labels and sound cues are stripped before anything is read", () => {
  const normalized = normalizeTranscript(`00:01:15\nINTERVIEWER: what do you look for\n[music]\n1:20\nclarity above all`);
  assert.ok(!/\d:\d\d/.test(normalized), normalized);
  assert.ok(!/INTERVIEWER:/.test(normalized), normalized);
  assert.ok(!/\[music\]/i.test(normalized), normalized);
  assert.match(normalized, /what do you look for/);
});
