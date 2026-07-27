import assert from "node:assert/strict";
import test from "node:test";
import { cleanWritingSamples, deriveWritingVoice } from "../lib/writing-voice.mjs";

test("writing voice learns deterministic style signals from approved samples", () => {
  const sample = "I like to make complex work clear. I keep people aligned and I keep projects moving. We make decisions early, and we communicate clearly. I like to make progress visible. We keep the process practical, and we keep the language direct.";
  const voice = deriveWritingVoice(sample);
  assert.equal(voice.ready, true);
  assert.match(voice.tone, /concise|measured/i);
  assert.match(voice.prefer, /sentences/i);
  assert.ok(voice.stats.words >= 40);
});

test("writing voice refuses to overlearn from a tiny sample", () => {
  const voice = deriveWritingVoice("Sounds good. Thank you.");
  assert.equal(voice.ready, false);
  assert.match(voice.avoid, /do not infer/i);
});

test("writing voice ignores LinkedIn CSV columns, URLs, and throwaway replies", () => {
  const source = [
    "Date,Link,Message",
    "2026-07-16,https://www.linkedin.com/feed/update/1,Belo texto!",
    "2026-07-15,https://www.linkedin.com/feed/update/2,Thanks, Josh. It's always a pleasure!",
    "2026-07-14,https://www.linkedin.com/feed/update/3,What I value most in a project is making the moving parts visible early, so people can make better decisions without losing the human side of the work.",
    "2026-07-13,https://www.linkedin.com/feed/update/4,The strongest teams make room for honest questions, clear ownership, and the kind of follow-through that helps creative work move with confidence.",
    "2026-07-12,https://www.linkedin.com/feed/update/5,Good collaboration is not a vague principle to me; it is the daily practice of communicating clearly, making decisions visible, and protecting people’s time.",
  ].join("\n");
  const cleaned = cleanWritingSamples(source);
  assert.doesNotMatch(cleaned.text, /linkedin\.com|Date,Link,Message|Belo texto|Thanks, Josh/i);
  assert.match(cleaned.text, /moving parts visible early/i);
  const voice = deriveWritingVoice(source);
  assert.equal(voice.ready, true);
  assert.equal(voice.stats.kept, 3);
  assert.ok(voice.stats.dropped >= 2);
});
