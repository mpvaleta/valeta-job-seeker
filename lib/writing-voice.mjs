const STOP_WORDS = new Set(["and", "are", "but", "for", "from", "have", "that", "the", "this", "was", "were", "with", "you", "your", "our", "their", "they", "will", "would", "about", "into", "just", "very"]);

export function deriveWritingVoice(value) {
  const text = String(value || "").replace(/---[^\n]+---/g, " ").replace(/\s+/g, " ").trim();
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
      tone: "Add at least three complete sentences of your real writing before V’s learns a voice profile.",
      prefer: "Use the uploaded samples directly until more writing is available.",
      avoid: "Do not infer a personal style from a very small sample.",
      stats: { words: words.length, sentences: sentences.length, averageSentenceWords, firstPerson, contractions, questions, exclamations },
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
    tone: `${capitalize(tone)}. Learned from ${words.length} words across ${sentences.length} sentences.`,
    prefer: `${sentenceGuidance}; retain the sample’s level of first-person language and confidence.${phraseGuidance}`,
    avoid: "Avoid generic enthusiasm, inflated claims, copied job-description language, and vocabulary that does not appear naturally in the approved samples.",
    stats: { words: words.length, sentences: sentences.length, averageSentenceWords, firstPerson, contractions, questions, exclamations },
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
