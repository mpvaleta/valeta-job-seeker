export type KnowledgeBaseInput = {
  profile?: { name?: string; headline?: string; location?: string; email?: string; phone?: string; linkedin?: string; portfolio?: string; summary?: string };
  facts?: string[];
  collapsed?: number;
  setAside?: number;
  conflicts?: Array<{ kind: "title" | "metric"; detail: string; a: { text: string; source: string }; b: { text: string; source: string } }>;
  playbookRules?: string[];
  voice?: { ready?: boolean; tone?: string; prefer?: string; avoid?: string; words?: number };
  tracks?: Array<{ name: string; headline?: string; focus?: string[] }>;
  research?: Array<{ title: string; sourceUrl?: string; importedAt?: string; excerpt?: string }>;
  sources?: Array<{ title: string; type?: string; scope?: string; importedAt?: string; candidates?: number; approved?: number }>;
  generatedAt?: string;
};
export function buildKnowledgeBase(input?: KnowledgeBaseInput): string;
export function knowledgeBasePlainText(markdown: string): string;
