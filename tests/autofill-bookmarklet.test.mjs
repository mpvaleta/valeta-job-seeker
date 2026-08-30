import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import vm from "node:vm";
import { buildBookmarklet, compactAutofillData } from "../lib/autofill-bookmarklet.mjs";

const mappingSource = await readFile(new URL("../extension/autofill-mapping.js", import.meta.url), "utf8");
const runtimeSource = await readFile(new URL("../lib/autofill-bookmarklet-runtime.js", import.meta.url), "utf8");

const fullPackage = {
  version: 1,
  profile: { fullName: "Marcos Valeta", email: "m@example.com", phone: "555", city: "Fremont", state: "CA" },
  target: { company: "Example", role: "Producer" },
  answers: { headline: "Producer", summary: "Summary", interest: "Interest" },
  resume: { id: "r1", title: "Valeta — Producer.doc", versionNumber: 3, origin: "generated", content: "R".repeat(60_000) },
  safety: { neverSubmit: true, sensitiveFieldsRequireUser: true },
};

// A bookmark cannot hold 60,000 characters of résumé, and the fill rules never
// consult it: a file input is always handed back to the user, so the title is
// the only part that does any work.
test("the résumé body is left out, and its title is kept", () => {
  const compact = compactAutofillData(fullPackage);
  assert.equal(compact.resume.title, "Valeta — Producer.doc");
  assert.equal(compact.resume.versionNumber, 3);
  assert.ok(!("content" in compact.resume));
  assert.deepEqual(compact.profile, fullPackage.profile);
  assert.equal(compact.safety.neverSubmit, true);
});

test("a package with no résumé selected still produces valid data", () => {
  assert.equal(compactAutofillData({ profile: {} }).resume, null);
  assert.equal(compactAutofillData(JSON.stringify({ profile: { email: "a@b.c" } })).profile.email, "a@b.c");
});

test("the bookmarklet is a self-contained javascript: URL small enough to save", () => {
  const bookmarklet = buildBookmarklet({ mappingSource, runtimeSource, data: fullPackage });
  assert.ok(bookmarklet.startsWith("javascript:"));
  assert.ok(!bookmarklet.includes("RRRRRRRRRR"), "the résumé body must not travel in the URL");
  // Browsers accept far more than this, but a bookmark that grows without
  // bound would eventually stop working somewhere, so the ceiling is asserted.
  assert.ok(bookmarklet.length < 60_000, `bookmarklet is ${bookmarklet.length} characters`);
  // Nothing is fetched at click time: application sites' CSP would block it.
  const body = decodeURIComponent(bookmarklet.slice("javascript:".length));
  assert.doesNotMatch(body, /\bfetch\(|XMLHttpRequest|document\.createElement\("script"\)/);
});

// The point of embedding the extension's module rather than re-implementing it.
test("the bookmarklet carries the same mapping rules the extension uses", () => {
  const body = decodeURIComponent(buildBookmarklet({ mappingSource, runtimeSource, data: fullPackage }).slice("javascript:".length));
  assert.ok(body.includes("root.VJobsAutofill"), "the mapping module must be embedded");
  const sandbox = { globalThis: undefined };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  // Run only the data + mapping halves; the runtime half needs a document.
  vm.runInContext(`globalThis.__VJOBS_AUTOFILL_DATA__=${JSON.stringify(compactAutofillData(fullPackage))};\n${mappingSource}`, sandbox);
  const data = sandbox.__VJOBS_AUTOFILL_DATA__;
  const decide = (strong, extra = {}) => sandbox.VJobsAutofill.decideField({ strong, weak: "", tag: "INPUT", type: "text", answered: false, ...extra }, data);
  assert.equal(decide("Email").status, "fillable");
  assert.equal(decide("Are you authorized to work in the United States?").status, "review");
  assert.equal(decide("Desired salary").status, "review");
  assert.equal(decide("Resume", { type: "file" }).status, "review");
  assert.match(decide("Resume", { type: "file" }).reason, /Valeta — Producer\.doc/);
});

test("a U+2028 in the data cannot break the script it is embedded in", () => {
  // Legal in JSON, but a line terminator in JavaScript source: pasted text can
  // carry one, and unescaped it would end the assignment statement mid-value.
  const data = { profile: { fullName: "Marcos\u2028Valeta", portfolio: "a\u2029b" } };
  const body = decodeURIComponent(buildBookmarklet({ mappingSource, runtimeSource, data }).slice("javascript:".length));
  const assignment = body.split("\n").find((line) => line.startsWith("globalThis.__VJOBS_AUTOFILL_DATA__"));
  assert.ok(assignment, "the data assignment must be a single line");
  assert.ok(assignment.includes("\\u2028") && assignment.includes("\\u2029"), "both separators must be escaped");
  assert.ok(!assignment.includes("\u2028") && !assignment.includes("\u2029"), "neither may survive raw");
  // And the escaped form still parses back to the original characters.
  assert.equal(JSON.parse(assignment.replace(/^globalThis\.__VJOBS_AUTOFILL_DATA__=/, "").replace(/;$/, "")).profile.fullName, "Marcos\u2028Valeta");
});
