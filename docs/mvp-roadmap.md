# MVP roadmap

## Shipped through MVP 0.3

- Local-first career profile and verified fact bank
- Job-description keyword and requirement extraction
- Evidence-oriented fit signal with transparent limitations
- Tailored resume, cover-letter, and application-answer drafts
- Copy and download actions
- Persistent application tracker and JSON backup
- Exportable autofill profile
- Chrome companion that fills common fields on user command and never submits
- Local PDF/DOCX/TXT/Markdown/CSV/JSON knowledge-source ingestion
- Separate career-evidence, résumé-playbook, writing-voice, and research scopes
- Selectable OpenAI, Anthropic Claude, and Google Gemini review adapters with a
  deterministic local fallback
- Browser-local diagnostics and a privacy-safe downloadable error report
- Private per-user radar goals, monitored companies, weekly/manual cadence, and
  a review-only discovery inbox
- Deterministic role-to-goal alignment with user-defined exclusions and minimum
  score
- Public Greenhouse, Lever, Ashby, structured JobPosting, and public-careers-
  page discovery adapters
- Role intake from a copied public job URL
- Public article and YouTube-caption ingestion into the scoped knowledge
  library
- LinkedIn API feasibility screen, official-export workflow, and explicit
  no-scraping boundary
- V's Job Seeker branding and a Mac-native visual refresh

## Next build priorities

1. Activate and verify a closed-app weekly scheduler trigger for the prepared
   Worker radar hook
2. AI résumé/cover-letter generation with playbook-rule citations and
   claim-level approval
3. Durable encrypted per-user source storage and restore
4. DOCX/PDF resume templates
5. Greenhouse, Lever, Workday, Ashby, and SmartRecruiters form adapters
6. Multi-user profiles for family and friends
7. Optional LinkedIn OpenID identity connection after developer-app approval;
   do not claim it unlocks job or member recommendations

## MVP 1 — Command center

Goal: make the product feel real immediately.

Includes:

- Wayfinder dashboard visual system.
- Best-next-role panel with fit score and evidence.
- Role intake field.
- Resume-tailoring, cover-letter, application, and monitor modules.
- Application directory snapshot.
- Durable D1/R2 schema foundation.

## MVP 2 — Career source ingestion

Goal: turn resumes, LinkedIn exports, and writing samples into reusable data.

Includes:

- Upload pipeline for resume PDFs, LinkedIn exports, writing samples, and notes.
- R2 object storage for originals.
- D1 metadata records.
- Extracted text checksums.
- Processing statuses.
- Human review queue for facts before reuse.

## MVP 3 — Verified fact bank

Goal: keep all generated career content truthful.

Includes:

- Facts grouped by experience, skill, industry, tool, outcome, language, and
  geography.
- Evidence source and confidence per fact.
- `reusable` approval flag.
- Gap detection when a role asks for something not supported by existing facts.

## MVP 4 — Role analyzer and resume tailor

Goal: tailor a resume to one selected role at a time.

Includes:

- Role requirement extraction.
- Fit score and match explanation.
- ATS keyword coverage.
- Human-readable positioning.
- Resume version draft with traceable fact IDs.
- Export-ready document generation.

## MVP 5 — Cover letter and writing style

Goal: produce cover letters and application answers that sound like the user.

Includes:

- Approved writing samples.
- Style profile with tone, phrases to prefer, phrases to avoid, and example
  edits.
- Tone modes: concise, balanced, story-led, brand, agency, tech, and sports.
- Reusable answer drafts for "Why this company?", "Tell us about yourself", and
  recruiter messages.

## MVP 6 — Application directory and company monitors

Goal: track everything applied to and find new roles from target companies.

Includes:

- Companies, agencies, marketing agencies, advertising agencies, and sports
  organizations.
- Applied date, status, next step, source URL, generated materials, and notes.
- Weekly or manual monitors for selected companies and public ATS sources.
- Source registry with last-checked timestamp and change summaries.

## MVP 7 — Application assistant

Goal: reduce repetitive form filling while preserving user control.

Includes:

- Companion browser extension activated by the user on supported pages.
- Field mapping and draft answers.
- Unknown-field questions.
- Review checkpoint before submit.
- Platform-specific restrictions, including no LinkedIn scraping.

## MVP 8 — Multi-user and GitHub handoff

Goal: make the app portable and reusable.

Includes:

- Separate user profiles for spouse/friends.
- Source isolation by user.
- Configurable target roles and markets.
- Private GitHub repository with documented setup and deployment flow.
