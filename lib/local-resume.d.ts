export type LocalResumeDocument = {
  headline: string;
  headline_fact_indexes: number[];
  summary: string;
  summary_fact_indexes: number[];
  core_skills: Array<{ label: string; fact_indexes: number[] }>;
  experience: Array<{ company: string; title: string; location: string; dates: string; fact_indexes: number[]; bullets: Array<{ text: string; fact_indexes: number[] }> }>;
  education: Array<{ text: string; fact_indexes: number[] }>;
  awards: Array<{ text: string; fact_indexes: number[] }>;
  professional_development: Array<{ text: string; fact_indexes: number[] }>;
  languages: Array<{ text: string; fact_indexes: number[] }>;
  omissions: string[];
  playbook_checks: Array<{ rule_source: "user" | "curated"; rule_index: number; status: "followed" | "not_applicable" | "conflict"; note: string }>;
};
export function buildLocalResume(input: { facts: string[]; roleText?: string; headline?: string; summary?: string }): LocalResumeDocument | null;
