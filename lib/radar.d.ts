export type RadarProfile = {
  titles: string[];
  skills: string[];
  locations: string[];
  workModes: string[];
  goals: string;
  exclusions: string[];
  minScore: number;
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
};

export const RADAR_TRACKS: Array<{ id: string; label: string }>;
export const RADAR_COMPANY_CATEGORIES: string[];
export const DEFAULT_RADAR_PROFILE: RadarProfile;
export function normalizeRadarProfile(value?: Partial<RadarProfile>): RadarProfile;
export function scoreRadarOpportunity(opportunity: RadarOpportunityInput, profile: Partial<RadarProfile>): { score: number; reasons: string[]; summary: string; passes: boolean };
export function detectCareerSource(value: string): { type: "greenhouse" | "lever" | "ashby" | "smartrecruiters" | "workday" | "meta-search" | "public-page"; token: string; url: URL };
export function classifyCompanyCategory(value?: string, context?: string): string;
export function classifyRadarOpportunity(opportunity?: RadarOpportunityInput, target?: { company?: string; name?: string; kind?: string; companyType?: string; focus?: string }): { trackId: string; trackLabel: string; companyCategory: string };
export function discoverTargetJobs(target: { company?: string; name?: string; careersUrl?: string; careers?: string; websiteUrl?: string; website?: string; referenceUrl?: string; searchUrls?: string[] }, options?: { fetchImpl?: typeof fetch }): Promise<RadarOpportunityInput[]>;
export function discoverTargetJobsDetailed(target: { company?: string; name?: string; careersUrl?: string; careers?: string; websiteUrl?: string; website?: string; referenceUrl?: string; searchUrls?: string[] }, options?: { fetchImpl?: typeof fetch }): Promise<{ jobs: RadarOpportunityInput[]; attempts: Array<{ url: string; resolvedUrl?: string; purpose: string; sourceType: string; status: string; found: number; rejected?: number; message?: string }>; recommendedCareersUrl: string }>;
export function isPlausibleRadarJob(job: Partial<RadarOpportunityInput>): boolean;
export function rankCareerLinks(links: Array<{ href?: string; label?: string }>): Array<{ href: string; label: string; score: number }>;
