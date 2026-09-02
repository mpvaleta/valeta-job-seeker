export type CompanyStagePreference = "no_preference" | "prefer_startups" | "startups_only";
export type LocationPolicy = "preferred" | "required";

export type RadarProfile = {
  titles: string[];
  skills: string[];
  locations: string[];
  workModes: string[];
  goals: string;
  exclusions: string[];
  minScore: number;
  companyStagePreference: CompanyStagePreference;
  locationPolicy: LocationPolicy;
};

export type RadarOpportunityInput = {
  title: string;
  company?: string;
  location?: string;
  description?: string;
  sourceUrl?: string;
  sourceType?: string;
  datePosted?: string;
  fitSummary?: string;
  companyCategory?: string;
};

export const RADAR_TRACKS: Array<{ id: string; label: string }>;
export const RADAR_COMPANY_CATEGORIES: string[];
export const DEFAULT_RADAR_PROFILE: RadarProfile;
export const RADAR_HOME_MARKET: string;
export const DISCOVERY_JOB_CAP: number;
export const RADAR_MARKETS: { id: string; label: string; value: string; home?: boolean }[];
export function withHomeMarket(locations: string[]): string[];
export function isBayAreaLocation(value: unknown): boolean;
export function isUnitedStatesLocation(value: unknown): boolean;
export function normalizeRadarProfile(value?: Partial<RadarProfile>): RadarProfile;
export function deriveRadarProfileFromCareer(input?: { headline?: string; summary?: string; location?: string; facts?: string[] }): {
  titles: string[];
  skills: string[];
  goals: string;
  locations: string[];
  evidence: { factsRead: number; titlesFromHeadline: number; recurringPhrases: number; recurringWords: number };
};
export type DismissalReason = "not_relevant" | "already_applied";
export type DismissalRecord = { title: string; reason: string; companyCategory?: string };
export type DismissalSignal = {
  ready: boolean;
  words: string[];
  categories: string[];
  reason: string;
  stats: { dismissalsRead: number; teachingDismissals: number; protectedWords: number };
};
export function deriveDismissalSignal(dismissals: DismissalRecord[], profile?: Partial<RadarProfile>): DismissalSignal;
export function dismissalPenalty(titleLower: string, companyCategory: string, signal?: DismissalSignal): { penalty: number; matched: string[]; categoryHit?: boolean };
export function scoreRadarOpportunity(opportunity: RadarOpportunityInput, profile: Partial<RadarProfile>, dismissalSignal?: DismissalSignal): { score: number; reasons: string[]; summary: string; gated: boolean; passes: boolean };
export function titleRelevance(title: string, targetTitles: string[], targetSkills?: string[]): { tier: "exact" | "family" | "none"; matched: string[] };
export function detectCareerSource(value: string): { type: "greenhouse" | "lever" | "ashby" | "smartrecruiters" | "workday" | "apple" | "google-careers" | "meta-search" | "meta-job" | "public-page"; token: string; url: URL };
export function classifyCompanyCategory(value?: string, context?: string): string;
export function classifyRadarOpportunity(opportunity?: RadarOpportunityInput, target?: { company?: string; name?: string; kind?: string; companyType?: string; focus?: string }): { trackId: string; trackLabel: string; companyCategory: string };
export function discoverTargetJobs(target: { company?: string; name?: string; careersUrl?: string; careers?: string; websiteUrl?: string; website?: string; referenceUrl?: string; searchUrls?: string[] }, options?: { fetchImpl?: typeof fetch }): Promise<RadarOpportunityInput[]>;
export function discoverTargetJobsDetailed(target: { company?: string; name?: string; careersUrl?: string; careers?: string; websiteUrl?: string; website?: string; referenceUrl?: string; searchUrls?: string[] }, options?: { fetchImpl?: typeof fetch }): Promise<{ jobs: RadarOpportunityInput[]; attempts: Array<{ url: string; resolvedUrl?: string; purpose: string; sourceType: string; status: string; found: number; rejected?: number; message?: string }>; recommendedCareersUrl: string }>;
export function isPlausibleRadarJob(job: Partial<RadarOpportunityInput>): boolean;
export function rankCareerLinks(links: Array<{ href?: string; label?: string }>): Array<{ href: string; label: string; score: number }>;
export function readSingleJobPosting(value: string, options?: { fetchImpl?: typeof fetch }): Promise<Required<Pick<RadarOpportunityInput, "title" | "company" | "location" | "description" | "sourceUrl" | "sourceType" | "datePosted">>>;
export function opportunityKey(value: unknown): string;
export function opportunityContentKey(job?: { company?: string; title?: string; location?: string }): string;
