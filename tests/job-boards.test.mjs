import assert from "node:assert/strict";
import test from "node:test";
import {
  JOB_BOARDS,
  JOB_SEARCH_LOCATIONS,
  buildJobSearchUrls,
  groupJobSearchUrls,
} from "../lib/job-boards.mjs";

const find = (searches, boardId, locationId = "any") =>
  searches.find((search) => search.boardId === boardId && search.locationId === locationId);

test("every built URL is a valid absolute https URL", () => {
  const searches = buildJobSearchUrls({
    keywords: ["Senior Project Manager", "Creative Operations"],
    locationIds: JOB_SEARCH_LOCATIONS.map((location) => location.id),
    postedWithinDays: 7,
  });
  assert.ok(searches.length > 0);
  for (const search of searches) {
    const url = new URL(search.url);
    assert.equal(url.protocol, "https:", `${search.boardId} must be https`);
    assert.ok(url.hostname.includes("."), `${search.boardId} needs a real host`);
  }
});

test("the keyword survives encoding on every board", () => {
  const keyword = "Brand & Creative Operations Manager";
  const searches = buildJobSearchUrls({ keywords: [keyword], locationIds: ["bay-area"] });
  assert.equal(searches.length, JOB_BOARDS.length);
  for (const search of searches) {
    // URLSearchParams encodes a space as "+", which decodeURIComponent leaves
    // alone — undo it before comparing against the typed keyword.
    const readable = decodeURIComponent(search.url.replace(/\+/g, "%20"));
    assert.ok(readable.includes(keyword), `${search.boardId} dropped or mangled the keyword: ${search.url}`);
  }
});

test("a location-aware board translates each place into that board's own spelling", () => {
  const searches = buildJobSearchUrls({ keywords: ["Producer"], locationIds: ["bay-area", "new-york"] });
  assert.match(find(searches, "linkedin", "bay-area").url, /location=San\+Francisco\+Bay\+Area/);
  assert.match(find(searches, "linkedin", "new-york").url, /location=New\+York%2C\+New\+York/);
  assert.match(find(searches, "indeed", "bay-area").url, /l=San\+Francisco\+Bay\+Area%2C\+CA/);
  assert.match(find(searches, "builtin", "new-york").url, /city=New\+York&state=New\+York/);
});

test("remote is expressed as each board's own remote filter, not as a place name", () => {
  const searches = buildJobSearchUrls({ keywords: ["Producer"], locationIds: ["remote-us"] });
  // LinkedIn's workplace-type filter; without it, "United States" alone
  // returns every on-site role in the country.
  assert.match(find(searches, "linkedin", "remote-us").url, /f_WT=2/);
  // Indeed's remote attribute replaces the location entirely — passing both
  // narrows to on-site roles in that city.
  const indeed = find(searches, "indeed", "remote-us").url;
  assert.match(indeed, /sc=0kf/);
  assert.ok(!indeed.includes("&l="), "Indeed remote searches must not also carry a city");
  assert.match(find(searches, "builtin", "remote-us").url, /builtin\.com\/jobs\/remote/);
  assert.match(find(searches, "ziprecruiter", "remote-us").url, /only_remote/);
});

test("the freshness window is translated per board", () => {
  const week = buildJobSearchUrls({ keywords: ["Producer"], locationIds: ["bay-area"], postedWithinDays: 7 });
  const day = buildJobSearchUrls({ keywords: ["Producer"], locationIds: ["bay-area"], postedWithinDays: 1 });
  assert.match(find(week, "linkedin", "bay-area").url, /f_TPR=r604800/);
  assert.match(find(day, "linkedin", "bay-area").url, /f_TPR=r86400/);
  assert.match(find(week, "indeed", "bay-area").url, /fromage=7/);
  assert.match(find(day, "indeed", "bay-area").url, /fromage=1/);
  assert.match(find(week, "google", "bay-area").url, /date_posted:week/);
  assert.match(find(day, "google", "bay-area").url, /date_posted:today/);
});

test("boards that ignore location produce one link per keyword, not one per city", () => {
  const searches = buildJobSearchUrls({
    keywords: ["Producer"],
    locationIds: ["bay-area", "new-york", "los-angeles", "remote-us"],
  });
  const wellfound = searches.filter((search) => search.boardId === "wellfound");
  assert.equal(wellfound.length, 1, "Wellfound cannot filter by location, so four cities must not make four identical links");
  const linkedin = searches.filter((search) => search.boardId === "linkedin");
  assert.equal(linkedin.length, 4);
});

test("duplicate keywords collapse and blank ones are dropped", () => {
  const searches = buildJobSearchUrls({
    keywords: ["Producer", " Producer ", "", "   ", "Creative Director"],
    locationIds: ["bay-area"],
    boardIds: ["linkedin"],
  });
  assert.deepEqual(searches.map((search) => search.keyword), ["Producer", "Creative Director"]);
});

test("an empty request builds nothing rather than a link to an empty search", () => {
  assert.deepEqual(buildJobSearchUrls({ keywords: [], locationIds: ["bay-area"] }), []);
  assert.deepEqual(buildJobSearchUrls({ keywords: ["Producer"], locationIds: [] }), []);
  assert.deepEqual(buildJobSearchUrls({ keywords: ["Producer"], locationIds: ["mars"] }), []);
  assert.deepEqual(buildJobSearchUrls(), []);
});

test("board selection narrows the result and every key is unique", () => {
  const searches = buildJobSearchUrls({
    keywords: ["Producer", "Creative Director"],
    locationIds: ["bay-area", "remote-us"],
    boardIds: ["linkedin", "indeed", "wellfound"],
  });
  assert.deepEqual([...new Set(searches.map((search) => search.boardId))].sort(), ["indeed", "linkedin", "wellfound"]);
  assert.equal(new Set(searches.map((search) => search.key)).size, searches.length);
});

test("grouping keeps every search and hides groups with nothing in them", () => {
  const searches = buildJobSearchUrls({ keywords: ["Producer"], locationIds: ["bay-area"], boardIds: ["linkedin"] });
  const groups = groupJobSearchUrls(searches);
  assert.deepEqual(groups.map((group) => group.id), ["general"]);
  assert.equal(groups.reduce((total, group) => total + group.searches.length, 0), searches.length);

  const all = buildJobSearchUrls({ keywords: ["Producer"], locationIds: ["bay-area"] });
  assert.equal(groupJobSearchUrls(all).reduce((total, group) => total + group.searches.length, 0), all.length);
});

test("the default freshness window is a week when none is given", () => {
  const searches = buildJobSearchUrls({ keywords: ["Producer"], locationIds: ["bay-area"], boardIds: ["indeed"] });
  assert.match(searches[0].url, /fromage=7/);
});

test("every board declares the fields the UI renders", () => {
  const ids = new Set();
  for (const board of JOB_BOARDS) {
    assert.ok(board.id && !ids.has(board.id), `duplicate or missing board id: ${board.id}`);
    ids.add(board.id);
    assert.ok(board.label, `${board.id} needs a label`);
    assert.ok(board.note, `${board.id} needs a note explaining why it is worth a click`);
    assert.ok(["general", "startup", "creative"].includes(board.group), `${board.id} has an unknown group`);
  }
});
