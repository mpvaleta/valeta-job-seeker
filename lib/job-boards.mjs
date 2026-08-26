// Search-URL builders for the public job boards V's cannot scan.
//
// LinkedIn, Indeed, Glassdoor and the rest all forbid automated collection, so
// the radar can never read them the way it reads an ATS board. What it can do
// is hand over a link that lands on the exact search the owner would have
// typed by hand — right keywords, right places, right freshness window — so
// the manual half of the search costs one click instead of five minutes of
// re-typing filters into four sites.
//
// Everything here is a pure function of its arguments. No fetching happens in
// this module, by design: the value is the URL, and building it must work the
// same in the browser, in a Worker, and in a test.

/** Freshness windows, in days, offered in the UI. */
export const POSTED_WITHIN_OPTIONS = [
  { days: 1, label: "Past 24 hours" },
  { days: 3, label: "Past 3 days" },
  { days: 7, label: "Past week" },
  { days: 14, label: "Past 2 weeks" },
  { days: 30, label: "Past month" },
];

// One row per place the owner actually searches. Each board spells locations
// its own way, so the translation lives here rather than at every call site.
export const JOB_SEARCH_LOCATIONS = [
  {
    id: "bay-area",
    label: "SF Bay Area",
    remote: false,
    linkedin: "San Francisco Bay Area",
    indeed: "San Francisco Bay Area, CA",
    google: "San Francisco Bay Area",
    ziprecruiter: "San Francisco, CA",
    glassdoor: "San Francisco, CA",
    builtin: { city: "San Francisco", state: "California" },
  },
  {
    id: "remote-us",
    label: "Remote (US)",
    remote: true,
    linkedin: "United States",
    indeed: "United States",
    google: "United States",
    ziprecruiter: "United States",
    glassdoor: "United States",
    builtin: null,
  },
  {
    id: "new-york",
    label: "New York",
    remote: false,
    linkedin: "New York, New York, United States",
    indeed: "New York, NY",
    google: "New York, NY",
    ziprecruiter: "New York, NY",
    glassdoor: "New York, NY",
    builtin: { city: "New York", state: "New York" },
  },
  {
    id: "los-angeles",
    label: "Los Angeles",
    remote: false,
    linkedin: "Los Angeles, California, United States",
    indeed: "Los Angeles, CA",
    google: "Los Angeles, CA",
    ziprecruiter: "Los Angeles, CA",
    glassdoor: "Los Angeles, CA",
    builtin: { city: "Los Angeles", state: "California" },
  },
  {
    id: "seattle",
    label: "Seattle",
    remote: false,
    linkedin: "Seattle, Washington, United States",
    indeed: "Seattle, WA",
    google: "Seattle, WA",
    ziprecruiter: "Seattle, WA",
    glassdoor: "Seattle, WA",
    builtin: { city: "Seattle", state: "Washington" },
  },
  {
    id: "chicago",
    label: "Chicago",
    remote: false,
    linkedin: "Chicago, Illinois, United States",
    indeed: "Chicago, IL",
    google: "Chicago, IL",
    ziprecruiter: "Chicago, IL",
    glassdoor: "Chicago, IL",
    builtin: { city: "Chicago", state: "Illinois" },
  },
];

function googleFreshness(days) {
  if (days <= 1) return "today";
  if (days <= 3) return "3days";
  if (days <= 7) return "week";
  return "month";
}

