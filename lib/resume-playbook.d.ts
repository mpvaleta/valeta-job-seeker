export type CuratedPlaybookRule = { id: string; kind: "do" | "dont"; text: string; sourceIds: string[] };
export type CuratedPlaybookSource = { id: string; title: string; url: string; authority: string };
export const CURATED_RESUME_PLAYBOOK: {
  version: string;
  lastReviewed: string;
  name: string;
  summary: string;
  sources: CuratedPlaybookSource[];
  rules: CuratedPlaybookRule[];
};
