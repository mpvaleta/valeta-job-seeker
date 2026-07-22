# V's Job Seeker

A private-first, personalized job-search command center designed to become
reusable for family and friends through separate user profiles.

The product helps with:

- importing resumes, official LinkedIn ZIP exports, writing samples, and other career docs;
- maintaining a separate résumé playbook of trusted tips, do/don't rules,
  templates, and best practices;
- maintaining a verified career fact bank so generated claims stay truthful;
- tailoring resumes to specific roles;
- drafting cover letters and application answers in the user's writing style;
- maintaining separate résumé tracks for different career directions;
- tracking companies, agencies, roles, applications, dates, and next steps;
- monitoring selected company and ATS sources for Bay Area and US roles;
- assisting with repetitive application forms through a review-first workflow.

## MVP order

1. Command center and data model.
2. Document ingestion and verified fact bank.
3. Role analyzer and resume-tailoring workspace.
4. Cover-letter and application-answer voice engine.
5. Company/application directory.
6. Company monitors using public career pages and official ATS sources.
7. Permission-based browser companion for allowed application forms.
8. GitHub publication and multi-user hardening.

## Guardrails

- No invented accomplishments, metrics, companies, dates, tools, or claims.
- Every generated bullet or answer should trace to one or more verified facts.
- LinkedIn roles should be handled through user-provided URLs/text or approved
  exports, not automated scraping.
- Autofill should show mapped fields and uncertainty before anything is
  submitted.
- Submission automation, if added, must remain user-approved and platform-safe.

## Architecture

- Next/Vinext site for the MacBook Pro-friendly web app experience.
- D1 (`DB`) stores structured records: users, profiles, facts, opportunities,
  applications, monitors, source registry, writing style, and drafts.
- R2 (`BUCKET`) stores uploaded resumes, writing samples, raw role descriptions,
  exports, and generated document files.
- ChatGPT/Sites identity headers provide the initial user identity path.
- The UI starts as one command-center route and can split into routes as the
  workflows become interactive.

## AI recommendation architecture

V's uses two recommendation layers so the core workflow does not disappear
when a model, key, rate limit, or network connection has a problem.

1. The local evidence engine runs automatically in the browser. It extracts
   likely requirements, maps them to approved facts, calculates bounded scores,
   and produces a deterministic recommendation. It does not need an API key.
2. The optional cloud review runs only when the user clicks a cloud-review
   button. The user can choose OpenAI, Anthropic Claude, or Google Gemini and
   then choose an allowlisted quality tier for that provider.
3. The backend reads the selected provider's key from a protected server
   environment variable. Keys are never returned to the browser. Cloud
   requests also require the hosting platform's authenticated-user identity
   header. The browser can choose only a provider/model key from the server
   registry; it cannot supply an arbitrary model ID or endpoint.
4. The model must return a strict JSON shape. It may select evidence only by
   index from the approved facts supplied in that request. The backend maps
   those indexes back to the exact original facts and rejects malformed output.
5. A timeout, provider error, rate limit, or invalid response produces a safe
   error message and leaves the local recommendation active.
6. The optional model lab runs the selected provider's three allowlisted models
   against the same role and approved facts so the user can compare results.

Raw uploaded documents, résumé playbooks, writing samples, company research,
profile contact fields, LinkedIn credentials, browser history, sensitive
application answers, and API keys are not sent in the cloud recommendation
request. Uploaded sources remain in the browser; only facts explicitly approved
by the user can enter the request.

