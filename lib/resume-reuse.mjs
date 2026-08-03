const STOP = new Set(["and", "the", "for", "with", "from", "this", "that", "manager", "lead", "senior", "role", "job"]);

export function scoreResumeReuse(candidate, target) {
  if (!candidate || candidate.type !== "resume") return { score: 0, reasons: [] };
  const targetTitle = tokens(target?.role);
  const candidateTitle = tokens(candidate.role);
  const titleScore = overlap(targetTitle, candidateTitle);
  const sameTrack = Boolean(target?.trackId && candidate.trackId === target.trackId);
  const targetText = tokens(target?.jobText);
  const candidateInput = tokens(candidate.inputSummary || candidate.jobDescriptionSnapshot || "");
  const descriptionScore = candidateInput.size ? overlap(targetText, candidateInput) : 0;
  const score = Math.round(Math.min(100, titleScore * 55 + descriptionScore * 25 + (sameTrack ? 20 : 0)));
  const reasons = [];
  if (sameTrack) reasons.push("same résumé track");
  if (titleScore >= 0.5) reasons.push("similar role title");
  if (descriptionScore >= 0.25) reasons.push("overlapping role requirements");
  return { score, reasons };
}

export function findReusableResumes(drafts, target, limit = 5) {
  return (Array.isArray(drafts) ? drafts : [])
    .filter((draft) => draft?.type === "resume" && String(draft.content || "").trim())
    .map((draft) => ({ draft, ...scoreResumeReuse(draft, target) }))
    .filter((item) => item.score >= 25)
    .sort((left, right) => right.score - left.score || Date.parse(right.draft.updatedAt || "") - Date.parse(left.draft.updatedAt || ""))
    .slice(0, limit);
}

function tokens(value) {
  return new Set((String(value || "").toLowerCase().match(/[a-z0-9][a-z0-9+#.-]{2,}/g) || []).filter((token) => !STOP.has(token)));
}

function overlap(left, right) {
  if (!left.size || !right.size) return 0;
  const shared = [...left].filter((token) => right.has(token)).length;
  return shared / Math.max(1, Math.min(left.size, right.size));
}
