import test from "node:test";
import assert from "node:assert/strict";
import { estimateUsageCost, formatEstimatedCost } from "../lib/ai-pricing.mjs";

test("estimates cost from input and output tokens at the model's tier rate", () => {
  const cost = estimateUsageCost("anthropic", "reliable", { inputTokens: 1_000_000, outputTokens: 1_000_000 });
  assert.equal(cost, 30); // $5 input + $25 output per the reliable tier
});

test("cheaper tiers cost less for the same usage", () => {
  const usage = { inputTokens: 100_000, outputTokens: 20_000 };
  const reliable = estimateUsageCost("anthropic", "reliable", usage);
  const fast = estimateUsageCost("anthropic", "fast", usage);
  assert.ok(fast < reliable);
});

test("returns null for an unknown provider or model tier rather than a wrong number", () => {
  assert.equal(estimateUsageCost("unknown-provider", "reliable", { inputTokens: 100, outputTokens: 100 }), null);
  assert.equal(estimateUsageCost("anthropic", "unknown-tier", { inputTokens: 100, outputTokens: 100 }), null);
});

test("returns null when usage is missing rather than treating it as zero", () => {
  assert.equal(estimateUsageCost("anthropic", "reliable", undefined), null);
  assert.equal(estimateUsageCost("anthropic", "reliable", null), null);
  assert.equal(estimateUsageCost("anthropic", "reliable", {}), null);
});

test("formatEstimatedCost floors tiny costs to a readable message instead of $0.00", () => {
  assert.equal(formatEstimatedCost(0.002), "less than $0.01");
  assert.equal(formatEstimatedCost(0), "less than $0.01");
});

test("formatEstimatedCost shows more precision under a dollar", () => {
  assert.equal(formatEstimatedCost(0.456), "~$0.456");
  assert.equal(formatEstimatedCost(12.3), "~$12.30");
});

test("formatEstimatedCost handles a missing estimate", () => {
  assert.equal(formatEstimatedCost(null), "");
});
