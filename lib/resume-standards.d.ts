export type ResumeStandardDimension = "relevance" | "evidence" | "ats" | "clarity" | "market";

export type ResumeStandardFinding = {
  dimension: ResumeStandardDimension;
  severity: "high" | "medium" | "low";
  message: string;
  line?: string;
};

export type ResumeAudit = {
  score: number;
  scores: Record<ResumeStandardDimension, number>;
  findings: ResumeStandardFinding[];
  stats: {
    words: number;
    bullets: number;
    quantifiedBullets: number;
    skills: number;
    entries: number;
    keywordCoverage: number | null;
    missingKeywords: string[];
  };
};

export function auditResume(text: string, options?: { roleText?: string; approvedFacts?: string[] }): ResumeAudit;
export const RESUME_STANDARD_DIMENSIONS: Array<{ key: ResumeStandardDimension; label: string; detail: string }>;
