const DEFAULT_LIMIT = 24;

const RULE_SIGNAL = /\b(?:always|avoid|do not|don't|ensure|include|keep|must|never|omit|prioritize|should|use)\b/i;
const RESUME_SIGNAL = /\b(?:achievement|ats|bullet|education|experience|format|headline|keyword|metric|page|resume|résumé|section|skill|summary)\b/i;
const TOKEN_STOP_WORDS = new Set([
  "about", "after", "also", "and", "are", "been", "being", "but", "can", "for", "from", "have",
  "into", "its", "more", "not", "only", "that", "the", "their", "then", "this", "through", "use",
  "using", "with", "your",
]);

function normalizeRule(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function tokens(value) {
  return new Set(normalizeRule(value).toLowerCase().normalize("NFKD").replace(/[^\p{L}\p{N}]+/gu, " ").split(/\s+/)
    .filter((token) => token.length >= 3 && !TOKEN_STOP_WORDS.has(token)));
}

function overlaps(left, right) {
  const a = tokens(left);
  const b = tokens(right);
  if (!a.size || !b.size) return false;
  const shared = [...a].filter((token) => b.has(token)).length;
  return shared / Math.min(a.size, b.size) >= 0.82;
}

function scoreRule(rule, contextTokens, index) {
  const ruleTokens = tokens(rule);
  const contextMatches = [...ruleTokens].filter((token) => contextTokens.has(token)).length;
  return (RULE_SIGNAL.test(rule) ? 12 : 0)
    + (RESUME_SIGNAL.test(rule) ? 8 : 0)
    + Math.min(8, contextMatches * 2)
    + Math.max(0, 4 - index / 25);
}

export function prioritizeResumePlaybookRules(rules, context = "", limit = DEFAULT_LIMIT) {
  const maximum = Math.max(1, Math.min(40, Number.isFinite(limit) ? Math.floor(limit) : DEFAULT_LIMIT));
  const unique = [];
  const exact = new Set();
  for (const raw of Array.isArray(rules) ? rules : []) {
    const rule = normalizeRule(raw);
    if (!rule) continue;
    const key = rule.toLowerCase();
    if (exact.has(key) || unique.some((item) => overlaps(item.rule, rule))) continue;
    exact.add(key);
    unique.push({ rule, index: unique.length });
  }
  if (unique.length <= maximum) return unique.map((item) => item.rule);
  const contextTokens = tokens(context);
  return unique
    .map((item) => ({ ...item, score: scoreRule(item.rule, contextTokens, item.index) }))
    .sort((left, right) => right.score - left.score || left.index - right.index)
    .slice(0, maximum)
    .sort((left, right) => left.index - right.index)
    .map((item) => item.rule);
}

export const PLAYBOOK_GENERATION_RULE_LIMIT = DEFAULT_LIMIT;
