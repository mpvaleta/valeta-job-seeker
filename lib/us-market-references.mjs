/*
 * Optional second curated pack: U.S.-market résumé references researched
 * August 2026. Kept separate from CURATED_RESUME_PLAYBOOK so the user can
 * enable either, both, or neither — uploaded personal rules always outrank
 * both packs. Rules are paraphrased guidance, never career evidence.
 */
export const US_MARKET_REFERENCES = {
  version: "2026.08.19",
  lastReviewed: "2026-08-19",
  name: "U.S. Market Reference Pack",
  summary: "Researched 2026 U.S. hiring conventions — the Harvard one-page bullet formula plus current ATS formatting and keyword guidance. Optional: it adds to your uploaded best practices and never replaces them.",
  sources: [
    {
      id: "harvard-mcs",
      title: "Harvard Mignone Center for Career Success — Create a Strong Resume",
      url: "https://careerservices.fas.harvard.edu/resources/create-a-strong-resume/",
      authority: "University career center",
    },
    {
      id: "resumegenius-rules",
      title: "Resume Genius — Resume Guidelines: 18 Formatting & Writing Rules for 2026",
      url: "https://resumegenius.com/blog/resume-help/resume-guidelines",
      authority: "Résumé industry guide",
    },
    {
      id: "scalejobs-ats",
      title: "Scale.jobs — ATS Resume Format 2026: What Works (and What Doesn't)",
      url: "https://scale.jobs/blog/ats-resume-format-2026-design-guide",
      authority: "ATS research guide",
    },
    {
      id: "enhancv-ats",
      title: "Enhancv — ATS Resume Examples & Guide for 2026",
      url: "https://enhancv.com/resume-examples/ats/",
      authority: "Résumé industry guide",
    },
    {
      id: "bjsa-ats",
      title: "Best Job Search Apps — ATS Resume Guide 2026: Format, Keywords, and Best Practices",
      url: "https://bestjobsearchapps.com/articles/en/ats-resume-guide-2026-format-keywords-and-best-practices-to-beat-applicant-tracking-systems",
      authority: "ATS research guide",
    },
  ],
  rules: [
    { id: "one-page", kind: "do", text: "Keep the résumé to one page for most roles; use two only when ten or more years are directly relevant to the target job.", sourceIds: ["harvard-mcs", "resumegenius-rules"] },
    { id: "action-context-result", kind: "do", text: "Build every bullet as action + context + result: a strong verb, the project or problem, and the verified outcome.", sourceIds: ["harvard-mcs"] },
    { id: "verb-first", kind: "do", text: "Start each bullet with a varied action verb — never \"Responsible for\" and never first person.", sourceIds: ["harvard-mcs", "resumegenius-rules"] },
    { id: "quantify-hard", kind: "do", text: "Quantify with percentages, dollar amounts, and timeframes wherever a real number exists — measurable results are what both recruiters and modern ATS ranking prioritize.", sourceIds: ["scalejobs-ats", "bjsa-ats"] },
    { id: "single-column", kind: "do", text: "Use a single-column layout with standard fonts at 10.5–12pt; avoid tables, text boxes, images, icons, and headshots, which still break ATS parsing.", sourceIds: ["resumegenius-rules", "scalejobs-ats", "enhancv-ats"] },
    { id: "chronological", kind: "do", text: "Prefer reverse-chronological or hybrid format — the structures ATS parsers classify most reliably.", sourceIds: ["enhancv-ats", "bjsa-ats"] },
    { id: "mirror-keywords", kind: "do", text: "Mirror the posting's exact wording for skills you genuinely have (e.g. \"project management\" vs \"program management\") — 2026 ATS ranking is semantic, and stuffing unsupported keywords actively hurts.", sourceIds: ["bjsa-ats", "scalejobs-ats"] },
    { id: "standard-headers", kind: "do", text: "Use standard section headers — Summary, Experience, Skills, Education — so parsing classifies every entry correctly.", sourceIds: ["enhancv-ats", "resumegenius-rules"] },
    { id: "skills-first", kind: "do", text: "Lead with demonstrated capabilities over credentials — U.S. hiring is shifting skills-first, and the summary plus first bullets carry the decision.", sourceIds: ["bjsa-ats"] },
    { id: "tense-discipline", kind: "do", text: "Write past roles in past tense and the current role in present tense, consistently.", sourceIds: ["resumegenius-rules"] },
    { id: "date-format", kind: "do", text: "Format every date the same way (e.g. \"Jun 2024 – Present\") — inconsistent dates are a common silent parsing failure.", sourceIds: ["enhancv-ats"] },
    { id: "targeted-summary", kind: "do", text: "Open with a two-to-three-line summary targeted at this role's keywords — not a generic objective statement.", sourceIds: ["resumegenius-rules", "bjsa-ats"] },
    { id: "contact-line", kind: "dont", text: "Do not include a full street address or \"References available upon request\" — city/state, phone, email, and LinkedIn are the U.S. standard.", sourceIds: ["resumegenius-rules"] },
    { id: "pdf-naming", kind: "do", text: "Submit as PDF named FirstName-LastName-Resume unless the posting explicitly asks for another format.", sourceIds: ["resumegenius-rules"] },
  ],
};
