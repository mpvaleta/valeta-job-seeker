// Assembles the autofill bookmarklet.
//
// The Chrome extension is kept — it can read a results page and talk back to
// the app, which a bookmarklet cannot. But installing it means downloading a
// folder, enabling developer mode, "load unpacked", and reloading it after
// every change, and it only works in Chrome. For the part that matters most on
// an application form — filling the boring fields — a saved bookmark does the
// same job in any browser, iPhone Safari included, with nothing installed.
//
// The mapping rules are not re-implemented here. The extension's module is
// embedded verbatim, so the two can never disagree about what is safe to fill.

// Everything the form-filling rules actually read. The full autofill package
// also carries up to 60,000 characters of résumé text, which a bookmark cannot
// hold and the rules never consult: a file input is always handed back to the
// user, so only the résumé's title is needed, to say which file to upload.
export function compactAutofillData(value) {
  const source = typeof value === "string" ? JSON.parse(value) : (value || {});
  return {
    version: source.version || 1,
    profile: source.profile || {},
    target: source.target || {},
    answers: source.answers || {},
    resume: source.resume ? { title: source.resume.title || "", versionNumber: source.resume.versionNumber || null } : null,
    safety: source.safety || { neverSubmit: true, sensitiveFieldsRequireUser: true },
  };
}

export function buildBookmarklet({ mappingSource, runtimeSource, data }) {
  const payload = JSON.stringify(compactAutofillData(data));
  // JSON is a superset of the JS string grammar in exactly one place that
  // matters here: U+2028 and U+2029 are legal in JSON but terminate a line in a
  // script, so they are escaped before the payload becomes source code.
  const safePayload = payload.replace(/\u2028/g, "\\u2028").replace(/\u2029/g, "\\u2029");
  const body = [
    "(function(){",
    `globalThis.__VJOBS_AUTOFILL_DATA__=${safePayload};`,
    mappingSource,
    runtimeSource,
    "})();",
  ].join("\n");
  // A bookmarklet is a URL, so the body is percent-encoded. Encoding also means
  // newlines and comments survive, which keeps the saved bookmark readable if
  // the owner ever inspects it.
  return `javascript:${encodeURIComponent(body)}`;
}