// Boards that ignore a location parameter still get one entry per keyword —
// collapsing them onto a single synthetic location keeps the caller from
// opening the same URL four times.
export const JOB_BOARDS = [
  {
    id: "linkedin",
    label: "LinkedIn",
    group: "general",
    locationAware: true,
    note: "Largest volume, and the one place recruiters search back. Sort by “Most recent” once the page opens — LinkedIn ignores the sort in a link.",
    build({ keyword, location, postedWithinDays }) {
      const params = new URLSearchParams({ keywords: keyword, f_TPR: `r${postedWithinDays * 86400}` });
      if (location.remote) params.set("f_WT", "2");
      if (location.linkedin) params.set("location", location.linkedin);
      return `https://www.linkedin.com/jobs/search/?${params.toString()}`;
    },
  },
  {
    id: "indeed",
    label: "Indeed",
    group: "general",
    locationAware: true,
    note: "Broadest reach outside tech, and the only large board that reliably surfaces staffing-agency and contract postings.",
    build({ keyword, location, postedWithinDays }) {
      const params = new URLSearchParams({ q: keyword, fromage: String(postedWithinDays) });
      if (location.remote) params.set("sc", "0kf:attr(DSQF7);");
      else if (location.indeed) params.set("l", location.indeed);
      return `https://www.indeed.com/jobs?${params.toString()}`;
    },
  },
  {
    id: "google",
    label: "Google Jobs",
    group: "general",
    locationAware: true,
    note: "Aggregates the company career pages that never reach a board at all. Good for catching a role the radar's ATS adapters missed.",
    build({ keyword, location, postedWithinDays }) {
      const query = [keyword, "jobs", location.remote ? "remote" : location.google].filter(Boolean).join(" ");
      const params = new URLSearchParams({ q: query, ibp: "htl;jobs" });
      return `https://www.google.com/search?${params.toString()}&htichips=date_posted:${googleFreshness(postedWithinDays)}`;
    },
  },
  {
    id: "ziprecruiter",
    label: "ZipRecruiter",
    group: "general",
    locationAware: true,
    note: "Heavy on mid-market employers who post nowhere else.",
    build({ keyword, location, postedWithinDays }) {
      const params = new URLSearchParams({ search: keyword, days: String(postedWithinDays) });
      if (location.ziprecruiter) params.set("location", location.ziprecruiter);
      if (location.remote) params.set("refine_by_location_type", "only_remote");
      return `https://www.ziprecruiter.com/jobs-search?${params.toString()}`;
    },
  },
  {
    id: "glassdoor",
    label: "Glassdoor",
    group: "general",
    locationAware: true,
    note: "Worth one pass because the salary range and the reviews sit on the same page as the posting.",
    build({ keyword, location, postedWithinDays }) {
      const params = new URLSearchParams({ "sc.keyword": keyword, fromAge: String(postedWithinDays) });
      if (location.remote) params.set("remoteWorkType", "1");
      if (location.glassdoor) params.set("locKeyword", location.glassdoor);
      return `https://www.glassdoor.com/Job/jobs.htm?${params.toString()}`;
    },
  },
  {
    id: "builtin",
    label: "Built In",
    group: "startup",
    locationAware: true,
    note: "Tech companies of every size, with a real city filter. The closest thing to a Bay Area–only board.",
    build({ keyword, location }) {
      if (location.remote) return `https://builtin.com/jobs/remote?search=${encodeURIComponent(keyword)}`;
      if (!location.builtin) return `https://builtin.com/jobs?search=${encodeURIComponent(keyword)}`;
      const params = new URLSearchParams({
        search: keyword,
        city: location.builtin.city,
        state: location.builtin.state,
        country: "USA",
        allLocations: "true",
      });
      return `https://builtin.com/jobs?${params.toString()}`;
    },
  },
  {
    id: "wellfound",
    label: "Wellfound",
    group: "startup",
    locationAware: false,
    note: "Startups and early-stage teams that never buy an enterprise ATS. Filter location on the page — the link only carries the keyword.",
    build({ keyword }) {
      return `https://wellfound.com/jobs?query=${encodeURIComponent(keyword)}`;
    },
  },
  {
    id: "workatastartup",
    label: "Work at a Startup",
    group: "startup",
    locationAware: false,
    note: "Y Combinator companies only. Small list, unusually high signal, and roles are often posted here weeks before anywhere else.",
    build({ keyword }) {
      return `https://www.workatastartup.com/jobs?query=${encodeURIComponent(keyword)}`;
    },
  },
  {
    id: "welcometothejungle",
    label: "Welcome to the Jungle",
    group: "startup",
    locationAware: false,
    note: "The board Otta became. Strong on product, brand, and operations roles at funded companies.",
    build({ keyword }) {
      return `https://www.welcometothejungle.com/en/jobs?query=${encodeURIComponent(keyword)}`;
    },
  },
  {
    id: "workingnotworking",
    label: "Working Not Working",
    group: "creative",
    locationAware: false,
    note: "Agency and in-house creative roles — the ones that get filled through networks rather than postings.",
    build({ keyword }) {
      return `https://workingnotworking.com/jobs?search=${encodeURIComponent(keyword)}`;
    },
  },
  {
    id: "aiga",
    label: "AIGA Design Jobs",
    group: "creative",
    locationAware: false,
    note: "Design-org board. Heavier on studios and nonprofits than the general boards.",
    build({ keyword }) {
      return `https://designjobs.aiga.org/jobs/?keywords=${encodeURIComponent(keyword)}`;
    },
  },
  {
    id: "mediabistro",
    label: "Mediabistro",
    group: "creative",
    locationAware: false,
    note: "Media, publishing, and marketing-communications roles, including agency-side production.",
    build({ keyword }) {
      return `https://www.mediabistro.com/jobs/search/?keywords=${encodeURIComponent(keyword)}`;
    },
  },
];

