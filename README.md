# Valeta's Job Seeker

A private-first, personalized job-search command center designed to become
reusable for family and friends through separate user profiles.

The product helps with:

- importing resumes, LinkedIn exports, writing samples, and other career docs;
- maintaining a verified career fact bank so generated claims stay truthful;
- tailoring resumes to specific roles;
- drafting cover letters and application answers in the user's writing style;
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

Valeta uses two recommendation layers so the core workflow does not disappear
when a model, key, rate limit, or network connection has a problem.

1. The local evidence engine runs automatically in the browser. It extracts
   likely requirements, maps them to approved facts, calculates bounded scores,
   and produces a deterministic recommendation. It does not need an API key.
2. The optional OpenAI review runs only when the user clicks **Run cloud AI
   review**. The browser sends the pasted job description, company/title,
   approved career facts, and a small local score summary to Valeta's backend.
3. The backend reads `OPENAI_API_KEY` from a protected server environment
   variable and calls the OpenAI Responses API using `gpt-5.6-sol` by default.
   The key is never returned to the browser. Cloud requests also require the
   hosting platform's authenticated-user identity header.
4. The model must return a strict JSON shape. It may select evidence only by
   index from the approved facts supplied in that request. The backend maps
   those indexes back to the exact original facts and rejects malformed output.
5. A timeout, provider error, rate limit, or invalid response produces a safe
   error message and leaves the local recommendation active.

Raw uploaded documents, writing samples, profile contact fields, LinkedIn
credentials, browser history, sensitive application answers, and API keys are
not sent in the cloud recommendation request. Uploaded documents remain in the
browser; only facts explicitly approved by the user can enter the request.

### Cloud setup

Copy `.env.example` to the environment used by the deployment, then store the
real key as a protected server secret:

```text
OPENAI_API_KEY=your-server-secret
OPENAI_MODEL=gpt-5.6-sol
AI_ALLOWED_EMAILS=you@example.com,friend@example.com
```

Never commit a real `.env` file, use a `NEXT_PUBLIC_*` key, or paste the key into
the app UI. Until the protected secret exists, the **AI & reliability** screen
correctly reports “Not configured yet” while the local engine stays active.
`AI_ALLOWED_EMAILS` is optional but recommended before sharing the URL; it
limits cloud-key usage to the listed signed-in ChatGPT accounts. The backend
also applies best-effort burst protection per authenticated account.

## Diagnostics

The **AI & reliability** screen keeps the latest 50 technical failures in local
browser storage. It records connection, AI request, document-reading, and
unexpected browser errors. The downloadable JSON report includes the app build,
model, connection state, timestamps, safe error messages, and non-sensitive
status context. It deliberately excludes resume text, approved facts, raw
documents, profile fields, credentials, and API keys.

## Reliability tests

`npm test` builds and validates the deployment artifact, then tests:

- incomplete role and insufficient-evidence behavior;
- strong-match and evidence-gap recommendations;
- deterministic, bounded scoring;
- source provenance and approved-facts-only evidence;
- the AI configuration endpoint without secret disclosure;
- invalid API requests and the no-key local fallback;
- anonymous access and optional account-allowlist protection;
- rendered availability of the AI/reliability and diagnostics interface.

## Local commands

- `npm run dev`: start the local development server through the Sites preview
  workflow.
- `npm run db:generate`: generate Drizzle migrations after schema changes.
- `npm run build`: build and validate the deployable Sites artifact.
- `npm test`: build, validate, and run the recommendation, API fallback, and
  rendered HTML tests.
