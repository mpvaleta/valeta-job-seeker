export const SOURCE_CATEGORIES = [
  "Résumé",
  "Custom GPT export",
  "LinkedIn export",
  "Writing sample",
  "Résumé playbook",
  "Company research",
  "Other evidence",
];

export function scopeForCategory(category) {
  if (category === "Writing sample") return "voice";
  if (category === "Résumé playbook") return "guidance";
  if (category === "Company research") return "research";
  return "evidence";
}

export function sourceScope(source) {
  const declared = source?.scope === "evidence" || source?.scope === "voice" || source?.scope === "guidance" || source?.scope === "research"
    ? source.scope
    : scopeForCategory(source?.category);
  const inferred = classifyKnowledgeSource({ title: source?.title, text: source?.text, selectedCategory: source?.category });
  return inferred.confidence === "high" ? inferred.scope : declared;
}

export function classifyKnowledgeSource({ title = "", text = "", selectedCategory = "Other evidence" } = {}) {
  const sample = `${String(title)}\n${String(text).slice(0, 80_000)}`.toLowerCase();
  const scores = { evidence: 0, guidance: 0, voice: 0, research: 0 };
  const reasons = [];
  score(/\b(resume|résumé|cv)\s+(tips?|guide|guidance|template|checklist|best practices?)\b|(?:do|don)['’]?ts?\b|action verbs?|applicant tracking system|\bats\b|bullet points?|avoid (?:using|writing)|tailor (?:your|the) resume/g, "guidance", 4, "résumé-writing guidance", sample, scores, reasons);
  score(/\b(professional experience|work experience|employment|education|certifications?|awards?|languages?|present)\b|(?:19|20)\d{2}\s*[-–—]|managed|led|coordinated|delivered|launched/g, "evidence", 2, "career-history signals", sample, scores, reasons);
  score(/\b(dear|hello|hi)\b.{0,80}\b(thanks|thank you|best|regards|sincerely)\b|\bi (?:think|believe|wanted|would|am|was)\b/g, "voice", 2, "first-person writing signals", sample, scores, reasons);
  score(/\b(company overview|market analysis|competitors?|industry|job description|responsibilities|qualifications|about the company|salary range)\b/g, "research", 3, "company or role research", sample, scores, reasons);
  const selectedScope = scopeForCategory(selectedCategory);
  scores[selectedScope] += 1;
  const ranked = Object.entries(scores).sort((left, right) => right[1] - left[1]);
  const [winner, runnerUp] = ranked;
  const confidence = winner[1] >= 5 && winner[1] >= runnerUp[1] + 2 ? "high" : winner[1] >= 3 ? "medium" : "low";
  const category = winner[0] === "guidance" ? "Résumé playbook"
    : winner[0] === "voice" ? "Writing sample"
      : winner[0] === "research" ? "Company research"
        : selectedCategory === "Résumé playbook" || selectedCategory === "Writing sample" || selectedCategory === "Company research" ? "Other evidence" : selectedCategory;
  return { scope: winner[0], category, confidence, reasons: [...new Set(reasons)].slice(0, 3), selectedScope };
}

function score(pattern, scope, weight, reason, value, scores, reasons) {
  const matches = value.match(pattern) || [];
  if (!matches.length) return;
  scores[scope] += Math.min(weight * 3, matches.length * weight);
  reasons.push(reason);
}

export function sourceScopeLabel(scope) {
  if (scope === "voice") return "Writing voice only";
  if (scope === "guidance") return "Résumé playbook";
  if (scope === "research") return "Research context only";
  return "Career evidence";
}

export function sourceScopeDescription(scope) {
  if (scope === "voice") return "Shapes tone and phrasing. It can never create or verify a career claim.";
  if (scope === "guidance") return "Stores résumé tips, do/don’t rules, examples, and best practices without treating them as personal experience.";
  if (scope === "research") return "Keeps company and role research separate. It can never become a career claim.";
  return "Creates candidate career facts that become reusable only after explicit approval.";
}

export function mergeWritingSample(existing, title, text) {
  const cleanTitle = String(title || "Writing sample").trim();
  const cleanText = String(text || "").trim();
  if (!cleanText) return String(existing || "");
  const marker = `--- ${cleanTitle} ---`;
  const current = String(existing || "").trim();
  if (current.includes(marker)) return current;
  return [current, marker, cleanText].filter(Boolean).join("\n\n");
}

export function removeWritingSample(existing, title) {
  const current = String(existing || "");
  const marker = `--- ${String(title || "Writing sample").trim()} ---`;
  const start = current.indexOf(marker);
  if (start < 0) return current;
  const next = current.indexOf("\n\n--- ", start + marker.length);
  return `${current.slice(0, start)}${next < 0 ? "" : current.slice(next + 2)}`.trim();
}
