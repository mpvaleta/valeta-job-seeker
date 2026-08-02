export type ResumeReuseResult<T> = { draft: T; score: number; reasons: string[] };
export function scoreResumeReuse(candidate: unknown, target: unknown): { score: number; reasons: string[] };
export function findReusableResumes<T>(drafts: T[], target: unknown, limit?: number): ResumeReuseResult<T>[];
