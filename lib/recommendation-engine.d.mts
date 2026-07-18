export type RecommendationTone = "ready" | "edit" | "hold" | "start";
export type ApplicationRecommendation = { label: string; tone: RecommendationTone; confidence: string; reason: string; actions: string[] };
export type EvidenceMatch = { requirement: string; evidence: { fact: string; source: string; score: number; shared: number }[]; strength: "Strong" | "Partial" | "Gap" };
export type RecommendationAnalysis = {
  version: string;
  roleKeywords: string[];
  requirements: string[];
  matchedFacts: string[];
  evidenceMap: EvidenceMatch[];
  counts: { strong: number; partial: number; gaps: number };
  profileReadiness: number;
  evidenceCoverage: number;
  sourceQuality: number;
  fit: number;
  recommendation: ApplicationRecommendation;
  firstGap: string | null;
};
export function keywords(text: string, limit?: number): string[];
export function extractRequirements(text: string, limit?: number): string[];
export function overlapScore(requirement: string, fact: string): { shared: number; score: number };
export function analyzeRole(input: {
  jobText?: string;
  facts?: string[];
  profile?: { name?: string; email?: string; headline?: string; summary?: string };
  sources?: { title: string; approved: string[] }[];
}): RecommendationAnalysis;
