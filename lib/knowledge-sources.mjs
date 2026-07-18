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
  if (source?.scope === "evidence" || source?.scope === "voice" || source?.scope === "guidance" || source?.scope === "research") return source.scope;
  return scopeForCategory(source?.category);
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
