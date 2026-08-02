// Turns the plain-text résumé the user sees and edits into a professionally
// laid-out document for print/PDF and Word export.
//
// The app has always held résumé data in a structured shape, but every export
// path flattened it to text and dumped that text inside a <pre> block, so the
// exported file looked like a terminal transcript rather than a résumé. This
// module parses the text back into sections and renders real typography.
//
// Parsing the text (rather than rendering the structured document directly)
// is deliberate: the user can edit the draft before exporting, and what they
// see in the editor must be exactly what lands in the exported file.

const SECTION_KINDS = new Map([
  ["PROFESSIONAL SUMMARY", "paragraph"],
  ["SUMMARY", "paragraph"],
  ["PROFILE", "paragraph"],
  ["CORE SKILLS", "skills"],
  ["SKILLS", "skills"],
  ["KEY SKILLS", "skills"],
  ["AREAS OF EXPERTISE", "skills"],
  ["PROFESSIONAL EXPERIENCE", "experience"],
  ["EXPERIENCE", "experience"],
  ["WORK EXPERIENCE", "experience"],
  ["RELEVANT EXPERIENCE", "experience"],
  ["EDUCATION", "list"],
  ["AWARDS", "list"],
  ["PROFESSIONAL DEVELOPMENT", "list"],
  ["LANGUAGES", "list"],
  ["CERTIFICATIONS", "list"],
  ["VOICE NOTES USED", "list"],
]);

const BULLET = /^\s*[•·*-]\s+/;

