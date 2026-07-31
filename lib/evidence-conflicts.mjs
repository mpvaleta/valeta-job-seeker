/*
 * Cross-source consistency review for career-evidence candidates.
 *
 * prepareResumeEvidence (career-evidence.mjs) already collapses near-duplicate
 * facts for résumé assembly, but it works on one flat list with no idea which
 * source a fact came from, and it only catches facts that are near-identical
 * text. It never asks whether two DIFFERENTLY worded facts are describing the
 * same job and quietly disagreeing about it -- a different title for the same
 * employer and years, or a different number for what reads as the same
 * accomplishment. Two résumé uploads that drifted, or a Custom GPT export
 * that misremembers a metric, look like two equally valid facts otherwise.
 *
 * This never discards anything. It returns what a human should look at, each
 * fact still tagged with the exact source it came from.
 */

const YEAR = /\b(19|20)\d{2}\b/g;

// Same asymmetry as lib/local-resume.mjs's EMPLOYER_AT/EMPLOYER_FOR: "at X"
// asserts employment outright, "for X" is ambiguous (client vs employer), and
// the leading word may itself be "the/of/and" ("at the Acme Group"). Reused
// here in a lighter form -- this module only needs a pairwise anchor, not a
// full chronological reconstruction.
const EMPLOYER_AT = /\bat\s+((?:[A-Z][\w&.,'’-]*|of|and|the)(?:\s+(?:[A-Z][\w&.,'’-]*|of|and|the)){0,4})/;
const EMPLOYER_FOR = /\bfor\s+((?:[A-Z][\w&.,'’-]*|of|and|the)(?:\s+(?:[A-Z][\w&.,'’-]*|of|and|the)){0,4})/;

const TITLE_WORD = /\b(?:manager|director|producer|coordinator|lead|specialist|analyst|engineer|designer|head|vp|vice president|president|officer|associate|assistant|consultant|strategist|supervisor|executive|architect|editor|planner|buyer|recruiter|controller|principal|partner|chief|founder|owner|intern|technician|administrator|representative|advisor|writer|developer|scientist|marketer|generalist)\b/gi;

// $ amounts, percentages, and comma-grouped thousands only -- deliberately
// narrow. A bare small number ("led 3 campaigns") is too weak a signal to
// call a conflict on its own. A bare 4-digit number is never treated as a
// metric at all (see extractMetrics) so a year can never be mistaken for
// one -- the exact bug class already found once in the AI guardrails' metric
// check ("20 campaigns" matching inside "2019-2024").
const METRIC = /\$\s?\d[\d,.]*\s?[kKmMbB]?\b|\b\d+(?:\.\d+)?\s?%|\b\d{1,3}(?:,\d{3})+\b/g;

const STOP_TOKENS = new Set(["the", "and", "for", "with", "from", "that", "this", "into", "over", "across", "team", "teams", "role", "work", "company"]);

export function auditEvidence(rawEntries) {
  const entries = (Array.isArray(rawEntries) ? rawEntries : [])
    .map((entry) => ({
      id: String(entry?.id || ""),
      text: String(entry?.text || "").replace(/\s+/g, " ").trim(),
      sourceId: String(entry?.sourceId || ""),
      sourceTitle: String(entry?.sourceTitle || "Unknown source"),
    }))
    .filter((entry) => entry.id && entry.text.length >= 12)
    .map(parseEntry);

  const duplicates = findDuplicateClusters(entries);
  const inDuplicateCluster = new Set(duplicates.flatMap((cluster) => cluster.members.map((member) => member.id)));
  const conflicts = findConflicts(entries, inDuplicateCluster);

  return { duplicates, conflicts };
}

function parseEntry(entry) {
  const normalizedText = normalizeText(entry.text);
  const years = extractYears(entry.text);
  return {
    ...entry,
    normalizedText,
    tokenSet: new Set(tokens(entry.text)),
    employer: extractEmployer(entry.text),
    years,
    titleWords: extractTitleWords(entry.text),
    metrics: extractMetrics(entry.text, years),
  };
}

function findDuplicateClusters(entries) {
  const clusters = [];
  const claimed = new Set();
  for (let i = 0; i < entries.length; i += 1) {
    if (claimed.has(entries[i].id)) continue;
    const members = [entries[i]];
    for (let j = i + 1; j < entries.length; j += 1) {
      if (claimed.has(entries[j].id)) continue;
      if (isNearDuplicate(entries[i], entries[j])) members.push(entries[j]);
    }
    if (members.length < 2) continue;
    members.forEach((member) => claimed.add(member.id));
    const ranked = [...members].sort((left, right) => qualityScore(right) - qualityScore(left));
    clusters.push({
      canonical: ranked[0].text,
      canonicalId: ranked[0].id,
      canonicalSourceId: ranked[0].sourceId,
      canonicalSourceTitle: ranked[0].sourceTitle,
      // Same-source repeats are usually a document restating itself and are
      // lower priority than two DIFFERENT sources claiming the same thing.
      crossSource: new Set(members.map((member) => member.sourceId)).size >= 2,
      members: members.map((member) => ({ id: member.id, text: member.text, sourceId: member.sourceId, sourceTitle: member.sourceTitle })),
    });
  }
  return clusters.sort((left, right) => Number(right.crossSource) - Number(left.crossSource));
}

