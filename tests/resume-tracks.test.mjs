import assert from "node:assert/strict";
import test from "node:test";
import { DEFAULT_RESUME_TRACKS, normalizeResumeTracks, selectResumeTrack } from "../lib/resume-tracks.mjs";

test("resume tracks separate brand, operations, and production positioning", () => {
  const brand = selectResumeTrack(DEFAULT_RESUME_TRACKS, "Brand Project Manager leading creative campaigns and agency partners");
  assert.equal(brand.track.id, "brand-project");
  const production = selectResumeTrack(DEFAULT_RESUME_TRACKS, "Senior Producer for video production, vendors, and content delivery");
  assert.equal(production.track.id, "production");
  const manual = selectResumeTrack(DEFAULT_RESUME_TRACKS, "unrelated role", "operations");
  assert.equal(manual.track.id, "operations");
  assert.equal(manual.automatic, false);
});

test("existing users receive additive creative and sports tracks without losing custom tracks", () => {
  const tracks = normalizeResumeTracks([{ id: "custom", name: "My custom direction", headline: "", summary: "", focus: ["custom"] }]);
  assert.ok(tracks.some((track) => track.id === "custom"));
  assert.ok(tracks.some((track) => track.id === "creative"));
  assert.ok(tracks.some((track) => track.id === "sports"));
  assert.equal(selectResumeTrack(tracks, "Sports marketing partnerships and sponsorship operations").track.id, "sports");
});
