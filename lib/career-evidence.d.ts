export type PreparedEvidence = {
  facts: string[];
  omitted: Array<{ fact: string; reason: string }>;
  duplicatesCollapsed: number;
};

export function prepareResumeEvidence(values: string[], limit?: number): PreparedEvidence;
export function preparePlaybookLibrary(values: string[], limit?: number): string[];
