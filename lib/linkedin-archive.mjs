const MAX_ENTRY_TEXT = 500_000;
const MAX_GROUP_TEXT = 300_000;

const EVIDENCE_NAMES = /(^|\/)(profile|positions?|skills?|education|projects?|certifications?|courses?|honors?|languages?|publications?|volunteer|recommendations[_ -]?received|resume data)([_ .-]|$)/i;
const RESEARCH_NAMES = /(^|\/)(saved[_ -]?jobs?|saved[_ -]?job[_ -]?alerts?|ai-powered|profile[_ -]?summary|inferences|member[_ -]?follows)([_ .-]|$)/i;
const VOICE_NAMES = /(^|\/)(shares?|comments?|articles?)([_ .-]|$)/i;

export async function extractLinkedInArchive(arrayBuffer, options = {}) {
  const JSZip = options.JSZip || (await import("jszip")).default;
  const archive = await JSZip.loadAsync(arrayBuffer);
  const readable = Object.values(archive.files)
    .filter((entry) => !entry.dir && /\.(csv|json|txt|md)$/i.test(entry.name))
    .slice(0, 80);
  const groups = { evidence: [], research: [], voice: [] };

  for (const entry of readable) {
    const scope = EVIDENCE_NAMES.test(entry.name) ? "evidence" : RESEARCH_NAMES.test(entry.name) ? "research" : VOICE_NAMES.test(entry.name) ? "voice" : null;
    if (!scope) continue;
    const raw = (await entry.async("string")).replace(/\u0000/g, "").trim().slice(0, MAX_ENTRY_TEXT);
    if (!raw) continue;
    groups[scope].push(`--- ${entry.name} ---\n${raw}`);
  }

  return [
    buildGroup("LinkedIn export — career evidence", "evidence", groups.evidence),
    buildGroup("LinkedIn export — saved jobs and AI context", "research", groups.research),
    buildGroup("LinkedIn export — public writing", "voice", groups.voice),
  ].filter(Boolean);
}

function buildGroup(title, scope, sections) {
  if (!sections.length) return null;
  const text = sections.join("\n\n").slice(0, MAX_GROUP_TEXT);
  return {
    title,
    scope,
    category: scope === "research" ? "Company research" : scope === "voice" ? "Writing sample" : "LinkedIn export",
    type: "Official LinkedIn ZIP export",
    text,
    truncated: sections.join("\n\n").length > MAX_GROUP_TEXT,
    includedFiles: sections.length,
  };
}
