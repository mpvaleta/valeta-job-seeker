export type ResumeTrack = { id: string; name: string; headline: string; summary: string; focus: string[] };
export const DEFAULT_RESUME_TRACKS: ResumeTrack[];
export function normalizeResumeTracks(value: unknown): ResumeTrack[];
export function selectResumeTrack(tracks: ResumeTrack[], roleText: string, preferredId?: string): { track: ResumeTrack; score: number | null; automatic: boolean; matches?: string[] };
