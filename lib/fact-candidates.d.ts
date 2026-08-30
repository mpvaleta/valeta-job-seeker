export const CANDIDATE_LIMIT: number;
export function stripInlineMarkdown(value: string): string;
export function candidateQuality(value: string): number;
export function toUnits(text: string): { text: string; heading: string; kind: "heading" | "body" }[];
export function factCandidates(text: string, limit?: number): string[];
