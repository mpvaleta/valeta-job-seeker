# Valeta's Job Seeker

A personalized job-search command center for Marcos Valeta first, designed to
become reusable for family and friends through separate user profiles.

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

## Local commands

- `npm run dev`: start the local development server through the Sites preview
  workflow.
- `npm run db:generate`: generate Drizzle migrations after schema changes.
- `npm run build`: build and validate the deployable Sites artifact.
- `npm test`: build, validate, and run the rendered HTML smoke test.
