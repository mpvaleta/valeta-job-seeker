"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { analyzeRole } from "@/lib/recommendation-engine.mjs";
import { classifyKnowledgeSource, mergeWritingSample, scopeForCategory, sourceScope, sourceScopeDescription, sourceScopeLabel, SOURCE_CATEGORIES } from "@/lib/knowledge-sources.mjs";
import { CURATED_RESUME_PLAYBOOK } from "@/lib/resume-playbook.mjs";
import { US_MARKET_REFERENCES } from "@/lib/us-market-references.mjs";
import { readJsonResponse } from "@/lib/http-json.mjs";
import { extractLinkedInArchive, extractLinkedInSavedJobs } from "@/lib/linkedin-archive.mjs";
import { parseResumeText, proseToHtml, resumeToHtml } from "@/lib/resume-document.mjs";
import { RESUME_STANDARD_DIMENSIONS, auditResume } from "@/lib/resume-standards.mjs";
import { cleanWritingSamples, deriveWritingVoice } from "@/lib/writing-voice.mjs";
import { buildLocalResume } from "@/lib/local-resume.mjs";
import { DEFAULT_RESUME_TRACKS, normalizeResumeTracks, selectResumeTrack } from "@/lib/resume-tracks.mjs";
import { PLAYBOOK_GENERATION_RULE_LIMIT, prioritizeResumePlaybookRules } from "@/lib/playbook-priority.mjs";
import { preparePlaybookLibrary, prepareResumeEvidence } from "@/lib/career-evidence.mjs";
import { auditEvidence } from "@/lib/evidence-conflicts.mjs";
import type { EvidenceAudit } from "@/lib/evidence-conflicts.mjs";
import { estimateUsageCost, formatEstimatedCost } from "@/lib/ai-pricing.mjs";
import { findReusableResumes } from "@/lib/resume-reuse.mjs";
import { RadarWorkspace } from "./radar-workspace";
import { JobSearchWorkspace } from "./job-search-workspace";
import type { RadarOpportunity } from "./radar-workspace";
import type { ApplicationRecommendation } from "@/lib/recommendation-engine.mjs";
import type { SourceCategory, SourceScope } from "@/lib/knowledge-sources.mjs";
import type { ResumeTrack } from "@/lib/resume-tracks.mjs";

type View = "workspace" | "radar" | "search" | "profile" | "documents" | "voice" | "connections" | "companies" | "applications" | "autofill" | "ai" | "data";
type Output = "analysis" | "resume" | "cover" | "answers" | "history";
type ApplicationStatus = "Saved opportunity" | "Preparing" | "Applied" | "Interview" | "Closed";
type Application = { id: string; company: string; role: string; status: ApplicationStatus; date: string; url?: string; jobSnapshotId?: string; resumeVersionId?: string; coverVersionId?: string; note?: string; nextStep?: string };
type JobSnapshot = { id: string; company: string; role: string; url?: string; description: string; source: "pasted" | "imported" | "radar"; savedAt: string; updatedAt: string; trackId: string };
type GeneratedDraft = { id: string; type: "resume" | "cover"; title: string; content: string; createdAt: string; updatedAt: string; company: string; role: string; trackId: string; jobSnapshotId?: string; applicationId?: string; sourceDocumentId?: string; origin: "generated" | "edited" | "uploaded"; provider?: AiProviderId | "local"; model?: string; modelLabel?: string; versionNumber?: number; usage?: CloudUsage; generationAttempts?: number; playbookRuleCount?: number; selectedPlaybookRuleCount?: number; approvedFactCount?: number; cleanedFactCount?: number; inputSummary?: string; reusedFromDraftId?: string; qualityScore?: number; qualityWordCount?: number; qualityBulletCount?: number; qualitySkillCount?: number };
type SourceDocument = { id: string; title: string; type: string; category?: SourceCategory; declaredCategory?: SourceCategory; scope?: SourceScope; classificationConfidence?: "high" | "medium" | "low"; classificationReasons?: string[]; trackId?: string; sourceUrl?: string; importedAt: string; text: string; candidates: string[]; approved: string[]; status: "reading" | "ready" | "needs-text"; truncated?: boolean };
type CompanyTarget = { id: string; name: string; website: string; careers: string; kind: "Brand" | "Agency" | "Sports" | "Tech"; focus: string; market: string; status: "Researching" | "Monitoring" | "Applied" | "Paused"; lastChecked: string; notes: string };
type WritingStyle = { tone: string; prefer: string; avoid: string; samples: string };
type AiProviderId = "openai" | "anthropic" | "google";
type AiModelKey = "reliable" | "balanced" | "fast";
type AiPreference = { provider: AiProviderId; modelKey: AiModelKey };
type PlaybookSettings = { curatedEnabled: boolean; usReferencesEnabled?: boolean };
type AiModelOption = { key: AiModelKey; id: string; label: string; tier: string; description: string };
type AiProviderStatus = { id: AiProviderId; name: string; keyName: string; configured: boolean; ready: boolean; defaultModelKey: AiModelKey; models: AiModelOption[] };
type AiConnection = { state: "checking" | "loaded" | "error"; authenticated: boolean; authorized: boolean; providers: AiProviderStatus[]; message: string };
type AiStatusPayload = { authenticated?: boolean; authorized?: boolean; providers?: AiProviderStatus[]; privacy?: string };
type AiModelDiagnostic = { key: AiModelKey; id: string; available: boolean; reason?: string; generationAvailable?: boolean; generationReason?: string; diagnosticCode?: string };
type AiProviderDiagnostic = { id: AiProviderId; name: string; state: "ready" | "not_configured" | "no_configured_models" | "error"; message: string; diagnosticCode?: string; requestId?: string | null; models: AiModelDiagnostic[] };
type AiDiagnosticsPayload = { ok?: boolean; code?: string; message?: string; checkedAt?: string; note?: string; providers?: AiProviderDiagnostic[] };
type CloudRecommendation = { decision: "prioritize_and_apply" | "apply_after_edits" | "hold_and_investigate"; confidence: "high" | "medium" | "low"; summary: string; actions: string[]; priorityFacts: string[]; evidenceGaps: string[]; cautions: string[]; evidenceMap?: Array<{ requirement: string; support: "strong" | "partial" | "gap"; facts: string[] }> };
type CloudUsage = { inputTokens: number; outputTokens: number; cachedTokens: number; totalTokens: number };
type CloudReview = { key: string; provider: AiProviderId; providerName: string; model: string; modelKey: AiModelKey; modelLabel: string; recommendation: CloudRecommendation; usage?: CloudUsage; requestId?: string | null };
type ErrorLogEntry = { id: string; timestamp: string; area: "app" | "ai" | "connection" | "documents" | "job-search" | "links" | "radar"; code: string; message: string; context?: Record<string, string | number | boolean> };
type ReadableLinkSource = { requestedUrl: string; finalUrl: string; sourceType: string; title: string; description: string; text: string; links?: Array<{ href: string; label: string }>; jobs: Array<{ title: string; company: string; location: string; description: string; sourceUrl: string }> };
type LinkReadPayload = { ok?: boolean; code?: string; message?: string; source?: ReadableLinkSource };
type LinkedInStatus = { state: "checking" | "ready" | "error"; configured: boolean; connected: boolean; message: string; identity?: { name?: string; email?: string; picture?: string } };
type OperationProgress = { label: string; detail: string } | null;
type LinkAssist = { kind: "linkedin" | "indeed" | "login"; title: string; message: string } | null;
type WorkspaceSnapshot = { version: number; profile: Profile; writingStyle: WritingStyle; resumeTracks: ResumeTrack[]; activeTrackId: string; aiPreference: AiPreference; claudeModel?: string; playbookSettings: PlaybookSettings; applications: Application[]; jobSnapshots: JobSnapshot[]; generatedDrafts: GeneratedDraft[]; documents: SourceDocument[]; companies: CompanyTarget[]; roleDraft: { jobText: string; company: string; role: string; roleUrl: string } };
type WorkspaceSync = { state: "loading" | "ready" | "saving" | "error"; message: string; lastSavedAt?: string };
type WorkspacePayload = { ok?: boolean; code?: string; message?: string; changed?: boolean; snapshot?: unknown; revision?: { id: string; createdAt: string; sizeBytes: number; sourceBuild: string } | null };
type WorkspaceRevision = { id: string; createdAt: string; sizeBytes: number; sourceBuild: string; isCurrent: boolean };
type ResumeAiResult = {
  headline: string;
  headline_fact_indexes: number[];
  summary: string;
  summary_fact_indexes: number[];
  core_skills: Array<{ label: string; fact_indexes: number[] }>;
  experience: Array<{ company: string; title: string; location: string; dates: string; fact_indexes: number[]; bullets: Array<{ text: string; fact_indexes: number[] }> }>;
  education: Array<{ text: string; fact_indexes: number[] }>;
  awards: Array<{ text: string; fact_indexes: number[] }>;
  professional_development: Array<{ text: string; fact_indexes: number[] }>;
  languages: Array<{ text: string; fact_indexes: number[] }>;
  omissions: string[];
  playbook_checks: Array<{ rule_source: "user" | "curated"; rule_index: number; status: "followed" | "not_applicable" | "conflict"; note: string }>;
};
type ResumeAiReview = { score: number; verdict: "ready_for_human_review" | "needs_revision" | "blocked_by_missing_evidence"; strengths: string[]; improvements: string[]; unsupported_claims: string[]; playbook_issues: string[] };
type ResumeQuality = { score: number; wordCount: number; bulletCount: number; skillCount: number; experienceCount: number; evidenceUsed: number; evidenceAvailable: number; playbookEvaluated: number; playbookFollowed: number; playbookConflicts: number; checks: string[] };
type ResumeAiResponse = { ok?: boolean; code?: string; message?: string; provider?: AiProviderId; providerName?: string; model?: string; modelLabel?: string; result?: ResumeAiResult | ResumeAiReview; usage?: CloudUsage; requestId?: string | null; diagnosticCode?: string; guardrailStage?: string; attempts?: number; providerFallback?: { from: string; to: string } | null; playbookCoverage?: { selectedUserRules: number; libraryUserRules: number; curatedRules: number }; quality?: ResumeQuality };
type ResumeGeneration = { key: string; provider: AiProviderId; providerName: string; model: string; modelKey?: AiModelKey; modelLabel: string; result: ResumeAiResult; usage?: CloudUsage; quality?: ResumeQuality };

type Profile = {
  name: string;
  email: string;
  phone: string;
  location: string;
  linkedin: string;
  portfolio: string;
  headline: string;
  summary: string;
  facts: string;
};

const initialProfile: Profile = {
  name: "",
  email: "",
  phone: "",
  location: "",
  linkedin: "",
  portfolio: "",
  headline: "",
  summary: "",
  facts: "",
};

// Quick tone presets the user can apply from the AI tab. Each one writes the
// three Writing-voice fields, which every cover letter, Claude prompt, and
// the daily automation already read — one source of truth, still hand-
// editable afterwards in Writing voice.
const TONE_PRESETS: Array<{ id: string; label: string; tone: string; prefer: string; avoid: string }> = [
  { id: "professional-direct", label: "Professional & direct", tone: "Clear, direct, confident, and practical.", prefer: "Specific examples, short sentences, concrete outcomes, and plain language.", avoid: "Corporate jargon, filler adjectives, exaggerated claims, and generic enthusiasm." },
  { id: "warm-conversational", label: "Warm & conversational", tone: "Warm, natural, and conversational while staying professional.", prefer: "First-person stories, approachable phrasing, genuine interest in the team and its work.", avoid: "Stiff formality, buzzwords, copied job-description language, and flattery." },
  { id: "executive-concise", label: "Executive & concise", tone: "Senior, measured, and economical — every sentence earns its place.", prefer: "Business outcomes, scope and scale, decision-making ownership, and short paragraphs.", avoid: "Long wind-ups, self-deprecation, jargon, and details that do not support the ask." },
  { id: "creative-energetic", label: "Creative & energetic", tone: "Energetic and creative with a clear point of view.", prefer: "Vivid but honest examples, craft language of the creative industry, momentum between paragraphs.", avoid: "Gimmicks, exclamation marks, invented metrics, and forced humor." },
];

const CLAUDE_MODEL_OPTIONS: Array<{ id: string; label: string; description: string }> = [
  { id: "sonnet", label: "Claude Sonnet", description: "Fast and strong — recommended for most drafts" },
  { id: "opus", label: "Claude Opus", description: "Deepest reasoning for a role you care most about" },
  { id: "haiku", label: "Claude Haiku", description: "Quickest — fine for small rewrites" },
];

const initialWritingStyle: WritingStyle = {
  tone: "Clear, direct, conversational, calm, and practical.",
  prefer: "Specific examples, short sentences, natural confidence, and plain language.",
  avoid: "Corporate jargon, exaggerated claims, copied job-description language, and generic enthusiasm.",
  samples: "",
};

const APP_BUILD = "2026.07-resume-radar-r10";
const MAX_SOURCE_FILE_BYTES = 10 * 1024 * 1024;
const MAX_LINKEDIN_ARCHIVE_BYTES = 50 * 1024 * 1024;
const MAX_SOURCE_TEXT = 300_000;
const SOURCE_TYPE_DETAILS: Record<SourceCategory, string> = {
  "Résumé": "Your current or past résumés. Extracted career statements become candidate evidence and can be approved together.",
  "Custom GPT export": "Career history or application content exported from your MyGPT. It becomes candidate evidence, never résumé-writing rules.",
  "LinkedIn export": "Your official LinkedIn ZIP or exported profile data. V’s separates profile evidence, received recommendations, saved-job research, and writing.",
  "Writing sample": "Emails, messages, letters, or articles that genuinely sound like you. These shape voice only and cannot create career facts.",
  "Résumé playbook": "Tips, do/don’t rules, templates, and résumé best practices. Detected rules activate automatically and outrank V’s built-in guidance.",
  "Company research": "Employer, market, team, and role research. It informs context but never becomes a claim about your experience.",
  "Other evidence": "Awards, project notes, certifications, performance feedback, or other documents that support your career history.",
};

function safeErrorMessage(value: unknown) {
  const message = value instanceof Error ? value.message : typeof value === "string" ? value : "Unexpected error";
  return message.replace(/https?:\/\/\S+/gi, "[url]").replace(/\s+/g, " ").trim().slice(0, 500);
}

function noticeTone(message: string) {
  if (/\b(?:failed|failure|error|rejected|could not|cannot|unavailable|quota|billing|blocked|invalid|needs attention|not connected)\b/i.test(message)) return "error";
  if (/\b(?:saved|created|generated|completed|connected|ready|added|approved|imported|found|preserved|relearned|copied)\b/i.test(message)) return "success";
  // Checked after error/success so a genuine failure or completion message
  // that happens to mention a progress verb in passing ("failed while
  // reading the response") is never misclassified as still in progress.
  if (/…\s*$/.test(message.trim()) || /\b(?:checking|reading|saving|loading|searching|comparing|uploading|generating|creating|running|scanning|importing|analyzing|preparing|fetching|connecting|opening|sending|verifying|syncing)\b/i.test(message)) return "pending";
  return "info";
}

function connectionFromStatus(data: AiStatusPayload): AiConnection {
  const providers = Array.isArray(data.providers) ? data.providers : [];
  if (!providers.length) return { state: "error", authenticated: Boolean(data.authenticated), authorized: Boolean(data.authorized), providers: [], message: "The provider list could not be loaded. Local analysis remains active." };
  return { state: "loaded", authenticated: Boolean(data.authenticated), authorized: Boolean(data.authorized), providers, message: "Provider status loaded. Choose the service and model you want for each cloud review." };
}

function factCandidates(text: string) {
  const seen = new Set<string>();
  const lines = text.split(/\n+/).map((item) => item.replace(/\s+/g, " ").trim()).filter(Boolean);
  const contextual: string[] = [];
  let heading = "";
  for (const line of lines) {
    const cleaned = line.replace(/^[-•*\d.)\s]+/, "").trim();
    const looksLikeHeading = cleaned.length <= 160 && (
      /\b(?:19|20)\d{2}\b/.test(cleaned)
      || /\b(?:present|current)\b/i.test(cleaned)
      || /^[A-Z][A-Z0-9&.,'’/ -]{5,}$/.test(cleaned)
      || (cleaned.includes("|") && cleaned.split("|").length >= 2)
    );
    if (looksLikeHeading) {
      heading = cleaned;
      contextual.push(cleaned);
      continue;
    }
    if (heading && cleaned.length >= 25) contextual.push(`${heading} — ${cleaned}`);
    contextual.push(cleaned);
  }
  return [...contextual, ...text.split(/(?<=[.!?])\s+/)]
    .map((item) => item.replace(/^[-•*\d.)\s]+/, "").trim())
    .filter((item) => item.length >= 20 && item.length <= 500)
    .filter((item) => {
      const key = item.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, 60);
}

function normalizeFact(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim().replace(/\s+/g, " ");
}

function isOverlappingFact(candidate: string, existing: string[]) {
  const normalized = normalizeFact(candidate);
  const tokens = new Set(normalized.split(" ").filter((token) => token.length > 2));
  return existing.some((item) => {
    const other = normalizeFact(item);
    if (other === normalized || other.includes(normalized) || normalized.includes(other)) return true;
    const otherTokens = new Set(other.split(" ").filter((token) => token.length > 2));
    const shared = [...tokens].filter((token) => otherTokens.has(token)).length;
    return tokens.size >= 7 && otherTokens.size >= 7 && shared / Math.min(tokens.size, otherTokens.size) >= 0.85;
  });
}

function flattenText(value: unknown): string[] {
  if (typeof value === "string") return [value];
  if (Array.isArray(value)) return value.flatMap(flattenText);
  if (value && typeof value === "object") return Object.values(value).flatMap(flattenText);
  return [];
}

async function extractPdfText(arrayBuffer: ArrayBuffer) {
  const pdfjs = await import("pdfjs-dist");
  pdfjs.GlobalWorkerOptions.workerSrc = (await import("pdfjs-dist/build/pdf.worker.min.mjs?url")).default;
  const pdf = await pdfjs.getDocument({ data: new Uint8Array(arrayBuffer) }).promise;
  const pages: string[] = [];
  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
    const page = await pdf.getPage(pageNumber);
    const content = await page.getTextContent();
    const lines: string[] = [];
    let currentLine = "";
    let currentY: number | null = null;
    for (const item of content.items) {
      if (!("str" in item)) continue;
      const value = item.str.trim();
      if (!value) continue;
      const y: number | null = Array.isArray(item.transform) ? Number(item.transform[5]) : currentY;
      if (currentY != null && y != null && Math.abs(y - currentY) > 3 && currentLine) {
        lines.push(currentLine.trim());
        currentLine = "";
      }
      currentLine += `${currentLine ? " " : ""}${value}`;
      if (y != null) currentY = y;
    }
    if (currentLine) lines.push(currentLine.trim());
    pages.push(lines.join("\n"));
  }
  return pages.join("\n");
}

async function extractFileText(file: File) {
  if (/\.pdf$/i.test(file.name) || file.type === "application/pdf") return extractPdfText(await file.arrayBuffer());
  if (/\.docx$/i.test(file.name) || file.type === "application/vnd.openxmlformats-officedocument.wordprocessingml.document") {
    const mammoth = (await import("mammoth")).default;
    return (await mammoth.extractRawText({ arrayBuffer: await file.arrayBuffer() })).value;
  }
  const rawText = await file.text();
  if (/\.json$/i.test(file.name)) {
    try { return flattenText(JSON.parse(rawText)).join("\n"); } catch { return rawText; }
  }
  return rawText;
}

function dateToday() {
  return new Intl.DateTimeFormat("en-US", { year: "numeric", month: "short", day: "numeric" }).format(new Date());
}

