const stopWords = new Set("the and with for from that this your you are will our into across has have role team work about who their they them all but not job more using use its can how what when where while an a to of in on at by or as is be we it responsibilities requirements preferred required qualifications qualification experience years including through within support ensure position candidate ideal looking seeks seeking must should would plus".split(" "));

function stem(word) {
  return word
    .replace(/ies$/, "y")
    .replace(/(ments?|ness|ation|ations|ingly|edly)$/i, "")
    .replace(/(ing|ed)$/i, "")
    .replace(/s$/i, "");
}

function tokens(text) {
  return (text.toLowerCase().match(/[a-z][a-z0-9+#.-]{2,}/g) || [])
    .map(stem)
    .filter((word) => word.length > 2 && !stopWords.has(word));
}

export function keywords(text, limit = 14) {
  const counts = new Map();
  tokens(text).forEach((word) => counts.set(word, (counts.get(word) || 0) + 1));
  return [...counts.entries()]
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
    .slice(0, limit)
    .map(([word]) => word);
}

export function extractRequirements(text, limit = 10) {
  const seen = new Set();
  const candidates = text
    .replace(/\r/g, "")
    .split(/\n+|(?<=[.!?;])\s+/)
    .map((item) => item.replace(/^[-•*\d.)\s]+/, "").replace(/\s+/g, " ").trim())
    .filter((item) => item.length >= 24 && item.length <= 520)
    .filter((item) => !/^(about|overview|benefits|compensation|equal opportunity|company description|who we are)[:\s]*$/i.test(item))
    .filter((item) => {
      const key = item.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  return candidates.slice(0, limit);
}

export function overlapScore(requirement, fact) {
  const requirementTokens = new Set(tokens(requirement));
  const factTokens = new Set(tokens(fact));
  if (!requirementTokens.size || !factTokens.size) return { shared: 0, score: 0 };
  const shared = [...requirementTokens].filter((word) => factTokens.has(word)).length;
  const coverage = shared / Math.min(requirementTokens.size, 12);
  return { shared, score: Math.round(coverage * 100) / 100 };
}

function clampScore(value) {
  return Math.max(0, Math.min(100, Math.round(value)));
}

export function analyzeRole({ jobText = "", facts = [], profile = {}, sources = [] }) {
  const cleanFacts = [...new Set(facts.map((fact) => String(fact).trim()).filter(Boolean))];
  const roleKeywords = keywords(jobText);
  const requirements = extractRequirements(jobText);
  const rankedFacts = cleanFacts
    .map((fact) => ({ fact, ...overlapScore(jobText, fact) }))
    .filter((item) => item.shared > 0)
    .sort((left, right) => right.shared - left.shared || right.score - left.score || left.fact.localeCompare(right.fact));
  const matchedFacts = rankedFacts.slice(0, 6).map((item) => item.fact);

  const evidenceMap = requirements.map((requirement) => {
    const evidence = cleanFacts
      .map((fact) => {
        const match = overlapScore(requirement, fact);
        const source = sources.find((item) => Array.isArray(item.approved) && item.approved.some((approved) => approved.toLowerCase() === fact.toLowerCase()))?.title || "Career profile";
        return { fact, source, score: match.score, shared: match.shared };
      })
      .filter((item) => item.shared > 0)
      .sort((left, right) => right.shared - left.shared || right.score - left.score)
      .slice(0, 2);
    const best = evidence[0];
    const strength = best?.shared >= 2 && best.score >= .16 ? "Strong" : best ? "Partial" : "Gap";
    return { requirement, evidence, strength };
  });

  const counts = {
    strong: evidenceMap.filter((item) => item.strength === "Strong").length,
    partial: evidenceMap.filter((item) => item.strength === "Partial").length,
    gaps: evidenceMap.filter((item) => item.strength === "Gap").length,
  };
  const profileChecks = [profile.name, profile.email, profile.headline, profile.summary, cleanFacts.length >= 3 ? "facts" : ""];
  const profileReadiness = clampScore((profileChecks.filter(Boolean).length / profileChecks.length) * 100);
  const evidenceCoverage = requirements.length ? clampScore(((counts.strong + counts.partial * .5) / requirements.length) * 100) : 0;
  const approvedSourceCount = sources.filter((source) => Array.isArray(source.approved) && source.approved.length > 0).length;
  const sourceQuality = cleanFacts.length ? clampScore(35 + Math.min(35, cleanFacts.length * 7) + Math.min(30, approvedSourceCount * 15)) : 0;
  const fit = jobText.trim().length < 80 ? 0 : clampScore(evidenceCoverage * .55 + profileReadiness * .25 + sourceQuality * .2);

  let recommendation;
  if (jobText.trim().length < 80) {
    recommendation = { label: "Add the complete role", tone: "start", confidence: "Waiting for role details", reason: "A recommendation needs the complete job description, not only a title or URL.", actions: ["Paste the full job description", "Add the company and role title", "Run the evidence review"] };
  } else if (cleanFacts.length < 3) {
    recommendation = { label: "Build evidence first", tone: "hold", confidence: "Low confidence", reason: "There are not enough approved career facts to make a reliable application recommendation yet.", actions: ["Upload your strongest résumé or GPT export", "Approve at least three verified facts", "Recheck this role"] };
  } else if (evidenceCoverage >= 65 && counts.strong >= 1) {
    recommendation = { label: "Prioritize and apply", tone: "ready", confidence: "High evidence confidence", reason: `${counts.strong + counts.partial} of ${requirements.length} detected requirements have approved support, including ${counts.strong} strong ${counts.strong === 1 ? "match" : "matches"}.`, actions: ["Open the tailored résumé and review wording", "Personalize the cover letter for the company", "Review every form field before submitting"] };
  } else if (evidenceCoverage >= 35) {
    recommendation = { label: "Apply after targeted edits", tone: "edit", confidence: "Medium evidence confidence", reason: `The role has useful overlap, but ${counts.gaps} ${counts.gaps === 1 ? "requirement needs" : "requirements need"} stronger proof or careful omission.`, actions: ["Lead with the highest-scoring approved facts", "Find verified examples for partial matches", "Do not copy unsupported requirements into the résumé"] };
  } else {
    recommendation = { label: "Hold and investigate", tone: "hold", confidence: "Low evidence confidence", reason: `The current fact bank does not support ${counts.gaps} of ${requirements.length} detected requirements. This may be a stretch role or missing evidence.`, actions: ["Check whether your source documents contain missing proof", "Research the company and role scope", "Apply only if the gaps are preferences—not core requirements"] };
  }

  return {
    version: "local-v2",
    roleKeywords,
    requirements,
    matchedFacts,
    evidenceMap,
    counts,
    profileReadiness,
    evidenceCoverage,
    sourceQuality,
    fit,
    recommendation,
    firstGap: evidenceMap.find((item) => item.strength === "Gap")?.requirement || null,
  };
}
