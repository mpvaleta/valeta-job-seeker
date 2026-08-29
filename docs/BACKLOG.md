# V's Job Seeker — Complete Backlog Log

Updated: 2026-08-28

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
- **[DONE, 2026-08-28]** Verify the visible résumé draft against the approved evidence, not just the structured generation. The structured generators trace fact indexes, but hand edits, pasted resume-tailor output, and provider rewording never re-verified. `auditResume` now takes `approvedFacts` and flags (a) any number in a bullet or the summary that appears in no approved fact — normalized so "$1,200,000" and "1200000" compare equal, years excluded since date ranges are legitimately reformatted — and (b) any experience employer the evidence never names. Flags ride the existing findings list as high-severity review prompts and deliberately never move the rubric score. Wired into the standards panel on the Résumé tab.
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
- **[DONE, 2026-08-28]** Widen direct board coverage: Workable (public widget feed at `apply.workable.com/api/v1/widget/accounts/<account>`) and Recruitee (tenant `/api/offers/` feed) added as first-class read sources — detection, reader, careers-hub follow, dedup identity (`workable:<account>:<shortcode>`, `recruitee:<tenant>:<slug>`), and the web-search domain allowlist. Workday boards are now read across up to three pages of 100 instead of silently truncating at the first page; a short page ends the loop so small boards still cost one request.
- **[DONE, 2026-08-28]** Learn from the whole decision loop, not just rejections. `deriveInterestSignal` mirrors the dismissal learner on the positive side: words recurring across roles the user pursued — shortlisted, applied to, or imported by hand (`imported`/`linkedin-saved` rows teach from the moment they arrive, unless later dismissed) — give similar future discoveries a bounded score boost (+15 cap), with the same conservatism — minimum sample of 3, a word must recur, words already in the saved targets are excluded (they score through the profile), and the boost can never reopen an exclusion, the location gate, or the startups-only filter. Wired into `scanRadar` alongside the dismissal signal; imported links stay unaffected since the user chose those by hand.
- Use secondary public sources when the employer page blocks reading. (already true)
- **[DONE]** Meta, Google, Apple as regression fixtures — Meta specifically covered by the import-link test suite.
- Approve, dismiss, archive, restore without deleting history. (already true)
- **[DONE]** Automatic scans at least twice daily, background vs catch-up distinguished. Still needs the hosting scheduler actually pointed at `/api/radar/cron` in production — see [[vfiles-deployment-model]].
- **[DONE]** Store last checked, next due, source response, counts, zero-result reason.
- **[DONE]** Deduplicate discoveries across every origin. `opportunityKey()` normalizes scheme/host/tracking-params/fragments; `mergeDuplicateOpportunities()` repairs rows an earlier build already duplicated, keeping the earliest `discovered_at` and the user's latest real decision. One piece of the original ask not built: merging keeps the *surviving* row's own URL rather than upgrading to "the most direct" one — low-value edge case, not done.
- **[DONE]** Startup job radar scoring. Wellfound and Y Combinator's Work at a Startup are wired up (paste-link import, auto-tagged `Startup / Early-stage` from the source regardless of posting text). Built In is wired up via paste-link but deliberately not auto-tagged (it lists companies of every size). The category tag now actually feeds the match score: a new `companyStagePreference` profile setting (`no_preference` default / `prefer_startups` soft boost / `startups_only` hard filter, same severity class as an exclusion term) is scored in `scoreRadarOpportunity` against the opportunity's classified `companyCategory`. Threaded into all three scoring call sites (`importRadarOpportunities`, `importLinkedInSavedJobs`, `scanRadar`'s per-job loop), and an existing company's own stored type now correctly overrides a fresh text/source classification on re-import (previously only computed when the company row was first created). Along the way, found and fixed a real bug: the add-monitor "Type" dropdown defaulted to `TARGET_TYPES[0]` = "Startup / Early-stage", silently tagging every manually-added company as a startup unless the user remembered to change it — now defaults to "Other". New UI control in the Search Goals card. 197/197 tests (5 new unit + 2 new integration, incl. a boundary case at minScore=20 where the capped penalty score could otherwise slip through the dashboard's text-sniffed display recheck).

## P1 — Role Workspace and market learning

- **[DONE, challenge half]** Make URL paste/copy-paste robust for public, redirected, login, challenge, and partial pages. Public/redirected/login were already handled (manual redirect-following up to 4 hops, 401/403 → clear "requires login" message). **"Challenge" was a real, confirmed gap**: a Cloudflare/PerimeterX/DataDome/reCAPTCHA interstitial returns a normal HTTP 200 with a full HTML page, so it sailed past both the login check and the not-enough-text check — the challenge page's own boilerplate silently became the imported "job description," no error at all. New `looksLikeBotChallenge()` (vendor-specific page titles + script/markup identifiers, e.g. `cf-chl-`, `g-recaptcha`, `px-captcha`) throws a clear, actionable error instead. Deliberately keys on vendor markup, not prose, so a real posting that happens to say "please verify you are authorized to work" is never misclassified — verified with a dedicated negative test. 9 new tests (incl. one that caught a real gap in the detector itself: the initial regex matched the JS global `grecaptcha` but not the far more common `g-recaptcha` CSS class real embeds actually use). "Partial pages" (JS-rendered SPA shells) not separately addressed — already caught by the existing not-enough-text check, no distinct signal to add.
- Add a compliant browser current-page capture flow for a logged-in LinkedIn page after explicit user action.
- Extract company, role title, location, description, requirements, source URL, and capture date from pasted/captured content.
- Save every role description automatically for market learning, independent of Save to Pipeline.
- Keep role history when the page is reloaded or cleared from the active workspace.
- **[DONE]** Move status/feedback above the application area; use clear success, warning, failure, and neutral colors. Position confirmed: the notice banner renders in the app's global `<header>`, above every view's content — already the highest position possible, not something to move further. Color: `noticeTone()` now has a fourth "pending" tone (amber, checked after error/success so a message that mentions a progress word in passing while reporting a real failure — "failed while reading" — is never misclassified as still in progress) for the "queued/in-progress" case the backlog flagged as unhandled; existing error/success classification unchanged.
- Show progress and retry/resend controls for reading, parsing, saving, recommendation, résumé, cover letter, and comparison.
- Clear the active intake after successful submission while retaining historical records.

## P1 — Knowledge, experience, and learning

- Keep “Knowledge Sources” (playbooks, tips, do/don'ts, templates, examples, research) separate from “Career Profile/Experience” (Marcos's facts and evidence).
- Make all tabs consume the same unified approved knowledge layer.
- **[DONE]** Make imported source types explicit and visible. `classifyKnowledgeSource()`'s result was computed (`sourceScope()` already used it to silently reassign scope on a high-confidence mismatch) but never shown — an uploaded source's detected type was thrown away instead of surfaced. Now a "Reads like: X (confidence)" chip appears on the source card whenever the detection disagrees with the declared category at medium+ confidence, with the matched reasons as a tooltip.
- **[DONE]** Detect duplicate/overlapping résumés and conflicting claims without deleting any source. New `lib/evidence-conflicts.mjs` (`auditEvidence`): cross-source near-duplicate clustering (a canonical fact + which other sources also approved it) plus two conflict classes — **title conflicts** (two sources naming a different role at the same employer with overlapping years) and **metric conflicts** (two near-identical claims that disagree on a number, e.g. "increased revenue by 20%" vs "by 45%" for what's otherwise the same sentence). Nothing is ever deleted; a "Consistency check" panel in Knowledge sources shows both, with full provenance (source title) on each side. A real bug was caught by the module's own tests before shipping: the duplicate-detector was classifying near-identical-but-different-number sentences as duplicates first (silently picking one as canonical), which would have swallowed the exact case the metric-conflict detector exists to catch — fixed by making duplicate detection require metric agreement.
- **[DONE, half]** Add Approve all/batch approval while retaining individual review for conflicts. `approveAllCandidates` now runs the same audit against already-approved facts from OTHER sources before bulk-adding; any candidate that would conflict is held back (stays unapproved, individually reviewable) rather than silently approved, with a notice explaining why. **Sensitive facts** (the other half of this line) is not addressed — there's no concept of a "sensitive" career-evidence fact anywhere in the app today (only autofill's unrelated SENSITIVE regex for form answers); would need its own definition of what makes an evidence fact sensitive before batch-approval could special-case it.
- **[DONE]** Suggest canonical facts and preserve provenance to every original file. This line predates the evidence-conflicts work above but is satisfied by it: every duplicate cluster names a canonical fact (the highest-quality-scoring near-duplicate) plus every other source that approved a version of it, and every entry in the audit carries its exact source document's id and title. Missed cross-referencing this line when the evidence-conflicts work was logged — correcting it now instead of re-building the same thing.
- **[DONE]** Fix missing playbook visibility and restore/status behavior after upload. Two real bugs found by reading the actual state logic (not guessing from the vague backlog wording): (1) the "Playbook sources" count in Knowledge sources always added a hardcoded `+ 1` for the built-in curated playbook, even when the user had explicitly disabled it via the Enable/Disable toggle — so the count stayed wrong (visibly too high) the moment curated guidance was turned off. Now it only adds 1 when `playbookSettings.curatedEnabled` is true. (2) A document could be restored (page reload, or a remote-backup merge) while still marked `status: "reading"` — the in-memory read that would resolve it belonged to the browser tab that started the upload, which no longer exists after a reload, so the card was stuck showing "Reading this file on your Mac…" forever with no retry path. The existing post-restore reconciliation effect (which already backfills auto-approval for older "guidance" documents) now also flips any leftover `"reading"` document to `"needs-text"` once the workspace has finished loading, and the needs-text message now explicitly mentions an interrupted read as a cause, not just "unsupported or over 10 MB." Browser-verified live: seeded a stuck "reading" document and `curatedEnabled: false`, reloaded, confirmed the document auto-recovered to "Needs text" with the new message and the playbook count read 1 (not 2).
- Support PDF, DOCX, TXT, Markdown, CSV, JSON/GPT exports, articles, and YouTube captions/transcripts with clear rate-limit/login fallbacks.
- Add a learning path showing processed, approved, used, and still-unreviewed material.
- Learn writing voice only from meaningful approved samples.

## P1 — Application and document history

- Make application records editable, including application date, status, source, notes, company, and role.
- Link the exact résumé and cover-letter version used, without duplicating files.
- Store why a version was selected and whether Marcos used a different version than suggested.
- **[DONE]** Add document-library filters by company, role, track, and provider. New filter bars (matching the existing Radar filter visual pattern) on both Applications sections: Pipeline gets status/company/search; Document library gets company/track/provider/search. Track and provider dropdowns are populated only from tracks/providers actually present in the data, not the full static lists. Browser-verified live with seeded data (3 applications, 3 résumé versions across 2 companies) — confirmed a company filter correctly narrows 3→2 results. Date filtering not built (no explicit ask for range vs. sort semantics; lists already render newest-relevant first).
- Preserve all historical job descriptions, drafts, submissions, and decisions.
- **[DONE, 2026-08-29]** Access from anywhere: the restore-on-load merge used to prefer the browser's local copy unconditionally whenever one existed, so a stale second device (phone opened after weeks) resurrected old records over everything edited elsewhere and autosaved that as the newest revision head. New freshness rule (`lib/workspace-sync.mjs`): each device stamps `localStorage` whenever its reconciled state changes; on load, a durable revision created after this device's stamp means another device saved more recently, so the remote side wins conflicts while device-only records are still kept via the id-union merges. D1's zone-less `CURRENT_TIMESTAMP` is pinned to UTC before comparing (a bare `Date.parse` would shift it by the device offset and pick the wrong winner west of UTC). Revisions stay append-only, so the worst case of clock skew is the old preference, never data loss. Documented the whole any-device story in `docs/access-from-anywhere.md` (token-on-a-new-device flow, PWA install, per-person `EXTRA_ACCESS_TOKENS`, cron scans while closed), linked from the README.

## P1 — AI providers and guardrails

- **[DONE]** Explicit, task-specific provider/model buttons. (already true)
- **[DONE]** Validate provider/model compatibility before sending. All three provider request shapes (OpenAI `text.format`, Anthropic `output_config`, Google `responseJsonSchema`) verified correct against live current docs this session.
- **[DONE]** Retry/backoff for transient 429/5xx, safe fallback to local analysis.
- **[DONE]** Capture privacy-safe provider/model/status/request-ID/latency/tokens. Usage tracking exists (`ai-security-store`). Cost estimate: new `lib/ai-pricing.mjs` converts recorded tokens to an approximate USD figure per provider/tier — real published Anthropic per-token rates for the models this app defaults to (opus-4-8/sonnet-5/haiku-4-5), reasoned comparable-tier estimates for OpenAI/Google (this app's configured model names for those two are its own future-dated placeholders with no published price to cite). Shown next to token counts in both usage-audit locations (cloud review, résumé generation), explicitly labeled "estimated." 7/7 new unit tests.
- **[DONE]** Model dropdowns by task + comparison mode.
- **[GAP, half fixed]** Store model outputs for reuse/evaluation — comparison results still exist only in memory during the session, not saved anywhere, and there is still no "winner" selection UI. **The adjacent dead-code half is fixed**: `aiDiagnostics`/`setAiDiagnostics` were scaffolded (state, UI text, even a fully-built backend route at `app/api/ai/models`) but `setAiDiagnostics` was never called anywhere, so the panel could never render and — more importantly — the real safety logic gated on it (`selectedModelGenerationBlocked`, the "listed but cannot generate" warning) was permanently inert since `aiDiagnostics.providers` was always empty. New "Check model catalog access" (free) and "Test real generation with X" (spends one small real request, clearly labeled) buttons call the existing backend route and populate the state — restoring the generation-capability guardrail as a side effect, not just the display panel. Browser-verified live (both the request and the error-handling path, since local dev has no ChatGPT sign-in to authenticate the check).
- **[DONE]** Reject malformed claims, map to exact fact indexes.
- **[DONE, verified today]** Distinguish consumer subscription vs API billing in the app's own setup guidance. This backlog line was carried forward as "not done" from an earlier session, but re-checking the actual current code found the copy already exists on the "Connect {provider}" setup card: "Create the key in that provider's developer console; API access and billing are separate from consumer chat subscriptions." Confirmed live in the browser. Correcting the stale claim rather than duplicating the sentence.

## P1 — LinkedIn and connections

- **[DONE, audited]** Complete official OpenID/OAuth setup documentation and status diagnostics. Previously "not yet audited" — read the full handshake (`app/api/linkedin/{start,callback,status}/route.ts` + `lib/linkedin-oauth.ts`) end to end looking for a real gap, same rigor as the other fixes this session, and found none: HMAC-signed CSRF state token with a 10-minute expiry, `__Host-`-prefixed cookies (enforces Secure + root path + no Domain by browser spec), an account-binding check that rejects a state token being redeemed by a different signed-in ChatGPT user than the one who started the flow, and correct token-exchange validation before trusting LinkedIn's response. The status route and Connections UI already report every real state (not configured, with the exact missing env var names; configured but not connected; connected, with identity) and the config box already lists the four required secrets. No code change made — verified rather than reworked.
- Never ask for or store a LinkedIn password.
- Support official LinkedIn ZIP/archive import and scope separation.
- Build the current-page capture/copy-paste path for logged-in pages.
- Do not claim access to private recommendations, saved jobs, or LinkedIn AI features without an approved LinkedIn product/API.
- Keep Indeed and other sources as compliant public/reference integrations unless an authorized personal API is available.

## P2 — Autofill assistant

- **[DONE]** Fix meaningless numeric fills and stale mappings. Two real bugs fixed: a shared section heading could fill every field beneath it with the same value; an unchecked checkbox/untouched dropdown was misread as "already answered" and hidden from the preview entirely.
- **[DONE, 2026-08-28 freshness half]** Stale scans are now surfaced the moment the popup opens, not at Fill time: a new `VALETA_STATUS` message compares the live field set against the last reviewed scan (fields appeared / fields removed) and the popup shows "rescan before filling" on load. Also new: role-specific questions (cover letter, "how did you hear", referral) route to review with a clear reason instead of landing in unmapped noise — with a word-boundary fix caught by tests ("referral" was matching inside "Preferred name"); the interest matcher now also covers "What interests/excites you". Auto-rescan via MutationObserver still deliberately not built: fill acts only on reviewed fields, so visibility, not automation, was the missing piece.
- **[GAP, safety half fixed]** Clean rescan without restarting the workflow — rescanning still works manually and there's still no LIVE re-detection (e.g. a MutationObserver auto-rescanning) when a form adds fields dynamically after the page loads. What's fixed: this used to be a real silent-fill risk, not just a convenience gap — `fill()` called `scan()` again internally right before writing, so if a multi-step form (or an "Add another employer" section) changed the DOM between the user's Scan click and their Fill click, the fill acted on whatever the page looked like at Fill-time, not what the user actually previewed. Fixed: `fill()` now acts ONLY on the exact field set + decision from the last explicit Scan (kept as live element references), never re-decides on the spot; anything fillable-looking that appeared since is counted and reported (`appearedSinceScan`) but never filled sight-unseen, and Fill with no prior scan at all now refuses instead of silently scanning-and-filling in one step. Verified against the real shipped `extension/content.js` in a browser harness (not just reasoned through): a field added after Scan was correctly left untouched on Fill, `appearedSinceScan` reported it, previously-scanned fields still filled correctly, and a field removed between Scan and Fill was safely skipped with no error. The user still has to click Rescan to bring new fields into a reviewed state — that manual step (the actual backlog ask) is unchanged.
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

