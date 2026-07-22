import assert from "node:assert/strict";
import test from "node:test";
import { deriveWritingVoice } from "../lib/writing-voice.mjs";

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
