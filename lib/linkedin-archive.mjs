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

/*
 * Pull saved jobs out of an official LinkedIn export.
 *
 * LinkedIn job pages cannot be read automatically and OpenID sign-in grants no
 * job access, so the user's own official archive is the only compliant way to
 * bring their saved LinkedIn roles into V's. The rows are used exactly as
 * LinkedIn exported them — no page is fetched.
 */
export function extractLinkedInSavedJobs(text, limit = 200) {
  const jobs = [];
  // Every section is offered to the CSV reader; it only accepts a table whose
  // header carries both a title and a URL column, which no other export file has.
  for (const section of String(text || "").split(/^--- .+? ---$/m)) {
    for (const row of parseCsvRows(section)) {
      const title = pick(row, /title/);
      const url = pick(row, /url|link/);
      if (!title || !/^https?:\/\//i.test(url)) continue;
      jobs.push({
        title: title.slice(0, 240),
        company: pick(row, /company/).slice(0, 180),
        url: url.slice(0, 4_000),
        savedAt: pick(row, /date/).slice(0, 40),
      });
    }
  }
  const seen = new Set();
  return jobs.filter((job) => {
    const key = job.url.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).slice(0, limit);
}

// Minimal RFC-4180 reader: LinkedIn quotes any field containing a comma, and
// job titles routinely do ("Producer, Brand Studio").
function parseCsvRows(section) {
  const lines = splitCsvLines(section);
  if (lines.length < 2) return [];
  const header = lines[0].map((cell) => cell.trim().toLowerCase());
  if (!header.some((cell) => /title/.test(cell)) || !header.some((cell) => /url|link/.test(cell))) return [];
  return lines.slice(1)
    .filter((cells) => cells.length >= 2)
    .map((cells) => Object.fromEntries(header.map((key, index) => [key, (cells[index] || "").trim()])));
}

function splitCsvLines(value) {
  const rows = [];
  let row = [];
  let field = "";
  let quoted = false;
  const text = String(value || "");
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (quoted) {
      if (character === '"' && text[index + 1] === '"') { field += '"'; index += 1; continue; }
      if (character === '"') { quoted = false; continue; }
      field += character;
      continue;
    }
    if (character === '"') { quoted = true; continue; }
    if (character === ",") { row.push(field); field = ""; continue; }
    if (character === "\n" || character === "\r") {
      if (character === "\r" && text[index + 1] === "\n") index += 1;
      row.push(field);
      if (row.some((cell) => cell.trim())) rows.push(row);
      row = [];
      field = "";
      continue;
    }
    field += character;
  }
  row.push(field);
  if (row.some((cell) => cell.trim())) rows.push(row);
  return rows;
}

// LinkedIn renames these columns between export versions ("Job Url",
// "Job Posting Url", "jobUrl"), so match on what the header contains.
function pick(row, pattern) {
  const found = Object.keys(row).find((candidate) => pattern.test(candidate) && row[candidate]);
  return found ? row[found] : "";
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
