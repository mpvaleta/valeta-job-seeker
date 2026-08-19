import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import vm from "node:vm";

// The mapping module ships as a plain content script, so it is loaded here the
// same way Chrome loads it: evaluated against a global object.
const source = await readFile(new URL("../extension/autofill-mapping.js", import.meta.url), "utf8");
const sandbox = { globalThis: undefined };
sandbox.globalThis = sandbox;
vm.createContext(sandbox);
vm.runInContext(source, sandbox);
const { decideField } = sandbox.VJobsAutofill;

const data = {
  profile: { fullName: "Marcos Valeta", email: "marcos@example.com", phone: "555-123-4567", location: "Fremont, CA", linkedin: "linkedin.com/in/mvaleta", portfolio: "https://marcosvaleta.com" },
  answers: { headline: "Project and Operations Manager", summary: "Creative operations leader.", interest: "The role matches my delivery experience." },
  resume: { title: "Brand PM v3" },
};

const field = (overrides) => ({ strong: "", weak: "", type: "text", tag: "INPUT", answered: false, ...overrides });

test("a clearly labelled field maps to its approved value", () => {
  const decision = decideField(field({ strong: "Email address", type: "email" }), data);
  assert.equal(decision.status, "fillable");
  assert.equal(decision.ruleKey, "email");
  assert.equal(decision.confidence, "high");
});

test("first and last name stay distinct rather than both matching the name rules", () => {
  assert.equal(decideField(field({ strong: "First name" }), data).ruleKey, "firstName");
  assert.equal(decideField(field({ strong: "Last name" }), data).ruleKey, "lastName");
  assert.equal(decideField(field({ strong: "Full name" }), data).ruleKey, "fullName");
});

// The failure that produced "meaningless fills": one section heading covering
// several inputs used to hand every one of them the first matching value.
test("a shared section heading never fills a field on its own", () => {
  const phoneBox = field({ strong: "", weak: "Contact information: email, phone, and LinkedIn" });
  const decision = decideField(phoneBox, data);
  assert.equal(decision.status, "review", "ambient context must not trigger a fill");
  assert.equal(decision.ruleKey, null);
  assert.equal(decision.confidence, "low");
  assert.match(decision.reason, /surrounding text/i);
});

test("the same heading as context does not override the field's own label", () => {
  const decision = decideField(field({ strong: "Mobile number", weak: "Contact information: email, phone, and LinkedIn" }), data);
  assert.equal(decision.status, "fillable");
  assert.equal(decision.ruleKey, "phone");
});

test("a label matching two different answers is left for the user", () => {
  const decision = decideField(field({ strong: "Full name and email" }), data);
  assert.equal(decision.status, "review");
  assert.equal(decision.ruleKey, null);
  assert.equal(decision.confidence, "ambiguous");
  assert.match(decision.reason, /more than one answer/i);
});

test("a matched field with no saved value is flagged instead of filled blank", () => {
  const decision = decideField(field({ strong: "LinkedIn profile" }), { ...data, profile: { ...data.profile, linkedin: "" } });
  assert.equal(decision.status, "review");
  assert.equal(decision.confidence, "missing-value");
});

test("sensitive and legal questions are never answered automatically", () => {
  const questions = [
    "Desired salary", "Are you authorized to work in the United States?", "Gender",
    "Veteran status", "Date of birth", "Do you require visa sponsorship",
    "Have you ever been convicted of a felony?", "Do you consent to a background check?",
    "Race / ethnicity", "Do you have a disability?", "Sexual orientation",
  ];
  for (const label of questions) {
    const decision = decideField(field({ strong: label }), data);
    assert.equal(decision.status, "review", `${label} must require the user`);
    assert.equal(decision.ruleKey, null);
  }
});

test("controls the user must operate are marked for review, not guessed", () => {
  for (const type of ["checkbox", "radio", "number", "date", "range", "month"]) {
    const decision = decideField(field({ strong: "Years of experience", type }), data);
    assert.equal(decision.status, "review", `${type} must not be auto-filled`);
  }
  assert.equal(decideField(field({ strong: "Country", tag: "SELECT" }), data).status, "review");
});

test("a résumé upload always stays manual and names the selected version", () => {
  const decision = decideField(field({ strong: "Resume", type: "file" }), data);
  assert.equal(decision.status, "review");
  assert.match(decision.reason, /Brand PM v3/);
});

