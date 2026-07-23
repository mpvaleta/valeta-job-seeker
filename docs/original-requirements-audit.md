# Original requirements audit

Reviewed July 18, 2026 against the user's full V's Job Seeker request.

## Working now

- Role-specific local evidence analysis with explicit gaps and no invented
  experience.
- Resume, cover-letter, and common application-answer drafts from approved
  career facts.
- Writing-voice learning from uploaded samples for cover letters and answers.
- PDF, DOCX, TXT, Markdown, CSV, JSON, Custom GPT-export, and official LinkedIn
  ZIP ingestion.
- Separate career-evidence, résumé-playbook, writing-voice, and company-research
  scopes.
- Public résumé-article and YouTube-caption ingestion with provenance.
- OpenAI, Anthropic, and Google provider/model selection with server-only keys,
  structured output, three-model comparison, exact-fact validation, local
  fallback, and error reports.
- Role intake from pasted text or a copied public job link.
- Application tracker with date, status, and original source URL.
- Review-first Chrome autofill companion that never presses Submit and never
  guesses sensitive answers.
- Private job radar with positions, skills, goals, exclusions, locations,
  company targets, career-page discovery, daily/manual cadence, discovered-role
  inbox, fit reasons, shortlisting, and handoff to Role intake.
- Public Greenhouse, Lever, Ashby, structured JobPosting, and generic careers-
  page adapters.
- Separate résumé tracks for brand/creative project management, operations,
  production, and general project management.
- Official LinkedIn OpenID Connect implementation boundary, ready once a
  LinkedIn developer app and protected deployment secrets are supplied.
- GitHub-portable code and MacBook Pro-friendly responsive interface.

## Partially complete

- Daily radar: due targets catch up when V's opens and the Worker has a
  scheduled-event hook. A verified hosting scheduler trigger is still required
  for scans while the app is completely closed.
- Resume/cover-letter generation: functional drafts exist, but document-quality
  templates, playbook-rule citations, claim-level revision approval, and deeper
  writing-style learning remain.
- Knowledge database: local source processing, D1 radar persistence, and
  append-only authenticated R2 workspace revisions now work. Per-source object
  versioning, conflict review, and a selectable historical restore UI remain.
- Autofill: generic field mapping works; deeper Workday, Greenhouse, Lever,
  Ashby, iCIMS, and SmartRecruiters adapters and upload assistance remain.
- Multi-user foundation: hosting identity and user-isolated radar rows exist;
  full source/profile isolation for a spouse or friends remains.
- Design: the main shell and new workflows use a Mac-native system, but a full
  component-by-component accessibility and motion polish pass remains.

## Not possible through an ordinary LinkedIn member API

- A real-time copy of the full LinkedIn profile.
- Received LinkedIn recommendations.
- LinkedIn's personal job-recommendation feed or saved jobs.
- Automated LinkedIn browsing, scraping, or application activity.

V's therefore uses official exports, user-pasted links/text, and public company
career pages. LinkedIn OpenID is implemented for its actual limited identity
fields and activates after developer-app configuration; restricted Talent Solutions access would
require a separate LinkedIn partner agreement.

## Remaining roadmap

1. Activate and verify a true closed-app daily scheduler.
2. Add a selectable historical-restore UI and conflict review on top of the
   immutable private workspace revision store.
3. Add claim-level AI editing, playbook citations, and polished PDF/DOCX résumé
   templates.
4. Expand form adapters and add an in-page review queue for uncertain fields.
5. Build full multi-user source isolation and onboarding for family/friends.
6. Add alerts/digests for new radar discoveries.
7. Continue the visual/accessibility polish pass.

## Authorizations that may be needed later

- One protected AI-provider key for optional cloud review.
- A hosting scheduler control or equivalent verified trigger for closed-app
  daily radar runs.
- A LinkedIn developer application and four protected deployment secrets if
  limited OpenID identity is desired.
- User installation of the local Chrome companion for application-page field
  assistance. V's should not request full-screen control or LinkedIn session
  access.