export const JOB_BOARD_GROUPS = [
  { id: "general", label: "General boards", blurb: "The widest nets. Run these first — most postings appear here." },
  { id: "startup", label: "Startup & tech boards", blurb: "Smaller companies that never reach the general boards." },
  { id: "creative", label: "Creative & agency boards", blurb: "Advertising, marketing, design, and production roles." },
];

const ANY_LOCATION = { id: "any", label: "Any location", remote: false };

/**
 * Turn a search intent into one openable URL per board × keyword × location.
 *
 * Boards that cannot take a location collapse to a single row per keyword, so
 * asking for four cities does not produce four identical Wellfound links.
 */
export function buildJobSearchUrls(options = {}) {
  const keywords = [...new Set((options.keywords || []).map((value) => String(value).trim()).filter(Boolean))];
  const postedWithinDays = Number(options.postedWithinDays) > 0 ? Number(options.postedWithinDays) : 7;
  // An explicitly empty list means "none" — the UI clears every chip and
  // expects the results to empty out with them. Only an omitted list falls
  // back to the default. Treating [] as "unset" made deselecting the last
  // board silently search all of them.
  const boardIds = Array.isArray(options.boardIds) ? new Set(options.boardIds) : null;
  const locationIds = Array.isArray(options.locationIds) ? options.locationIds : ["bay-area"];
  const locations = locationIds
    .map((id) => JOB_SEARCH_LOCATIONS.find((location) => location.id === id))
    .filter(Boolean);
  if (!keywords.length || !locations.length) return [];

  const searches = [];
  for (const board of JOB_BOARDS) {
    if (boardIds && !boardIds.has(board.id)) continue;
    const boardLocations = board.locationAware ? locations : [ANY_LOCATION];
    for (const keyword of keywords) {
      for (const location of boardLocations) {
        searches.push({
          key: `${board.id}:${location.id}:${keyword}`,
          boardId: board.id,
          boardLabel: board.label,
          group: board.group,
          note: board.note,
          keyword,
          locationId: location.id,
          locationLabel: location.label,
          url: board.build({ keyword, location, postedWithinDays }),
        });
      }
    }
  }
  return searches;
}

/** Group built searches for display, dropping groups with nothing in them. */
export function groupJobSearchUrls(searches) {
  return JOB_BOARD_GROUPS
    .map((group) => ({ ...group, searches: searches.filter((search) => search.group === group.id) }))
    .filter((group) => group.searches.length > 0);
}
