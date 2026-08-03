# V's Job Seeker — Project Handoff

Updated: 2026-07-26

## What this project is

V's Job Seeker is a private-first job-search command center for Marcos Valeta. It turns approved career evidence, résumé playbooks, writing samples, market roles, and application history into role-specific job-search materials and decisions.

The core product loop is:

1. Import or paste a role and preserve its job description for market learning.
2. Match requirements to approved career evidence and identify gaps.
3. Generate a role-specific résumé, cover letter, and application answers using the selected résumé track and writing voice.
4. Review, edit, save, compare, and reuse every output version.
5. Track the application and the exact documents used.
6. Monitor selected companies and public job sources in the Job Radar.
7. Keep the user in control: no invented experience, no silent application submission, and no unauthorized LinkedIn scraping.

## Marcos's target positioning

- Primary: Project and Operations Manager, brand and creative project management, creative operations, program/project management, and production.
- Additional tracks: sports marketing, creative/producer work, marketing operations, advertising agencies, and custom plan-B areas.
- Geography: Fremont / San Francisco Bay Area first, then U.S. remote and selected national roles.
- Evidence source of truth: Marcos's approved career facts and original source documents.
- Writing source of truth: approved, filtered writing samples.
- Résumé quality source of truth: Marcos's uploaded résumé playbooks, tips, do/don't rules, templates, and examples. Playbook rules guide writing but never become claims about Marcos.

## Shipped in the current source

- Role intake with pasted URLs/text, public-link safety, HTML/login detection, retry states, and saved role context.
- Job Radar with monitored companies, target positions, goals, exclusions, alignment scoring, company-homepage recovery, and public ATS/job-board adapters.
- Discovery and recovery paths for blocked or incomplete public career pages.
- Separate monitored versus suggested source handling and transparent Radar diagnostics.
- Résumé tracks, résumé reuse signals, model/provider diagnostics, and resume-generation guardrails.
- OpenAI, Anthropic, and Google provider/model selection with structured-output validation and local fallback.
- AI request security, authenticated-user checks, rate limits, allowlists, and persistent usage controls.
- LinkedIn OpenID/OAuth boundary, signed state/session handling, disconnect flow, and official archive import path.
- Knowledge-source separation for career evidence, résumé playbook, writing voice, and research context.
- Writing-voice learning with filtering and source-aware processing.
- D1 schema/migrations for workspace data, AI security/usage, OAuth sessions, and Radar persistence.
- Browser autofill companion with preview-first behavior and no automatic submit.
- Application and document workflow foundations.
- Privacy-safe diagnostics and test coverage for link reading, Radar, résumé routes, providers, OAuth, persistence, and guardrails.

## Important constraints

- Never invent a company, title, date, metric, tool, accomplishment, or credential.
- Never delete uploaded files, facts, generated versions, job descriptions, or application history unless Marcos explicitly requests deletion.
- Never submit or claim an application was submitted without Marcos doing it.
- Do not store LinkedIn passwords or pretend official LinkedIn identity login grants private jobs, recommendations, saved jobs, or LinkedIn AI suggestions.
- Keep the local recommendation fallback available when cloud AI fails.
- Keep public GitHub portable and free of personal secrets and hardcoded private career data.

## Current bottlenecks and things not fully solved

- LinkedIn and some employer pages block server-side reading or return login/challenge HTML. The compliant solution still needs a robust current-page browser capture/copy-paste path.
- Some company sites expose navigation cards, “learn more,” or generic content that looks like a job. Radar needs stronger job-page classification and source verification.
- True twice-daily closed-app Radar execution depends on a verified hosting scheduler trigger; app-open catch-up is not the same thing.
- Cloud provider keys/models can report configured while returning 4xx/5xx or unusable output. Provider health, request IDs, raw-safe diagnostics, retries, and model-specific compatibility need continued verification.
- Résumé quality still needs a final document-quality pass: complete sections, clean skills, evidence-linked bullets, playbook adherence, editable output, and version reuse tied to the position.
- Autofill remains a high-risk area: field semantics, role-aware answers, dynamic forms, uploads, rescan, and suspicious numeric mappings need more browser testing.
- Durable encrypted storage and reliable restore for all source documents/output files remains incomplete.
- LinkedIn official identity integration requires Marcos's own LinkedIn developer application secrets and redirect configuration; the app cannot obtain those permissions automatically.
- External Claude Projects/skills, NotebookLM, and custom GPT knowledge are deferred to source-export/import workflows unless an authorized API exists.

## How another AI should work with this project

1. Read this handoff and `docs/BACKLOG.md` before changing code.
2. Treat the current Sites checkout as the latest source when it is newer than public GitHub.
3. Inspect the private error report before diagnosing provider or link failures.
4. Preserve all existing records and add migrations rather than replacing data.
5. Test real user flows repeatedly, including failed-provider and blocked-link paths.
6. Report what is verified, what is inferred, and what remains blocked by external permissions.

