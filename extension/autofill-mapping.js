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
  //
  // "legal" is matched only in its sensitive senses. On its own it also caught
  // "Legal first name", a routine ATS name field, and pushed it to review.
  const SENSITIVE = /salary|compensation|pay expectation|desired pay|expected pay|authoriz(?:ed|ation)|right to work|work permit|sponsor|visa|immigration|gender|pronoun|\brace\b|ethnicity|veteran|disability|criminal|conviction|felony|background check|drug (?:test|screen)|security clearance|legally|legal (?:status|right|proceedings?|history)|ssn|social security|birth|\bage\b|marital|citizen|sexual orientation|protected|notice period|start date|available to start|earliest start|when can you start|relocat|salary history/i;

  // A control the user must operate themselves; V's can describe it but must
  // never choose a value.
  const CONTROLLED_TYPES = new Set(["number", "range", "date", "datetime-local", "time", "month", "week", "checkbox", "radio", "color"]);

  // Ordered only for readability — a label matching two rules is reported as
  // ambiguous rather than resolved by position, so order carries no meaning.
  const RULES = [
    { key: "firstName", match: /\bfirst.?name\b|\bgiven.?name\b|\bforename\b|\bpreferred.?name\b|\blegal.?first\b/i, read: (data) => data.profile.firstName || data.profile.fullName?.trim().split(/\s+/)[0] },
    { key: "lastName", match: /\blast.?name\b|\bfamily.?name\b|\bsurname\b|\blegal.?last\b/i, read: (data) => data.profile.lastName || data.profile.fullName?.trim().split(/\s+/).slice(1).join(" ") },
    { key: "fullName", match: /\bfull.?name\b|\byour.?name\b|\bcandidate.?name\b|\blegal.?name\b|^name$/i, read: (data) => data.profile.fullName },
    { key: "email", match: /\be.?mail\b|\bemail.?address\b/i, read: (data) => data.profile.email },
    { key: "phone", match: /\bphone\b|\bmobile\b|\btelephone\b|\bcell\b/i, read: (data) => data.profile.phone },
    // City and state are separate inputs on most ATS forms; the app derives
    // both from the single location the user maintains.
    { key: "city", match: /\bcity\b|\btown\b|\bcity.?\/?.?town\b/i, read: (data) => data.profile.city },
    { key: "state", match: /\bstate\b|\bprovince\b|\bregion\b|\bstate.?\/?.?province\b/i, read: (data) => data.profile.state },
    { key: "country", match: /\bcountry\b/i, read: (data) => data.profile.country },
    { key: "location", match: /\bcurrent.?location\b|\byour.?location\b|where.*located|\blocation\b/i, read: (data) => data.profile.location },
    { key: "linkedin", match: /\blinkedin\b/i, read: (data) => data.profile.linkedin },
    { key: "portfolio", match: /\bportfolio\b|\bpersonal.?(?:web)?site\b|\bwebsite\b/i, read: (data) => data.profile.portfolio },
    { key: "headline", match: /\bheadline\b|\bprofessional.?title\b|\bcurrent.?title\b/i, read: (data) => data.answers.headline },
    { key: "summary", match: /\babout.?you\b|\bsummary\b|\bbackground\b|tell.?us.?about|\bprofessional.?profile\b|\bbio\b/i, read: (data) => data.answers.summary },
    { key: "interest", match: /why.*(role|position|company|join|apply)|interest.*(role|position|company)|why do you want/i, read: (data) => data.answers.interest },
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

  /**
   * Clean up the rows a results-list capture pulled out of the page.
   *
   * The DOM half of that capture is board-specific and changes whenever a
   * board reskins; this half is the part with rules worth pinning down. A row
   * without a title or an http(s) URL is not a job. Two rows are the same job
   * when their URLs match ignoring the query string, because boards append
   * tracking parameters that differ on every render. And the upload is capped
   * so one very long results page cannot turn into an oversized request.
   */
  function normalizeCapturedRows(rows, limit = 100) {
    const text = (value, max) => String(value == null ? "" : value).replace(/\s+/g, " ").trim().slice(0, max);
    const seen = new Set();
    const result = [];
    for (const row of Array.isArray(rows) ? rows : []) {
      const title = text(row?.title, 240);
      const url = text(row?.url, 4000);
      if (!title || !/^https?:\/\//i.test(url)) continue;
      const key = url.split("?")[0].replace(/\/+$/, "").toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      result.push({
        title,
        company: text(row?.company, 180),
        location: text(row?.location, 240),
        url,
        description: text(row?.description, 600),
      });
      if (result.length >= limit) break;
    }
    return result;
  }

  root.VJobsAutofill = { SENSITIVE, CONTROLLED_TYPES, RULES, matchingRules, decideField, normalizeCapturedRows };
})(typeof globalThis === "undefined" ? this : globalThis);
