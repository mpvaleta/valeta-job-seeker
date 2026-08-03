const STOP_WORDS = new Set(["and", "are", "but", "for", "from", "have", "that", "the", "this", "was", "were", "with", "you", "your", "our", "their", "they", "will", "would", "about", "into", "just", "very"]);
const TRIVIAL_REPLY = /^(?:thanks?|thank you|thx|great|nice|love (?:this|it)|congrats?|congratulations|well done|so good|amazing|awesome|beautiful|perfect|same here|tamo junto|melhor|milagre|it(?:'|’)s always a pleasure|always a pleasure|happy to help|my pleasure)[!. ]*$/i;
const URL_OR_EXPORT_NOISE = /(?:https?:\/\/|www\.|linkedin\.com\/|^\s*(?:date|time|link|message|author|urn|activity|comments?)\s*(?:,|\||$)|^\s*---[^\n]+---\s*$|^\s*\d{4}-\d{2}-\d{2}[ T])/i;

/**
 * Returns the prose that is safe to use as a writing-voice sample.  Imports
 * remain intact in the source library; this only prevents CSV columns, URLs,
 * one-line reactions, and similar noise from teaching the voice model.
 */
export function cleanWritingSamples(value) {
  const raw = String(value || "").replace(/\u0000/g, "").trim();
  if (!raw) return { text: "", kept: 0, dropped: 0, sourceWords: 0 };

  const rows = csvRows(raw);
  const hasMessageColumn = rows[0]?.some((item) => /^message$/i.test(item.trim()));
  const messageColumn = rows[0]?.findIndex((item) => /^message$/i.test(item.trim())) ?? -1;
  const candidates = hasMessageColumn
    // Some LinkedIn CSV exports contain unquoted commas in the message body.
    // Joining the remaining cells recovers the visible comment without trusting
    // the Date/Link columns.
    ? rows.slice(1).map((row) => row.slice(messageColumn).join(",") || "")
    : raw.split(/\n{2,}|\r?\n/);
  const kept = [];
  let dropped = 0;
  for (const candidate of candidates) {
    const cleaned = String(candidate || "").replace(/\s+/g, " ").trim();
    if (!isMeaningfulWriting(cleaned)) { dropped += 1; continue; }
    kept.push(cleaned);
  }
  const unique = [...new Map(kept.map((item) => [item.toLocaleLowerCase(), item])).values()];
  return {
    text: unique.join("\n\n"),
    kept: unique.length,
    dropped,
    sourceWords: raw.match(/[A-Za-zÀ-ÿ][A-Za-zÀ-ÿ'’-]*/g)?.length || 0,
  };
}

function isMeaningfulWriting(value) {
  if (!value || URL_OR_EXPORT_NOISE.test(value) || TRIVIAL_REPLY.test(value)) return false;
  const words = value.match(/[A-Za-zÀ-ÿ][A-Za-zÀ-ÿ'’-]*/g) || [];
  if (words.length < 10 || value.length < 55) return false;
  const letters = words.filter((word) => word.length > 1).length;
  const punctuation = /[.!?;]/.test(value);
  return letters >= 8 && (punctuation || words.length >= 18);
}

function csvRows(value) {
  const rows = [];
  let row = [];
  let cell = "";
  let quoted = false;
  for (let index = 0; index < value.length; index += 1) {
    const char = value[index];
    const next = value[index + 1];
    if (char === '"' && quoted && next === '"') { cell += '"'; index += 1; continue; }
    if (char === '"') { quoted = !quoted; continue; }
    if (char === "," && !quoted) { row.push(cell); cell = ""; continue; }
    if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && next === "\n") index += 1;
      row.push(cell); cell = "";
      if (row.some((item) => item.trim())) rows.push(row);
      row = [];
      continue;
    }
    cell += char;
  }
  row.push(cell);
  if (row.some((item) => item.trim())) rows.push(row);
  return rows;
}

export function deriveWritingVoice(value) {
  const cleaned = cleanWritingSamples(value);
  const text = cleaned.text.replace(/\s+/g, " ").trim();
  const sentences = text.split(/(?<=[.!?])\s+/).map((item) => item.trim()).filter((item) => item.length >= 4);
  const words = text.match(/[A-Za-zÀ-ÿ][A-Za-zÀ-ÿ'’-]*/g) || [];
  const averageSentenceWords = sentences.length ? Math.round(words.length / sentences.length) : 0;
  const firstPerson = (text.match(/\b(I|I'm|I've|I'll|I'd|me|my|we|we're|we've|our)\b/gi) || []).length;
  const contractions = (text.match(/\b[A-Za-z]+[’'][A-Za-z]+\b/g) || []).length;
  const questions = (text.match(/\?/g) || []).length;
  const exclamations = (text.match(/!/g) || []).length;
  const phrases = characteristicPhrases(words).slice(0, 4);

  if (words.length < 40 || sentences.length < 3) {
    return {
      ready: false,
      tone: "Add at least three substantial sentences of your real writing before V’s learns a voice profile.",
      prefer: "Use meaningful emails, posts, letters, or articles. Short reactions, URLs, export columns, and code are ignored.",
      avoid: "Do not infer a personal style from a very small sample or one-line social replies.",
      stats: { words: words.length, sentences: sentences.length, averageSentenceWords, firstPerson, contractions, questions, exclamations, kept: cleaned.kept, dropped: cleaned.dropped, sourceWords: cleaned.sourceWords },
      phrases: [],
    };
  }

  const tone = [
    averageSentenceWords <= 14 ? "concise" : averageSentenceWords <= 22 ? "measured" : "detailed",
    contractions >= Math.max(2, sentences.length / 5) ? "conversational" : "professional",
    firstPerson >= Math.max(3, sentences.length / 4) ? "personal" : "focused",
    questions ? "occasionally inquisitive" : "declarative",
  ].join(", ");
  const sentenceGuidance = averageSentenceWords <= 14
    ? "Keep sentences short and direct"
    : averageSentenceWords <= 22
      ? "Use medium-length sentences with a clear point"
      : "Allow fuller sentences while keeping each paragraph focused";
  const phraseGuidance = phrases.length ? ` Preserve recurring language such as “${phrases.join("”, “")}” when it fits naturally.` : "";

  return {
    ready: true,
    tone: `${capitalize(tone)}. Learned from ${words.length} useful words across ${sentences.length} sentences.`,
    prefer: `${sentenceGuidance}; retain the sample’s level of first-person language and confidence.${phraseGuidance}`,
    avoid: "Avoid generic enthusiasm, inflated claims, copied job-description language, and vocabulary that does not appear naturally in the approved samples.",
    stats: { words: words.length, sentences: sentences.length, averageSentenceWords, firstPerson, contractions, questions, exclamations, kept: cleaned.kept, dropped: cleaned.dropped, sourceWords: cleaned.sourceWords },
    phrases,
  };
}

function characteristicPhrases(words) {
  const normalized = words.map((word) => word.toLowerCase().replace(/[’']/g, "'"));
  const counts = new Map();
  for (let index = 0; index < normalized.length - 1; index += 1) {
    const left = normalized[index];
    const right = normalized[index + 1];
    if (left.length < 3 || right.length < 3 || STOP_WORDS.has(left) || STOP_WORDS.has(right)) continue;
    const phrase = `${left} ${right}`;
    counts.set(phrase, (counts.get(phrase) || 0) + 1);
  }
  return [...counts.entries()]
    .filter(([, count]) => count >= 2)
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
    .map(([phrase]) => phrase);
}

function capitalize(value) {
  return value ? `${value[0].toUpperCase()}${value.slice(1)}` : value;
}
