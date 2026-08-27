// Code is detected by syntax, never by vocabulary. The earlier version matched
// bare words — error, stack, schema, timestamp, json, return, function, true,
// false — and those are ordinary résumé English: "reduced error rates", "owned
// the marketing function", "return on investment", "a true partner", "the full
// tech stack". Real accomplishment bullets were being thrown away as code. Each
// pattern below needs an operator, a declaration, a bracket pair, or markup, so
// a keyword on its own can no longer disqualify a fact. `<` and `>` were also
// dropped from the bracket class: "<10% churn" and ">$5M in spend" are normal.
const CODE_MARKERS = [
  /[{}[\]]{2,}/,
  /<\/?[a-z][^>]*>/i,
  /(?:=>|===|!==|&&|\|\|)/,
  /\b(?:const|let|var|function)\s+[A-Za-z_$][\w$]*\s*[=(]/,
  /\breturn\s+(?:null|undefined|true|false|[{[])/i,
  /\b(?:requestid|stacktrace|traceback|nullpointer)\b/i,
  /"[a-z_][\w-]*"\s*:/i,
  /\b[a-z_$][\w$]*\.[a-z_$][\w$]*\(/i,
];

const LOW_VALUE_PHRASES = new Set([
  "tamo junto",
  "melhor",
  "milagre",
  "thank you",
  "thanks",
  "okay",
  "ok",
]);

export function prepareResumeEvidence(values, limit = 220) {
  const source = Array.isArray(values) ? values : [];
  const omitted = [];
  const accepted = [];

  for (const raw of source) {
    const fact = clean(raw, 900);
    const reason = rejectionReason(fact);
    if (reason) {
      omitted.push({ fact, reason });
      continue;
    }

    const duplicateIndex = accepted.findIndex((item) => overlaps(item, fact));
    if (duplicateIndex >= 0) {
      const existing = accepted[duplicateIndex];
      if (qualityScore(fact) > qualityScore(existing)) accepted[duplicateIndex] = fact;
      omitted.push({ fact, reason: "overlap" });
      continue;
    }
    accepted.push(fact);
  }

  // Quality decides which facts survive the limit, but the survivors keep their
  // original order. Approved facts arrive in résumé order, and the résumé
  // builder reads that order to attach accomplishment bullets to the job header
  // above them — sorting the list by score would separate them.
  const kept = new Set([...accepted].sort((left, right) => qualityScore(right) - qualityScore(left)).slice(0, limit));
  return {
    facts: accepted.filter((fact) => kept.has(fact)),
    omitted,
    duplicatesCollapsed: omitted.filter((item) => item.reason === "overlap").length,
  };
}

export function preparePlaybookLibrary(values, limit = 120) {
  const source = Array.isArray(values) ? values : [];
  const accepted = [];
  for (const raw of source) {
    const rule = clean(raw, 800);
    if (rule.length < 18 || CODE_MARKERS.some((pattern) => pattern.test(rule))) continue;
    if (LOW_VALUE_PHRASES.has(normalize(rule))) continue;
    if (accepted.some((item) => overlaps(item, rule))) continue;
    accepted.push(rule);
  }
  return accepted.slice(0, limit);
}

function rejectionReason(fact) {
  if (!fact) return "empty";
  const normalized = normalize(fact);
  if (LOW_VALUE_PHRASES.has(normalized)) return "low-value";
  if (CODE_MARKERS.some((pattern) => pattern.test(fact))) return "code";
  if (/\b(?:https?:\/\/|www\.|linkedin\.com\/in\/)\S+/i.test(fact) && tokens(fact).length < 10) return "contact";
  if (/\b[\w.+-]+@[\w.-]+\.[a-z]{2,}\b/i.test(fact)) return "contact";
  if (/^\+?[\d\s().-]{7,}$/.test(fact)) return "contact";
  const words = tokens(fact);
  if (words.length < 4 && !/\b(?:19|20)\d{2}\b/.test(fact)) return "fragment";
  if (looksLikeKeywordDump(fact, words)) return "keyword-dump";
  return "";
}

function looksLikeKeywordDump(value, words) {
  const separators = (value.match(/[•|,]/g) || []).length;
  const sentences = (value.match(/[.!?]/g) || []).length;
  return words.length >= 6 && separators >= 4 && sentences === 0 && words.every((word) => word.length < 18);
}

function overlaps(left, right) {
  const a = normalize(left);
  const b = normalize(right);
  if (!a || !b) return false;
  if (a === b || (Math.min(a.length, b.length) >= 45 && (a.includes(b) || b.includes(a)))) return true;
  const aTokens = new Set(tokens(a).filter((token) => token.length > 2));
  const bTokens = new Set(tokens(b).filter((token) => token.length > 2));
  if (aTokens.size < 6 || bTokens.size < 6) return false;
  const shared = [...aTokens].filter((token) => bTokens.has(token)).length;
  return shared / Math.min(aTokens.size, bTokens.size) >= 0.82;
}

function qualityScore(value) {
  const words = tokens(value);
  let score = Math.min(40, words.length);
  if (/\b(?:led|managed|built|created|delivered|launched|improved|increased|reduced|coordinated|developed|directed|produced|owned)\b/i.test(value)) score += 18;
  if (/\b(?:19|20)\d{2}\b|\b\d+(?:\.\d+)?%|\$\s?\d/i.test(value)) score += 8;
  if (/\b(?:at|for|with)\s+[A-Z][\w&.'’-]+/.test(value)) score += 5;
  return score;
}

function tokens(value) {
  return String(value || "").match(/[A-Za-zÀ-ÿ0-9][A-Za-zÀ-ÿ0-9+#&.'’/-]*/g) || [];
}

function normalize(value) {
  return String(value || "").toLowerCase().replace(/[^a-z0-9à-ÿ]+/g, " ").replace(/\s+/g, " ").trim();
}

function clean(value, limit) {
  return String(value || "").replace(/\s+/g, " ").trim().slice(0, limit);
}
