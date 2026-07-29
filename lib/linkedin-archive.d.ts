export type LinkedInArchiveGroup = { title: string; scope: "evidence" | "research" | "voice"; category: "LinkedIn export" | "Company research" | "Writing sample"; type: string; text: string; truncated: boolean; includedFiles: number };
export function extractLinkedInArchive(arrayBuffer: ArrayBuffer, options?: { JSZip?: unknown }): Promise<LinkedInArchiveGroup[]>;
export function extractLinkedInSavedJobs(text: string, limit?: number): Array<{ title: string; company: string; url: string; savedAt: string }>;