function dateInputToday() {
  // Local calendar date, not UTC: toISOString() stamped tomorrow's date on
  // any application marked Applied after ~5pm Pacific.
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

function createId() {
  if (typeof globalThis.crypto?.randomUUID === "function") return globalThis.crypto.randomUUID();
  const random = Math.random().toString(36).slice(2);
  return `${Date.now().toString(36)}-${random}`;
}

function useSavedState<T>(key: string, fallback: T, legacyKeys: string[] = []) {
  const [value, setValue] = useState<T>(fallback);
  const [ready, setReady] = useState(false);
  const fallbackRef = useRef(fallback);
  const legacyKeysRef = useRef(legacyKeys);
  useEffect(() => {
    const timer = window.setTimeout(() => {
      try {
        const savedValues = [...legacyKeysRef.current, key]
          .map((savedKey) => localStorage.getItem(savedKey))
          .filter((saved): saved is string => Boolean(saved))
          .map((saved) => JSON.parse(saved) as unknown);
        if (Array.isArray(fallbackRef.current)) {
          const merged = new Map<string, unknown>();
          for (const saved of savedValues) {
            if (!Array.isArray(saved)) continue;
            for (const item of saved) {
              if (item && typeof item === "object" && typeof (item as { id?: unknown }).id === "string") merged.set((item as { id: string }).id, item);
            }
          }
          if (merged.size) setValue([...merged.values()] as T);
        } else if (savedValues.length) {
          setValue(savedValues.at(-1) as T);
        }
      } catch {}
      setReady(true);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [key]);
  useEffect(() => { if (ready) { try { localStorage.setItem(key, JSON.stringify(value)); } catch {} } }, [key, ready, value]);
  return [value, setValue] as const;
}

function copyText(value: string, setNotice: (value: string) => void) {
  // A denied clipboard used to reject silently: the button did nothing, said
  // nothing, and left the user pressing it again. Say what happened instead.
  navigator.clipboard.writeText(value).then(
    () => setNotice("Copied to clipboard"),
    () => setNotice("Your browser blocked the copy. Select the text and copy it manually, or allow clipboard access for this site."),
  );
}

function renderStructuredResume(result: ResumeAiResult, profile: Profile) {
  const contact = [profile.location, profile.email, profile.phone, profile.linkedin].map((item) => item.trim()).filter(Boolean).join(" | ");
  const section = (name: string, items: string[]) => items.length ? `\n\n${name.toUpperCase()}\n${items.map((item) => `• ${item}`).join("\n")}` : "";
  const experience = result.experience.map((entry) => {
    const employer = [entry.company, entry.location].filter(Boolean).join(" | ");
    const position = [entry.title, entry.dates].filter(Boolean).join(" | ");
    return `${employer}\n${position}\n${entry.bullets.map((bullet) => `• ${bullet.text}`).join("\n")}`;
  }).join("\n\n");
  const skills = result.core_skills.length ? `\n\nCORE SKILLS\n${result.core_skills.map((item) => item.label).join(" • ")}` : "";
  return `${profile.name || "Candidate name"}\n${result.headline}${contact ? `\n${contact}` : ""}\n\nPROFESSIONAL SUMMARY\n${result.summary}${skills}${experience ? `\n\nPROFESSIONAL EXPERIENCE\n${experience}` : ""}${section("Education", result.education.map((item) => item.text))}${section("Awards", result.awards.map((item) => item.text))}${section("Professional Development", result.professional_development.map((item) => item.text))}${section("Languages", result.languages.map((item) => item.text))}`;
}

// Renders the résumé exactly as the PDF/Word export will, straight from the
// same parser, so the on-screen preview reflects manual edits and never
// disagrees with the exported file.
// Most ATS forms ask for city and state as separate inputs, while the profile
// keeps one location line. Split it rather than making the user maintain both.
// Only a trailing 2-letter code or single word is treated as the state, so
// "San Francisco Bay Area" stays a city and does not invent a state.
function splitLocation(value: string) {
  const parts = String(value || "").split(",").map((part) => part.trim()).filter(Boolean);
  if (!parts.length) return { city: "", state: "", country: "" };
  if (parts.length === 1) return { city: parts[0], state: "", country: "" };
  const [city, second, third] = parts;
  const stateLike = /^[A-Za-z]{2}$|^[A-Z][a-z]+$/.test(second);
  // "Remote, United States" has no state — the second part is the country,
  // and dropping it entirely left both fields blank in the autofill package.
  if (!stateLike) return { city, state: "", country: third || second };
  return { city, state: second, country: third || "" };
}

function ResumePaper({ text }: { text: string }) {
  const parsed = useMemo(() => parseResumeText(text), [text]);
  if (!parsed.sections.length && !parsed.name) return <div className="resume-paper"><pre>{text}</pre></div>;
  return <div className="resume-paper"><article className="structured-resume" aria-label="Résumé preview">
    <header>
      {parsed.name && <h1>{parsed.name}</h1>}
      {parsed.headline && <p>{parsed.headline}</p>}
      {parsed.contact && <address>{parsed.contact.split("|").map((part, index) => <span key={part}>{index > 0 && <i>•</i>}{part.trim()}</span>)}</address>}
    </header>
    {parsed.sections.map((section) => <section key={section.title}>
      <h2>{section.title}</h2>
      {section.kind === "paragraph" && section.paragraphs.map((value) => <p key={value}>{value}</p>)}
      {section.kind === "skills" && <div className="structured-skills">{section.items.map((item) => <span key={item}>{item}</span>)}</div>}
      {section.kind === "list" && <ul>{section.items.map((item) => <li key={item}>{item}</li>)}</ul>}
      {section.kind === "experience" && <div className="structured-experience">{section.entries.map((entry, index) => <div key={`${entry.employer}-${entry.title}-${index}`}>
        {(entry.employer || entry.location) && <div className="experience-employer"><strong>{entry.employer}</strong><span>{entry.location}</span></div>}
        {(entry.title || entry.dates) && <div className="experience-role"><b>{entry.title}</b><span>{entry.dates}</span></div>}
        {entry.bullets.length > 0 && <ul>{entry.bullets.map((bullet) => <li key={bullet}>{bullet}</li>)}</ul>}
      </div>)}</div>}
    </section>)}
  </article></div>;
}

function linkKind(value: string) {
  try {
    const host = new URL(value).hostname.toLowerCase().replace(/^www\./, "");
    if (host === "linkedin.com" || host.endsWith(".linkedin.com")) return "linkedin" as const;
    if (host === "indeed.com" || host.endsWith(".indeed.com")) return "indeed" as const;
    return "public" as const;
  } catch {
    return "invalid" as const;
  }
}

function mergeById<T extends { id: string }>(serverValue: unknown, localValue: T[]) {
  const serverItems = Array.isArray(serverValue) ? serverValue.filter((item): item is T => Boolean(item && typeof item === "object" && typeof (item as { id?: unknown }).id === "string")) : [];
  const merged = new Map(serverItems.map((item) => [item.id, item]));
  for (const item of localValue) merged.set(item.id, item);
  return [...merged.values()];
}

function preferLocalObject<T extends Record<string, unknown>>(serverValue: unknown, localValue: T) {
  if (!serverValue || typeof serverValue !== "object" || Array.isArray(serverValue)) return localValue;
  const merged = { ...(serverValue as Partial<T>), ...localValue } as T;
  for (const key of Object.keys(localValue) as Array<keyof T>) {
    if (typeof localValue[key] === "string" && !(localValue[key] as string).trim() && typeof (serverValue as Partial<T>)[key] === "string") {
      merged[key] = (serverValue as Partial<T>)[key] as T[keyof T];
    }
  }
  return merged;
}

function isWorkspaceSnapshot(value: unknown): value is Partial<WorkspaceSnapshot> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

export function JobSeekerApp() {
  const [view, setView] = useState<View>("workspace");
  const [output, setOutput] = useState<Output>("analysis");
  const [profile, setProfile] = useSavedState("valeta-profile-v2", initialProfile);
  const [writingStyle, setWritingStyle] = useSavedState("valeta-writing-style-v1", initialWritingStyle);
  const [resumeTracks, setResumeTracks] = useSavedState<ResumeTrack[]>("v-jobs-resume-tracks-v1", DEFAULT_RESUME_TRACKS);
  const [activeTrackId, setActiveTrackId] = useSavedState("v-jobs-active-track-v1", "auto");
  const [aiPreference, setAiPreference] = useSavedState<AiPreference>("valeta-ai-preference-v1", { provider: "openai", modelKey: "reliable" });
  const [claudeModel, setClaudeModel] = useSavedState("v-jobs-claude-model-v1", "sonnet");
  const [playbookSettings, setPlaybookSettings] = useSavedState<PlaybookSettings>("valeta-playbook-settings-v1", { curatedEnabled: true });
  const [applications, setApplications] = useSavedState<Application[]>("valeta-applications-v3", [], ["valeta-applications-v1", "valeta-applications-v2"]);
  const [jobSnapshots, setJobSnapshots] = useSavedState<JobSnapshot[]>("v-jobs-market-history-v1", []);
  const [generatedDrafts, setGeneratedDrafts] = useSavedState<GeneratedDraft[]>("v-jobs-generated-drafts-v1", []);
  const [autofillResumeVersionId, setAutofillResumeVersionId] = useSavedState("v-jobs-autofill-resume-v1", "");
  const [documents, setDocuments] = useSavedState<SourceDocument[]>("valeta-documents-v1", []);
  const [companies, setCompanies] = useSavedState<CompanyTarget[]>("valeta-companies-v1", []);
  // The active intake is intentionally transient. Completed descriptions remain
  // preserved in jobSnapshots and durable workspace revisions.
  const [jobText, setJobText] = useState("");
  const [company, setCompany] = useState("");
  const [role, setRole] = useState("");
  const [roleUrl, setRoleUrl] = useState("");
  const [notice, setNotice] = useState("");
  const [documentTitle, setDocumentTitle] = useState("");
  const [documentText, setDocumentText] = useState("");
  const [sourceCategory, setSourceCategory] = useState<SourceCategory>("Résumé");
  const [sourceTrackId, setSourceTrackId] = useState("all");
  const [sourceUrl, setSourceUrl] = useState("");
  const [sourceReading, setSourceReading] = useState(false);
  const [roleReading, setRoleReading] = useState(false);
  // The one place the user repairs what generation got wrong was the only
  // workspace state that was not persisted, so a reload discarded every manual
  // edit. Saved like the rest of the workspace.
  const [draftEditor, setDraftEditor] = useSavedState("v-jobs-draft-editor-v1", "");
  const [draftEditorKey, setDraftEditorKey] = useSavedState("v-jobs-draft-editor-key-v1", "");
  // True when the current draft came from pasting an externally drafted
  // version (e.g. the resume-tailor Skill run in a separate Claude
  // conversation) rather than this app's own local or cloud generator.
  // Persisted so the provenance survives a reload, same as the draft itself.
  const [draftIsExternal, setDraftIsExternal] = useSavedState("v-jobs-draft-external-v1", false);
  const [pasteDraftOpen, setPasteDraftOpen] = useState(false);
  const [pasteDraftText, setPasteDraftText] = useState("");
  const [isDragging, setIsDragging] = useState(false);
  const [companyName, setCompanyName] = useState("");
  const [companyKind, setCompanyKind] = useState<CompanyTarget["kind"]>("Brand");
  const [companyWebsite, setCompanyWebsite] = useState("");
  const [companyCareers, setCompanyCareers] = useState("");
  const [companyFocus, setCompanyFocus] = useState("Creative operations, project management, production");
  const [pipelineFilters, setPipelineFilters] = useState({ status: "all", company: "all", search: "" });
  // Delete sits next to Archive in the pipeline row, and the two are one
  // pixel-miss apart. The first press arms it, the second carries it out.
  const [pendingApplicationDelete, setPendingApplicationDelete] = useState("");
  const [documentFilters, setDocumentFilters] = useState({ company: "all", trackId: "all", provider: "all", search: "" });
  const [aiConnection, setAiConnection] = useState<AiConnection>({ state: "checking", authenticated: false, authorized: false, providers: [], message: "Checking the secure backend connection…" });
  const [cloudReview, setCloudReview] = useState<CloudReview | null>(null);
  const [comparisonResults, setComparisonResults] = useState<CloudReview[]>([]);
  const [comparisonCount, setComparisonCount] = useState<1 | 2 | 3>(3);
  const [comparisonRunning, setComparisonRunning] = useState(false);
  const [aiRunning, setAiRunning] = useState(false);
  const [operationProgress, setOperationProgress] = useState<OperationProgress>(null);
  const [linkAssist, setLinkAssist] = useState<LinkAssist>(null);
  const [linkedinStatus, setLinkedinStatus] = useState<LinkedInStatus>({ state: "checking", configured: false, connected: false, message: "Checking official LinkedIn sign-in…" });
  const [errorLog, setErrorLog] = useSavedState<ErrorLogEntry[]>("valeta-error-log-v1", []);
  const [workspaceSync, setWorkspaceSync] = useState<WorkspaceSync>({ state: "loading", message: "Opening durable private backup…" });
  const [workspaceLoaded, setWorkspaceLoaded] = useState(false);
  const [browserStateReady, setBrowserStateReady] = useState(false);
  const [workspaceRevisions, setWorkspaceRevisions] = useState<WorkspaceRevision[]>([]);
  const [workspaceHistoryState, setWorkspaceHistoryState] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [resumeGeneration, setResumeGeneration] = useState<ResumeGeneration | null>(null);
  const [resumeReview, setResumeReview] = useState<{ providerName: string; modelLabel: string; result: ResumeAiReview; usage?: CloudUsage } | null>(null);
  const [resumeAiRunning, setResumeAiRunning] = useState<"generate" | "review" | "compare" | null>(null);
  const [aiDiagnostics, setAiDiagnostics] = useState<{ state: "idle" | "checking" | "ready" | "error"; checkedAt?: string; providers: AiProviderDiagnostic[]; message: string }>({ state: "idle", providers: [], message: "Run a no-generation model check to verify exact API access." });
  const workspaceAbort = useRef<AbortController | null>(null);

  const logError = useCallback((area: ErrorLogEntry["area"], code: string, message: unknown, context?: ErrorLogEntry["context"]) => {
    setErrorLog((current) => [{ id: createId(), timestamp: new Date().toISOString(), area, code, message: safeErrorMessage(message), context }, ...current].slice(0, 50));
  }, [setErrorLog]);

  const facts = useMemo(() => profile.facts.split("\n").map((x) => x.trim()).filter(Boolean), [profile.facts]);
  const preparedResumeEvidence = useMemo(() => prepareResumeEvidence(facts), [facts]);
  const resumeFacts = preparedResumeEvidence.facts;
  const normalizedTracks = useMemo(() => normalizeResumeTracks(resumeTracks), [resumeTracks]);
  const trackSelection = useMemo(() => selectResumeTrack(normalizedTracks, `${role}\n${jobText}`, activeTrackId), [activeTrackId, jobText, normalizedTracks, role]);
  const selectedTrack = trackSelection.track;
  const evidenceSources = useMemo(() => documents.filter((document) => sourceScope(document) === "evidence" && (!document.trackId || document.trackId === "all" || document.trackId === selectedTrack.id)), [documents, selectedTrack.id]);
  // Every APPROVED evidence fact, across every track (a conflict between a
  // brand-PM résumé and a production résumé about the same employer is still
  // worth flagging even though only one track is active right now), tagged
  // with the document it actually came from.
  const evidenceAuditEntries = useMemo(() => {
    const entries: { id: string; text: string; sourceId: string; sourceTitle: string }[] = [];
    const approvedTextSeen = new Set<string>();
    documents.forEach((document) => {
      if (sourceScope(document) !== "evidence") return;
      document.approved.forEach((text, index) => {
        approvedTextSeen.add(text.trim().toLowerCase());
        entries.push({ id: `${document.id}::${index}`, text, sourceId: document.id, sourceTitle: document.title });
      });
    });
    // A fact typed or edited directly in Career profile isn't traced to any
    // document's approval list -- give it its own provenance label instead
    // of either dropping it from the audit or borrowing a document's identity.
    facts.forEach((fact, index) => {
      if (approvedTextSeen.has(fact.trim().toLowerCase())) return;
      entries.push({ id: `profile::${index}`, text: fact, sourceId: "career-profile", sourceTitle: "Career profile" });
    });
    return entries;
  }, [documents, facts]);
  const evidenceAudit: EvidenceAudit = useMemo(() => auditEvidence(evidenceAuditEntries), [evidenceAuditEntries]);
  // classifyKnowledgeSource already runs for every source (sourceScope uses it
  // to silently reassign scope on a high-confidence mismatch) -- this is the
  // same call, memoized once per document list, so the source card can show
  // the user what it detected instead of only acting on it invisibly.
  const sourceClassifications = useMemo(
    () => new Map(documents.map((document) => [document.id, classifyKnowledgeSource({ title: document.title, text: document.text, selectedCategory: document.category })])),
    [documents],
  );
  const knowledgeStats = useMemo(() => ({
    evidence: documents.filter((document) => sourceScope(document) === "evidence").length,
    voice: documents.filter((document) => sourceScope(document) === "voice").length,
    guidance: documents.filter((document) => sourceScope(document) === "guidance").length,
    research: documents.filter((document) => sourceScope(document) === "research").length,
  }), [documents]);
  // LinkedIn blocks automated job-page reading and OpenID grants no job access,
  // so the user's own official export is the only compliant source for their
  // saved LinkedIn roles.
  const linkedInSavedJobs = useMemo(
    () => documents
      .filter((document) => document.type === "Official LinkedIn ZIP export" && sourceScope(document) === "research")
      .flatMap((document) => extractLinkedInSavedJobs(document.text)),
    [documents],
  );
  const learnedVoice = useMemo(() => deriveWritingVoice(writingStyle.samples), [writingStyle.samples]);
  const cleanedVoice = useMemo(() => cleanWritingSamples(writingStyle.samples), [writingStyle.samples]);
  const rawUserPlaybookRules = useMemo(() => documents.filter((document) => sourceScope(document) === "guidance").flatMap((document) => document.approved), [documents]);
  const userPlaybookRules = useMemo(() => preparePlaybookLibrary(rawUserPlaybookRules), [rawUserPlaybookRules]);
  const prioritizedUserPlaybookRules = useMemo(
    () => prioritizeResumePlaybookRules(userPlaybookRules, `${selectedTrack.name}\n${selectedTrack.headline}\n${role}\n${jobText}`, PLAYBOOK_GENERATION_RULE_LIMIT),
    [jobText, role, selectedTrack.headline, selectedTrack.name, userPlaybookRules],
  );
  const curatedPlaybookRules = useMemo(() => [...(playbookSettings.curatedEnabled ? CURATED_RESUME_PLAYBOOK.rules.map((rule) => rule.text) : []), ...(playbookSettings.usReferencesEnabled ? US_MARKET_REFERENCES.rules.map((rule) => rule.text) : [])], [playbookSettings.curatedEnabled, playbookSettings.usReferencesEnabled]);
  const availableResumeVersions = useMemo(() => generatedDrafts.filter((draft) => draft.type === "resume" && draft.content.trim()).sort((left, right) => Date.parse(right.updatedAt || right.createdAt || "") - Date.parse(left.updatedAt || left.createdAt || "")), [generatedDrafts]);
  const selectedAutofillResume = useMemo(() => availableResumeVersions.find((draft) => draft.id === autofillResumeVersionId) || null, [autofillResumeVersionId, availableResumeVersions]);
  // Prior versions strong enough to adapt for this role. Reusing one is the
  // lower-cost path: no provider call, and a draft already reviewed once.
  const reusableResumes = useMemo(
    () => findReusableResumes(generatedDrafts, { role, jobText, trackId: selectedTrack.id }),
    [generatedDrafts, jobText, role, selectedTrack.id],
  );
  const approvedPlaybookRules = useMemo(() => [...userPlaybookRules, ...curatedPlaybookRules], [curatedPlaybookRules, userPlaybookRules]);
  const pipelineCompanyOptions = useMemo(() => [...new Set(applications.map((app) => app.company).filter(Boolean))].sort((left, right) => left.localeCompare(right)), [applications]);
  const filteredApplications = useMemo(() => applications.filter((app) => {
    if (pipelineFilters.status !== "all" && app.status !== pipelineFilters.status) return false;
    if (pipelineFilters.company !== "all" && app.company !== pipelineFilters.company) return false;
    const search = pipelineFilters.search.trim().toLowerCase();
    if (search && !`${app.company} ${app.role} ${app.note || ""}`.toLowerCase().includes(search)) return false;
    return true;
  }), [applications, pipelineFilters]);
  const resumeDrafts = useMemo(() => generatedDrafts.filter((draft) => draft.type === "resume"), [generatedDrafts]);
  const documentCompanyOptions = useMemo(() => [...new Set(resumeDrafts.map((draft) => draft.company).filter(Boolean))].sort((left, right) => left.localeCompare(right)), [resumeDrafts]);
  const documentProviderOptions = useMemo(() => [...new Set(resumeDrafts.map((draft) => draft.provider || "local"))].sort((left, right) => left.localeCompare(right)), [resumeDrafts]);
  const documentTrackOptions = useMemo(() => {
    const present = new Set(resumeDrafts.map((draft) => draft.trackId).filter((id): id is string => Boolean(id)));
    return normalizedTracks.filter((track) => present.has(track.id));
  }, [normalizedTracks, resumeDrafts]);
  const filteredResumeDrafts = useMemo(() => resumeDrafts.filter((draft) => {
    if (documentFilters.company !== "all" && draft.company !== documentFilters.company) return false;
    if (documentFilters.trackId !== "all" && draft.trackId !== documentFilters.trackId) return false;
    if (documentFilters.provider !== "all" && (draft.provider || "local") !== documentFilters.provider) return false;
    const search = documentFilters.search.trim().toLowerCase();
    if (search && !`${draft.company} ${draft.role} ${draft.title}`.toLowerCase().includes(search)) return false;
    return true;
  }), [documentFilters, resumeDrafts]);
  const learningSteps = useMemo(() => [
    { label: "Career foundation", detail: "Upload current and past résumés", complete: knowledgeStats.evidence > 0 },
    { label: "Verified evidence", detail: "Approve at least 8 reusable career facts", complete: facts.length >= 8 },
    { label: "Writing voice", detail: "Add enough real writing to learn your style", complete: learnedVoice.ready },
    { label: "Résumé playbook", detail: "Keep authoritative do/don’t guidance active", complete: approvedPlaybookRules.length >= 5 },
    { label: "LinkedIn archive", detail: "Import the official ZIP for profile, recommendations, saved jobs, and AI context", complete: documents.some((document) => document.type === "Official LinkedIn ZIP export") },
    { label: "Résumé tracks", detail: "Add a summary for each career direction you want to pursue", complete: normalizedTracks.filter((track) => track.summary.trim()).length >= Math.min(2, normalizedTracks.length) },
  ], [approvedPlaybookRules.length, documents, facts.length, knowledgeStats.evidence, learnedVoice.ready, normalizedTracks]);
  const effectiveProfile = useMemo(() => ({ ...profile, headline: selectedTrack.headline || profile.headline, summary: selectedTrack.summary || profile.summary }), [profile, selectedTrack]);
  const analysis = useMemo(() => analyzeRole({ jobText, facts, profile: effectiveProfile, sources: evidenceSources.map((document) => ({ title: document.title, approved: document.approved })) }), [effectiveProfile, evidenceSources, facts, jobText]);
  const { roleKeywords, requirements, matchedFacts, evidenceMap, counts: evidenceCounts, profileReadiness, evidenceCoverage, sourceQuality, fit, recommendation, firstGap } = analysis;
  const selectedProvider = aiConnection.providers.find((provider) => provider.id === aiPreference.provider) || aiConnection.providers[0] || null;
  const selectedModel = selectedProvider?.models.find((model) => model.key === aiPreference.modelKey) || selectedProvider?.models.find((model) => model.key === selectedProvider.defaultModelKey) || selectedProvider?.models[0] || null;
  const selectedProviderDiagnostic = aiDiagnostics.providers.find((provider) => provider.id === selectedProvider?.id);
  const selectedModelDiagnostic = selectedProviderDiagnostic?.models.find((model) => model.key === selectedModel?.key);
  const aiReady = Boolean(selectedProvider?.configured && aiConnection.authenticated && aiConnection.authorized);
  const selectedModelGenerationBlocked = selectedModelDiagnostic?.generationAvailable === false;
  const aiUsable = aiReady && !selectedModelGenerationBlocked;
  const aiModel = selectedModel?.id || "gpt-5.6-sol";
  const aiProviderName = selectedProvider?.name || "Cloud AI";
  const aiConnectionMessage = aiConnection.state === "checking" ? "Checking the secure backend connection…" : aiConnection.state === "error" ? aiConnection.message : !selectedProvider ? "No cloud provider is available. Local analysis remains active." : !selectedProvider.configured ? `${selectedProvider.name} is available but not connected. Add ${selectedProvider.keyName} as a protected Sites secret, or choose another provider.` : !aiConnection.authenticated ? "The provider key is protected, but sign-in is required before cloud review can run." : !aiConnection.authorized ? "Cloud AI is protected, but this signed-in account is not on the allowed-access list." : selectedModelGenerationBlocked ? selectedModelDiagnostic?.generationReason || `${selectedProvider.name} lists this model, but a real generation request failed.` : `${selectedProvider.name} is connected. ${selectedModel?.label || "The selected model"} will run only after your click.`;
  const reviewKey = `${jobText}\u0000${facts.join("\u0000")}\u0000${aiPreference.provider}\u0000${selectedModel?.key || aiPreference.modelKey}`;
  const currentCloudReview = cloudReview?.key === reviewKey ? cloudReview : null;
  const activeRecommendation: ApplicationRecommendation = currentCloudReview ? {
    label: currentCloudReview.recommendation.decision === "prioritize_and_apply" ? "Prioritize and apply" : currentCloudReview.recommendation.decision === "apply_after_edits" ? "Apply after targeted edits" : "Hold and investigate",
    tone: currentCloudReview.recommendation.decision === "prioritize_and_apply" ? "ready" : currentCloudReview.recommendation.decision === "apply_after_edits" ? "edit" : "hold",
    confidence: `${currentCloudReview.recommendation.confidence[0].toUpperCase()}${currentCloudReview.recommendation.confidence.slice(1)} · ${currentCloudReview.providerName}`,
    reason: currentCloudReview.recommendation.summary,
    actions: currentCloudReview.recommendation.actions,
  } : recommendation;

  const workspaceSnapshot = useMemo<WorkspaceSnapshot>(() => ({
    version: 5,
    profile,
    writingStyle,
    resumeTracks: normalizedTracks,
    activeTrackId,
    aiPreference,
    claudeModel,
    playbookSettings,
    applications,
    jobSnapshots,
    generatedDrafts,
    documents,
    companies,
    roleDraft: { jobText, company, role, roleUrl },
  }), [activeTrackId, aiPreference, applications, claudeModel, companies, company, documents, generatedDrafts, jobSnapshots, jobText, normalizedTracks, playbookSettings, profile, role, roleUrl, writingStyle]);

  const saveWorkspaceBackup = useCallback(async (snapshot: WorkspaceSnapshot, manual = false) => {
    workspaceAbort.current?.abort();
    const controller = new AbortController();
    workspaceAbort.current = controller;
    setWorkspaceSync((current) => ({ ...current, state: "saving", message: manual ? "Backing up your private workspace…" : "Saving a durable private revision…" }));
    try {
      const response = await fetch("/api/workspace", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sourceBuild: APP_BUILD, snapshot }),
        signal: controller.signal,
      });
      const data = await readJsonResponse<WorkspacePayload>(response, "The durable private backup did not return readable app data.");
      if (!response.ok || !data.ok) throw new Error(data.message || "The durable private workspace could not be saved.");
      const savedAt = data.revision?.createdAt || new Date().toISOString();
      setWorkspaceSync({ state: "ready", message: data.changed === false ? "Private backup is current" : "Durable private revision saved", lastSavedAt: savedAt });
      if (manual) setNotice(data.changed === false ? "Your durable private backup is already current." : "A new durable private workspace revision was saved.");
    } catch (cause) {
      if (controller.signal.aborted) return;
      setWorkspaceSync({ state: "error", message: cause instanceof Error ? cause.message : "Durable backup failed; browser autosave remains active." });
      logError("app", "workspace_backup_failed", cause);
      if (manual) setNotice(cause instanceof Error ? cause.message : "Durable backup failed. Browser autosave remains active.");
    } finally {
      if (workspaceAbort.current === controller) workspaceAbort.current = null;
    }
  }, [logError]);

  const loadWorkspaceHistory = useCallback(async () => {
    setWorkspaceHistoryState("loading");
    try {
      const response = await fetch("/api/workspace?history=1", { cache: "no-store" });
      const data = await readJsonResponse<{ ok?: boolean; message?: string; revisions?: WorkspaceRevision[] }>(response, "Private version history could not be read.");
      if (!response.ok || !data.ok || !Array.isArray(data.revisions)) throw new Error(data.message || "Private version history could not be read.");
      setWorkspaceRevisions(data.revisions);
      setWorkspaceHistoryState("ready");
    } catch (cause) {
      setWorkspaceHistoryState("error");
      logError("app", "workspace_history_failed", cause);
      setNotice(cause instanceof Error ? cause.message : "Private version history could not be read.");
    }
  }, [logError]);

  async function mergeWorkspaceRevision(revisionId: string) {
    setWorkspaceHistoryState("loading");
    setOperationProgress({ label: "Recovering preserved data", detail: "Opening the selected private revision and merging its records into your current workspace. Existing records remain unchanged." });
    try {
      const response = await fetch(`/api/workspace?revision=${encodeURIComponent(revisionId)}`, { cache: "no-store" });
      const data = await readJsonResponse<WorkspacePayload>(response, "The selected private revision could not be read.");
      if (!response.ok || !data.ok || !isWorkspaceSnapshot(data.snapshot)) throw new Error(data.message || "The selected private revision could not be read.");
      const saved = data.snapshot;
      setProfile((current) => preferLocalObject(saved.profile, current));
      setWritingStyle((current) => preferLocalObject(saved.writingStyle, current));
      setResumeTracks((current) => mergeById(saved.resumeTracks, current));
      setApplications((current) => mergeById(saved.applications, current));
      setJobSnapshots((current) => mergeById(saved.jobSnapshots, current));
      setGeneratedDrafts((current) => mergeById(saved.generatedDrafts, current));
      setDocuments((current) => mergeById(saved.documents, current));
      setCompanies((current) => mergeById(saved.companies, current));
      setNotice("Preserved records from that version were merged into the current workspace. Nothing was deleted or replaced.");
      setWorkspaceHistoryState("ready");
      window.setTimeout(() => void loadWorkspaceHistory(), 1_500);
    } catch (cause) {
      setWorkspaceHistoryState("error");
      logError("app", "workspace_revision_merge_failed", cause);
      setNotice(cause instanceof Error ? cause.message : "That private revision could not be recovered.");
    } finally {
      setOperationProgress(null);
    }
  }

  useEffect(() => {
    // The access token normally arrives once, in the URL (?token=...). Every
    // API call after this one is a plain same-origin fetch with no token
    // attached, so without this the first request works and everything
    // after it 401s. Storing it as a cookie here makes the browser resend it
    // automatically on every subsequent fetch; the token is then stripped
    // from the visible URL so it doesn't linger in history or get shared.
    try {
      const params = new URLSearchParams(window.location.search);
      const token = params.get("token");
      if (token) {
        document.cookie = `vjobs_token=${encodeURIComponent(token)}; path=/; max-age=${60 * 60 * 24 * 365}; SameSite=Lax`;
        params.delete("token");
        const nextSearch = params.toString();
        window.history.replaceState(null, "", window.location.pathname + (nextSearch ? `?${nextSearch}` : "") + window.location.hash);
      }
    } catch {}
    const timer = window.setTimeout(() => setBrowserStateReady(true), 0);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (!browserStateReady) return;
    let active = true;
    fetch("/api/workspace", { cache: "no-store" })
      .then(async (response) => ({ response, data: await readJsonResponse<WorkspacePayload>(response, "The durable private backup could not be read.") }))
      .then(({ response, data }) => {
        if (!active) return;
        if (!response.ok || !data.ok) throw new Error(data.message || "The durable private backup could not be opened.");
        const remote = isWorkspaceSnapshot(data.snapshot) ? data.snapshot : null;
        if (remote) {
          const locallySaved = (key: string) => localStorage.getItem(key) !== null;
          setProfile((current) => locallySaved("valeta-profile-v2") ? preferLocalObject(remote.profile, current) : preferLocalObject(current, remote.profile && typeof remote.profile === "object" ? remote.profile as Profile : current));
          setWritingStyle((current) => locallySaved("valeta-writing-style-v1") ? preferLocalObject(remote.writingStyle, current) : preferLocalObject(current, remote.writingStyle && typeof remote.writingStyle === "object" ? remote.writingStyle as WritingStyle : current));
          setResumeTracks((current) => locallySaved("v-jobs-resume-tracks-v1") ? mergeById(remote.resumeTracks, current) : mergeById([], Array.isArray(remote.resumeTracks) ? remote.resumeTracks : current));
          setApplications((current) => locallySaved("valeta-applications-v3") ? mergeById(remote.applications, current) : mergeById([], Array.isArray(remote.applications) ? remote.applications : current));
          setJobSnapshots((current) => locallySaved("v-jobs-market-history-v1") ? mergeById(remote.jobSnapshots, current) : mergeById([], Array.isArray(remote.jobSnapshots) ? remote.jobSnapshots : current));
          setGeneratedDrafts((current) => locallySaved("v-jobs-generated-drafts-v1") ? mergeById(remote.generatedDrafts, current) : mergeById([], Array.isArray(remote.generatedDrafts) ? remote.generatedDrafts : current));
          setDocuments((current) => locallySaved("valeta-documents-v1") ? mergeById(remote.documents, current) : mergeById([], Array.isArray(remote.documents) ? remote.documents : current));
          setCompanies((current) => locallySaved("valeta-companies-v1") ? mergeById(remote.companies, current) : mergeById([], Array.isArray(remote.companies) ? remote.companies : current));
          setActiveTrackId((current) => locallySaved("v-jobs-active-track-v1") ? current : typeof remote.activeTrackId === "string" ? remote.activeTrackId : current);
          setClaudeModel((current) => locallySaved("v-jobs-claude-model-v1") ? current : typeof remote.claudeModel === "string" ? remote.claudeModel : current);
          setAiPreference((current) => locallySaved("valeta-ai-preference-v1") ? preferLocalObject(remote.aiPreference, current) : preferLocalObject(current, remote.aiPreference && typeof remote.aiPreference === "object" ? remote.aiPreference as AiPreference : current));
          setPlaybookSettings((current) => locallySaved("valeta-playbook-settings-v1") ? preferLocalObject(remote.playbookSettings, current) : preferLocalObject(current, remote.playbookSettings && typeof remote.playbookSettings === "object" ? remote.playbookSettings as PlaybookSettings : current));
          // Earlier active role drafts remain preserved inside revision history,
          // but are not reopened automatically after reload.
        }
        setWorkspaceSync({ state: "ready", message: remote ? "Durable private backup restored" : "Private backup ready", lastSavedAt: data.revision?.createdAt });
        setWorkspaceLoaded(true);
      })
      .catch((cause) => {
        if (!active) return;
        setWorkspaceSync({ state: "error", message: cause instanceof Error ? cause.message : "Durable backup is unavailable; browser autosave remains active." });
        setWorkspaceLoaded(true);
        logError("app", "workspace_restore_failed", cause);
      });
    return () => { active = false; };
  }, [browserStateReady, logError, setActiveTrackId, setAiPreference, setApplications, setClaudeModel, setCompanies, setDocuments, setGeneratedDrafts, setJobSnapshots, setJobText, setPlaybookSettings, setProfile, setResumeTracks, setRole, setRoleUrl, setWritingStyle, setCompany]);

  useEffect(() => {
    if (!workspaceLoaded) return;
    const timer = window.setTimeout(() => { void saveWorkspaceBackup(workspaceSnapshot); }, 8_000);
    return () => window.clearTimeout(timer);
  }, [saveWorkspaceBackup, workspaceLoaded, workspaceSnapshot]);

  useEffect(() => {
    if (!workspaceLoaded) return;
    setDocuments((current) => {
      let changed = false;
      const next = current.map((document) => {
        // A document can be restored (reload, remote-backup merge) while still
        // marked "reading" -- the in-memory read that would resolve it belonged
        // to the tab that started the upload and is gone, so it would otherwise
        // show "Reading this file on your Mac..." forever with no way to retry.
        if (document.status === "reading") { changed = true; return { ...document, status: "needs-text" as const }; }
        if (sourceScope(document) !== "guidance" || document.status !== "ready" || !document.candidates.length || document.approved.length) return document;
        changed = true;
        return { ...document, approved: [...document.candidates] };
      });
      return changed ? next : current;
    });
  }, [setDocuments, workspaceLoaded]);

  useEffect(() => () => workspaceAbort.current?.abort(), []);

  useEffect(() => {
    let active = true;
    fetch("/api/ai/recommend", { cache: "no-store" })
      .then(async (response) => ({ response, data: await readJsonResponse<AiStatusPayload>(response, "The AI connection status could not be read.") }))
      .then(({ response, data }) => {
        if (!active) return;
        setAiConnection(response.ok ? connectionFromStatus(data) : { state: "error", authenticated: false, authorized: false, providers: [], message: "The connection check returned an error. Local analysis remains active." });
      })
      .catch((cause) => { if (active) { setAiConnection({ state: "error", authenticated: false, authorized: false, providers: [], message: "The connection check failed. Local analysis remains active." }); logError("connection", "connection_check_failed", cause); } });
    return () => { active = false; };
  }, [logError]);

  useEffect(() => {
    let active = true;
    fetch("/api/linkedin/status", { cache: "no-store" })
      .then(async (response) => ({ response, data: await readJsonResponse<{ ok?: boolean; configured?: boolean; connected?: boolean; message?: string; identity?: LinkedInStatus["identity"] }>(response, "LinkedIn sign-in status could not be read.") }))
      .then(({ response, data }) => {
        if (!active) return;
        setLinkedinStatus({ state: response.ok ? "ready" : "error", configured: Boolean(data.configured), connected: Boolean(data.connected), message: data.message || (data.connected ? "Official LinkedIn identity connected." : "LinkedIn sign-in is not connected."), identity: data.identity });
      })
      .catch((cause) => {
        if (!active) return;
        setLinkedinStatus({ state: "error", configured: false, connected: false, message: cause instanceof Error ? cause.message : "LinkedIn sign-in status could not be checked." });
        logError("connection", "linkedin_status_failed", cause);
      });
    return () => { active = false; };
  }, [logError]);

  useEffect(() => {
    const handleError = (event: ErrorEvent) => logError("app", "browser_runtime_error", event.error || event.message, { line: event.lineno || 0, column: event.colno || 0 });
    const handleRejection = (event: PromiseRejectionEvent) => logError("app", "unhandled_promise_rejection", event.reason);
    window.addEventListener("error", handleError);
    window.addEventListener("unhandledrejection", handleRejection);
    return () => { window.removeEventListener("error", handleError); window.removeEventListener("unhandledrejection", handleRejection); };
  }, [logError]);

  function saveMarketSnapshot(source: JobSnapshot["source"] = "pasted", override?: Partial<Pick<JobSnapshot, "company" | "role" | "url" | "description">>) {
    const description = (override?.description ?? jobText).trim();
    if (description.length < 80) { setNotice("Add a more complete job description before saving it to market learning"); return null; }
    const snapshotCompany = (override?.company ?? company).trim() || "Unknown company";
    const snapshotRole = (override?.role ?? role).trim() || "Untitled role";
    const normalizedUrl = (override?.url ?? roleUrl).trim();
    const signature = `${normalizedUrl.toLowerCase()}|${snapshotCompany.toLowerCase()}|${snapshotRole.toLowerCase()}|${description.slice(0, 400).toLowerCase()}`;
    const existing = jobSnapshots.find((item) => `${(item.url || "").toLowerCase()}|${item.company.toLowerCase()}|${item.role.toLowerCase()}|${item.description.slice(0, 400).toLowerCase()}` === signature);
    const now = dateToday();
    if (existing) {
      setJobSnapshots((current) => current.map((item) => item.id === existing.id ? { ...item, company: snapshotCompany, role: snapshotRole, url: normalizedUrl || item.url, description, trackId: selectedTrack.id, source: source === "imported" ? "imported" : item.source, updatedAt: now } : item));
      return existing.id;
    }
    const id = createId();
    setJobSnapshots((current) => [{ id, company: snapshotCompany, role: snapshotRole, url: normalizedUrl || undefined, description, source, savedAt: now, updatedAt: now, trackId: selectedTrack.id }, ...current]);
    return id;
  }

  useEffect(() => {
    if (jobText.trim().length < 80) return;
    const timer = window.setTimeout(() => { saveMarketSnapshot("pasted"); }, 900);
    return () => window.clearTimeout(timer);
    // Deliberately save meaningful pasted descriptions as market history, while preserving all earlier snapshots.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobText, company, role, roleUrl, selectedTrack.id]);

  const resumeRequestKey = `${jobText}\u0000${resumeFacts.join("\u0000")}\u0000${userPlaybookRules.join("\u0000")}\u0000${curatedPlaybookRules.join("\u0000")}\u0000${selectedTrack.id}\u0000${aiPreference.provider}\u0000${selectedModel?.key || aiPreference.modelKey}`;
  const currentResumeGeneration = resumeGeneration?.key === resumeRequestKey ? resumeGeneration : null;
  const localResumeDocument = useMemo(() => buildLocalResume({
    facts: resumeFacts,
    roleText: `${role}\n${jobText}`,
    headline: effectiveProfile.headline || selectedTrack.headline || "Project and Operations Manager",
    summary: effectiveProfile.summary || "Add an approved professional summary in Career profile or the selected résumé track.",
  }), [effectiveProfile.headline, effectiveProfile.summary, resumeFacts, jobText, role, selectedTrack.headline]);
  const fallbackResume = localResumeDocument
    ? renderStructuredResume(localResumeDocument, profile)
    : `${profile.name || "Candidate name"}\n${effectiveProfile.headline || "Project and Operations Manager"}\n${[profile.location, profile.email, profile.phone, profile.linkedin].filter(Boolean).join(" | ")}\n\nPROFESSIONAL SUMMARY\n${effectiveProfile.summary || "Add an approved professional summary in Career profile or the selected résumé track."}\n\nPROFESSIONAL EXPERIENCE\n${matchedFacts.length ? matchedFacts.map((fact) => `• ${fact}`).join("\n") : "• Generate with a connected AI provider after approving career evidence."}\n\nCORE SKILLS\n${roleKeywords.slice(0, 10).join(" • ") || "Add a complete job description to prioritize verified capabilities."}`;
  const resume = currentResumeGeneration ? renderStructuredResume(currentResumeGeneration.result, profile) : fallbackResume;

  /*
   * Build the cover letter from the requirement-to-evidence map rather than a
   * fixed template. The previous version shipped the same three sentences with
   * every application — "contribute with clarity, care, and reliable execution"
   * and "connects closely with the work reflected in my verified experience"
   * said nothing a reader could check, which is exactly what the résumé
   * standards reject. Each body line now names a requirement the posting
   * actually stated and the approved fact that answers it.
   */
  const supportedRequirements = evidenceMap.filter((item) => item.strength !== "Gap" && item.evidence.length).slice(0, 3);
  const openRequirements = evidenceMap.filter((item) => item.strength === "Gap").slice(0, 3);
  const coverBody = supportedRequirements.length
    ? supportedRequirements.map((item) => `${item.requirement.replace(/[.\s]+$/, "")} — ${item.evidence[0].fact}`).join("\n\n")
    : matchedFacts.length
      ? matchedFacts.slice(0, 3).map((fact) => `• ${fact}`).join("\n")
      : "Approve career evidence in Career profile before using this draft — there is nothing here to support a claim yet.";
  const cover = [
    `Dear ${company ? `${company} Hiring Team` : "Hiring Team"},`,
    `I am writing about the ${role || "open position"}${company ? ` at ${company}` : ""}.${effectiveProfile.summary ? ` ${effectiveProfile.summary}` : ""}`,
    supportedRequirements.length ? "Where my background lines up with what the posting asks for:" : "",
    coverBody,
    "I would be glad to walk through any of this in more detail.",
    `Best,\n${profile.name || "Your name"}`,
    openRequirements.length
      ? `REVIEW BEFORE SENDING\nThe posting also asks about ${openRequirements.map((item) => item.requirement.replace(/[.\s]+$/, "")).join("; ")}. No approved evidence covers ${openRequirements.length === 1 ? "it" : "these"} — address ${openRequirements.length === 1 ? "it" : "them"} honestly or leave ${openRequirements.length === 1 ? "it" : "them"} out.`
      : "",
    `VOICE NOTES USED\nLearned from: ${knowledgeStats.voice} uploaded source${knowledgeStats.voice === 1 ? "" : "s"}\nTone: ${writingStyle.tone}\nPrefer: ${writingStyle.prefer}\nAvoid: ${writingStyle.avoid}`,
  ].filter(Boolean).join("\n\n");

  const answers = `APPLICATION ANSWER KIT\n\nProfessional headline\n${effectiveProfile.headline || "Add an approved headline."}\n\nCurrent location\n${profile.location || "Add your location."}\n\nWhy are you interested in this role?\nI’m interested because the role emphasizes ${roleKeywords.slice(0, 3).join(", ") || "the responsibilities in the posting"}, and I can connect those needs to approved evidence in my career profile.\n\nTell us about yourself\n${effectiveProfile.summary || "Add an approved professional summary before using this answer."}\n\nWhy ${company || "this company"}?\nThe opportunity stands out because of the work described in the posting. Before submitting, add one specific, researched reason for your interest in the company.\n\nCompensation, work authorization, demographic, and legal questions\nREQUIRES USER REVIEW — never infer or autofill these sensitive answers.`;

  const generatedText = output === "resume" ? resume : output === "cover" ? cover : output === "answers" ? answers : "";
  const activeText = (output === "resume" || output === "cover") && draftEditorKey === output ? draftEditor : generatedText;
  // Runs on whatever résumé is on screen — local, cloud, or hand-edited — with
  // no provider call, so the standards check works with no API key configured.
  const resumeAudit = useMemo(
    () => (output === "resume" && activeText.trim() ? auditResume(activeText, { roleText: `${role}\n${jobText}` }) : null),
    [activeText, jobText, output, role],
  );
  const autofillData = JSON.stringify({
    version: 1,
    profile: { fullName: profile.name, email: profile.email, phone: profile.phone, location: profile.location, linkedin: profile.linkedin, portfolio: profile.portfolio, ...splitLocation(profile.location) },
    target: { company, role },
    answers: { headline: profile.headline, summary: profile.summary, interest: `I’m interested in ${role || "this role"} because it combines ${roleKeywords.slice(0, 3).join(", ") || "project leadership, creative operations, and cross-functional delivery"}.` },
    // The companion reads this as `resume` — it was emitted as `resumeVersion`
    // for weeks, which is why the popup always said no résumé was attached.
    resume: selectedAutofillResume ? { id: selectedAutofillResume.id, title: selectedAutofillResume.title, versionNumber: selectedAutofillResume.versionNumber || null, origin: selectedAutofillResume.origin, content: selectedAutofillResume.content.slice(0, 60_000) } : null,
    safety: { neverSubmit: true, sensitiveFieldsRequireUser: true },
  }, null, 2);

  // The package carries the whole résumé so the companion can paste it into
  // forms that take pasted text. Printing all of it on screen buried
  // everything else under tens of thousands of characters, so the preview
  // shows the shape and says how much text is standing in for itself. Copy
  // and Download still emit the real package.
  const autofillPreview = selectedAutofillResume?.content
    ? autofillData.replace(
        JSON.stringify(selectedAutofillResume.content.slice(0, 60_000)),
        JSON.stringify(`[${selectedAutofillResume.content.length.toLocaleString()} characters of résumé text — included in full when you copy or download]`),
      )
    : autofillData;

  async function requestResumeAi(action: "generate" | "review") {
    if (jobText.trim().length < 80) throw new Error("Paste the complete job description before using cloud résumé tools.");
    // Generation receives the cleaned evidence, so the gate counts that list:
    // otherwise contact lines or duplicates could satisfy the check here and
    // still be rejected by the server.
    if (resumeFacts.length < 3) {
      throw new Error(facts.length >= 3
        ? "After removing contact lines, duplicates, and fragments, fewer than three usable career facts remain. Add more specific accomplishments in Career profile."
        : "Approve at least three career facts before using cloud résumé tools.");
    }
    if (!aiReady || !selectedProvider || !selectedModel) throw new Error(aiConnectionMessage);
    if (action === "review" && resume.trim().length < 120) throw new Error("Generate or write a complete résumé draft before review.");
    const response = await fetch("/api/ai/resume", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action,
        provider: selectedProvider.id,
        modelKey: selectedModel.key,
        company,
        role,
        jobText,
        approvedFacts: resumeFacts,
        // The server expects the role-relevant subset it must check rule by
        // rule, plus the full cleaned library as supporting guidance. Sending
        // the whole library as userRules let the server keep whichever 24 were
        // uploaded first instead of the ones that matter for this role.
        userRules: prioritizedUserPlaybookRules,
        userRuleLibrary: userPlaybookRules,
        userRuleLibraryCount: userPlaybookRules.length,
        curatedRules: curatedPlaybookRules,
        track: { name: selectedTrack.name, headline: selectedTrack.headline || profile.headline, summary: selectedTrack.summary || profile.summary },
        draft: action === "review" ? activeText : undefined,
      }),
    });
    const data = await readJsonResponse<ResumeAiResponse>(response, `${selectedProvider.name} did not return readable résumé data.`);
    if (!response.ok || !data.ok || !data.result) {
      logError("ai", data.code || "resume_ai_failed", data.message || `Résumé AI returned status ${response.status}`, {
        status: response.status,
        provider: data.provider || selectedProvider.id,
        model: data.model || selectedModel.id,
        diagnosticCode: data.diagnosticCode || "not-provided",
      });
      throw new Error(data.message || `${selectedProvider.name} could not complete this résumé request.`);
    }
    return { data, provider: selectedProvider, model: selectedModel };
  }

  async function generateResumeWithAi() {
    setOutput("resume");
    setResumeAiRunning("generate");
    setResumeReview(null);
    setOperationProgress({ label: `Creating résumé with ${selectedProvider?.name || "cloud AI"}`, detail: "Applying your uploaded playbook first, then curated guidance, while validating every candidate claim against approved evidence." });
    try {
      const { data, provider, model } = await requestResumeAi("generate");
      const result = data.result as ResumeAiResult;
      const generation: ResumeGeneration = {
        key: resumeRequestKey,
        provider: data.provider || provider.id,
        providerName: data.providerName || provider.name,
        model: data.model || model.id,
        modelKey: model.key,
        modelLabel: data.modelLabel || model.label,
        result,
        usage: data.usage,
        quality: data.quality,
      };
      setResumeGeneration(generation);
      // Generation replaces the draft wholesale. Preserve any manual edits as a
      // version first — the workspace guarantee is that nothing is overwritten.
      if (draftEditorKey === "resume" && draftEditor.trim() && draftEditor !== resume) {
        saveDraftVersion("resume");
        setNotice("Your edited draft was saved as a version before the new résumé replaced it.");
      }
      setDraftEditor(renderStructuredResume(result, profile));
      setDraftIsExternal(false);
      setDraftEditorKey("resume");
      setNotice(`${generation.modelLabel} created a fact-checked résumé using ${userPlaybookRules.length} uploaded rules first and ${curatedPlaybookRules.length} secondary rules.`);
    } catch (cause) {
      setNotice(cause instanceof Error ? cause.message : "The résumé could not be generated.");
    } finally {
      setResumeAiRunning(null);
      setOperationProgress(null);
    }
  }

  async function reviewResumeWithAi() {
    setOutput("resume");
    setResumeAiRunning("review");
    setOperationProgress({ label: `Reviewing résumé with ${selectedProvider?.name || "cloud AI"}`, detail: "Checking factual support, playbook compliance, relevance, clarity, and unsupported claims without rewriting your saved version." });
    try {
      const { data, provider, model } = await requestResumeAi("review");
      setResumeReview({ providerName: data.providerName || provider.name, modelLabel: data.modelLabel || model.label, result: data.result as ResumeAiReview, usage: data.usage });
      setNotice(`${data.modelLabel || model.label} review completed. The résumé draft itself was not changed.`);
    } catch (cause) {
      setNotice(cause instanceof Error ? cause.message : "The résumé review could not be completed.");
    } finally {
      setResumeAiRunning(null);
      setOperationProgress(null);
    }
  }

  async function runCloudRecommendation() {
    setOutput("analysis");
    if (jobText.trim().length < 80) { setNotice("Paste the complete job description before running cloud AI"); return; }
    if (resumeFacts.length < 3) { setNotice("Approve at least three usable career facts before running cloud AI"); return; }
    if (!aiReady || !selectedProvider || !selectedModel) { setView("ai"); setNotice(aiConnectionMessage); return; }
    setAiRunning(true);
    setOperationProgress({ label: `Reviewing with ${selectedProvider.name}`, detail: `${selectedModel.label} is comparing the role with approved facts only. Raw files and writing samples are not sent.` });
    try {
      const review = await requestModelReview(selectedProvider, selectedModel);
      setCloudReview(review);
      setNotice(`${review.providerName} review completed and checked against your approved facts`);
    } catch (cause) {
      logError("ai", "cloud_connection_failed", cause, { provider: selectedProvider.id, model: aiModel });
      setNotice(cause instanceof Error ? cause.message : "Cloud review could not connect. The verified local recommendation remains active.");
    } finally {
      setAiRunning(false);
      setOperationProgress(null);
    }
  }

  async function requestModelReview(provider: AiProviderStatus, model: AiModelOption) {
    const response = await fetch("/api/ai/recommend", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ provider: provider.id, modelKey: model.key, company, role, jobText, approvedFacts: resumeFacts, localAnalysis: { decision: recommendation.label, evidenceCoverage, strong: evidenceCounts.strong, partial: evidenceCounts.partial, gaps: evidenceCounts.gaps } }),
    });
    const data = await readJsonResponse<{ ok?: boolean; code?: string; message?: string; provider?: AiProviderId; providerName?: string; model?: string; modelLabel?: string; requestId?: string | null; recommendation?: CloudRecommendation; usage?: CloudUsage; diagnosticCode?: string }>(response, `${provider.name} did not return readable app data.`);
    if (!response.ok || !data.ok || !data.recommendation) {
      logError("ai", data.code || "cloud_review_failed", data.message || `Cloud review returned status ${response.status}`, { status: response.status, provider: data.provider || provider.id, model: data.model || model.id, requestId: data.requestId || "not-provided", diagnosticCode: data.diagnosticCode || "not-provided" });
      throw new Error(data.message || `${provider.name} could not complete the review. The verified local recommendation remains active.`);
    }
    const key = `${jobText}\u0000${facts.join("\u0000")}\u0000${provider.id}\u0000${model.key}`;
    return { key, provider: data.provider || provider.id, providerName: data.providerName || provider.name, model: data.model || model.id, modelKey: model.key, modelLabel: data.modelLabel || model.label, recommendation: data.recommendation, usage: data.usage, requestId: data.requestId } satisfies CloudReview;
  }

  async function compareSelectedModels() {
    if (jobText.trim().length < 80) { setView("workspace"); setNotice("Paste the complete job description before comparing models."); return; }
    if (resumeFacts.length < 3) { setView("documents"); setNotice("Approve at least three usable career facts before comparing models."); return; }
    if (!selectedProvider?.configured || !aiConnection.authenticated || !aiConnection.authorized) { setNotice(aiConnectionMessage); return; }
    setComparisonRunning(true);
    setComparisonResults([]);
    const completed: CloudReview[] = [];
    try {
      for (let index = 0; index < selectedProvider.models.slice(0, comparisonCount).length; index += 1) {
        const model = selectedProvider.models[index];
        setOperationProgress({ label: `Comparing ${selectedProvider.name} models · ${index + 1}/${comparisonCount}`, detail: `Waiting for ${model.label}. Each model receives the same role and approved facts so the comparison is fair.` });
        try {
          completed.push(await requestModelReview(selectedProvider, model));
          setComparisonResults([...completed]);
        } catch (cause) {
          logError("ai", "model_comparison_item_failed", cause, { provider: selectedProvider.id, model: model.id });
        }
      }
      setNotice(completed.length ? `${completed.length} ${selectedProvider.name} model reviews completed. Compare their reasoning below.` : "No comparison review completed. Check the error report and provider connection.");
    } finally {
      setComparisonRunning(false);
      setOperationProgress(null);
    }
  }

  async function recheckAiConnection() {
    setAiConnection((current) => ({ ...current, state: "checking", message: "Checking the secure backend connection…" }));
    try {
      const response = await fetch("/api/ai/recommend", { cache: "no-store" });
      const data = await readJsonResponse<AiStatusPayload>(response, "The AI connection status could not be read.");
      setAiConnection(response.ok ? connectionFromStatus(data) : { state: "error", authenticated: false, authorized: false, providers: [], message: "The connection check returned an error. Local analysis remains active." });
    } catch (cause) {
      logError("connection", "connection_recheck_failed", cause);
      setAiConnection({ state: "error", authenticated: false, authorized: false, providers: [], message: "The connection check failed. Local analysis remains active." });
    }
  }

  // Both diagnostics hit the same backend route (app/api/ai/models); `live`
  // additionally spends one real generation request on the currently
  // selected model, so it stays a separate, explicitly-labelled action
  // rather than something the free catalog check does silently.
  async function runAiDiagnostics(body: Record<string, unknown>, checkingMessage: string) {
    setAiDiagnostics((current) => ({ ...current, state: "checking", message: checkingMessage }));
    try {
      const response = await fetch("/api/ai/models", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const data = await readJsonResponse<AiDiagnosticsPayload>(response, "The model check could not be read.");
      if (!response.ok || data.ok === false) {
        setAiDiagnostics({ state: "error", providers: [], message: data.message || "The model check returned an error." });
        return;
      }
      setAiDiagnostics({ state: "ready", checkedAt: data.checkedAt, providers: data.providers || [], message: data.note || "Model check complete." });
    } catch (cause) {
      logError("ai", "model_diagnostics_failed", cause);
      setAiDiagnostics({ state: "error", providers: [], message: "The model check failed. Try again in a moment." });
    }
  }

  function runModelDiagnostics() {
    return runAiDiagnostics({}, "Checking model catalog access across every connected provider — no résumé text is generated.");
  }

  function runLiveGenerationCheck() {
    if (!selectedProvider || !selectedModel) return Promise.resolve();
    return runAiDiagnostics(
      { live: true, provider: selectedProvider.id, modelKey: selectedModel.key },
      `Sending one real, minimal generation request to ${selectedModel.label} to confirm quota and billable access…`,
    );
  }

  function saveApplication() {
    if (!company.trim() && !role.trim()) { setNotice("Add a company or role first"); return; }
    const jobSnapshotId = saveMarketSnapshot("pasted") || undefined;
    const snapshotCompany = company.trim() || "Unknown company";
    const snapshotRole = role.trim() || "Untitled role";
    const existing = applications.find((item) => jobSnapshotId ? item.jobSnapshotId === jobSnapshotId : !item.jobSnapshotId && item.company === snapshotCompany && item.role === snapshotRole);
    if (existing) { setNotice("This role is already in your application pipeline"); setView("applications"); return; }
    const id = createId();
    setApplications((current) => [{ id, company: snapshotCompany, role: snapshotRole, status: "Preparing", date: dateInputToday(), url: roleUrl.trim() || undefined, jobSnapshotId, note: "Saved from Role workspace" }, ...current]);
    setNotice("Role saved to your application pipeline. It is not marked as submitted.");
  }

  function reusePriorResume(draftId: string) {
    const prior = generatedDrafts.find((draft) => draft.id === draftId);
    if (!prior) { setNotice("That saved version could not be found."); return; }
    // Loaded into the editor, never saved over: the original version stays
    // untouched in history and this becomes a new draft the user can adapt.
    setDraftEditor(prior.content);
    setDraftEditorKey("resume");
    setDraftIsExternal(prior.origin === "uploaded");
    setOutput("resume");
    setNotice(`Loaded ${prior.title} into the draft editor. The saved version is unchanged — edit this copy for ${role || "this role"}, then Save version.`);
  }

  function openDraftEditor(kind: "resume" | "cover") {
    const seed = kind === "resume" ? resume : cover;
    setDraftEditor(seed);
    setDraftEditorKey(kind);
    setDraftIsExternal(false);
  }

  /*
   * Load a résumé or cover letter drafted somewhere else -- most commonly the
   * resume-tailor Skill run in a separate Claude conversation, for anyone
   * using their regular Claude subscription instead of configuring a paid API
   * key here. The pasted text becomes the working draft: it runs through the
   * same résumé-standards audit and evidence-map cover-letter tooling as any
   * other draft, and Save Version records it as "uploaded" so its origin
   * stays honest in the version history.
   */
  /*
   * The zero-API-key path. A Claude Max/Pro subscription cannot be used as an
   * API key, so instead of wiring the subscription into the server, this
   * bundles everything the cloud route would have sent — role, approved
   * facts, playbook rules, track positioning, writing voice — into one
   * prompt the user pastes into a regular Claude conversation. The reply
   * comes back through the existing "Paste a drafted…" flow and is scored,
   * versioned, and exported exactly like a cloud-generated draft.
   */
  function claudeSubscriptionPrompt(kind: "resume" | "cover") {
    const rules = [...prioritizedUserPlaybookRules, ...curatedPlaybookRules].slice(0, 24);
    return [
      `You are tailoring a US-market ${kind === "resume" ? "résumé" : "cover letter"} for the role below. Use ONLY the approved career facts listed — never invent employers, titles, dates, metrics, or skills. If a requirement has no supporting fact, leave it unaddressed instead of guessing.`,
      `ROLE\nCompany: ${company.trim() || "Not specified"}\nTitle: ${role.trim() || "Not specified"}\n\nJob description:\n${jobText.trim() || "(Not pasted yet — ask me for it before drafting.)"}`,
      `APPROVED CAREER FACTS — the only claims allowed\n${resumeFacts.length ? resumeFacts.map((fact) => `- ${fact}`).join("\n") : "(None approved yet — ask me for real experience before drafting.)"}`,
      `POSITIONING\nRésumé direction: ${selectedTrack.name}\nHeadline: ${selectedTrack.headline || profile.headline || "None saved"}\nSummary: ${selectedTrack.summary || profile.summary || "None saved"}`,
      rules.length ? `EDITORIAL RULES — uploaded rules first, curated second\n${rules.map((rule) => `- ${rule}`).join("\n")}` : "",
      `WRITING VOICE — affects phrasing only, never facts\nTone: ${writingStyle.tone}\nPrefer: ${writingStyle.prefer}\nAvoid: ${writingStyle.avoid}`,
      kind === "resume"
        ? "OUTPUT\nReturn only the finished résumé as plain text: name on the first line, headline on the second, one contact line, then ALL-CAPS section headers (SUMMARY, EXPERIENCE, SKILLS, EDUCATION) with hyphen bullets. No commentary before or after the résumé."
        : "OUTPUT\nReturn only the finished cover letter as plain text, ready to send. No commentary before or after it.",
      "I will paste your output back into V's Job Seeker, which scores it against these same rules.",
    ].filter(Boolean).join("\n\n");
  }

  function applyExternalDraft(kind: "resume" | "cover") {
    const content = pasteDraftText.trim();
    if (content.length < 40) { setNotice("Paste the complete drafted text first -- that looked too short to be a real draft."); return; }
    setDraftEditor(content);
    setDraftEditorKey(kind);
    setDraftIsExternal(true);
    setOutput(kind);
    setPasteDraftOpen(false);
    setPasteDraftText("");
    setNotice(`Pasted ${kind === "resume" ? "résumé" : "cover letter"} loaded as your working draft. ${kind === "resume" ? "Check the standards report below, then " : ""}Save version to keep it.`);
  }

  function saveDraftVersion(kind: "resume" | "cover") {
    const content = (draftEditorKey === kind ? draftEditor : kind === "resume" ? resume : cover).trim();
    if (!content) { setNotice("There is no draft to save yet"); return; }
    const jobSnapshotId = saveMarketSnapshot("pasted") || undefined;
    const id = createId();
    const title = `${company || "Untitled company"} — ${role || (kind === "resume" ? "Tailored resume" : "Cover letter")} · ${dateToday()}`;
    const draftCompany = company || "Unknown company";
    const draftRole = role || "Untitled role";
    setGeneratedDrafts((current) => [{
      id,
      type: kind,
      title,
      content,
      createdAt: dateToday(),
      updatedAt: dateToday(),
      company: draftCompany,
      role: draftRole,
      trackId: selectedTrack.id,
      jobSnapshotId,
      origin: draftEditorKey === kind && draftIsExternal ? "uploaded" : draftEditorKey === kind && draftEditor !== (kind === "resume" ? resume : cover) ? "edited" : "generated",
      provider: kind === "resume" && currentResumeGeneration ? currentResumeGeneration.provider : "local",
      model: kind === "resume" && currentResumeGeneration ? currentResumeGeneration.model : undefined,
      modelLabel: kind === "resume" && currentResumeGeneration ? currentResumeGeneration.modelLabel : undefined,
      versionNumber: Math.max(0, ...current.filter((item) => item.type === kind && item.company === draftCompany && item.role === draftRole).map((item) => item.versionNumber || 0)) + 1,
      playbookRuleCount: kind === "resume" ? approvedPlaybookRules.length : undefined,
      approvedFactCount: kind === "resume" ? facts.length : undefined,
    }, ...current]);
    setNotice(`${kind === "resume" ? "Résumé" : "Cover letter"} version saved for reuse and application tracking.`);
  }

  function attachDraftToApplication(applicationId: string, draft: GeneratedDraft) {
    setApplications((current) => current.map((item) => item.id === applicationId ? { ...item, resumeVersionId: draft.type === "resume" ? draft.id : item.resumeVersionId, coverVersionId: draft.type === "cover" ? draft.id : item.coverVersionId } : item));
    setGeneratedDrafts((current) => current.map((item) => item.id === draft.id ? { ...item, applicationId } : item));
    setNotice(`${draft.type === "resume" ? "Résumé" : "Cover letter"} linked to this application.`);
  }

  function download(name: string, content: string, type = "text/plain") {
    const url = URL.createObjectURL(new Blob([content], { type }));
    const anchor = document.createElement("a"); anchor.href = url; anchor.download = name; anchor.click(); URL.revokeObjectURL(url);
  }

  // Résumés render through the document formatter so the exported file keeps
  // real headings, entry layout, and bullet lists. Cover letters and answer
  // kits are prose and render through the prose formatter.
  function documentHtml(kind: "resume" | "prose", title: string, content: string, autoPrint: boolean) {
    return kind === "resume"
      ? resumeToHtml(content, { title, autoPrint })
      : proseToHtml(content, { title, autoPrint });
  }

  function downloadWordDocument(name: string, title: string, content: string, kind: "resume" | "prose" = "prose") {
    download(name, documentHtml(kind, title, content, false), "application/msword");
  }

  function printDocument(title: string, content: string, kind: "resume" | "prose" = "prose") {
    const printWindow = window.open("", "_blank", "noopener,noreferrer");
    if (!printWindow) { setNotice("Allow pop-ups to open the print-ready document"); return; }
    printWindow.document.write(documentHtml(kind, title, content, true));
    printWindow.document.close();
  }

  async function pasteFromClipboard(setValue: (value: string) => void, label: string) {
    try {
      const value = await navigator.clipboard.readText();
      if (!value.trim()) { setNotice(`Your clipboard does not contain a ${label}`); return; }
      setValue(value.trim());
      setNotice(`${label[0].toUpperCase()}${label.slice(1)} pasted from the clipboard`);
    } catch (cause) {
      logError("links", "clipboard_read_failed", cause, { field: label });
      setNotice(`Clipboard access was not available. Click the field and press Command–V.`);
    }
  }

  async function pasteVisibleRoleCapture() {
    try {
      const clipboard = await navigator.clipboard.readText();
      const parsed = JSON.parse(clipboard) as { schema?: unknown; sourceUrl?: unknown; title?: unknown; role?: unknown; company?: unknown; text?: unknown };
      if (parsed.schema !== "v-jobs-role-capture-v1" || typeof parsed.text !== "string" || parsed.text.trim().length < 80) throw new Error("not a V’s visible-page capture");
      const capturedTitle = typeof parsed.title === "string" ? parsed.title.trim() : "";
      const capturedUrl = typeof parsed.sourceUrl === "string" ? parsed.sourceUrl.trim() : "";
      const titleParts = capturedTitle.split(/\s+(?:at|@|\||—|–)\s+/i).map((item) => item.trim()).filter(Boolean);
      const capturedRole = typeof parsed.role === "string" && parsed.role.trim() ? parsed.role.trim() : titleParts[0] || role;
      const capturedCompany = typeof parsed.company === "string" && parsed.company.trim() ? parsed.company.trim() : titleParts.length > 1 ? titleParts[1] : company;
      if (capturedRole) setRole(capturedRole);
      if (capturedCompany) setCompany(capturedCompany);
      if (capturedUrl) setRoleUrl(capturedUrl);
      setJobText(parsed.text.trim());
      saveMarketSnapshot("imported", { company: capturedCompany, role: capturedRole, url: capturedUrl, description: parsed.text.trim() });
      setLinkAssist(null);
      setOutput("analysis");
      setNotice("Visible job page imported and saved to private market learning. Review the title, company, and description before applying.");
    } catch (cause) {
      logError("links", "visible_role_capture_failed", cause);
      setNotice("Clipboard does not contain a valid V’s visible-page capture. In the extension, choose “Copy visible job page,” then try again.");
    }
  }

  async function readLink(url: string, purpose: "knowledge" | "role") {
    const response = await fetch("/api/link/read", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ url, purpose }) });
    const data = await readJsonResponse<LinkReadPayload>(response, purpose === "role" ? "The public job page could not be read." : "The public knowledge source could not be read.");
    if (!response.ok || !data.ok || !data.source) throw new Error(data.message || "The public link could not be read.");
    return data.source;
  }

  function storeImportedSource(titleValue: string, type: string, rawText: string, originalUrl?: string) {
    const title = titleValue.trim() || `Imported source — ${dateToday()}`;
    const scope = scopeForCategory(sourceCategory);
    const trimmedText = rawText.trim();
    const text = trimmedText.slice(0, MAX_SOURCE_TEXT);
    const truncated = trimmedText.length > MAX_SOURCE_TEXT;
    const candidates = scope === "evidence" || scope === "guidance" ? factCandidates(text) : [];
    const document: SourceDocument = { id: createId(), title, type, category: sourceCategory, scope, trackId: sourceTrackId, sourceUrl: originalUrl || undefined, importedAt: dateToday(), text, candidates, approved: scope === "guidance" ? candidates : [], status: "ready", truncated };
    setDocuments((current) => [document, ...current]);
    if (scope === "voice") addWritingSample(title, text);
    return scope;
  }

  function addWritingSample(title: string, text: string) {
    setWritingStyle((current) => {
      const samples = mergeWritingSample(current.samples, title, text);
      const learned = deriveWritingVoice(samples);
      return learned.ready ? { samples, tone: learned.tone, prefer: learned.prefer, avoid: learned.avoid } : { ...current, samples };
    });
  }

  function relearnWritingVoice(samples = writingStyle.samples) {
    const learned = deriveWritingVoice(samples);
    if (!learned.ready) { setNotice(learned.tone); return; }
    setWritingStyle((current) => ({ ...current, tone: learned.tone, prefer: learned.prefer, avoid: learned.avoid }));
    setNotice(`Writing voice relearned from ${learned.stats.words} words across ${learned.stats.sentences} sentences.`);
  }

  async function readRoleFromLink(urlValue = roleUrl) {
    if (!urlValue.trim()) { setNotice("Paste a public job link first"); return; }
    const kind = linkKind(urlValue.trim());
    if (kind === "invalid") { setNotice("Use a complete link beginning with https://"); return; }
    if (kind === "linkedin") {
      setLinkAssist({ kind: "linkedin", title: "LinkedIn job detected", message: "You do not need to sign in to V’s. LinkedIn blocks automated job-page reading, and official LinkedIn sign-in does not grant job-page access. Open the original link, copy the job description, then paste it here." });
      setNotice("LinkedIn requires the copy-and-paste path. Official login cannot unlock job pages for this app.");
      return;
    }
    setLinkAssist(null);
    setRoleReading(true);
    setOperationProgress({ label: "Reading public job page", detail: `Opening ${kind === "indeed" ? "the public Indeed page" : "the employer or ATS page"}, checking access, and extracting the role text…` });
    try {
      const source = await readLink(urlValue.trim(), "role");
      const structuredJob = source.jobs[0];
      const extractedText = structuredJob?.description?.trim() || source.text.trim();
      const extractedUrl = structuredJob?.sourceUrl || source.finalUrl;
      const extractedCompany = structuredJob?.company || company;
      const extractedRole = structuredJob?.title || (!role.trim() && source.title ? source.title.replace(/\s*[|–—-].*$/, "").trim() : role);
      setRoleUrl(extractedUrl);
      if (extractedCompany) setCompany(extractedCompany);
      if (extractedRole) setRole(extractedRole);
      setJobText(extractedText);
      saveMarketSnapshot("imported", { company: extractedCompany, role: extractedRole, url: extractedUrl, description: extractedText });
      setOutput("analysis");
      setNotice(`Role imported from ${new URL(source.finalUrl).hostname} and saved to private market learning. Review the extracted text before using it.`);
    } catch (cause) {
      logError("links", "role_link_read_failed", cause);
      if (kind === "indeed") setLinkAssist({ kind: "indeed", title: "Indeed page needs manual copy", message: "Indeed sometimes returns a challenge or sign-in page instead of the public posting. Open the original link, copy the description, and paste it below. V’s never uses your Indeed password or browser session." });
      else setLinkAssist({ kind: "login", title: "This page could not be read publicly", message: "The site may require sign-in, block automated readers, or render the description only in your browser. Open the original page and paste the job description below." });
      setNotice(cause instanceof Error ? cause.message : "The role link could not be read. Paste the job description instead.");
    } finally {
      setRoleReading(false);
      setOperationProgress(null);
    }
  }

  async function readKnowledgeFromLink() {
    if (!sourceUrl.trim()) { setNotice("Paste a public article or YouTube link first"); return; }
    setSourceReading(true);
    setOperationProgress({ label: "Importing knowledge", detail: /youtu(?:\.be|be\.com)/i.test(sourceUrl) ? "Reading the public video metadata and exposed captions, then separating the transcript into the selected knowledge type…" : "Reading the public article and separating it into the selected knowledge type…" });
    try {
      const source = await readLink(sourceUrl.trim(), "knowledge");
      const scope = storeImportedSource(source.title, source.sourceType === "youtube-transcript" ? "YouTube transcript" : "Public article", source.text, source.finalUrl);
      setSourceUrl("");
      setNotice(scope === "guidance" ? "Public source imported into the résumé playbook. Detected rules are active and outrank built-in guidance." : scope === "voice" ? "Public text added to Writing voice only." : scope === "evidence" ? "Public source imported as candidate evidence. Approve each fact before use." : "Public research source saved separately from your career facts.");
    } catch (cause) {
      logError("links", "knowledge_link_read_failed", cause, { category: sourceCategory });
      setNotice(cause instanceof Error ? cause.message : "The public source could not be read. Paste its text instead.");
    } finally {
      setSourceReading(false);
      setOperationProgress(null);
    }
  }

  async function prepareRadarOpportunity(opportunity: RadarOpportunity) {
    setCompany(opportunity.company);
    setRole(opportunity.title);
    setRoleUrl(opportunity.sourceUrl);
    setView("workspace");
    await readRoleFromLink(opportunity.sourceUrl);
  }

  function importDocument() {
    if (!documentText.trim()) { setNotice("Paste document text before importing"); return; }
    if (sourceUrl.trim() && !/^https?:\/\//i.test(sourceUrl.trim())) { setNotice("Source URL must start with http:// or https://"); return; }
    const title = documentTitle.trim() || `Imported document — ${dateToday()}`;
    const scope = storeImportedSource(title, "Pasted text", documentText, sourceUrl.trim() || undefined);
    setDocumentTitle(""); setDocumentText(""); setSourceUrl("");
    setNotice(scope === "evidence" ? "Career source imported. Review candidates individually or use Approve all." : scope === "voice" ? "Writing sample added to your voice bank. It cannot create career facts." : scope === "guidance" ? "Résumé playbook imported and activated automatically. Uploaded rules outrank built-in guidance." : "Research source saved as context. It cannot create career facts.");
  }

  async function uploadDocuments(files: File[]) {
    if (!files.length) return;
    if (sourceUrl.trim() && !/^https?:\/\//i.test(sourceUrl.trim())) { setNotice("Source URL must start with http:// or https://"); return; }
    const scope = scopeForCategory(sourceCategory);
    const importedUrl = sourceUrl.trim() || undefined;
    const queued = files.map((file) => ({
      file,
      document: { id: createId(), title: file.name, type: file.type || "Document", category: sourceCategory, scope, trackId: sourceTrackId, sourceUrl: importedUrl, importedAt: dateToday(), text: "", candidates: [], approved: [], status: "reading" as const },
    }));
    setSourceUrl("");
    let failedCount = 0;
    setDocuments((current) => [...queued.map((item) => item.document), ...current]);
    setNotice(`Reading ${files.length} ${files.length === 1 ? "file" : "files"} on this Mac…`);
    setOperationProgress({ label: "Learning from uploaded content", detail: "Extracting text locally, classifying its knowledge scope, and preparing only evidence or résumé rules for your approval…" });

    await Promise.all(queued.map(async ({ file, document }) => {
      const isZip = /\.zip$/i.test(file.name) || file.type === "application/zip" || file.type === "application/x-zip-compressed";
      const fileLimit = isZip ? MAX_LINKEDIN_ARCHIVE_BYTES : MAX_SOURCE_FILE_BYTES;
      if (file.size > fileLimit) {
        logError("documents", "source_file_too_large", `The selected file is larger than the ${isZip ? "50" : "10"} MB import limit.`, { size: file.size, limit: fileLimit });
        failedCount += 1;
        setDocuments((current) => current.map((item) => item.id === document.id ? { ...item, status: "needs-text" } : item));
        return;
      }
      const isSupported = isZip || /^(text\/|application\/(json|csv|pdf|vnd\.openxmlformats-officedocument\.wordprocessingml\.document))/.test(file.type) || /\.(txt|md|csv|json|pdf|docx)$/i.test(file.name);
      if (!isSupported) {
        logError("documents", "unsupported_file_type", "The selected file type is not supported.", { extension: file.name.includes(".") ? file.name.split(".").pop()?.toLowerCase() || "unknown" : "none", mime: file.type || "unknown", size: file.size });
        failedCount += 1;
        setDocuments((current) => current.map((item) => item.id === document.id ? { ...item, status: "needs-text" } : item));
        return;
      }
      try {
        if (isZip) {
          const groups = await extractLinkedInArchive(await file.arrayBuffer());
          if (!groups.length) throw new Error("No supported LinkedIn export sections were found in this ZIP. Upload the complete archive LinkedIn provided, without changing its filenames.");
          const imported = groups.map((group) => ({
            id: createId(),
            title: group.title,
            type: group.type,
            category: group.category,
            scope: group.scope,
            trackId: sourceTrackId,
            importedAt: dateToday(),
            text: group.text,
            candidates: group.scope === "evidence" ? factCandidates(group.text) : [],
            approved: [],
            status: "ready" as const,
            truncated: group.truncated,
          }));
          setDocuments((current) => [...imported, ...current.filter((item) => item.id !== document.id)]);
          imported.filter((item) => item.scope === "voice").forEach((item) => addWritingSample(item.title, item.text));
          return;
        }
        const extractedText = (await extractFileText(file)).trim();
        const text = extractedText.slice(0, MAX_SOURCE_TEXT);
        const truncated = extractedText.length > MAX_SOURCE_TEXT;
        const sourceType = /\.json$/i.test(file.name) ? "JSON / GPT export" : /\.pdf$/i.test(file.name) ? "PDF" : /\.docx$/i.test(file.name) ? "Word document" : file.type || "Text document";
        const candidates = scope === "evidence" || scope === "guidance" ? factCandidates(text) : [];
        setDocuments((current) => current.map((item) => item.id === document.id ? { ...item, type: sourceType, text, candidates, approved: scope === "guidance" ? candidates : item.approved, status: "ready", truncated } : item));
        if (scope === "voice") addWritingSample(document.title, text);
      } catch (cause) {
        logError("documents", "document_read_failed", cause, { extension: file.name.includes(".") ? file.name.split(".").pop()?.toLowerCase() || "unknown" : "none", mime: file.type || "unknown", size: file.size });
        failedCount += 1;
        setDocuments((current) => current.map((item) => item.id === document.id ? { ...item, status: "needs-text" } : item));
      }
    }));
    setOperationProgress(null);
    if (failedCount >= files.length) {
      setNotice(`None of the ${files.length === 1 ? "file" : `${files.length} files`} could be read — ${files.length === 1 ? "it is" : "they are"} marked "needs text" below. Check the type (PDF, DOCX, TXT, MD, CSV, JSON, or a LinkedIn ZIP) and size, or paste the text directly.`);
    } else if (failedCount > 0) {
      setNotice(`${files.length - failedCount} of ${files.length} files imported; ${failedCount} could not be read and ${failedCount === 1 ? "is" : "are"} marked "needs text" below. ${scope === "evidence" ? "Review candidates from the imported ones or use Approve all." : ""}`.trim());
    } else {
      setNotice(scope === "evidence" ? "Import finished. Review candidates individually or use Approve all." : scope === "voice" ? "Writing samples are now in your voice bank and cannot create career facts." : scope === "guidance" ? "Résumé playbook imported and activated automatically. Your uploaded rules now outrank the built-in guidance." : "Research sources are saved as context and cannot create career facts.");
    }
  }

  function approveCandidate(documentId: string, candidate: string) {
    const source = documents.find((document) => document.id === documentId);
    if (!source || sourceScope(source) !== "evidence") { setNotice("Only a career-evidence source can create an approved fact"); return; }
    const alreadyAdded = isOverlappingFact(candidate, facts);
    if (!alreadyAdded) setProfile({ ...profile, facts: [...facts, candidate].join("\n") });
    setDocuments(documents.map((doc) => doc.id === documentId ? { ...doc, approved: doc.approved.includes(candidate) ? doc.approved : [...doc.approved, candidate] } : doc));
    setNotice(alreadyAdded ? "That fact is already approved" : "Fact approved and added to your profile");
  }

  function approvePlaybookRule(documentId: string, rule: string) {
    const source = documents.find((document) => document.id === documentId);
    if (!source || sourceScope(source) !== "guidance") { setNotice("Only a résumé-playbook source can create a writing rule"); return; }
    setDocuments(documents.map((document) => document.id === documentId ? { ...document, approved: document.approved.includes(rule) ? document.approved : [...document.approved, rule] } : document));
    setNotice(source.approved.includes(rule) ? "That résumé rule is already active" : "Résumé rule added to the playbook—not to your career facts");
  }

  function approveAllCandidates(documentId: string) {
    const source = documents.find((document) => document.id === documentId);
    if (!source) return;
    const scope = sourceScope(source);
    if (scope !== "evidence" && scope !== "guidance") return;
    const candidates = source.candidates.filter(Boolean);
    if (!candidates.length) { setNotice("There are no candidate items to approve in this source"); return; }

    if (scope === "guidance") {
      setDocuments((current) => current.map((document) => document.id === documentId ? { ...document, approved: [...new Set([...document.approved, ...candidates])] } : document));
      setNotice(`${candidates.length} résumé playbook rules activated.`);
      return;
    }

    // Batch approval skips anything that conflicts with an ALREADY-approved
    // fact from a different source -- those still need the individual
    // "Approve fact" click, so Approve All can never quietly paper over two
    // sources disagreeing about a title or a number.
    const candidateEntries = candidates.map((text, index) => ({ id: `pending::${index}`, text, sourceId: documentId, sourceTitle: source.title }));
    const audit = auditEvidence([...evidenceAuditEntries, ...candidateEntries]);
    const heldBackTexts = new Set(
      audit.conflicts
        .filter((conflict) => conflict.factA.id.startsWith("pending::") !== conflict.factB.id.startsWith("pending::"))
        .map((conflict) => (conflict.factA.id.startsWith("pending::") ? conflict.factA.text : conflict.factB.text)),
    );
    const cleared = candidates.filter((candidate) => !heldBackTexts.has(candidate));
    const heldBack = candidates.filter((candidate) => heldBackTexts.has(candidate));

    setDocuments((current) => current.map((document) => document.id === documentId ? { ...document, approved: [...new Set([...document.approved, ...cleared])] } : document));
    const additions = cleared.filter((candidate) => !isOverlappingFact(candidate, facts));
    if (additions.length) setProfile({ ...profile, facts: [...facts, ...additions].join("\n") });

    setNotice(heldBack.length
      ? `${cleared.length} career facts approved. ${heldBack.length} held back for individual review — ${heldBack.length === 1 ? "it" : "they"} may conflict with an already-approved fact from a different source. See the consistency check below.`
      : `${cleared.length} career facts approved. Review or edit them any time in Career profile.`);
  }

  function addCompany() {
    if (!companyName.trim()) { setNotice("Add a company or agency name first"); return; }
    setCompanies([{ id: createId(), name: companyName.trim(), website: companyWebsite.trim(), careers: companyCareers.trim(), kind: companyKind, focus: companyFocus.trim(), market: "Bay Area / U.S.", status: "Researching", lastChecked: "Not checked", notes: "" }, ...companies]);
    setCompanyName(""); setCompanyWebsite(""); setCompanyCareers(""); setNotice("Target added to your directory");
  }

  function loadCompanyForRole(target: CompanyTarget) {
    setCompany(target.name); setView("workspace"); setNotice("Company loaded into the role workspace");
  }

  function updateResumeTrack(trackId: string, patch: Partial<ResumeTrack>) {
    setResumeTracks(normalizedTracks.map((track) => track.id === trackId ? { ...track, ...patch } : track));
  }

  function addResumeTrack() {
    if (normalizedTracks.length >= 12) { setNotice("V’s supports up to 12 résumé tracks."); return; }
    const id = `track-${createId().slice(0, 8)}`;
    setResumeTracks([...normalizedTracks, { id, name: "New résumé direction", headline: "", summary: "", focus: [] }]);
    setActiveTrackId(id);
    setNotice("New résumé track added. Give it a name, headline, summary, and matching role terms.");
  }

  async function disconnectLinkedin() {
    try {
      const response = await fetch("/api/linkedin/disconnect", { method: "POST" });
      const data = await readJsonResponse<{ ok?: boolean; message?: string }>(response, "LinkedIn sign-in could not be disconnected.");
      if (!response.ok || !data.ok) throw new Error(data.message || "LinkedIn sign-in could not be disconnected.");
      setLinkedinStatus({ state: "ready", configured: true, connected: false, message: data.message || "LinkedIn sign-in disconnected." });
      setNotice("Official LinkedIn identity disconnected. Imported files remain in your private knowledge library.");
    } catch (cause) {
      logError("connection", "linkedin_disconnect_failed", cause);
      setNotice(cause instanceof Error ? cause.message : "LinkedIn sign-in could not be disconnected.");
    }
  }

  function exportWorkspace() {
    download("v-jobs-private-workspace.json", JSON.stringify({ product: "V's Job Seeker", exportedAt: new Date().toISOString(), ...workspaceSnapshot }, null, 2), "application/json");
  }

  function createErrorReport() {
    return JSON.stringify({
      product: "V's Job Seeker",
      build: APP_BUILD,
      generatedAt: new Date().toISOString(),
      aiConnection: { state: aiConnection.state, authenticated: aiConnection.authenticated, authorized: aiConnection.authorized, selectedProvider: selectedProvider?.id || aiPreference.provider, configured: Boolean(selectedProvider?.configured), ready: aiReady, model: aiModel },
      privacy: "No résumé text, approved facts, raw documents, profile fields, credentials, or API keys are included.",
      errors: errorLog,
    }, null, 2);
  }

  return (
    <main className="app-shell">
      <aside className="nav-panel">
        <button className="wordmark" onClick={() => setView("workspace")}><span>V&apos;S</span><small>JOB SEEKER</small></button>
        <nav>
          {([['workspace','Role workspace'],['radar','Job radar'],['search','Open job search'],['companies','Target directory'],['profile','Career profile'],['documents','Knowledge sources'],['voice','Writing voice'],['connections','Connections'],['applications','Applications'],['autofill','Autofill assistant'],['ai','AI & reliability'],['data','Data & versions']] as [View,string][]).map(([id,label]) =>
            <button key={id} className={view === id ? "nav-item active" : "nav-item"} onClick={() => { setView(id); if (id === "data" && workspaceHistoryState === "idle") window.setTimeout(() => void loadWorkspaceHistory(), 0); }}>{label}</button>
          )}
        </nav>
        <div className="nav-note"><strong>Private workspace</strong><span>Your browser keeps a fast local copy. Signed-in durable backups preserve every revision across devices.</span></div>
      </aside>

      <section className="main-stage">
        <header className="topbar"><div><span className="kicker">V&apos;S PRIVATE JOB SEARCH OS</span><h1>{view === "workspace" ? "Turn a role into an evidence-backed application." : view === "radar" ? "Put the right companies on your daily radar." : view === "search" ? "Search every board the radar cannot reach." : view === "profile" ? "Your verified career profile." : view === "documents" ? "Build the knowledge behind every application." : view === "voice" ? "Teach every letter how you write." : view === "connections" ? "Connect sources without giving up control." : view === "companies" ? "Build your target list with intent." : view === "applications" ? "Your application pipeline." : view === "autofill" ? "Fill forms without starting over." : view === "data" ? "Recover and preserve every version." : "Choose and understand your AI."}</h1></div><button className={`status-pill workspace-sync ${workspaceSync.state}`} onClick={() => void saveWorkspaceBackup(workspaceSnapshot, true)} disabled={workspaceSync.state === "saving"} title={workspaceSync.message}><i /> {workspaceSync.state === "saving" ? "Saving private revision…" : workspaceSync.state === "error" ? "Browser saved · retry backup" : workspaceSync.lastSavedAt ? "Private backup current" : "Private backup ready"}</button></header>
        {notice && <button className={`notice ${noticeTone(notice)}`} onClick={() => setNotice("")}>{notice} ×</button>}
        {operationProgress && <div className="operation-status global-operation" role="status" aria-live="polite"><i /><div><strong>{operationProgress.label}</strong><span>{operationProgress.detail}</span></div></div>}

        {view === "workspace" && <div className="workspace-grid">
          <section className="input-card">
            <div className="step"><b>01</b><span>ROLE INTAKE</span></div>
            <div className="link-intake"><label>Job link<input type="url" value={roleUrl} onChange={(event) => { setRoleUrl(event.target.value); setLinkAssist(null); }} placeholder="Copy a job link, then press Command–V" /></label><div><button onClick={() => pasteFromClipboard(setRoleUrl, "job link")}>Paste link</button><button onClick={pasteVisibleRoleCapture}>Paste visible-page capture</button><button className="primary" onClick={() => readRoleFromLink()} disabled={roleReading}>{roleReading ? "Reading and extracting…" : "Read public job page"}</button></div><small>Employer and ATS pages can usually be read directly. For LinkedIn, Indeed, and login-only pages, use the companion’s “Copy visible job page” while you are viewing the page, then paste it here.</small></div>
            {linkAssist && <div className={`link-assist ${linkAssist.kind}`}><div><span>USE THE PAGE YOU CAN SEE</span><strong>{linkAssist.title}</strong><p>{linkAssist.message} Your LinkedIn login stays in your browser. V’s never receives your password or LinkedIn cookies.</p></div><div>{/^https?:\/\//i.test(roleUrl) && <a href={roleUrl} target="_blank" rel="noreferrer">Open original job ↗</a>}<button className="primary" onClick={() => { void pasteFromClipboard(setJobText, "job description"); setLinkAssist(null); }}>Paste copied job text</button></div></div>}
            <div className="field-row"><label>Company<input value={company} onChange={(e) => setCompany(e.target.value)} placeholder="e.g. Apple" /></label><label>Role title<input value={role} onChange={(e) => setRole(e.target.value)} placeholder="e.g. Brand Project Manager" /></label></div>
            <div className="track-selector"><label>Résumé direction<select value={activeTrackId} onChange={(event) => setActiveTrackId(event.target.value)}><option value="auto">Auto-select from the role</option>{normalizedTracks.map((track) => <option key={track.id} value={track.id}>{track.name}</option>)}</select></label><div><span>{trackSelection.automatic ? "AUTO MATCH" : "MANUAL"}</span><strong>{selectedTrack.name}</strong><small>{selectedTrack.headline || "Add a headline in Career profile → Résumé tracks"}</small></div></div>
            <label>Job description<textarea value={jobText} onBlur={() => { if (jobText.trim().length >= 80) { saveMarketSnapshot("pasted"); setNotice("Job description saved to private market learning."); } }} onChange={(e) => setJobText(e.target.value)} placeholder="Paste the complete job description here, or import it from the public job link above." /></label>
            {(!evidenceSources.length || facts.length < 3) && <button className="knowledge-cta" onClick={() => setView("documents")}><span>YOUR SOURCE OF TRUTH</span><strong>Upload knowledge sources</strong><small>Add your résumé, Custom GPT content, résumé rules, and writing samples. Personal claims require your approval.</small></button>}
            <div className="input-actions"><button className="primary" onClick={() => setOutput("analysis")}>Analyze locally</button><button onClick={runCloudRecommendation} disabled={aiRunning}>{aiRunning ? "Running secure review…" : aiReady ? `Review with ${aiProviderName}` : "Cloud AI setup"}</button><button onClick={() => { saveMarketSnapshot("pasted"); setNotice("Saved to market learning. This does not create an application."); }}>Save description</button><button onClick={saveApplication}>Save to applications</button><button onClick={() => { setJobText(""); setCompany(""); setRole(""); setRoleUrl(""); setDraftEditor(""); setDraftEditorKey(""); setDraftIsExternal(false); }}>Clear</button></div>
            <div className="workspace-feedback" aria-live="polite"><strong>{jobSnapshots.length} saved job descriptions</strong><span>Descriptions are preserved for market learning; “Save to applications” creates a separate pipeline record.</span></div>
          </section>

          <section className="output-card">
            <div className="output-tabs">{([['analysis','Fit'],['resume','Résumé'],['cover','Cover letter'],['answers','Answers']] as [Output,string][]).map(([id,label]) => <button key={id} className={output === id ? "selected" : ""} onClick={() => setOutput(id)}>{label}</button>)}</div>
            {output === "analysis" ? <div className="analysis-view">
              <section className={`recommendation-card ${activeRecommendation.tone}`}>
                <div className="recommendation-top"><div><span>{currentCloudReview ? `${currentCloudReview.providerName.toUpperCase()} REVIEW — APPROVED FACTS ONLY` : "VERIFIED LOCAL RECOMMENDATION"}</span><h2>{activeRecommendation.label}</h2></div><strong>{activeRecommendation.confidence}</strong></div>
                <p>{activeRecommendation.reason}</p>
                <ol>{activeRecommendation.actions.map((action) => <li key={action}>{action}</li>)}</ol>
                {currentCloudReview && <div className="cloud-audit">
                  <div><span>Priority evidence</span>{currentCloudReview.recommendation.priorityFacts.length ? <ul>{currentCloudReview.recommendation.priorityFacts.map((fact) => <li key={fact}>{fact}</li>)}</ul> : <p>No approved fact was selected as priority evidence.</p>}</div>
                  <div><span>Evidence gaps & cautions</span>{[...currentCloudReview.recommendation.evidenceGaps, ...currentCloudReview.recommendation.cautions].length ? <ul>{[...currentCloudReview.recommendation.evidenceGaps, ...currentCloudReview.recommendation.cautions].map((item) => <li key={item}>{item}</li>)}</ul> : <p>No additional gaps were returned. Human review is still required.</p>}</div>
                  {currentCloudReview.recommendation.evidenceMap?.length ? <div><span>Cloud evidence trace</span><ul>{currentCloudReview.recommendation.evidenceMap.slice(0, 8).map((item) => <li key={item.requirement}><strong>{item.support.toUpperCase()}</strong> · {item.requirement}{item.facts.length ? ` — ${item.facts.join("; ")}` : " — no approved support"}</li>)}</ul></div> : null}
                  {currentCloudReview.usage && <div><span>Usage audit</span><p>{currentCloudReview.usage.totalTokens.toLocaleString()} total tokens · {currentCloudReview.usage.inputTokens.toLocaleString()} input · {currentCloudReview.usage.outputTokens.toLocaleString()} output{currentCloudReview.usage.cachedTokens ? ` · ${currentCloudReview.usage.cachedTokens.toLocaleString()} cached` : ""}{(() => { const cost = estimateUsageCost(currentCloudReview.provider, currentCloudReview.modelKey, currentCloudReview.usage); return cost != null ? ` · ${formatEstimatedCost(cost)} estimated` : ""; })()}. No prompt or career-fact text is stored in the audit log.</p></div>}
                </div>}
                <div className="recommendation-actions"><button className="primary" onClick={() => setOutput("resume")}>Open tailored résumé</button><button onClick={saveApplication}>Save to pipeline</button><button onClick={runCloudRecommendation} disabled={aiRunning}>{aiRunning ? "Checking…" : currentCloudReview ? `Refresh with ${currentCloudReview.providerName}` : aiReady ? `Run ${aiProviderName} review` : "See AI setup"}</button></div>
                <small>{currentCloudReview ? `${currentCloudReview.modelLabel} (${currentCloudReview.model}) · Structured response validated · Local fallback active` : `${analysis.version} · Deterministic · Works without an internet connection`}. Based only on approved facts and the pasted role. It never invents experience or predicts hiring.</small>
              </section>
              <div className="fit-score"><strong>{fit ? `${fit}%` : "—"}</strong><span>{fit ? "Evidence match" : "Paste a role"}</span></div>
              <div className="score-breakdown"><div><span>Requirement coverage</span><strong>{requirements.length ? `${evidenceCoverage}%` : "—"}</strong><small>{evidenceCounts.strong} strong · {evidenceCounts.partial} partial · {evidenceCounts.gaps} gaps</small></div><div><span>Profile readiness</span><strong>{profileReadiness}%</strong><small>Name, contact, headline, summary, facts</small></div><div><span>Source quality</span><strong>{sourceQuality}%</strong><small>{evidenceSources.length} evidence sources · {facts.length} approved facts</small></div></div>
              <div><h2>Hiring signals</h2><div className="chips">{roleKeywords.length ? roleKeywords.map((key) => <span key={key}>{key}</span>) : <p>Keywords and requirements will appear here.</p>}</div></div>
              <div><h2>Likely requirements</h2><ul>{requirements.length ? requirements.map((r) => <li key={r}>{r}</li>) : <li>Paste the complete posting to extract requirements.</li>}</ul></div>
              <div className="evidence-map"><div className="evidence-head"><h2>Requirement → evidence map</h2><span>{evidenceMap.filter((item) => item.strength !== "Gap").length}/{evidenceMap.length || 0} supported</span></div>{evidenceMap.length ? evidenceMap.map((item) => <article key={item.requirement}><div><span className={`strength ${item.strength.toLowerCase()}`}>{item.strength}</span><p>{item.requirement}</p></div>{item.evidence.length ? <ul>{item.evidence.map((match) => <li key={match.fact}><strong>{match.fact}</strong><small>Source: {match.source}</small></li>)}</ul> : <p className="gap-copy">No approved evidence found. Ask for clarification or leave this claim out.</p>}</article>) : <p className="gap-copy">Paste a complete posting to map its requirements to approved facts.</p>}</div>
              <div className="truth-check"><strong>Truth check</strong><p>The score measures approved evidence coverage and profile readiness—not your chance of being hired. Unknown metrics and experience must be reviewed by you.</p><ul><li>{matchedFacts.length} approved facts are currently relevant to this role.</li><li>{firstGap ? `First unsupported requirement: ${firstGap}` : roleKeywords.length ? "Every detected requirement has at least partial evidence; review quality before using it." : "Paste a complete role description to produce a better check."}</li><li>Final application decisions and all sensitive answers remain yours.</li></ul></div>
            </div> : <div className="document-view">
              <div className="document-actions"><span>{output === "resume" ? currentResumeGeneration ? `AI résumé · ${currentResumeGeneration.modelLabel} · evidence validated` : "Local résumé scaffold · generate with a connected model for full tailoring" : output === "cover" ? "Editable working draft — based on approved facts" : "Generated from approved facts"}</span>{(output === "resume" || output === "cover") && <button onClick={() => openDraftEditor(output)}>Edit draft</button>}{(output === "resume" || output === "cover") && <button onClick={() => saveDraftVersion(output)}>Save version</button>}<button onClick={() => copyText(activeText, setNotice)}>Copy</button><button onClick={() => download(`tailored-${output}.txt`, activeText)}>Text</button><button onClick={() => downloadWordDocument(`tailored-${output}.doc`, `${profile.name || "Candidate"} — ${output === "resume" ? "Tailored Resume" : output === "cover" ? "Cover Letter" : "Application Answers"}`, activeText, output === "resume" ? "resume" : "prose")}>Word</button><button className="primary" onClick={() => printDocument(`${profile.name || "Candidate"} — ${output === "resume" ? "Tailored Resume" : output === "cover" ? "Cover Letter" : "Application Answers"}`, activeText, output === "resume" ? "resume" : "prose")}>Save as PDF</button></div>
              {(output === "resume" || output === "cover") && <div className="paste-external-draft">
                {pasteDraftOpen ? <>
                  <textarea
                    aria-label={`Paste a drafted ${output === "resume" ? "résumé" : "cover letter"}`}
                    placeholder={`Paste the complete ${output === "resume" ? "résumé" : "cover letter"} text here — for example, output from the resume-tailor Skill run in a separate Claude conversation.`}
                    value={pasteDraftText}
                    onChange={(event) => setPasteDraftText(event.target.value)}
                  />
                  <div className="paste-external-draft-actions">
                    <button className="primary" onClick={() => applyExternalDraft(output as "resume" | "cover")}>Use this draft</button>
                    <button onClick={() => { setPasteDraftOpen(false); setPasteDraftText(""); }}>Cancel</button>
                  </div>
                </> : <div className="paste-external-draft-actions"><button className="primary" onClick={() => copyText(claudeSubscriptionPrompt(output as "resume" | "cover"), setNotice)}>Copy Claude prompt</button><button onClick={() => setPasteDraftOpen(true)}>Paste a drafted {output === "resume" ? "résumé" : "cover letter"}</button></div>}
                <small>Use your regular Claude subscription instead of a paid API key: <b>Copy Claude prompt</b> bundles this role, your approved facts, playbook rules, positioning, and your writing voice into one message. Open a Claude chat with <b>{CLAUDE_MODEL_OPTIONS.find((option) => option.id === claudeModel)?.label || "Claude Sonnet"}</b> (change the model and tone in AI &amp; reliability), paste it, then paste Claude&rsquo;s reply back here with <b>Paste a drafted {output === "resume" ? "résumé" : "cover letter"}</b> — it is scored, versioned, and exported exactly like a cloud-generated draft.</small>
              </div>}
              {output === "resume" && <div className="resume-ai-toolbar">
                <div><span>RÉSUMÉ ENGINE</span><strong>{selectedProvider?.name || "Choose a provider"} · {selectedModel?.label || "Choose a model"}</strong><small>Generation writes the résumé. Review audits the current draft without changing it.</small></div>
                <label>Provider<select value={aiPreference.provider} onChange={(event) => { const next = aiConnection.providers.find((item) => item.id === event.target.value); if (next) setAiPreference({ provider: next.id, modelKey: next.defaultModelKey }); }}>{aiConnection.providers.map((provider) => <option key={provider.id} value={provider.id} disabled={!provider.configured}>{provider.name}{provider.configured ? "" : " · not connected"}</option>)}</select></label>
                <label>Model<select value={selectedModel?.key || aiPreference.modelKey} onChange={(event) => selectedProvider && setAiPreference({ provider: selectedProvider.id, modelKey: event.target.value as AiModelKey })}>{selectedProvider?.models.map((model) => <option key={model.key} value={model.key}>{model.label}</option>)}</select></label>
                <button className="primary" onClick={generateResumeWithAi} disabled={Boolean(resumeAiRunning)}>{resumeAiRunning === "generate" ? "Creating résumé…" : `Generate with ${selectedProvider?.name || "AI"}`}</button>
                <button onClick={reviewResumeWithAi} disabled={Boolean(resumeAiRunning)}>{resumeAiRunning === "review" ? "Reviewing résumé…" : `Review with ${selectedProvider?.name || "AI"}`}</button>
              </div>}
              {output === "resume" && <div className={`playbook-banner ${approvedPlaybookRules.length ? "active" : "empty"}`}><div><span>RÉSUMÉ PLAYBOOK</span><strong>{userPlaybookRules.length} uploaded rules first · {curatedPlaybookRules.length} curated rules second</strong><small>{approvedPlaybookRules.length ? "Generation receives your uploaded rules as the highest-priority editorial instructions. Every candidate claim still requires approved evidence." : "Upload a Résumé playbook source. Detected guidance is activated automatically."}</small></div><button onClick={() => setView("documents")}>{approvedPlaybookRules.length ? "Review rules" : "Add playbook"}</button>{approvedPlaybookRules.length > 0 && <ul>{approvedPlaybookRules.slice(0, 3).map((rule) => <li key={rule}>{rule}</li>)}</ul>}</div>}
              {output === "cover" && knowledgeStats.voice > 0 && <div className="playbook-banner active"><div><span>WRITING VOICE</span><strong>{knowledgeStats.voice} uploaded voice {knowledgeStats.voice === 1 ? "source" : "sources"}</strong><small>Voice affects phrasing only; approved career facts remain the truth boundary.</small></div><button onClick={() => setView("voice")}>Review voice</button></div>}
              {(output === "resume" || output === "cover") && draftEditorKey === output ? <textarea className="draft-editor" aria-label={`Editable ${output} draft`} value={draftEditor} onChange={(event) => setDraftEditor(event.target.value)} /> : output === "resume" ? <ResumePaper text={activeText} /> : <pre>{activeText}</pre>}
              {output === "resume" && reusableResumes.length > 0 && draftEditorKey !== "resume" && <div className="resume-reuse">
                <div><span>REUSE A PRIOR VERSION</span><strong>{reusableResumes.length} saved {reusableResumes.length === 1 ? "résumé looks" : "résumés look"} close to this role</strong><small>Adapting one costs nothing and starts from a draft you have already reviewed. The saved version stays unchanged.</small></div>
                <ul>{reusableResumes.map((item) => <li key={item.draft.id}>
                  <div><b>{item.draft.title}</b><i>{item.score}% match</i></div>
                  <span>{item.draft.company || "No company recorded"} · {item.draft.role || "No role recorded"}{item.draft.versionNumber ? ` · v${item.draft.versionNumber}` : ""}</span>
                  <em>{item.reasons.length ? `Matched on ${item.reasons.join(", ")}.` : "Matched on overall similarity."}</em>
                  <button onClick={() => reusePriorResume(item.draft.id)}>Adapt this version</button>
                </li>)}</ul>
              </div>}
              {output === "resume" && resumeAudit && <div className="resume-standards">
                <div className="resume-standards-head">
                  <div><span>RÉSUMÉ STANDARDS</span><strong>{resumeAudit.score}<i>/10</i></strong><small>Your résumé-tailor rules, checked on this draft. Runs offline — no model, no API key, no cost. It reports; every wording change stays yours.</small></div>
                  <div className="resume-standards-grid">{RESUME_STANDARD_DIMENSIONS.map((dimension) => <div key={dimension.key} className={`tier-${resumeAudit.scores[dimension.key]}`}><span>{dimension.label}</span><strong>{resumeAudit.scores[dimension.key]}<i>/2</i></strong><small>{dimension.detail}</small></div>)}</div>
                </div>
                <div className="resume-standards-stats">
                  <span>{resumeAudit.stats.words} words</span>
                  <span>{resumeAudit.stats.quantifiedBullets}/{resumeAudit.stats.bullets} bullets with a number</span>
                  <span>{resumeAudit.stats.skills} skills</span>
                  {resumeAudit.stats.keywordCoverage !== null && <span>{resumeAudit.stats.keywordCoverage}% of the posting&rsquo;s repeated terms used</span>}
                </div>
                {resumeAudit.findings.length > 0
                  ? <ul>{resumeAudit.findings.slice(0, 12).map((finding, index) => <li key={`${finding.dimension}-${index}`} className={finding.severity}><b>{finding.dimension}</b>{finding.message}{finding.line && <em>{finding.line.length > 120 ? `${finding.line.slice(0, 120)}…` : finding.line}</em>}</li>)}</ul>
                  : <p className="resume-standards-clear">Every standard passed on this draft.</p>}
                {resumeAudit.findings.length > 12 && <p className="resume-standards-more">{resumeAudit.findings.length - 12} further findings are not listed.</p>}
              </div>}
              {output === "resume" && !currentResumeGeneration && localResumeDocument && localResumeDocument.omissions.length > 0 && <div className="resume-provenance"><strong>{localResumeDocument.omissions.length} approved {localResumeDocument.omissions.length === 1 ? "fact was" : "facts were"} not placed automatically</strong><span>Nothing was deleted — these facts stay in your career profile. Edit the draft to add any that matter for this role, or connect a model for full tailoring.</span><ul className="resume-omissions">{localResumeDocument.omissions.map((omission) => <li key={omission}>{omission.replace(/^Approved fact not placed automatically: /, "")}</li>)}</ul></div>}
              {output === "resume" && currentResumeGeneration?.quality && <div className="resume-quality">
                <div className="resume-quality-head">
                  <div><span>DRAFT REPORT</span><strong>{currentResumeGeneration.quality.score}<i>/100</i></strong><small>Measures how much approved evidence this draft uses and how completely it is built — not your chance of being hired.</small></div>
                  <div className="resume-quality-grid">
                    <div><span>Evidence used</span><strong>{currentResumeGeneration.quality.evidenceUsed}/{currentResumeGeneration.quality.evidenceAvailable}</strong></div>
                    <div><span>Playbook rules followed</span><strong>{currentResumeGeneration.quality.playbookEvaluated ? `${currentResumeGeneration.quality.playbookFollowed}/${currentResumeGeneration.quality.playbookEvaluated}` : "—"}</strong></div>
                    <div><span>Bullets</span><strong>{currentResumeGeneration.quality.bulletCount}</strong></div>
                    <div><span>Words</span><strong>{currentResumeGeneration.quality.wordCount}</strong></div>
                  </div>
                </div>
                {currentResumeGeneration.quality.checks.length > 0
                  ? <ul>{currentResumeGeneration.quality.checks.map((note) => <li key={note}>{note}</li>)}</ul>
                  : <p className="resume-quality-clear">Nothing was flagged for review in this draft.</p>}
              </div>}
              {output === "resume" && currentResumeGeneration && <div className="resume-provenance"><strong>Generated by {currentResumeGeneration.modelLabel}</strong><span>{facts.length} approved facts · {userPlaybookRules.length} uploaded rules · {curatedPlaybookRules.length} secondary rules · {currentResumeGeneration.usage?.totalTokens ? `${currentResumeGeneration.usage.totalTokens.toLocaleString()} tokens` : "usage unavailable"}{currentResumeGeneration.modelKey && currentResumeGeneration.usage ? (() => { const cost = estimateUsageCost(currentResumeGeneration.provider, currentResumeGeneration.modelKey, currentResumeGeneration.usage); return cost != null ? ` · ${formatEstimatedCost(cost)} estimated` : ""; })() : ""}</span><small>{currentResumeGeneration.result.omissions.length ? `Omitted as unsupported: ${currentResumeGeneration.result.omissions.join("; ")}` : "No unsupported requirement was inserted into the draft."}</small></div>}
              {output === "resume" && resumeReview && <div className={`resume-review-card ${resumeReview.result.verdict}`}><div><span>{resumeReview.providerName.toUpperCase()} REVIEW · {resumeReview.modelLabel}</span><strong>{resumeReview.result.score}/100 · {resumeReview.result.verdict.replaceAll("_", " ")}</strong></div>{resumeReview.result.unsupported_claims.length > 0 && <section><b>Unsupported or overstated claims</b><ul>{resumeReview.result.unsupported_claims.map((item) => <li key={item}>{item}</li>)}</ul></section>}<section><b>Recommended improvements</b><ul>{resumeReview.result.improvements.map((item) => <li key={item}>{item}</li>)}</ul></section><small>This review did not edit the résumé. Apply only the changes you approve.</small></div>}
            </div>}
          </section>
        </div>}

        {view === "radar" && <RadarWorkspace savedLinkedInJobs={linkedInSavedJobs} onOpenJobSearch={() => setView("search")} onPrepare={prepareRadarOpportunity} onNotice={setNotice} onError={(code, message, context) => logError("radar", code, message, context)} />}

        {view === "search" && <JobSearchWorkspace onNotice={setNotice} onError={(code, message, context) => logError("job-search", code, message, context)} />}

        {view === "ai" && <section className="ai-reliability">
          <div className="ai-status-card">
            <div className="step"><b>AI</b><span>CONNECTION & RELIABILITY</span></div>
            <div className="connection-heading"><div><span className={`connection-dot ${aiConnection.state === "loaded" && aiReady ? "ready" : aiConnection.state}`} /><div><small>SELECTED CLOUD CONNECTION</small><h2>{aiConnection.state === "checking" ? "Checking…" : aiReady ? "Connected" : !selectedProvider?.configured ? "Setup required" : !aiConnection.authenticated ? "Sign-in required" : "Access not allowed"}</h2></div></div><button onClick={recheckAiConnection} disabled={aiConnection.state === "checking"}>Recheck</button></div>
            <p>{aiConnectionMessage}</p>
            <div className="setup-note"><strong>No API key? Use your Claude subscription</strong><p>A Claude Max or Pro plan cannot be plugged in as an API key — consumer subscriptions and API billing are separate on purpose. But every drafting feature here works without one: on the Résumé and Cover letter tabs, <b>Copy Claude prompt</b> packages the role, your approved facts, and your playbook into one message for a normal Claude conversation, and <b>Paste a drafted…</b> brings the reply back as a scored, versioned draft. Job Radar scanning, fit analysis, the standards report, and the autofill companion never call a paid model at all.</p></div>
            <div className="setup-note"><strong>Drafting style — Claude model &amp; tone</strong>
              <div className="field-row">
                <label>Claude model for drafting<select value={claudeModel} onChange={(event) => setClaudeModel(event.target.value)}>{CLAUDE_MODEL_OPTIONS.map((option) => <option key={option.id} value={option.id}>{option.label} — {option.description}</option>)}</select></label>
                <label>Apply a tone preset<select value="" onChange={(event) => { const preset = TONE_PRESETS.find((item) => item.id === event.target.value); if (!preset) return; setWritingStyle({ ...writingStyle, tone: preset.tone, prefer: preset.prefer, avoid: preset.avoid }); setNotice(`Tone set to “${preset.label}”. Every cover letter, Claude prompt, and the daily automation now use it — fine-tune it anytime in Writing voice.`); }}><option value="">Choose a preset…</option>{TONE_PRESETS.map((preset) => <option key={preset.id} value={preset.id}>{preset.label}</option>)}</select></label>
              </div>
              <p>The model choice is remembered for the <b>Copy Claude prompt</b> flow and for the scheduled daily drafting. A tone preset rewrites the three Writing-voice fields in one click; your learned voice stays available — press <b>Relearn</b> in Writing voice to go back to it.</p>
            </div>
            <div className="model-diagnostics-actions">
              <button onClick={runModelDiagnostics} disabled={aiDiagnostics.state === "checking"}>{aiDiagnostics.state === "checking" ? "Checking…" : "Check model catalog access"}</button>
              {selectedProvider?.configured && selectedModel && <button onClick={runLiveGenerationCheck} disabled={aiDiagnostics.state === "checking"}>Test real generation with {selectedModel.label}</button>}
              <small>{aiDiagnostics.state === "idle" ? "Catalog check validates the key and exact model access without generating résumé text. The generation test also spends one small, real request." : null}</small>
            </div>
            {aiDiagnostics.state !== "idle" && <div className={`ai-model-diagnostics ${aiDiagnostics.state}`}><div><strong>Live model-access check</strong><span>{aiDiagnostics.checkedAt ? `Checked ${new Date(aiDiagnostics.checkedAt).toLocaleString()}` : aiDiagnostics.message}</span></div>{aiDiagnostics.providers.map((provider) => <article key={provider.id}><strong>{provider.name}</strong><span>{provider.message}</span><ul>{provider.models.map((model) => <li key={model.key} className={model.generationAvailable === false || !model.available ? "unavailable" : "available"}>{model.id} · {model.generationAvailable === true ? "generation verified" : model.generationAvailable === false ? model.generationReason || "generation failed" : model.available ? "catalog available" : "unavailable"}</li>)}</ul></article>)}</div>}

            <div className="provider-picker"><span>1 · Choose a provider</span><div>{aiConnection.providers.map((provider) => <button key={provider.id} className={selectedProvider?.id === provider.id ? "selected" : ""} onClick={() => setAiPreference({ provider: provider.id, modelKey: provider.defaultModelKey })}><strong>{provider.name}</strong><small>{provider.configured ? "Connected secret" : `Needs ${provider.keyName}`}</small></button>)}</div></div>
            {selectedProvider && <div className="model-picker"><span>2 · Choose a model</span><div>{selectedProvider.models.map((model) => <button key={model.key} className={selectedModel?.key === model.key ? "selected" : ""} aria-pressed={selectedModel?.key === model.key} onClick={() => setAiPreference({ provider: selectedProvider.id, modelKey: model.key })}><span>{model.tier}</span><strong>{model.label}</strong><small>{model.description}</small><code>{model.id}</code></button>)}</div></div>}

            <div className="engine-status"><div><span>Local evidence engine</span><strong>Always active</strong><small>Instant, deterministic, private to this browser</small></div><div><span>Selected cloud review</span><strong>{selectedModelGenerationBlocked ? "Generation blocked" : aiReady ? "Ready" : selectedProvider?.configured ? !aiConnection.authenticated ? "Sign-in required" : "Access restricted" : "Setup required"}</strong><small>{aiProviderName} · {selectedModel?.label || aiModel} · only after your click</small></div></div>
            {selectedProvider && !selectedProvider.configured && <div className="setup-note"><strong>Connect {selectedProvider.name}</strong><p>Add <code>{selectedProvider.keyName}</code> as a protected secret in your deployment (a Cloudflare Worker secret, or a GitHub Actions secret if it is deployed automatically), then redeploy. Create the key in that provider&apos;s developer console; API access and billing are separate from consumer chat subscriptions. Never paste a key into chat or this app, commit it to GitHub, or store it in browser data.</p></div>}
            {selectedProvider?.configured && !aiReady && <div className="setup-note"><strong>Access protection is working</strong><p>{aiConnection.authenticated ? "Add this account to the optional AI_ALLOWED_EMAILS deployment allowlist, or remove the allowlist restriction." : "Sign in to V’s Job Seeker first. Protected provider keys are never exposed to anonymous visitors."}</p></div>}
            {aiReady && !selectedModelGenerationBlocked && <div className="ready-note"><strong>{selectedModel?.label} is ready</strong><span>V’s sends one protected request only when you click a cloud-review button. Switching the selector changes the next review, not the local engine.</span></div>}
            {selectedModelGenerationBlocked && <div className="setup-note"><strong>{selectedModel?.label} is listed but cannot generate</strong><p>{selectedModelDiagnostic?.generationReason} Fix that provider project or choose another verified model, then rerun the selected-generation test.</p></div>}
            <div className="model-comparison">
              <div><span>OPTIONAL MODEL LAB</span><strong>Compare one, two, or three {selectedProvider?.name || "provider"} models</strong><p>Each model receives the same current role and approved facts. Every selected model uses one API request and runs only after your click.</p></div>
              <label>Number of models<select value={comparisonCount} onChange={(event) => setComparisonCount(Number(event.target.value) as 1 | 2 | 3)}><option value={1}>1 model</option><option value={2}>2 models</option><option value={3}>3 models</option></select></label>
              <button className="primary" onClick={compareSelectedModels} disabled={!aiUsable || comparisonRunning}>{comparisonRunning ? "Comparing models…" : `Run ${comparisonCount}-model comparison`}</button>
              {comparisonResults.length > 0 && <div className="comparison-results">{comparisonResults.map((review) => <article key={`${review.provider}-${review.model}`}><div><span>{review.modelLabel}</span><code>{review.model}</code></div><strong>{review.recommendation.decision.replaceAll("_", " ")}</strong><p>{review.recommendation.summary}</p><small>{review.recommendation.confidence} confidence · {review.recommendation.evidenceGaps.length} evidence gaps</small><button onClick={() => { setAiPreference({ provider: review.provider, modelKey: review.modelKey }); setCloudReview(review); setOutput("analysis"); setView("workspace"); setNotice(`${review.modelLabel} selected for the current recommendation.`); }}>Use this review</button></article>)}</div>}
            </div>
          </div>

          <div className="ai-explainer">
            <div className="section-head"><div><span>THE CONNECTION</span><h2>One adapter, several AI choices, one truth boundary.</h2></div><p>Your browser keeps the working copy and signed-in durable backup preserves private revisions. The selected AI provider receives only the current role, company/title, approved career facts, and a small local score summary.</p></div>
            <ol className="connection-flow">
              <li><b>1</b><div><strong>You approve the evidence</strong><span>Uploaded documents become reusable only after you approve each career fact.</span></div></li>
              <li><b>2</b><div><strong>Local analysis runs first</strong><span>The built-in engine maps requirements to approved facts and always remains available.</span></div></li>
              <li><b>3</b><div><strong>You choose “Run cloud AI review”</strong><span>Nothing is sent simply because you pasted, uploaded, or opened a role.</span></div></li>
              <li><b>4</b><div><strong>The protected backend calls your selected provider</strong><span>OpenAI, Anthropic Claude, and Google Gemini use separate server-only keys and allowlisted models. A structured response format limits the result to expected fields.</span></div></li>
              <li><b>5</b><div><strong>V’s validates the answer</strong><span>Priority evidence can point only to facts you approved. On timeout or error, the local recommendation stays visible.</span></div></li>
            </ol>
          </div>

          <div className="guardrail-grid">
            <article><span>DATA SENT</span><strong>Minimum necessary</strong><p>Fit review sends the pasted job, company/title, approved facts, and local coverage. Résumé generation also sends the extracted rules you activated—uploaded rules first, curated rules second.</p></article>
            <article><span>DATA NOT SENT TO AI</span><strong>Raw knowledge stays outside model requests</strong><p>No raw uploaded files, full playbook documents, writing samples, research sources, browser history, LinkedIn credentials, demographic answers, or API keys are sent to a provider.</p></article>
            <article><span>TRUTH BOUNDARY</span><strong>No invented experience</strong><p>The model cannot return a priority fact outside your approved list. Missing proof is labeled as a gap.</p></article>
            <article><span>FAILURE MODE</span><strong>Useful even offline</strong><p>Rate limits, model errors, or connection problems fall back to the tested local recommendation engine.</p></article>
          </div>

          <div className="diagnostic-card">
            <div className="diagnostic-head"><div><span>PRIVATE DIAGNOSTICS</span><h2>Error report</h2><p>V’s keeps the latest 50 technical errors in this browser so you can send a useful report when something fails. Personal profile content and document text are excluded.</p></div><strong>{errorLog.length} {errorLog.length === 1 ? "error" : "errors"} recorded</strong></div>
            {errorLog.length ? <div className="error-list">{errorLog.slice(0, 8).map((entry) => <article key={entry.id}><div><strong>{entry.code.replaceAll("_", " ")}</strong><span>{entry.area} · {new Date(entry.timestamp).toLocaleString()}</span></div><p>{entry.message}</p></article>)}</div> : <div className="diagnostic-empty"><strong>No errors recorded.</strong><span>If a connection, AI review, document import, or unexpected browser action fails, it will appear here.</span></div>}
            <div className="diagnostic-actions"><button className="primary" onClick={() => copyText(createErrorReport(), setNotice)}>Copy report</button><button onClick={() => download(`v-jobs-error-report-${new Date().toISOString().slice(0, 10)}.json`, createErrorReport(), "application/json")}>Download JSON</button><button onClick={() => { setErrorLog([]); setNotice("Local error log cleared"); }} disabled={!errorLog.length}>Clear log</button></div>
            <small>Before sending, you can open the JSON and review it. The report contains the app build, connection state, model name, timestamps, safe error messages, and non-sensitive status details.</small>
          </div>
        </section>}

        {view === "connections" && <section className="connections-workspace">
          <div className="connections-hero"><div><span>CONNECTED SOURCES</span><h2>LinkedIn and job boards, without scraping or sharing passwords.</h2><p>V’s uses the strongest access each service officially permits. Your profile URL and official LinkedIn export can enrich your evidence; private job recommendations and LinkedIn AI advice are not exposed through a general member API.</p></div><div className="connection-verdict"><strong>{linkedinStatus.connected ? "LinkedIn identity connected" : "Safe import available now"}</strong><span>{linkedinStatus.message}</span></div></div>
          <div className="connections-grid">
            <article className="linkedin-card">
              <div className="integration-title"><div className="linkedin-mark">in</div><div><span>LINKEDIN</span><h3>Your professional source</h3></div></div>
              <label>LinkedIn profile URL<input type="url" value={profile.linkedin} onChange={(event) => setProfile({ ...profile, linkedin: event.target.value })} placeholder="https://www.linkedin.com/in/…" /></label>
              <div className={`linkedin-login-status ${linkedinStatus.connected ? "connected" : ""}`}><strong>{linkedinStatus.state === "checking" ? "Checking official sign-in…" : linkedinStatus.connected ? `Connected as ${linkedinStatus.identity?.name || linkedinStatus.identity?.email || "LinkedIn member"}` : linkedinStatus.configured ? "Official sign-in is ready" : "Developer credentials required"}</strong><span>{linkedinStatus.connected ? "Identity only: name, picture, and email. It does not unlock job pages, recommendations, saved jobs, or LinkedIn AI suggestions." : linkedinStatus.message}</span></div>
              <div className="integration-actions">{linkedinStatus.connected ? <button onClick={disconnectLinkedin}>Disconnect official sign-in</button> : linkedinStatus.configured ? <a className="primary-link" href="/api/linkedin/start">Connect official LinkedIn sign-in</a> : <a href="https://www.linkedin.com/developers/apps" target="_blank" rel="noreferrer">Create LinkedIn developer app ↗</a>}<a className="primary-link" href="https://www.linkedin.com/mypreferences/d/download-my-data" target="_blank" rel="noreferrer">Request official data export ↗</a><button onClick={() => { setSourceCategory("LinkedIn export"); setView("documents"); setNotice("Upload LinkedIn’s ZIP here. V’s separates career evidence, saved jobs/AI context, and public writing automatically."); }}>Import LinkedIn ZIP</button><a href="https://www.linkedin.com/my-items/saved-jobs/" target="_blank" rel="noreferrer">Open saved jobs ↗</a></div>
              {!linkedinStatus.configured && <div className="integration-config"><strong>To activate official sign-in</strong><span>Add <code>LINKEDIN_CLIENT_ID</code>, <code>LINKEDIN_CLIENT_SECRET</code>, <code>LINKEDIN_REDIRECT_URI</code>, and <code>LINKEDIN_SESSION_SECRET</code> as protected deployment secrets. The redirect URI must end in <code>/api/linkedin/callback</code>.</span></div>}
              <div className="integration-safety"><strong>The official ZIP is the useful data path</strong><span>LinkedIn’s export can include Profile, Positions, Skills, Recommendations Received, Saved Jobs, Saved Job Alerts, résumé data, AI-powered conversations, Profile Summary AI, Shares, Comments, and Articles. V’s separates these into evidence, research, and writing voice.</span></div>
              <div className="integration-safety"><strong>Never requested</strong><span>Your LinkedIn password, browser cookies, private messages, or session.</span></div>
            </article>

            <article className="api-reality-card">
              <span>OFFICIAL API REALITY</span><h3>What a LinkedIn connection can—and cannot—do</h3>
              <div className="api-capability yes"><b>Available with approval</b><p>LinkedIn OpenID Connect can authenticate you and provide limited identity fields such as name, picture, and email.</p></div>
              <div className="api-capability no"><b>Not generally available</b><p>There is no open member API for your full real-time profile, received recommendations, LinkedIn job recommendations, saved jobs, or arbitrary job search.</p></div>
              <div className="api-capability limited"><b>Restricted partner products</b><p>Talent Solutions APIs focus on approved recruiting partners, ATS integrations, and job posting—not a personal job-recommendation feed.</p></div>
              <div className="integration-actions"><a href="https://learn.microsoft.com/en-us/linkedin/consumer/integrations/self-serve/sign-in-with-linkedin-v2" target="_blank" rel="noreferrer">Review official sign-in API ↗</a><a href="https://www.linkedin.com/developers/apps" target="_blank" rel="noreferrer">LinkedIn developer apps ↗</a></div>
            </article>
            <article className="api-reality-card job-board-card">
              <span>JOB BOARD REFERENCES</span><h3>Indeed and other sites</h3>
              <div className="api-capability yes"><b>Available now</b><p>Paste public Indeed, Glassdoor, and other job-board URLs into Role intake or save them as radar references.</p></div>
              <div className="api-capability limited"><b>Access varies by page</b><p>If the site returns a sign-in or anti-bot page, V’s shows the manual-copy path instead of an unreadable JSON error.</p></div>
              <div className="api-capability no"><b>No candidate-feed shortcut</b><p>Indeed’s official APIs primarily support approved employer, job-posting, and partner workflows. V’s does not use your password or pretend a general personal job-feed API exists.</p></div>
              <div className="integration-actions"><button onClick={() => setView("workspace")}>Open Role intake</button><button onClick={() => setView("radar")}>Add radar reference</button></div>
            </article>
          </div>
          <div className="linkedin-next-step"><div><span>IMPLEMENTATION STATUS</span><strong>Official OIDC scaffold + export intelligence</strong></div><p>V’s can now run the official OpenID Connect flow once deployment credentials are added. That connection is intentionally identity-only. For profile evidence, received recommendations, saved jobs, and LinkedIn AI/profile context, import the official ZIP.</p><a href="https://www.linkedin.com/help/linkedin/answer/a1341387" target="_blank" rel="noreferrer">Why V’s does not scrape or automate LinkedIn ↗</a></div>
        </section>}

        {view === "profile" && <section className="profile-workspace">
          <div className="section-head"><div className="step"><b>PROFILE</b><span>VERIFIED SOURCE OF TRUTH</span></div><p>Edit this once. Every résumé, letter, answer, and autofill package uses these fields.</p></div>
          <div className="profile-form"><label>Full name<input value={profile.name} onChange={(e) => setProfile({...profile,name:e.target.value})} /></label><label>Default professional headline<input value={profile.headline} onChange={(e) => setProfile({...profile,headline:e.target.value})} /></label><label>Email<input value={profile.email} onChange={(e) => setProfile({...profile,email:e.target.value})} /></label><label>Phone<input value={profile.phone} onChange={(e) => setProfile({...profile,phone:e.target.value})} /></label><label>Location<input value={profile.location} onChange={(e) => setProfile({...profile,location:e.target.value})} /></label><label>LinkedIn<input value={profile.linkedin} onChange={(e) => setProfile({...profile,linkedin:e.target.value})} /></label><label>Portfolio / website<input type="url" value={profile.portfolio} onChange={(e) => setProfile({...profile,portfolio:e.target.value})} placeholder="https://…" /></label><label className="wide">Default base summary<textarea value={profile.summary} onChange={(e) => setProfile({...profile,summary:e.target.value})} /></label><label className="wide">Verified career facts — one per line<textarea className="facts-area" value={profile.facts} onChange={(e) => setProfile({...profile,facts:e.target.value})} /></label></div>
          <div className="resume-tracks-section">
            <div className="resume-tracks-head"><div><span>RÉSUMÉ DIRECTIONS</span><h2>Keep different career areas distinct.</h2><p>Auto-select uses role terms. Each track can override the default headline and summary; approved career facts remain shared truth unless a source is assigned to one track.</p></div><button onClick={addResumeTrack}>Add track</button></div>
            <label className="track-default">Role workspace selection<select value={activeTrackId} onChange={(event) => setActiveTrackId(event.target.value)}><option value="auto">Auto-select from each role</option>{normalizedTracks.map((track) => <option key={track.id} value={track.id}>{track.name}</option>)}</select></label>
            <div className="resume-track-list">{normalizedTracks.map((track) => <article key={track.id} className={selectedTrack.id === track.id ? "selected" : ""}><div className="track-card-head"><span>{selectedTrack.id === track.id ? trackSelection.automatic ? "CURRENT AUTO MATCH" : "CURRENT TRACK" : "RÉSUMÉ TRACK"}</span><small>Preserved with its linked sources and versions</small></div><label>Name<input value={track.name} onChange={(event) => updateResumeTrack(track.id, { name: event.target.value })} /></label><label>Headline<input value={track.headline} onChange={(event) => updateResumeTrack(track.id, { headline: event.target.value })} /></label><label>Track summary<textarea value={track.summary} onChange={(event) => updateResumeTrack(track.id, { summary: event.target.value })} placeholder="Use a truthful summary tailored to this career direction." /></label><label>Matching role terms<textarea value={track.focus.join(", ")} onChange={(event) => updateResumeTrack(track.id, { focus: event.target.value.split(/[,\n]/).map((item) => item.trim()).filter(Boolean) })} placeholder="brand, campaign, creative, agency" /></label></article>)}</div>
          </div>
          <div className="profile-footer"><span>{facts.length} approved facts · {normalizedTracks.length} résumé tracks · {workspaceSync.message}</span><div><button onClick={() => download("v-jobs-career-profile.json", JSON.stringify({ profile, resumeTracks: normalizedTracks },null,2), "application/json")}>Export profile</button><button onClick={exportWorkspace}>Download backup</button><button className="primary" onClick={() => void saveWorkspaceBackup(workspaceSnapshot, true)} disabled={workspaceSync.state === "saving" || !workspaceLoaded}>Save durable revision</button></div></div>
        </section>}

        {view === "voice" && <section className="profile-workspace voice-workspace">
          <div className="section-head"><div className="step"><b>VOICE</b><span>COVER LETTER STYLE BANK</span></div><p>V’s learns only from substantial writing that sounds like you. Source files are preserved, but export columns, URLs, code, dates, and quick social replies do not shape your voice.</p></div>
          <div className={`voice-learning-status ${learnedVoice.ready ? "ready" : "learning"}`}><div><span>{learnedVoice.ready ? "VOICE PROFILE READY" : "MORE WRITING NEEDED"}</span><strong>{learnedVoice.stats.words} useful words · {learnedVoice.stats.sentences} sentences · {learnedVoice.stats.averageSentenceWords || 0} words per sentence</strong><small>{cleanedVoice.kept} meaningful samples used · {cleanedVoice.dropped} low-signal export entries ignored · {knowledgeStats.voice} original source{knowledgeStats.voice === 1 ? "" : "s"} preserved.</small></div><button onClick={() => relearnWritingVoice()}>{learnedVoice.ready ? "Relearn from clean samples" : "Check clean samples"}</button></div>
          <div className="profile-form"><label className="wide">Learned tone<textarea value={writingStyle.tone} onChange={(event) => setWritingStyle({...writingStyle,tone:event.target.value})} /></label><label>Prefer<textarea value={writingStyle.prefer} onChange={(event) => setWritingStyle({...writingStyle,prefer:event.target.value})} /></label><label>Avoid<textarea value={writingStyle.avoid} onChange={(event) => setWritingStyle({...writingStyle,avoid:event.target.value})} /></label></div>
          <section className="voice-sample-review"><div><span>WRITING USED FOR LEARNING</span><strong>{cleanedVoice.kept ? "Clean, readable sample set" : "No substantial prose found yet"}</strong><p>{cleanedVoice.kept ? "This is the exact text used to learn phrasing. It is read-only so imported originals are never overwritten." : "Upload a longer email, post, article, or cover letter. One-line replies and data exports stay out of the voice profile."}</p></div><textarea className="voice-samples" value={cleanedVoice.text} readOnly aria-label="Writing samples used for learning" placeholder="Your cleaned writing samples will appear here." /></section>
          <details className="voice-source-archive"><summary>View preserved original imported writing</summary><pre>{writingStyle.samples || "No writing source has been added yet."}</pre></details>
          <div className="profile-footer"><span>Voice changes style only—never career facts. Original imports are kept separately from the clean learning set.</span><div><button onClick={() => { setSourceCategory("Writing sample"); setView("documents"); }}>Upload more writing</button><button onClick={() => { setView("workspace"); setOutput("cover"); }}>Preview cover-letter voice</button></div></div>
        </section>}

        {view === "documents" && <section className="documents-workspace knowledge-workspace">
          <div className="document-import">
            <div className="step"><b>02</b><span>KNOWLEDGE SOURCES</span></div>
            <h2>Upload evidence, voice, and the rules for a great résumé.</h2>
            <p>V’s keeps four kinds of knowledge separate so a tip, article, or writing sample can never become a claim about your experience.</p>
            <div className="learning-path"><div className="learning-path-head"><span>YOUR LEARNING PATH</span><strong>{learningSteps.filter((step) => step.complete).length}/{learningSteps.length} foundations ready</strong><small>V’s uses this sequence to learn your history, voice, résumé rules, LinkedIn context, and different career directions.</small></div><ol>{learningSteps.map((step, index) => <li key={step.label} className={step.complete ? "complete" : ""}><b>{step.complete ? "✓" : index + 1}</b><div><strong>{step.label}</strong><span>{step.detail}</span></div></li>)}</ol></div>
            <label className="source-type">What kind of knowledge is this?<select value={sourceCategory} onChange={(event) => setSourceCategory(event.target.value as SourceCategory)}>{SOURCE_CATEGORIES.map((category) => <option key={category}>{category}</option>)}</select><small>{SOURCE_TYPE_DETAILS[sourceCategory]}</small></label>
            <label className="source-type">Use this source for<select value={sourceTrackId} onChange={(event) => setSourceTrackId(event.target.value)}><option value="all">All résumé tracks</option>{normalizedTracks.map((track) => <option key={track.id} value={track.id}>{track.name}</option>)}</select></label>
            <div className={`scope-preview ${scopeForCategory(sourceCategory)}`}><strong>{sourceScopeLabel(scopeForCategory(sourceCategory))}</strong><span>{sourceScopeDescription(scopeForCategory(sourceCategory))}</span></div>
            <div className="link-source-import"><label className="source-url">Public article or YouTube URL <small>V’s can read a public article or public captions. It never logs in, sends cookies, or reads private pages.</small><input type="url" value={sourceUrl} onChange={(event) => setSourceUrl(event.target.value)} placeholder="https://article… or https://youtu.be/…" /></label><div><button onClick={() => pasteFromClipboard(setSourceUrl, "source link")}>Paste link</button><button className="primary" onClick={readKnowledgeFromLink} disabled={sourceReading}>{sourceReading ? "Reading public source…" : "Read and import link"}</button></div></div>
            <label className={isDragging ? "upload-zone dragging" : "upload-zone"} onDragEnter={(event) => { event.preventDefault(); setIsDragging(true); }} onDragOver={(event) => event.preventDefault()} onDragLeave={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node)) setIsDragging(false); }} onDrop={(event) => { event.preventDefault(); setIsDragging(false); uploadDocuments(Array.from(event.dataTransfer.files)); }}>
              <input type="file" multiple accept=".pdf,.docx,.txt,.md,.csv,.json,.zip,application/pdf,application/zip,application/x-zip-compressed,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain,text/markdown,text/csv,application/json" onChange={(event) => { uploadDocuments(Array.from(event.target.files || [])); event.currentTarget.value = ""; }} />
              <span className="upload-icon">↑</span><strong>Drop files here</strong><span>or click to browse your Mac</span><small>PDF · Word · TXT · Markdown · CSV · JSON / GPT export · LinkedIn ZIP (50 MB) · other files 10 MB</small>
            </label>
            <div className="privacy-strip"><strong>Private by default</strong><span>Files are processed and saved in this browser. They are not uploaded to GitHub or sent to an AI provider.</span></div>
            <details className="paste-fallback"><summary>Paste text instead</summary><div><label>Source name<input value={documentTitle} onChange={(event) => setDocumentTitle(event.target.value)} placeholder="e.g. Résumé do’s and don’ts — 2026" /></label><label>Source text<textarea value={documentText} onChange={(event) => setDocumentText(event.target.value)} placeholder="Paste career evidence, Custom GPT content, résumé tips and rules, writing samples, or company research." /></label><button className="primary" onClick={importDocument}>Import pasted text</button></div></details>
            <p className="gpt-note"><strong>Links and private sources:</strong> public articles and YouTube videos with exposed captions can be imported directly. For Custom GPT knowledge, private LinkedIn pages, login-only sites, or videos without captions, export or copy the content and upload/paste it here.</p>
          </div>

          <div className="fact-review">
            <div className="review-heading"><div><span>SOURCE LIBRARY</span><h2>{documents.length} imported sources</h2></div><strong>{facts.length} approved facts</strong></div>
            <div className="knowledge-summary"><div><strong>{knowledgeStats.evidence}</strong><span>Career evidence</span></div><div><strong>{knowledgeStats.guidance + (playbookSettings.curatedEnabled ? 1 : 0)}</strong><span>Playbook sources</span></div><div><strong>{knowledgeStats.voice}</strong><span>Voice sources</span></div><div><strong>{knowledgeStats.research}</strong><span>Research sources</span></div><div><strong>{approvedPlaybookRules.length}</strong><span>Active résumé rules</span></div></div>

            <section className={`consistency-panel ${evidenceAudit.conflicts.length ? "has-conflicts" : evidenceAudit.duplicates.some((cluster) => cluster.crossSource) ? "has-overlap" : "clean"}`}>
              <div className="consistency-head">
                <span>CONSISTENCY CHECK</span>
                <h3>{evidenceAudit.conflicts.length === 0 && !evidenceAudit.duplicates.some((cluster) => cluster.crossSource)
                  ? "No conflicts or repeated facts across your approved sources"
                  : [
                    evidenceAudit.conflicts.length ? `${evidenceAudit.conflicts.length} possible conflict${evidenceAudit.conflicts.length === 1 ? "" : "s"}` : "",
                    evidenceAudit.duplicates.some((cluster) => cluster.crossSource) ? `${evidenceAudit.duplicates.filter((cluster) => cluster.crossSource).length} fact${evidenceAudit.duplicates.filter((cluster) => cluster.crossSource).length === 1 ? "" : "s"} repeated across sources` : "",
                  ].filter(Boolean).join(" · ")}</h3>
                <small>Checked across every approved career-evidence source, regardless of résumé track. Nothing here is ever deleted automatically.</small>
              </div>
              {evidenceAudit.conflicts.length > 0 && <div className="conflict-list">{evidenceAudit.conflicts.map((conflict, index) => <article key={index} className={`conflict-card ${conflict.kind}`}>
                <span className="conflict-kind">{conflict.kind === "title" ? "Different role, same employer & years" : "Different number for the same claim"}</span>
                <p>{conflict.detail}</p>
                <div className="conflict-sides">
                  <div><strong>{conflict.factA.sourceTitle}</strong><span>{conflict.factA.text}</span></div>
                  <div><strong>{conflict.factB.sourceTitle}</strong><span>{conflict.factB.text}</span></div>
                </div>
                <small>Both stay in your library. Edit or remove the outdated one in Career profile once you know which is correct.</small>
              </article>)}</div>}
              {evidenceAudit.duplicates.some((cluster) => cluster.crossSource) && <details className="duplicate-list">
                <summary>{evidenceAudit.duplicates.filter((cluster) => cluster.crossSource).length} fact{evidenceAudit.duplicates.filter((cluster) => cluster.crossSource).length === 1 ? "" : "s"} approved from more than one source</summary>
                {evidenceAudit.duplicates.filter((cluster) => cluster.crossSource).map((cluster, index) => <div key={index} className="duplicate-cluster">
                  <strong>{cluster.canonical}</strong>
                  <span>Also approved from: {cluster.members.filter((member) => member.id !== cluster.canonicalId).map((member) => member.sourceTitle).join(", ")}</span>
                </div>)}
              </details>}
            </section>

            <article className={`curated-playbook-card ${playbookSettings.curatedEnabled ? "enabled" : "disabled"}`}><div className="curated-title"><div><span>BUILT-IN · CURATED GUIDANCE</span><strong>{CURATED_RESUME_PLAYBOOK.name}</strong><small>Version {CURATED_RESUME_PLAYBOOK.version} · reviewed {CURATED_RESUME_PLAYBOOK.lastReviewed}</small></div><button onClick={() => setPlaybookSettings({ ...playbookSettings, curatedEnabled: !playbookSettings.curatedEnabled })}>{playbookSettings.curatedEnabled ? "Disable" : "Enable"}</button></div><p>{CURATED_RESUME_PLAYBOOK.summary}</p><div className="curated-meta"><span>{CURATED_RESUME_PLAYBOOK.rules.length} paraphrased do/don’t rules</span><span>{CURATED_RESUME_PLAYBOOK.sources.length} authoritative sources</span><span>Updates with V’s releases</span></div><details><summary>Review sources</summary><div>{CURATED_RESUME_PLAYBOOK.sources.map((source) => <a key={source.id} href={source.url} target="_blank" rel="noreferrer"><strong>{source.title}</strong><small>{source.authority} ↗</small></a>)}</div></details></article>
            <article className={`curated-playbook-card ${playbookSettings.usReferencesEnabled ? "enabled" : "disabled"}`}><div className="curated-title"><div><span>OPTIONAL · U.S. MARKET RESEARCH</span><strong>{US_MARKET_REFERENCES.name}</strong><small>Version {US_MARKET_REFERENCES.version} · researched {US_MARKET_REFERENCES.lastReviewed}</small></div><button onClick={() => setPlaybookSettings({ ...playbookSettings, usReferencesEnabled: !playbookSettings.usReferencesEnabled })}>{playbookSettings.usReferencesEnabled ? "Disable" : "Enable"}</button></div><p>{US_MARKET_REFERENCES.summary}</p><div className="curated-meta"><span>{US_MARKET_REFERENCES.rules.length} researched do/don’t rules</span><span>{US_MARKET_REFERENCES.sources.length} cited sources</span><span>Your uploaded rules always come first</span></div><details><summary>Review sources</summary><div>{US_MARKET_REFERENCES.sources.map((source) => <a key={source.id} href={source.url} target="_blank" rel="noreferrer"><strong>{source.title}</strong><small>{source.authority} ↗</small></a>)}</div></details></article>
            {documents.length === 0 ? <div className="empty-state compact"><strong>Your knowledge library is empty.</strong><span>Start with your current résumé for evidence. Then add “Résumé playbook” sources containing tips, do’s, don’ts, templates, or best practices.</span></div> : <div className="source-list">{documents.map((doc) => {
              const scope = sourceScope(doc);
              const detected = sourceClassifications.get(doc.id);
              const detectedMismatch = detected && detected.confidence !== "low" && detected.category !== (doc.category || "Other evidence");
              return <article key={doc.id} className={`source-card ${doc.status} ${scope}`}>
                <header><div><div className="source-badges"><span className="source-category">{doc.category || "Imported source"}</span><span className={`source-scope ${scope}`}>{sourceScopeLabel(scope)}</span><span className="source-track">{doc.trackId && doc.trackId !== "all" ? normalizedTracks.find((track) => track.id === doc.trackId)?.name || "Specific track" : "All tracks"}</span>{detectedMismatch && <span className={`source-detected ${detected!.confidence}`} title={detected!.reasons.join("; ") || "Detected from the source's own content"}>Reads like: {detected!.category} ({detected!.confidence})</span>}</div><strong>{doc.title}</strong><span>{doc.type} · {doc.importedAt}{doc.truncated ? " · first 300,000 characters stored" : ""}</span>{doc.sourceUrl && /^https?:\/\//i.test(doc.sourceUrl) && <a href={doc.sourceUrl} target="_blank" rel="noreferrer">Open original source ↗</a>}</div><div className="source-controls"><span className={`source-status ${doc.status}`}>{doc.status === "reading" ? "Reading…" : doc.status === "ready" ? scope === "evidence" || scope === "guidance" ? "Ready for review" : "Stored safely" : "Needs text"}</span><small>Preserved in your library</small></div></header>
                {doc.status === "reading" ? <p className="needs-text">Reading this file on your Mac…</p> : doc.status === "needs-text" ? <p className="needs-text">This file could not be read, or the read was interrupted (e.g. by a reload). It may also be unsupported or over 10 MB. Save it as PDF, Word .docx, text, or JSON, re-upload it, or paste its text on the left.</p> : scope === "voice" ? <div className="scope-result"><strong>Added to Writing voice</strong><span>This source shapes tone and phrasing only. It cannot create career facts.</span><button onClick={() => setView("voice")}>Review writing voice</button></div> : scope === "research" ? <div className="scope-result"><strong>Saved as research context</strong><span>This information stays separate from your experience and is not sent in fit reviews.</span></div> : <div className="candidate-list">{doc.candidates.length ? <><div className="candidate-batch"><strong>{doc.approved.length}/{doc.candidates.length} {scope === "evidence" ? "facts" : "rules"} active</strong><button onClick={() => approveAllCandidates(doc.id)}>Approve all</button></div>{doc.candidates.map((candidate) => <div key={candidate}><p>{candidate}</p><button className={doc.approved.includes(candidate) ? "approved" : ""} onClick={() => scope === "evidence" ? approveCandidate(doc.id, candidate) : approvePlaybookRule(doc.id, candidate)}>{doc.approved.includes(candidate) ? scope === "evidence" ? "Approved fact" : "Active rule" : scope === "evidence" ? "Approve fact" : "Use rule"}</button></div>)}</> : <p className="needs-text">{scope === "evidence" ? "No useful fact candidates were found. You can add facts directly in Career profile." : "No clear tip or rule was detected. Paste shorter do/don’t statements for the playbook."}</p>}</div>}
              </article>;
            })}</div>}
          </div>
        </section>}

        {view === "companies" && <section className="companies-workspace"><div className="target-form"><div className="step"><b>03</b><span>ADD A TARGET</span></div><h2>Companies, brands, and agencies — in one list.</h2><p>Keep only targets you want to follow. Career links and notes are optional, so this works even before you have every detail.</p><label>Company or agency name<input value={companyName} onChange={(event) => setCompanyName(event.target.value)} placeholder="e.g. Agency, brand, or sports organization" /></label><div className="field-row"><label>Type<select value={companyKind} onChange={(event) => setCompanyKind(event.target.value as CompanyTarget["kind"])}><option>Brand</option><option>Agency</option><option>Sports</option><option>Tech</option></select></label><label>Focus<input value={companyFocus} onChange={(event) => setCompanyFocus(event.target.value)} /></label></div><label>Website<input value={companyWebsite} onChange={(event) => setCompanyWebsite(event.target.value)} placeholder="https://" /></label><label>Careers page<input value={companyCareers} onChange={(event) => setCompanyCareers(event.target.value)} placeholder="https://" /></label><button className="primary" onClick={addCompany}>Add to directory</button></div><div className="target-directory"><div className="review-heading"><div><span>TARGET DIRECTORY</span><h2>{companies.length} saved targets</h2></div><strong>Bay Area first</strong></div>{companies.length === 0 ? <div className="empty-state compact"><strong>Your target list starts here.</strong><span>Add brands, agencies, sports organizations, or tech teams. Nothing is marked as an open role until you verify it.</span></div> : <div className="company-list">{companies.map((target) => <article key={target.id}><div className="company-title"><span>{target.kind}</span><strong>{target.name}</strong><small>{target.market} · {target.focus || "No focus set"}</small></div><div className="company-links">{target.website && <a href={target.website} target="_blank" rel="noreferrer">Website</a>}{target.careers && <a href={target.careers} target="_blank" rel="noreferrer">Careers</a>}<button onClick={() => loadCompanyForRole(target)}>Use for role</button></div><div className="company-actions"><label>Status<select value={target.status} onChange={(event) => setCompanies(companies.map((item) => item.id === target.id ? { ...item, status: event.target.value as CompanyTarget["status"] } : item))}><option>Researching</option><option>Monitoring</option><option>Applied</option><option>Paused</option></select></label><label>Notes<input value={target.notes} onChange={(event) => setCompanies(companies.map((item) => item.id === target.id ? { ...item, notes: event.target.value } : item))} placeholder="Contact, role, or next step" /></label><button onClick={() => setCompanies(companies.map((item) => item.id === target.id ? { ...item, status: "Paused" } : item))}>Pause</button></div></article>)}</div>}</div></section>}

        {view === "applications" && <section className="table-card"><div className="table-head"><div><span>PIPELINE</span><h2>{filteredApplications.length} of {applications.length} saved applications</h2></div><button onClick={() => download("v-jobs-applications.json", JSON.stringify({ applications, generatedDrafts, jobSnapshots },null,2), "application/json")}>Export</button></div>{applications.length > 0 && <div className="radar-inbox-controls"><div className="radar-filters">{(["all", "Saved opportunity", "Preparing", "Applied", "Interview", "Closed"] as const).map((status) => <button key={status} className={pipelineFilters.status === status ? "selected" : ""} onClick={() => setPipelineFilters({ ...pipelineFilters, status })}>{status === "all" ? "All statuses" : status}</button>)}</div><label>Company<select value={pipelineFilters.company} onChange={(event) => setPipelineFilters({ ...pipelineFilters, company: event.target.value })}><option value="all">All companies</option>{pipelineCompanyOptions.map((name) => <option key={name} value={name}>{name}</option>)}</select></label><label>Search<input value={pipelineFilters.search} onChange={(event) => setPipelineFilters({ ...pipelineFilters, search: event.target.value })} placeholder="Role, company, or note" /></label></div>}{applications.length === 0 ? <div className="empty-state"><strong>No applications saved yet.</strong><span>Prepare a role in the workspace, then choose “Save to applications.”</span><button className="primary" onClick={() => setView("workspace")}>Prepare first role</button></div> : filteredApplications.length === 0 ? <div className="empty-state compact"><strong>No applications match these filters.</strong><span>Change the status, company, or search text.</span></div> : <div className="application-list">{filteredApplications.map((app) => { const resumeDraft = generatedDrafts.find((draft) => draft.id === app.resumeVersionId); const coverDraft = generatedDrafts.find((draft) => draft.id === app.coverVersionId); const matchingDrafts = generatedDrafts.filter((draft) => draft.company === app.company && draft.role === app.role); return <article key={app.id}><div className="application-main"><strong>{app.role}</strong><span>{app.company}</span>{app.url && <a href={app.url} target="_blank" rel="noreferrer">Original role ↗</a>}<small>{app.note || "Saved opportunity — not submitted"}</small></div><label>Application date<input type="date" value={/^\d{4}-\d{2}-\d{2}$/.test(app.date) ? app.date : ""} onChange={(e) => setApplications((current) => current.map((item) => item.id === app.id ? {...item,date:e.target.value}:item))} /></label><label>Status<select value={app.status} onChange={(e) => { const nextStatus = e.target.value as ApplicationStatus; const justApplied = nextStatus === "Applied" && app.status !== "Applied"; setApplications((current) => current.map((item) => item.id === app.id ? {...item, status: nextStatus, date: justApplied ? dateInputToday() : item.date} : item)); if (justApplied) setCompanies((current) => current.map((target) => target.status !== "Paused" && target.name.trim().toLowerCase() === app.company.trim().toLowerCase() ? { ...target, status: "Applied" } : target)); }}><option>Saved opportunity</option><option>Preparing</option><option>Applied</option><option>Interview</option><option>Closed</option></select></label><label>Note<input value={app.note || ""} onChange={(e) => setApplications((current) => current.map((item) => item.id === app.id ? {...item,note:e.target.value}:item))} placeholder="Follow-up, contact, or reminder" /></label><label>Next step<input value={app.nextStep || ""} onChange={(e) => setApplications((current) => current.map((item) => item.id === app.id ? {...item,nextStep:e.target.value}:item))} placeholder="e.g. Follow up Friday, prep for interview" /></label><div className="application-document-links"><span>Résumé: {resumeDraft ? resumeDraft.title : "Not linked"}</span><span>Cover letter: {coverDraft ? coverDraft.title : "Not linked"}</span></div><div className="application-actions"><button onClick={() => { setCompany(app.company); setRole(app.role); setRoleUrl(app.url || ""); setView("workspace"); setNotice("Role reopened. Its saved history remains intact."); }}>Open role</button><button onClick={() => setApplications((current) => current.map((item) => item.id === app.id ? {...item,status:"Closed"}:item))}>Archive as closed</button><button className={pendingApplicationDelete === app.id ? "danger-armed" : ""} onClick={() => { if (pendingApplicationDelete !== app.id) { setPendingApplicationDelete(app.id); setNotice(`Press Confirm delete to remove ${app.role} at ${app.company}. Anything else cancels it.`); return; } setApplications((current) => current.filter((item) => item.id !== app.id)); setPendingApplicationDelete(""); setNotice("Application removed from your pipeline. Earlier private revisions still hold it — recover it in Data & versions."); }} onBlur={() => setPendingApplicationDelete((current) => current === app.id ? "" : current)}>{pendingApplicationDelete === app.id ? "Confirm delete" : "Delete"}</button></div>{matchingDrafts.length > 0 && <div className="application-draft-picker">{matchingDrafts.map((draft) => <button key={draft.id} onClick={() => attachDraftToApplication(app.id, draft)}>Link {draft.type === "resume" ? "résumé" : "cover letter"}: {draft.updatedAt}</button>)}</div>}</article>; })}</div>}</section>}
        {view === "applications" && <section className="resume-library"><div className="table-head"><div><span>DOCUMENT LIBRARY</span><h2>{filteredResumeDrafts.length} of {resumeDrafts.length} saved résumé versions</h2></div><small>Every version is preserved and can be linked to an application.</small></div>{resumeDrafts.length > 0 && <div className="radar-inbox-controls"><label>Company<select value={documentFilters.company} onChange={(event) => setDocumentFilters({ ...documentFilters, company: event.target.value })}><option value="all">All companies</option>{documentCompanyOptions.map((name) => <option key={name} value={name}>{name}</option>)}</select></label>{documentTrackOptions.length > 0 && <label>Track<select value={documentFilters.trackId} onChange={(event) => setDocumentFilters({ ...documentFilters, trackId: event.target.value })}><option value="all">All tracks</option>{documentTrackOptions.map((track) => <option key={track.id} value={track.id}>{track.name}</option>)}</select></label>}<label>Provider<select value={documentFilters.provider} onChange={(event) => setDocumentFilters({ ...documentFilters, provider: event.target.value })}><option value="all">All providers</option>{documentProviderOptions.map((provider) => <option key={provider} value={provider}>{provider === "local" ? "Local draft" : provider}</option>)}</select></label><label>Search<input value={documentFilters.search} onChange={(event) => setDocumentFilters({ ...documentFilters, search: event.target.value })} placeholder="Role, company, or title" /></label></div>}{resumeDrafts.length === 0 ? <div className="empty-state compact"><strong>No résumé version saved yet.</strong><span>Generate or edit a résumé in Role workspace, then choose Save version.</span></div> : filteredResumeDrafts.length === 0 ? <div className="empty-state compact"><strong>No résumé versions match these filters.</strong><span>Change the company, track, provider, or search text.</span></div> : <div className="resume-version-list">{filteredResumeDrafts.map((draft) => <article key={draft.id}><div><strong>{draft.title}</strong><span>{draft.company} · {draft.role}</span><small>{draft.updatedAt} · {draft.provider === "local" || !draft.provider ? "Local draft" : `${draft.provider} · ${draft.model || "model recorded"}`} · {draft.playbookRuleCount ?? 0} playbook rules</small></div><button onClick={() => { setCompany(draft.company); setRole(draft.role); setDraftEditor(draft.content); setDraftEditorKey("resume"); setDraftIsExternal(draft.origin === "uploaded"); setOutput("resume"); setView("workspace"); setNotice("Saved résumé version opened for editing. The original version remains preserved."); }}>Open copy</button><button onClick={() => download(`${draft.company}-${draft.role}-resume.txt`.replace(/[^a-z0-9.-]+/gi, "-"), draft.content)}>Download</button></article>)}</div>}</section>}

        {view === "data" && <section className="data-workspace">
          <div className="data-safety-card"><span>APPEND-ONLY PRIVATE HISTORY</span><h2>Recover records without deleting the current workspace.</h2><p>Every durable save creates an immutable private revision. “Merge preserved records” adds missing applications, sources, résumé versions, job descriptions, and companies to the current workspace. Current records win when the same ID exists.</p><div><button className="primary" onClick={() => void saveWorkspaceBackup(workspaceSnapshot, true)} disabled={workspaceSync.state === "saving" || !workspaceLoaded}>Save revision now</button><button onClick={() => void loadWorkspaceHistory()} disabled={workspaceHistoryState === "loading"}>{workspaceHistoryState === "loading" ? "Refreshing…" : "Refresh history"}</button><button onClick={exportWorkspace}>Download complete backup</button></div></div>
          <div className="version-history-card"><div className="table-head"><div><span>PRIVATE VERSION HISTORY</span><h2>{workspaceRevisions.length} recent revisions</h2></div><strong>Nothing is deleted here</strong></div>{workspaceHistoryState === "loading" && !workspaceRevisions.length ? <div className="empty-state compact"><strong>Opening preserved versions…</strong></div> : workspaceRevisions.length ? <div className="version-history-list">{workspaceRevisions.map((revision) => <article key={revision.id} className={revision.isCurrent ? "current" : ""}><div><strong>{revision.isCurrent ? "Current private revision" : new Date(revision.createdAt).toLocaleString()}</strong><span>{revision.sourceBuild}</span><small>{Math.max(1, Math.round(revision.sizeBytes / 1024)).toLocaleString()} KB · {revision.id.slice(0, 8)}</small></div>{revision.isCurrent ? <b>ACTIVE</b> : <button onClick={() => void mergeWorkspaceRevision(revision.id)} disabled={workspaceHistoryState === "loading"}>Merge preserved records</button>}</article>)}</div> : <div className="empty-state compact"><strong>No durable revisions are visible yet.</strong><span>Your browser copy remains untouched. Choose Save revision now to create the first durable version.</span></div>}</div>
        </section>}

        {view === "autofill" && <section className="autofill-grid">
          <div className="autofill-intro"><div className="step"><b>04</b><span>ASSISTED AUTOFILL</span></div><h2>Continue an application without starting over.</h2><p>Choose the exact résumé version you want to use, then load one reusable package into the companion. It scans the page again each time and fills only blank, approved fields after your click.</p><div className="safety-list"><span>✓ Keeps the selected résumé version visible</span><span>✓ Skips already-completed fields</span><span>✓ Never presses Submit or guesses sensitive answers</span><span>✓ File uploads stay manual because browsers protect them</span></div></div>
          <div className="autofill-package"><span>AUTOFILL PACKAGE</span><label>Résumé for this application<select value={selectedAutofillResume?.id || ""} onChange={(event) => setAutofillResumeVersionId(event.target.value)}><option value="">Choose a preserved résumé</option>{availableResumeVersions.map((draft) => <option key={draft.id} value={draft.id}>{draft.origin === "uploaded" ? "Uploaded" : `v${draft.versionNumber || "saved"}`} · {draft.title}</option>)}</select></label>{selectedAutofillResume ? <div className="autofill-resume-choice"><strong>{selectedAutofillResume.title}</strong><span>Selected for this package. The original is preserved.</span><button onClick={() => downloadWordDocument(`${selectedAutofillResume.title.replace(/[^a-z0-9.-]+/gi, "-")}.doc`, selectedAutofillResume.title, selectedAutofillResume.content, "resume")}>Download selected résumé</button></div> : <p className="autofill-empty-choice">Choose or upload a résumé version first. The companion will identify it for the form; you manually select the file when a website requires an upload.</p>}<pre>{autofillPreview}</pre><div><button className="primary" onClick={() => copyText(autofillData,setNotice)}>Copy package</button><button onClick={() => download("v-jobs-autofill-profile.json",autofillData,"application/json")}>Download JSON</button></div><small>Load once in the Chrome companion, then use Scan page and Fill ready fields. Reload the extension after updating it from the companion folder.</small></div>
        </section>}
      </section>
    </main>
  );
}

