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
};

export const DEFAULT_RADAR_PROFILE: RadarProfile;
export function normalizeRadarProfile(value?: Partial<RadarProfile>): RadarProfile;
export function scoreRadarOpportunity(opportunity: RadarOpportunityInput, profile: Partial<RadarProfile>): { score: number; reasons: string[]; summary: string; passes: boolean };
export function detectCareerSource(value: string): { type: "greenhouse" | "lever" | "ashby" | "public-page"; token: string; url: URL };
export function discoverTargetJobs(target: { company?: string; name?: string; careersUrl?: string; careers?: string }, options?: { fetchImpl?: typeof fetch }): Promise<RadarOpportunityInput[]>;