function findConflicts(entries, skip) {
  const conflicts = [];
  for (let i = 0; i < entries.length; i += 1) {
    if (skip.has(entries[i].id)) continue;
    for (let j = i + 1; j < entries.length; j += 1) {
      if (skip.has(entries[j].id)) continue;
      const a = entries[i];
      const b = entries[j];
      // A single source disagreeing with itself is a different, rarer
      // problem (a bad first draft, not two records of the truth) -- this
      // pass stays focused on cross-source disagreement, the case where the
      // user has no way to tell which source to trust.
      if (a.sourceId === b.sourceId) continue;
      if (!a.employer || a.employer !== b.employer) continue;
      if (!overlapsRange(a.years, b.years)) continue;

      const sharedTitle = [...a.titleWords].some((word) => b.titleWords.has(word));
      if (a.titleWords.size && b.titleWords.size && !sharedTitle) {
        conflicts.push(conflictRecord(
          "title", a, b,
          `Both describe ${titleCase(a.employer)} around ${rangeLabel(a.years)}, but name different roles: "${[...a.titleWords].join(", ")}" vs "${[...b.titleWords].join(", ")}".`,
        ));
        continue;
      }

      if (a.metrics.length && b.metrics.length) {
        const similarity = jaccard(significantTokens(a.tokenSet), significantTokens(b.tokenSet));
        const sameMetrics = a.metrics.length === b.metrics.length && a.metrics.every((metric, index) => normalizeMetric(metric) === normalizeMetric(b.metrics[index]));
        if (similarity >= 0.6 && !sameMetrics) {
          conflicts.push(conflictRecord(
            "metric", a, b,
            `Both describe the same result at ${titleCase(a.employer)}, but the numbers disagree: ${a.metrics.join(", ")} vs ${b.metrics.join(", ")}.`,
          ));
        }
      }
    }
  }
  return conflicts;
}

function conflictRecord(kind, a, b, detail) {
  return {
    kind,
    detail,
    factA: { id: a.id, text: a.text, sourceId: a.sourceId, sourceTitle: a.sourceTitle },
    factB: { id: b.id, text: b.text, sourceId: b.sourceId, sourceTitle: b.sourceTitle },
  };
}

function isNearDuplicate(a, b) {
  if (a.normalizedText === b.normalizedText) return true;
  if (Math.min(a.normalizedText.length, b.normalizedText.length) >= 45
    && (a.normalizedText.includes(b.normalizedText) || b.normalizedText.includes(a.normalizedText))) return true;
  if (a.tokenSet.size < 6 || b.tokenSet.size < 6) return false;
  // Two claims that are otherwise near-identical but assert DIFFERENT numbers
  // are a metric conflict, not a duplicate -- collapsing them here (picking
  // one as "canonical" and discarding the disagreement) would hide the exact
  // thing this module exists to surface. Only silently merge when either
  // side has no metric to disagree about, or both sides agree on it.
  if (a.metrics.length && b.metrics.length) {
    const metricsAgree = a.metrics.length === b.metrics.length && a.metrics.every((metric, index) => normalizeMetric(metric) === normalizeMetric(b.metrics[index]));
    if (!metricsAgree) return false;
  }
  return jaccard(a.tokenSet, b.tokenSet) >= 0.82;
}

function qualityScore(entry) {
  // Deliberately not career-evidence.mjs's qualityScore: that one rewards
  // action verbs for picking a résumé BULLET, which isn't the question here
  // (picking which of several near-identical CLAIMS to show as canonical).
  let score = Math.min(40, entry.tokenSet.size);
  if (entry.years) score += 8;
  if (entry.metrics.length) score += 8;
  if (entry.employer) score += 5;
  return score;
}

function overlapsRange(a, b) {
  if (!a || !b) return false;
  return a.min <= b.max && b.min <= a.max;
}

function jaccard(a, b) {
  if (!a.size || !b.size) return 0;
  const shared = [...a].filter((token) => b.has(token)).length;
  return shared / new Set([...a, ...b]).size;
}

function significantTokens(tokenSet) {
  return new Set([...tokenSet].filter((token) => !/^\d+$/.test(token)));
}

function extractEmployer(text) {
  const atMatch = text.match(EMPLOYER_AT);
  const raw = atMatch ? atMatch[1] : (text.match(EMPLOYER_FOR)?.[1] || "");
  const normalized = normalizeEmployer(raw);
  // Under ~3 characters is too weak an anchor to trust ("at IT", stray
  // fragments) -- treat as no employer rather than risk a false pairing.
  return normalized.length >= 3 ? normalized : "";
}

function normalizeEmployer(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b(?:inc|llc|ltd|corp|co)\b\.?/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function extractYears(text) {
  const years = [...text.matchAll(YEAR)].map((match) => Number(match[0]));
  return years.length ? { min: Math.min(...years), max: Math.max(...years) } : null;
}

function extractTitleWords(text) {
  return new Set((text.match(TITLE_WORD) || []).map((word) => word.toLowerCase()));
}

function extractMetrics(text, years) {
  const yearDigits = new Set((years ? [years.min, years.max] : []).map(String));
  return (text.match(METRIC) || []).filter((metric) => !yearDigits.has(metric.replace(/\D/g, "")));
}

function normalizeMetric(value) {
  return String(value || "").toLowerCase().replace(/[,\s]/g, "");
}

function normalizeText(text) {
  return text.toLowerCase().replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();
}

function tokens(text) {
  // The length>2 floor exists to drop short filler words ("by", "at", "on"),
  // not numbers -- a bare 1-2 digit count ("20%" -> "20") is exactly the kind
  // of detail a metric conflict needs to tell two claims apart, so numeric
  // tokens are kept at any length.
  return (String(text || "").toLowerCase().match(/[a-zà-ÿ0-9]+/g) || [])
    .filter((token) => (/^\d+$/.test(token) || token.length > 2) && !STOP_TOKENS.has(token));
}

function titleCase(value) {
  return String(value || "").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function rangeLabel(range) {
  if (!range) return "an unspecified date";
  return range.min === range.max ? String(range.min) : `${range.min}–${range.max}`;
}
