# V's Job Seeker — Complete Backlog Log

Updated: 2026-07-29 (later)

Priority labels reflect Marcos's stated order. P0 and P1 are the work that most directly affects getting applications out quickly.

Items marked **[DONE]** were verified working this session (tested, typechecked, browser-verified where applicable) — kept in the list rather than deleted so the original requirement stays visible. Unmarked items are still open. Items marked **[GAP]** are partially done with a specific known hole.

## P0 — Résumé generation and output quality

- **[DONE]** Produce a complete, professional résumé with name, approved contact header, target title, summary, selected experience, accomplishments, skills, and clean formatting. (`lib/resume-document.mjs`, `lib/local-resume.mjs`)
- **[DONE]** Apply the selected résumé playbook before generation and show which rules were applied.
- **[DONE]** Use approved career evidence as the only source for claims; surface unsupported requirements instead of filling gaps. (evidence map now also drives the cover letter, not just the résumé)
- **[DONE]** Remove malformed keyword fragments, duplicated facts, raw CSV/code noise, contact chatter, and generic filler. (`prepareResumeEvidence`, now actually wired into generation)
- **[DONE]** Filter writing-voice samples so greetings, comments, URLs, emojis, export headers, and casual noise do not dominate the learned profile. (`lib/writing-voice.mjs`)
- Keep multiple résumé tracks: brand/creative PM, creative operations, production/producer, general PM/program management, sports marketing, and custom tracks. (tracks exist; not re-audited this session)
- **[DONE]** Make the draft editable before export or application use, and keep the edit. (was editable but silently lost on reload — now persists)
- **[DONE]** Save every generated and edited version; never overwrite the previous version. (regeneration now auto-saves an in-progress edit as a version first, instead of overwriting it)
- **[DONE]** Attach each version to company, role title, role description, résumé track, provider/model, prompt inputs, creation date, edits, tokens/usage when available, and application date when submitted.
- **[DONE]** Reuse a strong prior version for similar roles with an adaptation explanation and lower-cost path. (`lib/resume-reuse.mjs` was fully built but never called — now a panel on the Résumé tab)
- **[DONE]** Compare two or three model outputs side by side with quality signals.
- **[DONE]** Make the selected/default model and the model used for each output explicit.
- **[GAP]** No-API path for résumé help. Marcos's own `resume-tailor` Claude Skill can now be run in a normal conversation (subscription-covered) and the output pasted into the app — it's scored by an offline standards checker and versioned normally. What's still missing: the app doesn't yet surface *when* to suggest this path (e.g. no provider connected) — right now the user has to know it exists.

## P1 — Job Radar reliability

- **[DONE]** Radar scans monitored companies and labels results monitored / suggested-by-V / imported / manually added — now 4 origins including `linkedin-saved`.
- Keep all Radar discoveries in the inbox, not Role Workspace. (already true, not re-audited)
- Filters for company, source, target position, location, alignment, status, origin. (already true)
- Target-position dropdowns while preserving custom values. (already true)
- Preserve minimum alignment across runs. (already true)
- Classify real postings vs navigation/marketing content. (already true — `isPlausibleRadarJob`)
- Discover careers/jobs pages from company homepages. (already true)
- **[DONE]** Follow public ATS/job-board links where compliant: Greenhouse, Lever, Ashby, Workday, SmartRecruiters read directly via documented APIs. iCIMS and TeamWork Online researched directly (robots.txt + real listing and job-detail pages on both) before building anything: iCIMS's real API is OAuth-gated to its own customers, and neither platform's pages carry JobPosting JSON-LD — checked a real iCIMS customer instance and both a TeamWork Online team-listing page and an individual job page. Same conclusion as Built In: no reliable bulk reader is possible, so both are supported through the existing "paste one link" import, with the employer name recovered from the URL itself (tenant subdomain for iCIMS, team slug for TeamWork Online) rather than reporting the platform name as the employer.
- Use secondary public sources when the employer page blocks reading. (already true)
- **[DONE]** Meta, Google, Apple as regression fixtures — Meta specifically covered by the import-link test suite.
- Approve, dismiss, archive, restore without deleting history. (already true)
- **[DONE]** Automatic scans at least twice daily, background vs catch-up distinguished. Still needs the hosting scheduler actually pointed at `/api/radar/cron` in production — see [[vfiles-deployment-model]].
- **[DONE]** Store last checked, next due, source response, counts, zero-result reason.
- **[DONE]** Deduplicate discoveries across every origin. `opportunityKey()` normalizes scheme/host/tracking-params/fragments; `mergeDuplicateOpportunities()` repairs rows an earlier build already duplicated, keeping the earliest `discovered_at` and the user's latest real decision. One piece of the original ask not built: merging keeps the *surviving* row's own URL rather than upgrading to "the most direct" one — low-value edge case, not done.
- **[GAP]** Startup job radar. Wellfound and Y Combinator's Work at a Startup are wired up (paste-link import, auto-tagged `Startup / Early-stage` from the source regardless of posting text). Built In is wired up via paste-link but deliberately not auto-tagged (it lists companies of every size). **Not done: a monitor-level "this target is a startup" flag that feeds scoring** — the original ask was for stage/funding/size to influence match score, and that part doesn't exist yet, only the category tag on imported roles.

