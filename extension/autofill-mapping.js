/*
 * Field-mapping decisions for the autofill companion.
 *
 * Loaded as a plain script before content.js and also exercised directly by
 * tests/autofill-mapping.test.mjs, so the rules that decide what gets typed
 * into a real application form are covered rather than only observed by hand.
 *
 * The guiding rule is that guessing is worse than leaving a field blank: the
 * user reviews everything, and a wrong value silently placed in the right-
 * looking box is the failure mode that actually costs an application.
 */
(function (root) {
  // Anything here is the user's to answer. The list errs wide on purpose: a
  // question wrongly flagged for review costs a moment, while one wrongly
  // auto-answered can misstate work authorization or a protected characteristic
  // on a real application. "authorization" alone previously missed the most
  // common phrasing of all — "Are you authorized to work…".
  const SENSITIVE = /salary|compensation|pay expectation|desired pay|expected pay|authoriz(?:ed|ation)|right to work|work permit|sponsor|visa|immigration|gender|pronoun|\brace\b|ethnicity|veteran|disability|criminal|conviction|felony|background check|drug (?:test|screen)|security clearance|legal|ssn|social security|birth|\bage\b|marital|citizen|sexual orientation|protected/i;

  // A control the user must operate themselves; V's can describe it but must
  // never choose a value.
  const CONTROLLED_TYPES = new Set(["number", "range", "date", "datetime-local", "time", "month", "week", "checkbox", "radio", "color"]);

  const RULES = [
    { key: "firstName", match: /\bfirst.?name\b|\bgiven.?name\b|\bforename\b/i, read: (data) => data.profile.fullName?.trim().split(/\s+/)[0] },
    { key: "lastName", match: /\blast.?name\b|\bfamily.?name\b|\bsurname\b/i, read: (data) => data.profile.fullName?.trim().split(/\s+/).slice(1).join(" ") },
    { key: "fullName", match: /\bfull.?name\b|\byour.?name\b|\bcandidate.?name\b|^name$/i, read: (data) => data.profile.fullName },
    { key: "email", match: /\be.?mail\b/i, read: (data) => data.profile.email },
    { key: "phone", match: /\bphone\b|\bmobile\b|\btelephone\b/i, read: (data) => data.profile.phone },
    { key: "location", match: /\bcity\b|\bcurrent.?location\b|\byour.?location\b|where.*located/i, read: (data) => data.profile.location },
    { key: "linkedin", match: /\blinkedin\b/i, read: (data) => data.profile.linkedin },
    { key: "headline", match: /\bheadline\b|\bprofessional.?title\b/i, read: (data) => data.answers.headline },
    { key: "summary", match: /\babout.?you\b|\bsummary\b|\bbackground\b|tell.?us.?about|\bprofessional.?profile\b/i, read: (data) => data.answers.summary },
    { key: "interest", match: /why.*(role|position|company)|interest.*(role|position|company)/i, read: (data) => data.answers.interest },
  ];

  function matchingRules(label) {
    if (!label) return [];
    return RULES.filter((rule) => rule.match.test(label));
  }

  /*
   * Decide what to do with one field.
   *
   * `strong` is the field's own labelling — name, id, placeholder, aria-label,
   * its <label>. `weak` is ambient context such as an aria-labelledby section
   * heading or an enclosing label block, which on ATS forms routinely covers
   * several inputs at once. Only `strong` may trigger a fill; a rule that
   * matches nothing but `weak` marks the field for review instead, because a
   * heading reading "Contact — email, phone, LinkedIn" otherwise put the email
   * address into all three boxes.
   */
  function decideField(field, data) {
    const strong = String(field.strong || "").trim();
    const weak = String(field.weak || "").trim();
    const combined = `${strong} ${weak}`.trim();
    const type = String(field.type || "").toLowerCase();
    const tag = String(field.tag || "").toUpperCase();

    if (field.answered) return { status: "existing", reason: "Already answered on the page", ruleKey: null, confidence: "n/a" };
    if (type === "file") {
      return {
        status: "review",
        reason: data?.resume?.title ? `Upload the selected résumé yourself: ${data.resume.title}` : "Upload your résumé yourself",
        ruleKey: null,
        confidence: "manual",
      };
    }
    if (SENSITIVE.test(combined)) {
      return { status: "review", reason: "Sensitive or legal answer — complete this personally", ruleKey: null, confidence: "manual" };
    }
    if (tag === "SELECT") return { status: "review", reason: "Dropdown — choose the exact option yourself", ruleKey: null, confidence: "manual" };
    if (CONTROLLED_TYPES.has(type)) return { status: "review", reason: "Choice or numeric field — confirm the exact value yourself", ruleKey: null, confidence: "manual" };

    const strongMatches = matchingRules(strong);
    if (strongMatches.length > 1) {
      return {
        status: "review",
        reason: `Label matches more than one answer (${strongMatches.map((rule) => rule.key).join(", ")}) — fill this one yourself`,
        ruleKey: null,
        confidence: "ambiguous",
      };
    }
    if (strongMatches.length === 1) {
      const rule = strongMatches[0];
      const value = rule.read(data);
      if (value) return { status: "fillable", reason: "Approved profile match", ruleKey: rule.key, confidence: "high" };
      return { status: "review", reason: `No approved value saved for ${rule.key}`, ruleKey: null, confidence: "missing-value" };
    }

    const weakMatches = matchingRules(weak);
    if (weakMatches.length) {
      return {
        status: "review",
        reason: "Only the surrounding text suggests an answer — confirm before filling",
        ruleKey: null,
        confidence: "low",
      };
    }
    return { status: "unknown", reason: "No approved mapping", ruleKey: null, confidence: "none" };
  }

  root.VJobsAutofill = { SENSITIVE, CONTROLLED_TYPES, RULES, matchingRules, decideField };
})(typeof globalThis === "undefined" ? this : globalThis);
