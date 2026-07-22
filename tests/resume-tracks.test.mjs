import assert from "node:assert/strict";
import test from "node:test";
import { DEFAULT_RESUME_TRACKS, selectResumeTrack } from "../lib/resume-tracks.mjs";

test("resume tracks separate brand, operations, and production positioning", () => {
  const brand = selectResumeTrack(DEFAULT_RESUME_TRACKS, "Brand Project Manager leading creative campaigns and agency partners");
  assert.equal(brand.track.id, "brand-project");
  const production = selectResumeTrack(DEFAULT_RESUME_TRACKS, "Senior Producer for video production, vendors, and content delivery");
  assert.equal(production.track.id, "production");
  const manual = selectResumeTrack(DEFAULT_RESUME_TRACKS, "unrelated role", "operations");
  assert.equal(manual.track.id, "operations");
  assert.equal(manual.automatic, false);
});