The default registry was reviewed on July 18, 2026 against the official
[OpenAI model catalog](https://developers.openai.com/api/docs/models),
[Anthropic model overview](https://platform.claude.com/docs/en/about-claude/models/overview),
and [Gemini 3.5 guide](https://ai.google.dev/gemini-api/docs/whats-new-gemini-3.5).
Each adapter requests structured JSON and the V's backend validates the
result again before displaying it.

## Knowledge source boundaries

The **Knowledge sources** screen deliberately separates four scopes:

- **Career evidence**: résumés, LinkedIn exports, Custom GPT exports, and other
  personal evidence. Candidate claims require explicit approval before they
  enter the career fact bank.
- **Résumé playbook**: tips, do/don't rules, templates, and trusted résumé best
  practices. Rules can be activated as an editorial checklist but never become
  personal claims.
- **Writing voice**: real writing samples. They shape tone and phrasing only.
- **Research context**: company and role research. It stays separate from the
  candidate's experience.

PDF, DOCX, TXT, Markdown, CSV, JSON/GPT exports, and official LinkedIn ZIP
archives are read on the user's Mac. LinkedIn archives are separated into
career evidence, saved-job/AI research context, and public writing samples.
Each file is limited to 10 MB and each extracted source to 300,000 characters
to keep browser storage and document processing predictable. An optional source
URL can be used to read a public article, public job page, or exposed YouTube
captions. Link reading never logs in, sends cookies, or accesses private pages;
unsupported sources fall back to user-pasted text.

The app also ships a dated, source-linked curated playbook. The July 18, 2026
edition paraphrases guidance from Harvard's Mignone Center, Yale's Office of
Career Strategy, CareerOneStop, and UC Berkeley Career Engagement. It updates
with V's releases, can be disabled in the Knowledge sources screen, and is
kept separate from user-provided evidence.

## Job radar

The **Job radar** is a private, review-first company monitor:

- users save target positions, skills, markets, work modes, goals, exclusions,
  and a minimum alignment threshold;
- each target has a company website and/or public careers URL and a daily or
  manual cadence;
- V's can discover and follow a public Careers, Jobs, Opportunities, Openings,
  or Join-us hub from the company homepage;
- Greenhouse, Lever, and Ashby use their public job-board endpoints, while
  other public careers pages use structured `JobPosting` data and job links;
- matching roles enter a discovery inbox with deterministic goal-alignment
  reasons and `new`, `reviewing`, `shortlisted`, `dismissed`, or `applied`
  states;
- **Prepare application** loads the original role into Role intake; it never
  submits or applies automatically;
- due daily targets catch up when the private app is opened. The Worker also
  contains a scheduled-event hook, but a true closed-app background cadence
  requires a verified hosting scheduler trigger.

Radar targets, goals, and discoveries use per-user D1 records keyed by the
hosting platform's authenticated identity. Career documents and raw résumé
evidence remain browser-local in this release.

## Public-link ingestion

Role intake can paste a URL directly or use the clipboard button. A protected
backend reader accepts only standard public web URLs, blocks private-network
hosts and embedded credentials, limits redirects and response size, and never
sends browser cookies. The same reader imports public résumé articles and
YouTube transcripts when the video exposes captions.

LinkedIn is intentionally excluded from automated reading. Official LinkedIn
OpenID access is limited to identity fields, while Talent Solutions APIs are
restricted partner products and do not provide a general personal job-
recommendations or received-recommendations feed. V's supports profile URLs,
official LinkedIn data exports, and user-pasted saved-job links instead. Indeed
and other job-board links can be saved or attempted as public sources; if a
site returns HTML sign-in/challenge content, the app shows an explicit manual-
copy path instead of a raw JSON parser error.

### Cloud setup

For production, open [ChatGPT Sites](https://chatgpt.com/sites), find **V's
Job Seeker**, choose **More actions → Settings**, and add one or more provider
keys as secrets. Add optional model overrides in the same screen, then redeploy
the approved saved version so the new environment revision becomes active:

```text
OPENAI_API_KEY=your-server-secret
OPENAI_MODEL=gpt-5.6-sol
ANTHROPIC_API_KEY=your-server-secret
GEMINI_API_KEY=your-server-secret
AI_ALLOWED_EMAILS=you@example.com,friend@example.com
LINKEDIN_CLIENT_ID=your-linkedin-app-client-id
LINKEDIN_CLIENT_SECRET=your-server-secret
LINKEDIN_REDIRECT_URI=https://your-site.example/api/linkedin/callback
LINKEDIN_SESSION_SECRET=at-least-32-random-characters
```

For local development, copy `.env.example` to a local ignored environment file
and add the same keys there.

Configure only the providers you intend to use. API keys and provider billing
are obtained from each provider's developer platform; a consumer chat
subscription is not an API key. Never commit a real `.env` file, use a
`NEXT_PUBLIC_*` key, or paste a key into the app UI. Until a selected provider's
protected secret exists, the **AI & reliability** screen correctly reports
“Setup required” while the local engine stays active.
`AI_ALLOWED_EMAILS` is optional but recommended before sharing the URL; it
limits cloud-key usage to the listed signed-in ChatGPT accounts. The backend
also applies best-effort burst protection per authenticated account.

LinkedIn sign-in uses the official OpenID Connect product and stores only a
signed, HTTP-only identity session. It does not store the access token and does
not grant access to job pages, received recommendations, saved jobs, or
LinkedIn's AI/profile suggestions. Import LinkedIn's official ZIP for those
exportable datasets.

## Diagnostics

The **AI & reliability** screen keeps the latest 50 technical failures in local
browser storage. It records connection, AI request, document-reading, and
unexpected browser errors. The downloadable JSON report includes the app build,
provider/model, connection state, timestamps, safe error messages, and non-sensitive
status context. It deliberately excludes resume text, approved facts, raw
documents, profile fields, credentials, and API keys.

## Reliability tests

`npm test` builds and validates the deployment artifact, then tests:

- incomplete role and insufficient-evidence behavior;
- strong-match and evidence-gap recommendations;
- deterministic, bounded scoring;
- source provenance and approved-facts-only evidence;
- the AI configuration endpoint without secret disclosure;
- provider and model allowlisting for OpenAI, Anthropic, and Google;
- structured-output normalization and exact approved-fact mapping across all
  three provider adapters;
- source-scope separation for career evidence, résumé guidance, writing voice,
  and company research;
- public-link safety, article extraction, structured JobPosting parsing, and
  YouTube public-caption parsing;
- radar defaults, deterministic target matching, exclusions, and public ATS
  adapter behavior, including company-homepage career-hub discovery;
- official LinkedIn ZIP scope separation and signed OpenID state handling;
- deterministic writing-voice learning and résumé-track selection;
- invalid API requests and the no-key local fallback;
- anonymous access and optional account-allowlist protection;
- rendered availability of the radar, connections, AI/reliability, and
  diagnostics interfaces.

## Local commands

- `npm run dev`: start the local development server through the Sites preview
  workflow.
- `npm run db:generate`: generate Drizzle migrations after schema changes.
- `npm run build`: build and validate the deployable Sites artifact.
- `npm test`: build, validate, and run the recommendation, API fallback, and
  rendered HTML tests.
