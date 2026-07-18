# Source and platform policy

## Knowledge source scopes

Sources must be classified before they can influence an output:

- **career evidence** supports personal claims and requires fact-level approval;
- **résumé playbook** stores tips, do/don't rules, templates, and authoritative
  guidance about creating a strong résumé;
- **writing voice** shapes tone only;
- **research context** describes a company, market, or role and is never
  evidence about the candidate.

Résumé guidance must never be promoted into the verified career fact bank. A
writing sample is not evidence that the candidate performed the work discussed
in it, and company research is not candidate experience.

## Career content sources

The database should prioritize sources that are either owned by the user or
stable, public, and attributable:

- resumes, LinkedIn exports, portfolios, writing samples, and uploaded notes;
- company career pages;
- official ATS feeds such as Greenhouse and Lever when available;
- authoritative resume and cover-letter guidance from university career offices;
- public company and agency information used only for role/company research.

Each content source should store:

- title;
- URL or upload origin;
- topic;
- trust level;
- refresh cadence;
- last checked timestamp;
- notes about limitations.

Uploaded files are processed locally in the current MVP. URLs are provenance
records only unless a later, explicitly authorized public-source monitor fetches
them.

## LinkedIn handling

LinkedIn should be treated as a user-directed source:

- The user can paste a LinkedIn role URL or job description.
- The user can upload/export profile information they are allowed to use.
- The app should draft tailored materials from user-provided content.
- The app should not scrape LinkedIn pages or run background automation against
  LinkedIn.

## Application assistant handling

The assistant should be review-first:

- activate only when the user chooses to use it;
- identify fields and show mappings;
- draft from verified facts and approved style profiles;
- flag uncertainty instead of guessing;
- require user review before submission;
- keep platform-specific restrictions visible in the UI.

## Database refresh model

Company monitors and source updates should run on a defined cadence:

- hourly only for fast-moving sources where useful;
- daily for target-company job monitors;
- weekly or monthly for resume/cover-letter guidance and slower reference
  content;
- immediate refresh when the user adds a new role or company.

Every refresh run should store whether anything changed and what new roles,
facts, or source updates were found.