## P1 — Role Workspace and market learning

- Make URL paste/copy-paste robust for public, redirected, login, challenge, and partial pages.
- Add a compliant browser current-page capture flow for a logged-in LinkedIn page after explicit user action.
- Extract company, role title, location, description, requirements, source URL, and capture date from pasted/captured content.
- Save every role description automatically for market learning, independent of Save to Pipeline.
- Keep role history when the page is reloaded or cleared from the active workspace.
- **[GAP]** Move status/feedback above the application area; use clear success, warning, failure, and neutral colors. The color logic now exists and is wired up (`noticeTone` was written but never applied — fixed this session, notices read success/error/neutral at a glance). Position ("above the application area") not specifically re-audited. "Queued" and "in-progress" states still read the same neutral color as everything else — only success/failure are visually distinct.
- Show progress and retry/resend controls for reading, parsing, saving, recommendation, résumé, cover letter, and comparison.
- Clear the active intake after successful submission while retaining historical records.

## P1 — Knowledge, experience, and learning

- Keep “Knowledge Sources” (playbooks, tips, do/don'ts, templates, examples, research) separate from “Career Profile/Experience” (Marcos's facts and evidence).
- Make all tabs consume the same unified approved knowledge layer.
- **Not done:** make imported source types explicit and visible. `classifyKnowledgeSource()` exists in `lib/knowledge-sources.mjs` and is imported into the workspace, but its result is never rendered anywhere (confirmed dead by the linter) — an uploaded source's classified type is computed and thrown away, so the user never sees it.
- Add Approve all/batch approval while retaining individual review for conflicts and sensitive facts.
- Detect duplicate/overlapping résumés and conflicting claims without deleting any source.
- Suggest canonical facts and preserve provenance to every original file.
- Fix missing playbook visibility and restore/status behavior after upload.
- Support PDF, DOCX, TXT, Markdown, CSV, JSON/GPT exports, articles, and YouTube captions/transcripts with clear rate-limit/login fallbacks.
- Add a learning path showing processed, approved, used, and still-unreviewed material.
- Learn writing voice only from meaningful approved samples.

## P1 — Application and document history

- Make application records editable, including application date, status, source, notes, company, and role.
- Link the exact résumé and cover-letter version used, without duplicating files.
- Store why a version was selected and whether Marcos used a different version than suggested.
- Add document-library filters by company, role, track, date, provider, and application.
- Preserve all historical job descriptions, drafts, submissions, and decisions.

## P1 — AI providers and guardrails

- **[DONE]** Explicit, task-specific provider/model buttons. (already true)
- **[DONE]** Validate provider/model compatibility before sending. All three provider request shapes (OpenAI `text.format`, Anthropic `output_config`, Google `responseJsonSchema`) verified correct against live current docs this session.
- **[DONE]** Retry/backoff for transient 429/5xx, safe fallback to local analysis.
- **[GAP]** Capture privacy-safe provider/model/status/request-ID/latency/tokens. Usage tracking exists (`ai-security-store`); **cost estimate is not computed anywhere** — tokens are recorded but never converted to an approximate dollar figure.
- **[DONE]** Model dropdowns by task + comparison mode.
- **[GAP]** Store model outputs for reuse/evaluation — comparison results exist in memory during the session but are not saved anywhere; there is no "winner" selection UI at all. Dead code confirms this: an `aiDiagnostics` state and `setAiDiagnostics` setter exist for a "no-generation model check" feature whose UI text is already written ("Run a no-generation model check to verify exact API access") but `setAiDiagnostics` is never called anywhere — the feature was scaffolded and abandoned mid-build.
- **[DONE]** Reject malformed claims, map to exact fact indexes.
- **Not done:** distinguish consumer subscription vs API billing in the app's own setup guidance. This came up directly in conversation this session (clarified for Marcos: claude.ai subscription and API credits are billed separately, no bridge exists) but that explanation was never added to the AI & Reliability screen's copy — a user hitting this confusion today gets no in-app guidance.

