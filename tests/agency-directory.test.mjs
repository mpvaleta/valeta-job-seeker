import assert from "node:assert/strict";
import test from "node:test";
import { AGENCY_PACK_GROUPS, AGENCY_RADAR_PACK } from "../lib/agency-radar-pack.ts";
import { DIRECTORY_WITHOUT_URL } from "../lib/bay-area-agency-directory.ts";

// This is bulk data imported from a document, so the risk is not logic but a
// malformed row reaching the seeder and creating a monitor that can never scan.

test("every seeded agency has something the scanner can actually reach", () => {
  for (const group of AGENCY_PACK_GROUPS) {
    for (const entry of group.entries) {
      assert.ok(entry.company.trim(), `empty company name in ${group.id}`);
      assert.ok(entry.kind.trim(), `${entry.company} has no kind`);
      // A monitor with neither a website nor a careers URL fails on every run
      // and buries the useful summaries -- the exact noise this radar is
      // meant to avoid. Rows without a URL belong in DIRECTORY_WITHOUT_URL.
      assert.ok(
        entry.websiteUrl.trim() || entry.careersUrl.trim(),
        `${entry.company} (${group.id}) has no website and no careers URL`,
      );
      for (const url of [entry.websiteUrl, entry.careersUrl].filter(Boolean)) {
        assert.match(url, /^https?:\/\//, `${entry.company} has a non-HTTP url: ${url}`);
      }
    }
  }
});

test("a company is never seeded twice across the packs", () => {
  const seen = new Map();
  for (const group of AGENCY_PACK_GROUPS) {
    for (const entry of group.entries) {
      const key = entry.company.toLowerCase();
      const previous = seen.get(key);
      // The same shop may legitimately sit in two disciplines, but the union
      // that actually seeds monitors must collapse it to one row.
      if (previous && previous !== group.id) continue;
      assert.equal(previous, undefined, `${entry.company} appears twice within ${group.id}`);
      seen.set(key, group.id);
    }
  }
  const unionKeys = AGENCY_RADAR_PACK.map((entry) => entry.company.toLowerCase());
  assert.equal(unionKeys.length, new Set(unionKeys).size, "AGENCY_RADAR_PACK contains a duplicate company");
});

test("the curated entry wins when a company is also in the bulk directory", () => {
  // The curated set carries hand-verified careers URLs; the directory rows
  // carry only a website. Losing the curated one would silently downgrade a
  // target from a direct board read to careers-page discovery.
  const advertising = AGENCY_PACK_GROUPS.find((group) => group.id === "advertising");
  const duncan = advertising.entries.filter((entry) => /^duncan channon$/i.test(entry.company));
  assert.equal(duncan.length, 1, "Duncan Channon is in both sets and must appear once");
  assert.match(duncan[0].websiteUrl, /careers/, "the curated entry, which points at the careers page, must survive");
});

test("agencies with no usable URL are held back rather than seeded", () => {
  assert.ok(DIRECTORY_WITHOUT_URL.length > 0, "the held-back list should not be silently empty");
  const seeded = new Set(AGENCY_RADAR_PACK.map((entry) => entry.company.toLowerCase()));
  for (const name of DIRECTORY_WITHOUT_URL) {
    assert.ok(name.trim(), "held-back list contains an empty name");
    assert.ok(!seeded.has(name.toLowerCase()), `${name} has no URL but is being seeded anyway`);
  }
});

test("the PR discipline is reachable as its own pack", () => {
  // PR and communications is a distinct hiring market from creative
  // advertising, and burying it inside "marketing" is what made the old
  // single agency pack unusable.
  const pr = AGENCY_PACK_GROUPS.find((group) => group.id === "pr");
  assert.ok(pr, "a PR group should exist");
  assert.ok(pr.entries.length >= 5, `PR pack looks too small: ${pr.entries.length}`);
});
