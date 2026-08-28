/*
 * Agency radar packs, split by discipline.
 *
 * "Agency" covers four very different hiring markets, and a producer role at a
 * broadcast-advertising shop has little in common with a programme-management
 * role at a performance-marketing firm. Adding all of them at once buried the
 * distinction, so each discipline is now its own one-click pack: add the ones
 * you actually want to watch and leave the rest off the scan rotation.
 *
 * Where the exact ATS board is known it is set directly — those scan on the
 * first try. Most agencies publish no machine-readable board at all, so the
 * rest carry a website and rely on the engine's careers-page discovery and its
 * web-search fallback, which is the only route that reaches them.
 */

export type AgencyPackEntry = {
  company: string;
  kind: string;
  careersUrl: string;
  websiteUrl: string;
  focus: string;
};

import {
  DIRECTORY_ADVERTISING_PACK,
  DIRECTORY_DIGITAL_PACK,
  DIRECTORY_MARKETING_PACK,
  DIRECTORY_PR_PACK,
  DIRECTORY_PRODUCTION_PACK,
} from "./bay-area-agency-directory.ts";

// Traditional creative and advertising shops: brand campaigns, broadcast and
// integrated production, creative project management.
export const ADVERTISING_AGENCY_PACK: readonly AgencyPackEntry[] = [
  { company: "Wieden+Kennedy", kind: "Creative / Advertising Agency", careersUrl: "", websiteUrl: "https://www.wk.com/careers/", focus: "Brand campaigns, creative production, project management" },
  { company: "Goodby Silverstein & Partners", kind: "Creative / Advertising Agency", careersUrl: "", websiteUrl: "https://www.goodbysilverstein.com/careers/", focus: "Integrated campaigns, broadcast production, account and project management" },
  { company: "72andSunny", kind: "Creative / Advertising Agency", careersUrl: "", websiteUrl: "https://www.72andsunny.com/careers", focus: "Integrated campaigns, creative project management" },
  { company: "Duncan Channon", kind: "Creative / Advertising Agency", careersUrl: "", websiteUrl: "https://duncanchannon.com/careers/", focus: "SF independent agency — brand campaigns, integrated production" },
  { company: "BSSP", kind: "Creative / Advertising Agency", careersUrl: "", websiteUrl: "https://www.bssp.com/careers", focus: "Bay Area independent agency — account and project management, production" },
  { company: "Argonaut", kind: "Creative / Advertising Agency", careersUrl: "https://jobs.lever.co/argonaut", websiteUrl: "", focus: "SF independent agency — integrated production, project management" },
  { company: "Mekanism", kind: "Creative / Advertising Agency", careersUrl: "", websiteUrl: "https://mekanism.com/careers", focus: "SF creative agency — branded entertainment, campaign production" },
  { company: "Venables Bell + Partners", kind: "Creative / Advertising Agency", careersUrl: "", websiteUrl: "https://venablesbell.com/careers/", focus: "SF independent agency — brand campaigns, integrated project management" },
  { company: "Droga5", kind: "Creative / Advertising Agency", careersUrl: "", websiteUrl: "https://droga5.com/careers/", focus: "Creative campaigns, integrated production" },
  { company: "Giant Spoon", kind: "Creative / Advertising Agency", careersUrl: "https://job-boards.greenhouse.io/giantspoon", websiteUrl: "", focus: "Experiential, brand strategy, integrated production" },
];

// Digital product, experience, and interactive shops: web and app builds,
// design systems, digital campaign delivery.
export const DIGITAL_AGENCY_PACK: readonly AgencyPackEntry[] = [
  { company: "Instrument", kind: "Marketing Agency", careersUrl: "https://job-boards.greenhouse.io/instrument", websiteUrl: "", focus: "Digital product and brand experience, program and project management" },
  { company: "R/GA", kind: "Marketing Agency", careersUrl: "", websiteUrl: "https://www.rga.com/careers", focus: "Digital product and campaign delivery, program management" },
  { company: "AKQA", kind: "Marketing Agency", careersUrl: "", websiteUrl: "https://www.akqa.com/careers/", focus: "Digital experience design and build, delivery management" },
  { company: "Huge", kind: "Marketing Agency", careersUrl: "", websiteUrl: "https://www.hugeinc.com/careers", focus: "Digital product and experience, program management" },
  { company: "Media.Monks", kind: "Marketing Agency", careersUrl: "", websiteUrl: "https://www.mediamonks.com/careers", focus: "Digital content production at scale, project and resource management" },
  { company: "Work & Co", kind: "Marketing Agency", careersUrl: "", websiteUrl: "https://work.co/careers/", focus: "Digital product design and build, delivery management" },
  { company: "Code and Theory", kind: "Marketing Agency", careersUrl: "", websiteUrl: "https://www.codeandtheory.com/careers", focus: "Digital platforms and content, project management" },
  { company: "Barbarian", kind: "Marketing Agency", careersUrl: "", websiteUrl: "https://www.wearebarbarian.com/careers", focus: "Digital experience and innovation, project management" },
];