## P1 — LinkedIn and connections

- Complete official OpenID/OAuth setup documentation and status diagnostics.
- Never ask for or store a LinkedIn password.
- Support official LinkedIn ZIP/archive import and scope separation.
- Build the current-page capture/copy-paste path for logged-in pages.
- Do not claim access to private recommendations, saved jobs, or LinkedIn AI features without an approved LinkedIn product/API.
- Keep Indeed and other sources as compliant public/reference integrations unless an authorized personal API is available.

## P2 — Autofill assistant

- **[DONE]** Fix meaningless numeric fills and stale mappings. Two real bugs fixed: a shared section heading could fill every field beneath it with the same value; an unchecked checkbox/untouched dropdown was misread as "already answered" and hidden from the preview entirely.
- **[GAP]** Clean rescan without restarting the workflow — rescanning works, but there's no live re-detection when a form adds fields dynamically after the page loads (e.g. a multi-step ATS form); the user has to manually rescan.
- **[DONE]** Uses active role, company, track, profile, selected résumé version, and role-specific answers.
- **[GAP]** Field-type coverage: text/email/phone/city/state/country/textarea/checkbox/radio/dropdown/file all handled correctly (checkbox/radio/dropdown/file always route to manual review, on purpose). **Repeated sections (e.g. "Add another prior employer") and true dynamic forms are not specifically handled** — not tested against a real multi-entry ATS form this session.
- **[DONE]** Preview every mapping, flag uncertainty, log unmapped fields, never auto-submit.
- **[DONE]** Different résumé version selectable before filling.

## P2 — Career profile and focus tracks

- Make title, target areas, location, goals, skills, constraints, and preferred focus editable.
- Add Creative and Sports tracks alongside project/operations tracks.
- Let V suggest a focus while allowing Marcos to override it.

## P2 — Design and usability

- Preserve the current design as a fallback and add a modern card-based visual direction inspired by the supplied reference.
- Use distinct colors for success, warning, failure, rejected, queued, and in-progress states.
- Improve role-description layout, cards, spacing, dropdowns, loading bars, and responsive behavior.
- Keep the interface calm and readable rather than code-like or text-heavy.
- Keep tab-to-tab continuity across Workspace, Radar, Knowledge, Applications, Connections, and AI Reliability.

## P3 — Lower-priority integrations

- Investigate import/reference workflows for Claude Projects/skills, NotebookLM, custom GPTs, and other AI workspaces.
- Add general app chat grounded in approved evidence, playbooks, market learning, and Radar.
- Add optional LinkedIn Profile Builder with separate rules and source knowledge.
- Add deletion/archive controls only after preservation and restore are reliable.
- Add provider credit/token dashboards and long-term quality analytics.

## Not yet audited this session (status unknown, not claimed done or open)

These sections were not touched or re-verified in the 2026-07-28/29 work: **Role Workspace URL-paste robustness** (redirected/login/challenge pages), **LinkedIn OAuth diagnostics**, **Application/document-history filters**, **Career profile/focus-track editing**, and the **card-based visual redesign**. Treat backlog items in those sections as their original open/unknown status, not as newly confirmed gaps.

## Required verification for every release

- TypeScript and lint checks.
- Production build and deployment artifact validation.
- Unit tests for parsing, persistence, guardrails, provider adapters, Radar classification, and versioning.
- Integration tests for API routes and database writes.
- Browser walkthrough of the changed flow.
- Repeat critical flows at least three times: role import, résumé generation/edit/save, provider failure/fallback, Radar scan, and application version linkage.
- Confirm no existing data, files, applications, or versions were deleted.
- Confirm secrets and personal career facts are not committed to public GitHub.

