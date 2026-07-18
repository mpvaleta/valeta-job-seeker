export type PublicJobPosting = {
  title: string;
  company: string;
  location: string;
  description: string;
  sourceUrl: string;
  employmentType: string;
  datePosted: string;
};

export type PublicLinkResult = {
  requestedUrl: string;
  finalUrl: string;
  sourceType: "article" | "job-page" | "youtube-transcript";
  title: string;
  description: string;
  text: string;
  jobs: PublicJobPosting[];
  links: Array<{ href: string; label: string }>;
  metadata?: Record<string, string>;
};

export class PublicLinkError extends Error {
  code: string;
  status: number;
}

export function validatePublicUrl(value: string): URL;
export function isLinkedInUrl(value: string): boolean;
export function extractYouTubeVideoId(value: string): string | null;
export function decodeHtml(value: string): string;
export function htmlToText(html: string): string;
export function extractJobPostings(html: string, baseUrl: string): PublicJobPosting[];
export function extractPageLinks(html: string, baseUrl: string): Array<{ href: string; label: string }>;
export function extractPublicPage(html: string, finalUrl: string): { title: string; description: string; text: string; jobs: PublicJobPosting[]; links: Array<{ href: string; label: string }> };
export function extractYouTubeCaptionTracks(html: string): Array<Record<string, unknown> & { baseUrl: string }>;
export function parseYouTubeTranscript(value: string): string;
export function readPublicLink(value: string, options?: { fetchImpl?: typeof fetch }): Promise<PublicLinkResult>;
