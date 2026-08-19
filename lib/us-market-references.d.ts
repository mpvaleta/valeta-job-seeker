import type { CuratedPlaybookRule, CuratedPlaybookSource } from "./resume-playbook.mjs";

export const US_MARKET_REFERENCES: {
  version: string;
  lastReviewed: string;
  name: string;
  summary: string;
  sources: CuratedPlaybookSource[];
  rules: CuratedPlaybookRule[];
};
