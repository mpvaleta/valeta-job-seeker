/*
 * Everything V's knows, as one document.
 *
 * The workspace holds the same knowledge in several places — approved facts on
 * the profile, rules on playbook sources, a learned voice, research notes, the
 * sources themselves — and the owner's way of checking what the app knew was
 * to open each of them. Two uploaded résumés that overlap made it worse: the
 * same fact, twice, worded slightly differently, and no single place to see
 * that.
 *
 * This is rebuilt from the current workspace every time it is asked for, so it
 * is never stale and never edited by hand. It is Markdown on purpose: the one
 * format that reads well in a text editor, pastes into a chat model, and
 * imports into a notebook tool without conversion.
 */

const line = (value) => String(value == null ? "" : value).replace(/\s+/g, " ").trim();

export function buildKnowledgeBase(input = {}) {
  const profile = input.profile || {};
  const facts = Array.isArray(input.facts) ? input.facts.map(line).filter(Boolean) : [];
  const conflicts = Array.isArray(input.conflicts) ? input.conflicts : [];
  const rules = Array.isArray(input.playbookRules) ? input.playbookRules.map(line).filter(Boolean) : [];
  const voice = input.voice || {};
  const tracks = Array.isArray(input.tracks) ? input.tracks : [];
  const research = Array.isArray(input.research) ? input.research : [];
  const sources = Array.isArray(input.sources) ? input.sources : [];
  const collapsed = Number(input.collapsed || 0);
  const setAside = Number(input.setAside || 0);
  const generatedAt = line(input.generatedAt) || "today";
  const name = line(profile.name) || "Candidate";

  const out = [];
  out.push(`# ${name} — everything V’s knows`);
  out.push("");
  out.push(`_Generated ${generatedAt} from the current workspace. This file is rebuilt every time it is downloaded; change the source in V’s and download again rather than editing it._`);
  out.push("");

  out.push("## Profile");
  out.push("");
  for (const [label, value] of [
    ["Headline", profile.headline],
    ["Location", profile.location],
    ["Email", profile.email],
    ["Phone", profile.phone],
    ["LinkedIn", profile.linkedin],
    ["Portfolio", profile.portfolio],
  ]) {
    if (line(value)) out.push(`- **${label}:** ${line(value)}`);
  }
  if (line(profile.summary)) {
    out.push("");
    out.push("**Base summary**");
    out.push("");
    out.push(line(profile.summary));
  }
  out.push("");

  out.push(`## Career facts (${facts.length}, deduplicated)`);
  out.push("");
  if (!facts.length) out.push("_No approved facts yet. Approve candidates from an uploaded résumé in Knowledge sources._");
  facts.forEach((fact, index) => out.push(`${index + 1}. ${fact}`));
  const notes = [];
  if (collapsed) notes.push(`${collapsed} near-duplicate${collapsed === 1 ? "" : "s"} from overlapping sources collapsed into the entries above`);
  if (setAside) notes.push(`${setAside} line${setAside === 1 ? "" : "s"} set aside as contact details, fragments, or keyword lists`);
  if (notes.length) {
    out.push("");
    out.push(`_${notes.join("; ")}._`);
  }
  out.push("");

  if (conflicts.length) {
    out.push(`## Facts that disagree (${conflicts.length})`);
    out.push("");
    out.push("_Two sources describe the same job or result differently. Neither was discarded; decide which is right in Knowledge sources._");
    out.push("");
    conflicts.forEach((conflict, index) => {
      out.push(`${index + 1}. **${conflict.kind === "metric" ? "Different number" : "Different title"}** — ${line(conflict.detail)}`);
      out.push(`   - ${line(conflict.a?.text)} _(${line(conflict.a?.source) || "unknown source"})_`);
      out.push(`   - ${line(conflict.b?.text)} _(${line(conflict.b?.source) || "unknown source"})_`);
    });
    out.push("");
  }

  out.push(`## Résumé playbook (${rules.length} rule${rules.length === 1 ? "" : "s"})`);
  out.push("");
  if (!rules.length) out.push("_No uploaded rules yet. V’s falls back to its built-in guidance._");
  else out.push("_Uploaded rules outrank V’s built-in guidance when a résumé is generated._");
  rules.forEach((rule) => out.push(`- ${rule}`));
  out.push("");

  out.push("## Writing voice");
  out.push("");
  if (voice.ready) {
    out.push(`- **Tone:** ${line(voice.tone)}`);
    out.push(`- **Prefer:** ${line(voice.prefer)}`);
    out.push(`- **Avoid:** ${line(voice.avoid)}`);
    if (voice.words) out.push(`- **Learned from:** ${voice.words} words of approved writing samples`);
  } else {
    out.push("_Not learned yet. Add writing samples in Knowledge sources to teach it._");
  }
  out.push("");

  if (tracks.length) {
    out.push(`## Résumé tracks (${tracks.length})`);
    out.push("");
    for (const track of tracks) {
      const focus = Array.isArray(track.focus) ? track.focus.map(line).filter(Boolean) : [];
      out.push(`- **${line(track.name) || "Untitled track"}**${line(track.headline) ? ` — ${line(track.headline)}` : ""}${focus.length ? ` · focus: ${focus.join(", ")}` : ""}`);
    }
    out.push("");
  }

  if (research.length) {
    out.push(`## Research notes (${research.length})`);
    out.push("");
    out.push("_Kept apart from career facts. Context only; never a claim about the candidate._");
    out.push("");
    for (const note of research) {
      const title = line(note.title) || "Untitled";
      const link = line(note.sourceUrl);
      out.push(`- **${title}**${link ? ` — ${link}` : ""}${line(note.importedAt) ? ` _(${line(note.importedAt)})_` : ""}`);
      if (line(note.excerpt)) out.push(`  ${line(note.excerpt).slice(0, 300)}${line(note.excerpt).length > 300 ? "…" : ""}`);
    }
    out.push("");
  }

  out.push(`## Sources (${sources.length})`);
  out.push("");
  if (!sources.length) out.push("_Nothing imported yet._");
  for (const source of sources) {
    const counts = Number.isFinite(source.candidates) ? ` · ${source.approved || 0}/${source.candidates} ${source.scope === "Résumé playbook" ? "rules active" : "facts approved"}` : "";
    out.push(`- ${line(source.title) || "Untitled"} · ${line(source.type) || "document"} · ${line(source.scope) || "unscoped"}${line(source.importedAt) ? ` · ${line(source.importedAt)}` : ""}${counts}`);
  }
  out.push("");

  out.push("## Not in this document");
  out.push("");
  out.push("- Job radar targets, search goals, and what the radar has learned from your decisions live on the server; open the Job radar tab for those.");
  out.push("- Applications and saved résumé versions have their own export on the Applications tab.");
  out.push("");
  return out.join("\n");
}

// The same document without Markdown marks, for a Word file or a plain paste.
export function knowledgeBasePlainText(markdown) {
  return String(markdown || "")
    .split("\n")
    .map((row) => row
      .replace(/^#{1,6}\s+/, "")
      .replace(/^\s*[-*]\s+/, "• ")
      .replace(/^_(.*)_$/, "$1")
      .replace(/\*\*([^*]+)\*\*/g, "$1")
      .replace(/_\(([^)]+)\)_/g, "($1)"))
    .join("\n");
}
