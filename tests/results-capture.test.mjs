import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import vm from "node:vm";

const mappingSource = await readFile(new URL("../extension/autofill-mapping.js", import.meta.url), "utf8");
const captureSource = await readFile(new URL("../extension/results-capture.js", import.meta.url), "utf8");

/*
 * A results page, small enough to reason about.
 *
 * There is no DOM in this test runner, and the part of the capture worth
 * pinning down is which nodes it reaches for and what it builds from them — so
 * the page is modelled as plain objects answering the handful of DOM calls the
 * reader makes. A node is { sel: [selectors it answers to], attrs, text,
 * children }, and querySelectorAll walks the tree matching on the selector
 * strings the module actually passes.
 */
function node({ sel = [], attrs = {}, text = "", children = [], href = "" } = {}) {
  const self = {
    sel,
    attrs,
    href,
    innerText: text,
    parent: null,
    children,
    getAttribute: (name) => (name in attrs ? attrs[name] : null),
  };
  self.querySelector = (selector) => descendants(self).find((item) => matches(item, selector)) || null;
  self.closest = (selector) => {
    let current = self.parent;
    while (current) {
      if (matches(current, selector)) return current;
      current = current.parent;
    }
    return null;
  };
  for (const child of children) child.parent = self;
  return self;
}

// Values built inside the vm carry that realm's prototypes, so a strict deep
// comparison against ordinary arrays fails on identity alone. Round-tripping
// through JSON is what the capture does anyway on its way to the clipboard.
function plain(value) {
  return JSON.parse(JSON.stringify(value));
}

function descendants(root) {
  return root.children.flatMap((child) => [child, ...descendants(child)]);
}

// The module passes comma-separated selector lists; a node answers to any of
// the literal strings it was labelled with.
function matches(item, selector) {
  return selector.split(",").map((part) => part.trim()).some((part) => item.sel.includes(part));
}

function pageContext({ hostname, body, title = "Jobs" }) {
  const documentRoot = node({ children: body });
  const sandbox = {
    globalThis: undefined,
    location: { hostname, href: `https://${hostname}/jobs/search` },
    document: {
      title,
      querySelectorAll: (selector) => descendants(documentRoot).filter((item) => matches(item, selector)),
    },
    Date,
  };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(`${mappingSource}\n${captureSource}`, sandbox);
  return sandbox;
}

const linkedInCard = (id, title, company, location) => node({
  sel: ["li", "[data-job-id]"],
  attrs: { "data-job-id": id },
  text: `${title}\n${company}\n${location}`,
  children: [
    node({ sel: ['a[href*="/jobs/view/"]'], attrs: { href: `/jobs/view/${id}/?trk=flagship`, "aria-label": title } }),
    node({ sel: [".artdeco-entity-lockup__subtitle"], text: company }),
    node({ sel: [".job-card-container__metadata-item"], text: location }),
  ],
});

test("a LinkedIn results page is read into rows the app can file", () => {
  const sandbox = pageContext({
    hostname: "www.linkedin.com",
    body: [
      linkedInCard("4001", "Creative Producer", "Mercury", "San Francisco, CA"),
      linkedInCard("4002", "Operations Lead", "Airbnb", "Remote"),
    ],
  });
  const capture = plain(sandbox.VJobsCapture.captureVisibleList());
  assert.equal(capture.source, "linkedin");
  assert.equal(capture.rows.length, 2);
  assert.deepEqual(
    capture.rows.map((row) => [row.title, row.company, row.location, row.url]),
    [
      ["Creative Producer", "Mercury", "San Francisco, CA", "https://www.linkedin.com/jobs/view/4001/"],
      ["Operations Lead", "Airbnb", "Remote", "https://www.linkedin.com/jobs/view/4002/"],
    ],
  );
  // The tracking parameter LinkedIn appends never reaches the stored link.
  assert.ok(capture.rows.every((row) => !row.url.includes("trk")));
});

test("an Indeed results page is read, and its job key becomes the link", () => {
  const card = (key, title, company, location) => node({
    sel: [".job_seen_beacon"],
    text: `${title} ${company} ${location}`,
    children: [
      node({ sel: ["a[data-jk]", "h2 a"], attrs: { "data-jk": key } }),
      node({ sel: ["h2"], text: title }),
      node({ sel: ["[data-testid='company-name']"], text: company }),
      node({ sel: ["[data-testid='text-location']"], text: location }),
    ],
  });
  const sandbox = pageContext({
    hostname: "www.indeed.com",
    body: [card("abc123", "Project Manager", "Giant Spoon", "Oakland, CA")],
  });
  const capture = plain(sandbox.VJobsCapture.captureVisibleList());
  assert.equal(capture.source, "indeed");
  assert.deepEqual(capture.rows, [{
    title: "Project Manager",
    company: "Giant Spoon",
    location: "Oakland, CA",
    url: "https://www.indeed.com/viewjob?jk=abc123",
    description: "Project Manager Giant Spoon Oakland, CA",
  }]);
});

// The same posting reached twice on one page — LinkedIn renders a card and a
// separate "similar roles" link — must not become two inbox rows.
test("the same posting listed twice is captured once", () => {
  const sandbox = pageContext({
    hostname: "www.linkedin.com",
    body: [
      linkedInCard("4001", "Creative Producer", "Mercury", "San Francisco, CA"),
      linkedInCard("4001", "Creative Producer", "Mercury", "San Francisco, CA"),
    ],
  });
  assert.equal(plain(sandbox.VJobsCapture.captureVisibleList()).rows.length, 1);
});

// A card with no link is a heading or an advert, not a job.
test("a card without a job link is skipped rather than filed with no URL", () => {
  const sandbox = pageContext({
    hostname: "www.indeed.com",
    body: [node({ sel: [".job_seen_beacon"], text: "Sponsored", children: [node({ sel: ["h2"], text: "Jobs near you" })] })],
  });
  assert.deepEqual(plain(sandbox.VJobsCapture.captureVisibleList().rows), []);
});

// Any other board still produces something: the generic pass keeps a board
// nobody anticipated from being a dead end.
test("an unrecognised board falls back to job-detail links", () => {
  const sandbox = pageContext({
    hostname: "jobs.lever.co",
    body: [
      node({ sel: ['a[href*="/jobs/"]'], href: "https://jobs.lever.co/instrument/8f21bd7a-1c4e", text: "Senior Producer" }),
      node({ sel: ['a[href*="/jobs/"]'], href: "https://jobs.lever.co/instrument", text: "All jobs" }),
    ],
  });
  const capture = plain(sandbox.VJobsCapture.captureVisibleList());
  assert.equal(capture.source, "other");
  assert.deepEqual(capture.rows.map((row) => row.title), ["Senior Producer"]);
});
