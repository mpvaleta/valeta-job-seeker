/*
 * Approximate USD cost for a cloud AI request, from token usage already
 * being recorded (lib/ai-security-store.ts) but never converted to a dollar
 * figure anywhere in the app.
 *
 * Rates are per-tier (reliable/balanced/fast, matching the app's own model
 * picker), not per exact model ID. Anthropic's tier rates are the real
 * published per-token prices for the models this app defaults to
 * (lib/../app/api/ai/models/route.ts: opus-4-8 / sonnet-5 / haiku-4-5).
 * OpenAI's and Google's configured model names in this app (gpt-5.6-*,
 * gemini-3.5-*) are this project's own future-dated placeholders with no
 * published price to cite, so those two rows are reasoned estimates at
 * comparable tiers -- shown to the user as an approximation, never framed
 * as an actual bill.
 */
const RATES_PER_MILLION_TOKENS = {
  anthropic: {
    reliable: { input: 5, output: 25 },
    balanced: { input: 3, output: 15 },
    fast: { input: 1, output: 5 },
  },
  openai: {
    reliable: { input: 5, output: 20 },
    balanced: { input: 2, output: 8 },
    fast: { input: 0.5, output: 2 },
  },
  google: {
    reliable: { input: 3, output: 15 },
    balanced: { input: 1, output: 5 },
    fast: { input: 0.15, output: 0.6 },
  },
};

export function estimateUsageCost(provider, modelKey, usage) {
  const rates = RATES_PER_MILLION_TOKENS[provider]?.[modelKey];
  const inputTokens = Number(usage?.inputTokens);
  const outputTokens = Number(usage?.outputTokens);
  if (!rates || !Number.isFinite(inputTokens) || !Number.isFinite(outputTokens)) return null;
  return (Math.max(0, inputTokens) / 1_000_000) * rates.input + (Math.max(0, outputTokens) / 1_000_000) * rates.output;
}

export function formatEstimatedCost(cost) {
  if (cost == null || !Number.isFinite(cost)) return "";
  if (cost < 0.01) return "less than $0.01";
  return `~$${cost.toFixed(cost < 1 ? 3 : 2)}`;
}
