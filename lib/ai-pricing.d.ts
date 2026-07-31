export function estimateUsageCost(provider: string, modelKey: string, usage?: { inputTokens?: number; outputTokens?: number } | null): number | null;
export function formatEstimatedCost(cost: number | null): string;
