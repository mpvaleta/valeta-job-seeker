export type ResumeExperienceEntry = {
  employer: string;
  location: string;
  title: string;
  dates: string;
  bullets: string[];
};

export type ResumeSection =
  | { title: string; kind: "paragraph"; paragraphs: string[]; hasContent: boolean }
  | { title: string; kind: "skills"; items: string[]; hasContent: boolean }
  | { title: string; kind: "list"; items: string[]; hasContent: boolean }
  | { title: string; kind: "experience"; entries: ResumeExperienceEntry[]; hasContent: boolean };

export type ParsedResume = {
  name: string;
  headline: string;
  contact: string;
  sections: ResumeSection[];
};

export type DocumentHtmlOptions = { title?: string; autoPrint?: boolean };

export function parseResumeText(text: string): ParsedResume;
export function escapeHtml(value: unknown): string;
export function resumeToHtml(text: string, options?: DocumentHtmlOptions): string;
export function proseToHtml(text: string, options?: DocumentHtmlOptions): string;