// Performance, brand, and communications marketing firms: media, growth,
// lifecycle, PR-adjacent programme work.
export const MARKETING_AGENCY_PACK: readonly AgencyPackEntry[] = [
  { company: "VaynerMedia", kind: "Marketing Agency", careersUrl: "https://job-boards.greenhouse.io/vaynermedia", websiteUrl: "", focus: "Creative operations, integrated production, brand campaigns" },
  { company: "Wpromote", kind: "Marketing Agency", careersUrl: "https://jobs.lever.co/wpromote", websiteUrl: "", focus: "Performance and growth marketing, campaign program management" },
  { company: "Edelman", kind: "Marketing Agency", careersUrl: "", websiteUrl: "https://www.edelman.com/careers", focus: "Brand communications, integrated campaign and program management" },
  { company: "Highwire", kind: "Marketing Agency", careersUrl: "https://job-boards.greenhouse.io/highwire", websiteUrl: "", focus: "Communications and creative production leadership" },
  { company: "Ogilvy", kind: "Marketing Agency", careersUrl: "", websiteUrl: "https://www.ogilvy.com/careers", focus: "Brand and communications campaigns, account and project management" },
  { company: "Razorfish", kind: "Marketing Agency", careersUrl: "", websiteUrl: "https://www.razorfish.com/careers/", focus: "Brand and media campaigns, delivery and project management" },
  { company: "Inizio Evoke", kind: "Marketing Agency", careersUrl: "", websiteUrl: "https://www.inizioevoke.com/careers/", focus: "Health and brand marketing, agency creative delivery" },
];

// Content, experiential, and film production companies.
export const PRODUCTION_AGENCY_PACK: readonly AgencyPackEntry[] = [
  { company: "Buck", kind: "Production Company", careersUrl: "https://job-boards.greenhouse.io/buck", websiteUrl: "", focus: "Design and animation production, executive producing" },
  { company: "Jack Morton Worldwide", kind: "Production Company", careersUrl: "https://job-boards.greenhouse.io/jackmortonworldwide", websiteUrl: "", focus: "Experiential and conference production, executive producing" },
  { company: "George P. Johnson", kind: "Production Company", careersUrl: "", websiteUrl: "https://www.gpj.com/who-we-are/careers/", focus: "Live and experiential event production, senior producing" },
  { company: "Legs Media", kind: "Production Company", careersUrl: "", websiteUrl: "https://www.legsmedia.com/careers", focus: "Branded content and campaign production" },
];

// The curated entries above carry hand-verified careers URLs and focus text.
// The directory adds the rest of the owner's own SF Bay Area research on top,
// de-duplicated by company name so a shop appearing in both keeps the curated
// version, which is the better-verified one.
function withDirectory(curated: readonly AgencyPackEntry[], directory: readonly AgencyPackEntry[]): readonly AgencyPackEntry[] {
  const seen = new Set(curated.map((entry) => entry.company.toLowerCase()));
  return [...curated, ...directory.filter((entry) => !seen.has(entry.company.toLowerCase()))];
}

export const AGENCY_PACK_GROUPS: ReadonlyArray<{
  id: string;
  label: string;
  blurb: string;
  entries: readonly AgencyPackEntry[];
}> = [
  { id: "advertising", label: "Advertising", blurb: "Creative shops: brand campaigns, broadcast, integrated production.", entries: withDirectory(ADVERTISING_AGENCY_PACK, DIRECTORY_ADVERTISING_PACK) },
  { id: "digital", label: "Digital", blurb: "Product, experience, and interactive builds.", entries: withDirectory(DIGITAL_AGENCY_PACK, DIRECTORY_DIGITAL_PACK) },
  { id: "marketing", label: "Marketing", blurb: "Performance, brand, and communications firms.", entries: withDirectory(MARKETING_AGENCY_PACK, DIRECTORY_MARKETING_PACK) },
  { id: "pr", label: "PR & comms", blurb: "PR, communications, and content-marketing firms.", entries: DIRECTORY_PR_PACK },
  { id: "production", label: "Production", blurb: "Content, experiential, and film production companies.", entries: withDirectory(PRODUCTION_AGENCY_PACK, DIRECTORY_PRODUCTION_PACK) },
];

// The union, kept so the original "add every agency" action still means the
// same thing. Deduplicated by company name because a shop can plausibly be
// listed under more than one discipline later.
export const AGENCY_RADAR_PACK: readonly AgencyPackEntry[] = (() => {
  const seen = new Set<string>();
  const all: AgencyPackEntry[] = [];
  for (const group of AGENCY_PACK_GROUPS) {
    for (const entry of group.entries) {
      const key = entry.company.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      all.push(entry);
    }
  }
  return all;
})();
