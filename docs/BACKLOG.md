# V's Job Seeker — Complete Backlog Log

Updated: 2026-07-28

Priority labels reflect Marcos's stated order. P0 and P1 are the work that most directly affects getting applications out quickly.

## P0 — Résumé generation and output quality

- Produce a complete, professional résumé with name, approved contact header, target title, summary, selected experience, accomplishments, skills, and clean formatting.
- Apply the selected résumé playbook before generation and show which rules were applied.
- Use approved career evidence as the only source for claims; surface unsupported requirements instead of filling gaps.
- Remove malformed keyword fragments, duplicated facts, raw CSV/code noise, contact chatter, and generic filler.
- Filter writing-voice samples so greetings, comments, URLs, emojis, export headers, and casual noise do not dominate the learned profile.
- Keep multiple résumé tracks: brand/creative PM, creative operations, production/producer, general PM/program management, sports marketing, and custom tracks.
- Make the draft editable before export or application use.
- Save every generated and edited version; never overwrite the previous version.
- Attach each version to company, role title, role description, résumé track, provider/model, prompt inputs, creation date, edits, tokens/usage when available, and application date when submitted.
- Reuse a strong prior version for similar roles with an adaptation explanation and lower-cost path.
- Compare two or three model outputs side by side with quality signals: evidence compliance, clarity, specificity, playbook adherence, track fit, and writing voice.
- Make the selected/default model and the model used for each output explicit.

## P1 — Job Radar reliability

- Radar must scan the companies Marcos added and label results as monitored-by-Marcos, suggested-by-V, imported, or manually added.
- Keep all Radar discoveries in the Radar/discovery inbox, not Role Workspace.
- Add filters for company, source, target position, location, alignment, status, and origin.
- Add target-position dropdowns/checkpoints while preserving custom values.
- Preserve minimum alignment and other target settings across every run.
- Classify real job postings separately from navigation/marketing content such as “learn more,” “working here,” or generic program pages.
- Discover careers/jobs/opportunities/openings/join-us pages from company homepages.
- Follow public ATS and job-board links where compliant: Greenhouse, Lever, Ashby, Workday, SmartRecruiters, iCIMS, Built In SF, Wellfound, TeamWork Online, Indeed references, and other relevant sources.
- Use secondary public sources to recover a role when the employer page blocks reading, but retain direct-source verification status.
- Test Meta, Google, Apple, and additional monitored companies as regression fixtures.
- Add approve, dismiss, archive, and restore actions without deleting discovery history.
- Support automatic scans at least twice daily when the hosting scheduler is available; clearly distinguish background scans from app-open catch-up.
- Store last checked, next due, source response, discovered count, filtered count, and reason for zero results.
- **Deduplicate discoveries across every origin.** The same role must occupy one inbox row no matter how it arrived. Matching on the raw `source_url` string treats trivially different URLs as different jobs — trailing slash, `http` vs `https`, `www.`, tracking parameters (`utm_*`, `gh_src`, `trk`), reordered query parameters, and `#fragment` all produce a second row, and a role found by a monitored scan, then by V's Job Watch, then imported by hand produces three. Merging must preserve the user's decision (an approved or dismissed row never reverts to `new`), keep the earliest `discovered_at`, and prefer the most direct source URL. Never silently delete history while merging.
- **Add a startup job radar.** Marcos wants roles at startups, which mostly do not appear on the enterprise ATS boards the radar covers today. Cover compliant startup-focused sources — Wellfound/AngelList, Y Combinator's job board, Built In SF — plus startup ATS tenants (Ashby and Lever are heavily used by early-stage companies). Let a monitored target be marked as a startup so stage, funding, and company size can inform scoring, and so a startup track can be filtered separately in the inbox.

## P1 — Role Workspace and market learning

- Make URL paste/copy-paste robust for public, redirected, login, challenge, and partial pages.
- Add a compliant browser current-page capture flow for a logged-in LinkedIn page after explicit user action.
- Extract company, role title, location, description, requirements, source URL, and capture date from pasted/captured content.
- Save every role description automatically for market learning, independent of Save to Pipeline.
- Keep role history when the page is reloaded or cleared from the active workspace.
- Move status/feedback above the application area; use clear success, warning, failure, and neutral colors.
- Show progress and retry/resend controls for reading, parsing, saving, recommendation, résumé, cover letter, and comparison.
- Clear the active intake after successful submission while retaining historical records.

## P1 — Knowledge, experience, and learning

- Keep “Knowledge Sources” (playbooks, tips, do/don'ts, templates, examples, research) separate from “Career Profile/Experience” (Marcos's facts and evidence).
- Make all tabs consume the same unified approved knowledge layer.
- Make imported source types explicit and visible.
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

- Make OpenAI, Gemini, and Claude review/generation buttons explicit and task-specific.
- Validate provider/model compatibility before sending a request.
- Add retry/backoff for transient 429/5xx responses and safe fallback to local analysis.
- Capture privacy-safe provider, model, task, status, request ID, latency, approximate tokens, and cost estimate when available.
- Add default model dropdowns by task and a one/two/three-model comparison mode.
- Store model outputs and user-selected winner for future reuse and evaluation.
- Reject malformed or unsupported claims and map evidence to exact approved-fact indexes.
- Distinguish consumer subscriptions from API billing/quotas in setup guidance.

## P1 — LinkedIn and connections

- Complete official OpenID/OAuth setup documentation and status diagnostics.
- Never ask for or store a LinkedIn password.
- Support official LinkedIn ZIP/archive import and scope separation.
- Build the current-page capture/copy-paste path for logged-in pages.
- Do not claim access to private recommendations, saved jobs, or LinkedIn AI features without an approved LinkedIn product/API.
- Keep Indeed and other sources as compliant public/reference integrations unless an authorized personal API is available.

## P2 — Autofill assistant

- Fix meaningless numeric fills and stale mappings.
- Add clean rescan/reload without restarting the workflow.
- Use active role, company, résumé track, approved profile, selected documents, and role-specific answers.
- Support text fields, textareas, dropdowns, radios, checkboxes, repeated sections, uploads, and dynamic ATS forms.
- Preview every mapping, flag uncertainty, log unmapped fields, and never submit automatically.
- Allow a different résumé version to be uploaded/selected before filling.

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

## Required verification for every release

- TypeScript and lint checks.
- Production build and deployment artifact validation.
- Unit tests for parsing, persistence, guardrails, provider adapters, Radar classification, and versioning.
- Integration tests for API routes and database writes.
- Browser walkthrough of the changed flow.
- Repeat critical flows at least three times: role import, résumé generation/edit/save, provider failure/fallback, Radar scan, and application version linkage.
- Confirm no existing data, files, applications, or versions were deleted.
- Confirm secrets and personal career facts are not committed to public GitHub.

