import assert from "node:assert/strict";
import test from "node:test";

import { classifyCompanyCategory } from "../lib/radar.mjs";

test("early-stage companies are classified as startups", () => {
  const startups = [
    "Series A fintech building payments infrastructure",
    "We are a seed-stage startup based in San Francisco",
    "YC W24 company hiring our founding marketer",
    "Venture-backed, pre-seed, 12-person team",
    "Stealth mode consumer app",
  ];
  for (const context of startups) {
    assert.equal(classifyCompanyCategory("", context), "Startup / Early-stage", context);
  }
});

test("established companies are not mislabelled as startups", () => {
  // "growth" and "scaling" describe plenty of large companies, so they must not
  // on their own imply an early-stage employer.
  const established = [
    ["", "A global streaming media company with 4,000 employees", "Media"],
    ["", "Enterprise software platform for retail analytics", "Technology"],
    ["", "Our growth marketing team is scaling paid channels", "Other"],
    ["Brand / Consumer", "A seed-stage beauty brand", "Brand / Consumer"],
  ];
  for (const [explicit, context, expected] of established) {
    assert.equal(classifyCompanyCategory(explicit, context), expected, `${explicit} | ${context}`);
  }
});