test("an unanswered control is reported rather than treated as already answered", () => {
  // An unchecked checkbox reports value "on" and an untouched dropdown reports
  // its placeholder, so both used to be classified as answered and hidden.
  assert.equal(decideField(field({ strong: "I agree to the terms", type: "checkbox", answered: false }), data).status, "review");
  assert.equal(decideField(field({ strong: "Country", tag: "SELECT", answered: false }), data).status, "review");
  assert.equal(decideField(field({ strong: "I agree to the terms", type: "checkbox", answered: true }), data).status, "existing");
});

test("an unrecognized field is reported as unmapped rather than filled", () => {
  const decision = decideField(field({ strong: "How did you hear about us?" }), data);
  assert.equal(decision.status, "unknown");
  assert.equal(decision.ruleKey, null);
});

test("no decision ever returns a value for a field it did not positively match", () => {
  const labels = ["", "Additional information", "Portfolio URL", "Referral code", "Start date"];
  for (const strong of labels) {
    const decision = decideField(field({ strong }), data);
    if (decision.status === "fillable") assert.ok(decision.ruleKey, `fillable without a rule: ${strong}`);
  }
});

const withAddress = {
  ...data,
  profile: { ...data.profile, city: "Fremont", state: "CA", country: "United States" },
};

test("city and state fill separately, as most ATS forms ask for them", () => {
  assert.equal(decideField(field({ strong: "City" }), withAddress).ruleKey, "city");
  assert.equal(decideField(field({ strong: "State" }), withAddress).ruleKey, "state");
  assert.equal(decideField(field({ strong: "State / Province" }), withAddress).ruleKey, "state");
  assert.equal(decideField(field({ strong: "Country" }), withAddress).ruleKey, "country");
});

test("a state field with nothing saved is flagged rather than left unmapped", () => {
  const decision = decideField(field({ strong: "State" }), data);
  assert.equal(decision.status, "review");
  assert.equal(decision.confidence, "missing-value");
});

test("common ATS label aliases resolve to the right answer", () => {
  const aliases = [
    ["Legal first name", "firstName"],
    ["Preferred name", "firstName"],
    ["Legal last name", "lastName"],
    ["Cell phone", "phone"],
    ["Email Address", "email"],
    ["Current title", "headline"],
    ["Short bio", "summary"],
    ["Why do you want to work here?", "interest"],
    ["Why are you interested in joining us?", "interest"],
  ];
  for (const [label, expected] of aliases) {
    assert.equal(decideField(field({ strong: label }), withAddress).ruleKey, expected, label);
  }
});

// "Statement" and "United States" both contain a rule word; neither is a state field.
test("words that merely contain a rule term do not match it", () => {
  assert.equal(decideField(field({ strong: "Statement of interest" }), withAddress).ruleKey, null);
  // "United States" appears in work-authorization questions, which are sensitive
  // and must be caught before any rule matching happens.
  const auth = decideField(field({ strong: "Are you authorized to work in the United States?" }), withAddress);
  assert.equal(auth.status, "review");
  assert.equal(auth.ruleKey, null);
});

test("'legal name' is a name field, while genuinely legal questions stay sensitive", () => {
  assert.equal(decideField(field({ strong: "Legal name" }), withAddress).ruleKey, "fullName");
  for (const label of ["Legal status", "Are you legally authorized to work?", "Legal right to work in the US"]) {
    assert.equal(decideField(field({ strong: label }), withAddress).status, "review", label);
  }
});

test("portfolio and personal website fill from the approved portfolio link", () => {
  const decision = decideField(field({ strong: "Portfolio or personal website" }), data);
  assert.equal(decision.status, "fillable");
  assert.equal(decision.ruleKey, "portfolio");
});

test("a LinkedIn URL field still maps to LinkedIn, not the portfolio rule", () => {
  const decision = decideField(field({ strong: "LinkedIn Profile URL" }), data);
  assert.equal(decision.status, "fillable");
  assert.equal(decision.ruleKey, "linkedin");
});

test("timing, relocation, and salary-history questions go to the user", () => {
  for (const label of ["Notice period", "When can you start?", "Earliest start date", "Are you willing to relocate?", "Salary history"]) {
    const decision = decideField(field({ strong: label }), data);
    assert.equal(decision.status, "review", label);
    assert.equal(decision.confidence, "manual", label);
  }
});
