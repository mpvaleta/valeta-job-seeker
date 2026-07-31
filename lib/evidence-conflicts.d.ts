export type EvidenceEntryInput = { id: string; text: string; sourceId: string; sourceTitle: string };
export type EvidenceEntryRef = { id: string; text: string; sourceId: string; sourceTitle: string };
export type DuplicateCluster = {
  canonical: string;
  canonicalId: string;
  canonicalSourceId: string;
  canonicalSourceTitle: string;
  crossSource: boolean;
  members: EvidenceEntryRef[];
};
export type EvidenceConflict = {
  kind: "title" | "metric";
  detail: string;
  factA: EvidenceEntryRef;
  factB: EvidenceEntryRef;
};
export type EvidenceAudit = { duplicates: DuplicateCluster[]; conflicts: EvidenceConflict[] };

export function auditEvidence(entries: EvidenceEntryInput[]): EvidenceAudit;
