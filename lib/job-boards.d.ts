export type JobSearchLocation = {
  id: string;
  label: string;
  remote: boolean;
  linkedin?: string;
  indeed?: string;
  google?: string;
  ziprecruiter?: string;
  glassdoor?: string;
  builtin?: { city: string; state: string } | null;
};

export type JobBoard = {
  id: string;
  label: string;
  group: string;
  locationAware: boolean;
  note: string;
  build(options: { keyword: string; location: JobSearchLocation; postedWithinDays: number }): string;
};

export type JobSearchUrl = {
  key: string;
  boardId: string;
  boardLabel: string;
  group: string;
  note: string;
  keyword: string;
  locationId: string;
  locationLabel: string;
  url: string;
};

export type JobBoardGroup = { id: string; label: string; blurb: string };

export const POSTED_WITHIN_OPTIONS: Array<{ days: number; label: string }>;
export const JOB_SEARCH_LOCATIONS: JobSearchLocation[];
export const JOB_BOARDS: JobBoard[];
export const JOB_BOARD_GROUPS: JobBoardGroup[];

export function buildJobSearchUrls(options?: {
  keywords?: string[];
  locationIds?: string[];
  boardIds?: string[];
  postedWithinDays?: number;
}): JobSearchUrl[];

export function groupJobSearchUrls(searches: JobSearchUrl[]): Array<JobBoardGroup & { searches: JobSearchUrl[] }>;
