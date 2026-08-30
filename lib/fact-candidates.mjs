// Turning an uploaded document into reviewable career facts.
//
// The previous version read the file line by line, emitted each line twice (once
// bare, once prefixed with the nearest heading), appended a sentence-split of
// the whole document on top of that, and then kept the first 60 survivors in
// document order.
//
// Every one of those choices worked against a real document. A résumé or a
// career knowledge base is hard-wrapped, so a line is a fragment rather than a
// sentence — "career, plus the rules for how this material must be used. It is
// written for an" was a candidate. Markdown markers rode along into the text.
// The double emission plus the sentence split meant most of the 60 slots went
// to near-duplicates of each other. And because the cap ran in document order,
// a document that opens with a preamble spent all 60 on the preamble: uploading
// a 600-line career knowledge base surfaced its usage rules and stopped before
// reaching a single employer.
//
// This version reassembles wrapped paragraphs into whole units, keeps one
// candidate per unit, and ranks before it truncates — so whatever the cap
// removes is the weakest material, not simply the last.

export const CANDIDATE_LIMIT = 400;

const MARKDOWN_HEADING = /^\s{0,3}#{1,6}\s+/;
const BULLET_START = /^\s*(?:[-•*+]\s+|\d{1,2}[.)]\s+)/;
const HORIZONTAL_RULE = /^\s*(?:[-*_]\s*){3,}$/;

// Words that mark a line as an instruction to the tool rather than a fact about
// the career. They lower a candidate's rank; they never remove it, because
// "never" and "avoid" also appear in perfectly good accomplishment bullets.
const INSTRUCTION_SIGNAL = /\b(?:this document|the tool should|source-of-truth|never (?:invent|use|guess)|do not (?:use|guess|invent)|must never|per (?:his|her|their|valeta's) instruction|see section|verify before|unconfirmed|do not exist)\b/i;

const ACTION_VERB = /\b(?:led|managed|built|created|delivered|launched|produced|owned|directed|coordinated|developed|ran|drove|designed|negotiated|oversaw|founded|architected|introduced|rebuilt|established|grew|reduced|increased|improved|trained|partnered|sourced)\b/i;

export function stripInlineMarkdown(value) {
  return String(value || "")
    .replace(/`{1,3}([^`]*)`{1,3}/g, "$1")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/__([^_]+)__/g, "$1")
    .replace(/(?<!\*)\*([^*]+)\*(?!\*)/g, "$1")
    .replace(/\[([^\]]+)\]\((?:[^)]*)\)/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
}

// A heading is what gives the bullets under it their employer and dates. It is
// kept as its own candidate rather than glued onto each bullet, because the
// résumé builder reads approved facts in order and attaches accomplishment
// bullets to the job header above them.
function isStructuralHeading(value) {
  if (value.length > 160) return false;
  if (/^[A-Z][A-Z0-9&.,'’/() -]{5,}$/.test(value)) return true;
  const hasDate = /\b(?:19|20)\d{2}\b/.test(value) || /\b(?:present|current)\b/i.test(value);
  if (hasDate && value.length <= 120 && !ACTION_VERB.test(value)) return true;
  return value.includes("|") && value.split("|").length >= 2 && value.length <= 120;
}

// A section marker ("1. IDENTITY & CONTACT", "Section 4") organises a document
// but says nothing about the career.
function isSectionMarker(value) {
  return /^(?:section\s+)?\d+(?:\.\d+)*\.?\s+[A-Z0-9&' -]{3,60}$/.test(value) || /^(?:table of contents|contents|index|purpose|note|appendix)\b/i.test(value);
}

export function candidateQuality(value) {
  const words = value.split(/\s+/).filter(Boolean);
  let score = Math.min(30, words.length);
  if (ACTION_VERB.test(value)) score += 22;
  if (/\b(?:19|20)\d{2}\b|\d+(?:\.\d+)?\s?%|\$\s?\d|\bR\$\s?\d/.test(value)) score += 12;
  // A capitalised name after a preposition is usually an employer or a client.
  if (/\b(?:at|for|with|across)\s+[A-Z][\w&.'’-]+/.test(value)) score += 8;
  if (INSTRUCTION_SIGNAL.test(value)) score -= 30;
  if (isSectionMarker(value)) score -= 20;
  // A fragment left over from a hard wrap starts lowercase and ends mid-clause.
  if (/^[a-z]/.test(value) && !/[.!?]$/.test(value)) score -= 12;
  return score;
}

// Rebuilds wrapped paragraphs into whole units. A new unit starts at a blank
// line, a bullet, or a heading; anything else continues the unit above it, which
// is what turns three wrapped fragments back into one sentence.
export function toUnits(text) {
  const lines = String(text || "").replace(/\r\n?/g, "\n").split("\n");
  const units = [];
  let current = null;
  let heading = "";

  const flush = () => {
    if (current && current.text.length) units.push(current);
    current = null;
  };

  for (const raw of lines) {
    if (!raw.trim() || HORIZONTAL_RULE.test(raw)) { flush(); continue; }
    const markedHeading = MARKDOWN_HEADING.test(raw);
    const bulleted = BULLET_START.test(raw);
    const body = stripInlineMarkdown(raw.replace(MARKDOWN_HEADING, "").replace(BULLET_START, ""));
    if (!body) continue;

    if (markedHeading || isStructuralHeading(body)) {
      flush();
      heading = body.replace(/[:：]+$/, "").trim();
      units.push({ text: heading, heading: "", kind: "heading" });
      continue;
    }
    if (bulleted || !current) {
      flush();
      current = { text: body, heading, kind: "body" };
      continue;
    }
    current.text = `${current.text} ${body}`;
  }
  flush();
  return units;
}

export function factCandidates(text, limit = CANDIDATE_LIMIT) {
  const units = toUnits(text);
  const seen = new Set();
  const ranked = [];

  units.forEach((unit, order) => {
    const value = unit.text.replace(/^[-•*\d.)\s]+/, "").trim();
    if (value.length < 20 || value.length > 900) return;
    const key = value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
    if (!key || seen.has(key)) return;
    seen.add(key);
    // A heading earns a small premium: it is what dates and locates everything
    // filed under it, so it must survive the cap even though it carries no verb.
    const quality = candidateQuality(value) + (unit.kind === "heading" ? 14 : 0);
    ranked.push({ value, order, quality });
  });

  // Rank to decide what survives, then restore document order, because the
  // résumé builder depends on job headers arriving before their bullets.
  const kept = new Set([...ranked].sort((left, right) => right.quality - left.quality || left.order - right.order).slice(0, limit).map((item) => item.order));
  return ranked.filter((item) => kept.has(item.order)).map((item) => item.value);
}
