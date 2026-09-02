/*
 * Turning a talk about résumés into résumé playbook rules.
 *
 * The playbook is the highest editorial authority the résumé builder has: an
 * uploaded rule outranks every curated one. So what lands in it matters more
 * than what lands anywhere else in the app.
 *
 * It was being filled by factCandidates(), which is tuned for the opposite
 * job — finding *career facts* in a CV. That extractor scores action verbs,
 * dates, employer names and money, and it actively penalises instruction-like
 * sentences. Point it at a transcript of a résumé talk and two things go wrong:
 * the rules score last, and the speaker's own career claims ("I led a team of
 * twelve at Google") score first. Pasted transcripts fared worse still —
 * toUnits() joins consecutive lines into one paragraph, a pasted transcript is
 * consecutive lines, and a unit over 900 characters is dropped, so a whole
 * video yielded exactly nothing.
 *
 * This extractor is the mirror image: it keeps the instructions and drops the
 * war stories. A rule is what someone tells you to do; a career fact is what
 * someone says they did, and only Marcos's own documents may produce those.
 */

// YouTube's "Show transcript" copies a timestamp on its own line before each
// caption line, and speaker labels arrive as "NAME:" prefixes.
const TIMESTAMP_LINE = /^\s*(?:\[?\d{1,2}:\d{2}(?::\d{2})?\]?|\(\d{1,2}:\d{2}(?::\d{2})?\))\s*$/;
const INLINE_TIMESTAMP = /(?:^|\s)\[?\d{1,2}:\d{2}(?::\d{2})?\]?(?=\s|$)/g;
const SPEAKER_LABEL = /^\s*[A-Z][A-Za-z .'-]{1,30}:\s+/;
const SOUND_CUE = /\[(?:music|applause|laughter|inaudible|silence)\]/gi;

// What a channel says that is not advice.
const CHANNEL_FILLER = /\b(?:subscribe|hit the bell|like the video|leave a comment|in the comments|link (?:is )?in the (?:description|bio)|patreon|sponsor(?:ed|ship)? (?:of|by)|welcome back|my channel|next video|check out my|sign up (?:for|to) my|free template below|before we (?:start|begin))\b/i;

// Someone's own history. In a source about how to write a résumé, these are the
// speaker's claims, and they must never reach Marcos's playbook or his facts.
const PERSONAL_CLAIM = /^(?:and\s+|so\s+|but\s+)?(?:i|we)\s+(?:led|managed|built|ran|worked|joined|founded|spent|started|hired|reviewed|created|launched|grew|left|got|landed)\b/i;

// The shapes advice actually takes.
const IMPERATIVE_START = /^(?:always|never|avoid|use|keep|start|end|put|list|write|include|exclude|remove|cut|drop|skip|tailor|quantify|lead with|show|prove|match|mirror|limit|name|order|group|highlight|focus|make sure|don['’]?t|do not|stop|try to|aim (?:for|to)|stick to|save|send|check|read|open|close|swap|replace|prioriti[sz]e|structure|format|label|number|spell|proofread)\b/i;
const PRESCRIPTIVE = /\b(?:should(?:n['’]?t)?|must(?:n['’]?t)?|need(?:s)? to|have to|ought to|make sure|be sure to|instead of|rather than|the best way|a good rule|rule of thumb|works better|never|always|avoid|don['’]?t|do not)\b/i;
const RESUME_DOMAIN = /\b(?:r[ée]sum[ée]s?|cv|cvs|bullet|bullets|summary|headline|profile|ats|applicant tracking|keyword|keywords|cover letter|one page|two pages?|font|margin|section|action verb|verb|metric|metrics|quantif|tailor|recruiter|hiring manager|screener|interview|job description|application|portfolio|linkedin)\b/i;

const MIN_RULE_LENGTH = 25;
const MAX_RULE_LENGTH = 320;
export const PLAYBOOK_RULE_LIMIT = 120;

/*
 * A pasted transcript, made readable.
 *
 * Timestamps, speaker labels and sound cues go; the caption lines are rejoined
 * into sentences. Auto-captions carry no punctuation at all, so a line that
 * ends without one is treated as continuing the next — which is what turns
 * forty minutes of five-word lines back into sentences a reader would
 * recognise.
 */
export function normalizeTranscript(value) {
  const lines = String(value || "")
    .replace(/\r\n?/g, "\n")
    .replace(SOUND_CUE, " ")
    .split("\n")
    .map((line) => line.replace(INLINE_TIMESTAMP, " ").replace(SPEAKER_LABEL, "").replace(/\s+/g, " ").trim())
    .filter((line) => line && !TIMESTAMP_LINE.test(line));

  // Only an obvious continuation is rejoined here — a line broken mid-clause.
  // Deciding where one instruction ends and the next begins needs to know
  // whether the source is punctuated at all, and that is ruleUnits' job.
  const joined = [];
  for (const line of lines) {
    const previous = joined[joined.length - 1];
    if (previous && /[,;:-]$/.test(previous)) joined[joined.length - 1] = `${previous} ${line}`;
    else joined.push(line);
  }
  return joined.join("\n").trim();
}

// Where a new piece of advice begins when the speaker never punctuates.
const DISCOURSE_START = /^(?:so|now|next|then|also|and then|but|okay|ok|right|another (?:thing|tip)|the (?:first|second|third|fourth|fifth|next|last|other) (?:thing|tip|rule|one)|number \d+|tip \d+|finally|lastly|first(?:ly)?|second(?:ly)?|third(?:ly)?|my (?:first|second|next|last) (?:tip|rule))\b/i;
const FILLER_PREFIX = /^(?:so|and|but|now|okay|ok|right|well|um+|uh+|like|you know|i mean|look|alright)[,\s]+/i;
const MERGED_UNIT_LIMIT = 240;

// A transcript that carries real punctuation can be split on it. Auto-captions
// carry none at all, which is why this is measured rather than assumed.
function isPunctuated(text) {
  const sentences = (text.match(/[.!?]/g) || []).length;
  return sentences >= Math.max(3, text.length / 400);
}

/*
 * Sentence-ish units.
 *
 * Long blocks are split rather than dropped, which is what a transcript needs
 * and what the fact extractor — working from a formatted CV — never had to do.
 * Without punctuation to split on, a new unit starts where a new instruction
 * plausibly starts: an imperative, or the discourse marker people use to move
 * to the next tip.
 */
function ruleUnits(text) {
  const normalized = normalizeTranscript(text);
  if (isPunctuated(normalized)) {
    // Joined first, then split on sentence ends: a punctuated transcript wraps
    // sentences across lines, so splitting line by line would cut them in half.
    return normalized
      .split(/\n{2,}/)
      .flatMap((block) => block.replace(/\n/g, " ").split(/(?<=[.!?])\s+/))
      .map(cleanUnit)
      .filter(Boolean);
  }
  const units = [];
  for (const line of normalized.split("\n")) {
    const previous = units[units.length - 1];
    // Filler and personal history break a unit as surely as a new instruction
    // does. Merged into the rule above them, they take the whole rule down with
    // them when it is filtered.
    const starts = IMPERATIVE_START.test(line) || DISCOURSE_START.test(line) || /^[-•*\d]/.test(line)
      || CHANNEL_FILLER.test(line) || PERSONAL_CLAIM.test(line);
    if (!previous || starts || previous.length + line.length > MERGED_UNIT_LIMIT) units.push(line);
    else units[units.length - 1] = `${previous} ${line}`;
  }
  return units.map(cleanUnit).filter(Boolean);
}

// The filler people open a sentence with carries no instruction, and leaving it
// in makes every rule read like a transcript instead of a rule.
function cleanUnit(value) {
  let unit = String(value || "").replace(/^[-•*\d.)\s]+/, "").replace(/\s+/g, " ").trim();
  for (let pass = 0; pass < 3 && FILLER_PREFIX.test(unit); pass += 1) unit = unit.replace(FILLER_PREFIX, "");
  unit = unit.replace(/^(?:the (?:first|second|third|fourth|fifth|next|last|other) (?:thing|tip|rule|one) is(?: that)?|another (?:thing|tip) is(?: that)?|number \d+|tip \d+)[,:\s]+/i, "");
  return unit.charAt(0).toUpperCase() + unit.slice(1);
}

export function ruleQuality(value) {
  let score = 0;
  if (IMPERATIVE_START.test(value)) score += 26;
  if (PRESCRIPTIVE.test(value)) score += 18;
  if (RESUME_DOMAIN.test(value)) score += 14;
  // A rule that says what to do *and* what it is about beats one that only
  // sounds instructive: "keep it short" is weaker than "keep the summary to
  // three lines".
  if (IMPERATIVE_START.test(value) && RESUME_DOMAIN.test(value)) score += 10;
  if (/\b(?:one|two|three|1|2|3|\d{1,3})\s*(?:page|pages|line|lines|word|words|bullet|bullets|second|seconds)\b/i.test(value)) score += 8;
  if (CHANNEL_FILLER.test(value)) score -= 60;
  if (PERSONAL_CLAIM.test(value)) score -= 40;
  if (/\?\s*$/.test(value)) score -= 12;
  const words = value.split(/\s+/).filter(Boolean).length;
  if (words < 5) score -= 20;
  if (words > 45) score -= 8;
  return score;
}

/*
 * The rules a source is offering, best first, deduplicated.
 *
 * Nothing that reads as somebody's personal history survives, whatever else it
 * scores: a playbook rule is guidance, and a stranger's claim about their own
 * career is neither guidance nor Marcos's evidence.
 */
export function playbookRuleCandidates(text, limit = PLAYBOOK_RULE_LIMIT) {
  const seen = new Set();
  const ranked = [];
  ruleUnits(text).forEach((value, order) => {
    if (value.length < MIN_RULE_LENGTH || value.length > MAX_RULE_LENGTH) return;
    if (PERSONAL_CLAIM.test(value) || CHANNEL_FILLER.test(value)) return;
    const key = value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
    if (!key || seen.has(key)) return;
    seen.add(key);
    const quality = ruleQuality(value);
    // A unit that is neither instructive nor about résumés is conversation.
    if (quality < 20) return;
    ranked.push({ value, order, quality });
  });
  const kept = new Set([...ranked]
    .sort((left, right) => right.quality - left.quality || left.order - right.order)
    .slice(0, limit)
    .map((item) => item.order));
  return ranked.filter((item) => kept.has(item.order)).map((item) => item.value);
}
