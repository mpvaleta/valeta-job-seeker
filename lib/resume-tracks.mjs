export const DEFAULT_RESUME_TRACKS = [
  {
    id: "brand-project",
    name: "Brand & Creative Project Management",
    headline: "Brand-focused Project and Operations Manager",
    summary: "",
    focus: ["brand", "creative", "campaign", "marketing", "project manager", "program manager", "agency"],
  },
  {
    id: "operations",
    name: "Operations & Cross-functional Delivery",
    headline: "Project and Operations Manager",
    summary: "",
    focus: ["operations", "workflow", "process", "delivery", "cross-functional", "stakeholder", "program"],
  },
  {
    id: "production",
    name: "Integrated Production & Producer",
    headline: "Creative Production and Integrated Delivery Lead",
    summary: "",
    focus: ["producer", "production", "film", "video", "content", "vendor", "creative operations"],
  },
  {
    id: "general-project",
    name: "General Project Management",
    headline: "Project Manager | Cross-functional Delivery",
    summary: "",
    focus: ["project manager", "project management", "timeline", "budget", "risk", "coordination", "delivery"],
  },
];

export function normalizeResumeTracks(value) {
  const source = Array.isArray(value) ? value : DEFAULT_RESUME_TRACKS;
  const tracks = source.map((track, index) => ({
    id: clean(track?.id, 80) || `track-${index + 1}`,
    name: clean(track?.name, 120) || `Résumé track ${index + 1}`,
    headline: clean(track?.headline, 220),
    summary: clean(track?.summary, 2_000),
    focus: cleanList(track?.focus, 30, 100),
  })).filter((track) => track.name);
  return tracks.length ? uniqueBy(tracks, (track) => track.id).slice(0, 12) : DEFAULT_RESUME_TRACKS.map((track) => ({ ...track, focus: [...track.focus] }));
}

export function selectResumeTrack(tracksValue, roleText, preferredId = "auto") {
  const tracks = normalizeResumeTracks(tracksValue);
  if (preferredId && preferredId !== "auto") {
    const selected = tracks.find((track) => track.id === preferredId);
    if (selected) return { track: selected, score: null, automatic: false };
  }
  const haystack = String(roleText || "").toLowerCase();
  const ranked = tracks.map((track) => {
    const matches = track.focus.filter((term) => phraseMatch(haystack, term));
    const score = matches.reduce((total, term) => total + (haystack.includes(term.toLowerCase()) ? Math.min(12, 4 + term.length / 4) : 3), 0);
    return { track, score: Math.round(score), matches };
  }).sort((left, right) => right.score - left.score || left.track.name.localeCompare(right.track.name));
  return { track: ranked[0]?.track || tracks[0], score: ranked[0]?.score || 0, automatic: true, matches: ranked[0]?.matches || [] };
}

function phraseMatch(haystack, value) {
  const phrase = clean(value, 100).toLowerCase();
  if (!phrase) return false;
  if (haystack.includes(phrase)) return true;
  const tokens = phrase.split(/\s+/).filter((token) => token.length >= 4);
  return tokens.length > 1 && tokens.every((token) => haystack.includes(token));
}

function cleanList(value, limit, itemLimit) {
  const source = Array.isArray(value) ? value : typeof value === "string" ? value.split(/[,\n]/) : [];
  return [...new Set(source.map((item) => clean(item, itemLimit)).filter(Boolean))].slice(0, limit);
}

function clean(value, limit) {
  return String(value || "").replace(/\s+/g, " ").trim().slice(0, limit);
}

function uniqueBy(items, key) {
  const seen = new Set();
  return items.filter((item) => {
    const value = key(item);
    if (seen.has(value)) return false;
    seen.add(value);
    return true;
  });
}