// A heading is a short all-caps line with no bullet marker. Requiring at least
// one letter keeps a date range or a divider row from being read as a heading.
function headingOf(line) {
  const value = line.trim();
  if (!value || value.length > 44 || BULLET.test(line)) return null;
  if (!/[A-Z]/.test(value) || value !== value.toUpperCase()) return null;
  if (!/^[A-Z0-9 &/,'’.()-]+$/.test(value)) return null;
  const normalized = value.replace(/[^A-Z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();
  return { title: value, kind: SECTION_KINDS.get(normalized) || "list" };
}

// Only unambiguous contact markers count. A bare "|" does not: résumé headlines
// are routinely written as "Project Manager | Cross-functional Delivery", and
// treating that as the contact line swaps it with the real one.
function looksLikeContact(line) {
  return /@/.test(line)
    || /\b\d{3}[.\-\s]?\d{3}[.\-\s]?\d{4}\b/.test(line)
    || /\b(?:linkedin|github)\.com/i.test(line)
    || /\bhttps?:\/\//i.test(line);
}

// Splits "Acme Corp | San Francisco, CA" into a left label and a right-aligned
// trailing detail. Only the LAST pipe is treated as the separator so employer
// names containing a pipe survive intact.
function splitTrailing(line) {
  const index = line.lastIndexOf("|");
  if (index === -1) return { text: line.trim(), trailing: "" };
  return { text: line.slice(0, index).trim(), trailing: line.slice(index + 1).trim() };
}

export function parseResumeText(text) {
  const lines = String(text || "").replace(/\r\n?/g, "\n").split("\n");
  const header = { name: "", headline: "", contact: "" };
  const sections = [];
  let current = null;
  let started = false;

  for (const line of lines) {
    const heading = headingOf(line);
    if (heading) {
      current = { title: heading.title, kind: heading.kind, lines: [] };
      sections.push(current);
      started = true;
      continue;
    }
    if (!started) {
      const value = line.trim();
      if (!value) continue;
      if (!header.name) header.name = value;
      else if (looksLikeContact(value) && !header.contact) header.contact = value;
      else if (!header.headline) header.headline = value;
      else if (!header.contact) header.contact = value;
      continue;
    }
    current.lines.push(line);
  }

  return { ...header, sections: sections.map(finishSection).filter((section) => section.hasContent) };
}

function finishSection(section) {
  const lines = section.lines;
  const trimmed = lines.map((line) => line.trim());
  const body = trimmed.filter(Boolean);

  if (section.kind === "paragraph") {
    const paragraphs = lines.join("\n").split(/\n\s*\n/).map((value) => value.replace(/\s+/g, " ").trim()).filter(Boolean);
    return { ...section, paragraphs, hasContent: paragraphs.length > 0 };
  }

  if (section.kind === "skills") {
    const items = body
      .flatMap((line) => line.replace(BULLET, "").split(/\s+[•·]\s+/))
      .map((value) => value.trim())
      .filter(Boolean);
    return { ...section, items, hasContent: items.length > 0 };
  }

  if (section.kind === "experience") {
    const entries = [];
    let entry = null;
    for (const raw of lines) {
      const line = raw.trim();
      if (!line) { entry = null; continue; }
      if (BULLET.test(raw)) {
        if (!entry) { entry = { employer: "", location: "", title: "", dates: "", bullets: [] }; entries.push(entry); }
        entry.bullets.push(line.replace(BULLET, "").trim());
        continue;
      }
      // A non-bullet line starts a new entry, or completes the one just begun.
      if (!entry || entry.bullets.length) {
        const employer = splitTrailing(line);
        entry = { employer: employer.text, location: employer.trailing, title: "", dates: "", bullets: [] };
        entries.push(entry);
      } else if (!entry.employer) {
        const employer = splitTrailing(line);
        entry.employer = employer.text;
        entry.location = employer.trailing;
      } else if (!entry.title) {
        const role = splitTrailing(line);
        entry.title = role.text;
        entry.dates = role.trailing;
      } else {
        entry.bullets.push(line);
      }
    }
    const kept = entries.filter((item) => item.employer || item.title || item.bullets.length);
    return { ...section, entries: kept, hasContent: kept.length > 0 };
  }

  const items = body.map((line) => line.replace(BULLET, "").trim()).filter(Boolean);
  return { ...section, items, hasContent: items.length > 0 };
}

export function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>'"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" }[character]));
}

// Word's HTML engine ignores most modern layout, so the stylesheet stays on
// properties Word and print engines both honor: block flow, floats, borders,
// and point-based type. No flexbox, no grid, no custom properties.
const DOCUMENT_CSS = `
@page { margin: 0.5in; }
* { box-sizing: border-box; }
body { margin: 0; padding: 0; background: #fff; color: #111; font-family: Georgia, 'Times New Roman', serif; font-size: 10.5pt; line-height: 1.4; }
.resume { max-width: 7.5in; margin: 0 auto; }
.resume-name { margin: 0; font-size: 22pt; font-weight: 700; letter-spacing: -0.01em; line-height: 1.1; }
.resume-headline { margin: 3pt 0 0; font-size: 11.5pt; font-weight: 700; color: #333; }
.resume-contact { margin: 5pt 0 0; font-size: 9pt; color: #444; }
.resume-rule { border: 0; border-top: 1.5pt solid #111; margin: 7pt 0 0; }
h2 { margin: 14pt 0 6pt; padding-bottom: 2pt; border-bottom: 0.75pt solid #999; font-size: 10pt; font-weight: 700; letter-spacing: 0.09em; text-transform: uppercase; }
p { margin: 0 0 6pt; }
ul { margin: 4pt 0 0; padding-left: 16pt; }
li { margin: 0 0 3pt; }
.entry { margin: 0 0 10pt; page-break-inside: avoid; }
.entry-line { margin: 0; overflow: hidden; }
.entry-employer { font-weight: 700; font-size: 11pt; }
.entry-title { font-style: italic; }
.entry-detail { float: right; font-size: 9.5pt; color: #444; font-style: normal; font-weight: 400; }
.skills { margin: 0; }
.plain-list { list-style: none; padding-left: 0; }
.plain-list li { margin: 0 0 3pt; }
`.trim();

function renderEntry(entry) {
  const employerLine = entry.employer || entry.location
    ? `<p class="entry-line"><span class="entry-employer">${escapeHtml(entry.employer)}</span>${entry.location ? `<span class="entry-detail">${escapeHtml(entry.location)}</span>` : ""}</p>`
    : "";
  const titleLine = entry.title || entry.dates
    ? `<p class="entry-line"><span class="entry-title">${escapeHtml(entry.title)}</span>${entry.dates ? `<span class="entry-detail">${escapeHtml(entry.dates)}</span>` : ""}</p>`
    : "";
  const bullets = entry.bullets.length
    ? `<ul>${entry.bullets.map((bullet) => `<li>${escapeHtml(bullet)}</li>`).join("")}</ul>`
    : "";
  return `<div class="entry">${employerLine}${titleLine}${bullets}</div>`;
}

function renderSection(section) {
  const heading = `<h2>${escapeHtml(titleCase(section.title))}</h2>`;
  if (section.kind === "paragraph") return `${heading}${section.paragraphs.map((value) => `<p>${escapeHtml(value)}</p>`).join("")}`;
  if (section.kind === "skills") return `${heading}<p class="skills">${section.items.map((item) => escapeHtml(item)).join(" &nbsp;•&nbsp; ")}</p>`;
  if (section.kind === "experience") return `${heading}${section.entries.map(renderEntry).join("")}`;
  return `${heading}<ul class="plain-list">${section.items.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>`;
}

// "PROFESSIONAL EXPERIENCE" reads better as "Professional Experience" at the
// larger heading size; the stylesheet re-applies uppercase for the printed look.
function titleCase(value) {
  return value.toLowerCase().replace(/\b[a-z]/g, (character) => character.toUpperCase());
}

export function resumeToHtml(text, options = {}) {
  const parsed = parseResumeText(text);
  const title = options.title || parsed.name || "Résumé";
  const body = `<div class="resume">`
    + (parsed.name ? `<h1 class="resume-name">${escapeHtml(parsed.name)}</h1>` : "")
    + (parsed.headline ? `<p class="resume-headline">${escapeHtml(parsed.headline)}</p>` : "")
    + (parsed.contact ? `<p class="resume-contact">${escapeHtml(parsed.contact)}</p>` : "")
    + (parsed.name || parsed.headline || parsed.contact ? `<hr class="resume-rule" />` : "")
    + parsed.sections.map(renderSection).join("")
    + `</div>`;
  const autoPrint = options.autoPrint ? `<script>window.onload=function(){window.print()}<\/script>` : "";
  return `<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(title)}</title><style>${DOCUMENT_CSS}</style></head><body>${body}${autoPrint}</body></html>`;
}

// Cover letters and answer kits are prose, not résumés: same page setup and
// typography, but no section rules or entry layout.
export function proseToHtml(text, options = {}) {
  const title = options.title || "Document";
  const paragraphs = String(text || "").replace(/\r\n?/g, "\n").split(/\n\s*\n/)
    .map((block) => block.trim()).filter(Boolean)
    .map((block) => `<p>${block.split("\n").map((line) => escapeHtml(line.trim())).join("<br />")}</p>`)
    .join("");
  const autoPrint = options.autoPrint ? `<script>window.onload=function(){window.print()}<\/script>` : "";
  return `<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(title)}</title><style>${DOCUMENT_CSS}</style></head><body><div class="resume">${paragraphs}</div>${autoPrint}</body></html>`;
}
