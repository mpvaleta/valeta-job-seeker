"use client";

import { useEffect, useMemo, useState } from "react";
import {
  JOB_BOARDS,
  JOB_BOARD_GROUPS,
  JOB_SEARCH_LOCATIONS,
  POSTED_WITHIN_OPTIONS,
  buildJobSearchUrls,
  groupJobSearchUrls,
} from "@/lib/job-boards.mjs";
import { readJsonResponse } from "@/lib/http-json.mjs";
import type { JobSearchUrl } from "@/lib/job-boards.mjs";

type Props = {
  onNotice: (message: string) => void;
  onError: (code: string, message: unknown, context?: Record<string, string | number | boolean>) => void;
};

type RadarPayload = {
  ok?: boolean;
  message?: string;
  profile?: { titles?: string[] };
  result?: {
    imported?: Array<{ url: string; title: string; company: string; score: number; status: "added" | "updated" }>;
    failures?: Array<{ url?: string; message: string }>;
  };
};

const SETTINGS_KEY = "vjs.job-search.settings.v1";
const OPENED_KEY = "vjs.job-search.opened.v1";
// Chrome allows a burst of window.open calls from one click gesture, then
// starts blocking. Six is comfortably inside that budget on every browser
// tested, and more than six tabs at once is not a search anyone reads.
const OPEN_ALL_LIMIT = 6;

type Settings = {
  // null means "never chosen", which is what makes the saved target positions
  // an opening default rather than a value that reappears the moment the last
  // keyword is removed. An empty array is a deliberate choice and is honored.
  keywords: string[] | null;
  locationIds: string[];
  boardIds: string[];
  postedWithinDays: number;
};

const DEFAULT_SETTINGS: Settings = {
  keywords: null,
  locationIds: ["bay-area", "remote-us"],
  boardIds: JOB_BOARDS.map((board) => board.id),
  postedWithinDays: 7,
};

function readStored<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw) as T;
    return parsed && typeof parsed === "object" ? { ...fallback, ...parsed } : fallback;
  } catch {
    // A corrupt or hand-edited entry must never break the tab — the settings
    // are a convenience, not data worth recovering.
    return fallback;
  }
}

function relativeTime(iso: string) {
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return "";
  const minutes = Math.round((Date.now() - then) / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  return days === 1 ? "yesterday" : `${days}d ago`;
}

export function JobSearchWorkspace({ onNotice, onError }: Props) {
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [opened, setOpened] = useState<Record<string, string>>({});
  const [keywordDraft, setKeywordDraft] = useState("");
  const [suggestedKeywords, setSuggestedKeywords] = useState<string[]>([]);
  const [importLinks, setImportLinks] = useState("");
  const [busy, setBusy] = useState("");

  // Hydrate after the first paint, not during it: the server has no
  // localStorage, so reading it inline would render different markup than the
  // HTML React is hydrating against. This is the same deferral useSavedState
  // uses elsewhere in the app.
  useEffect(() => {
    const timer = window.setTimeout(() => {
      setSettings(readStored(SETTINGS_KEY, DEFAULT_SETTINGS));
      setOpened(readStored<Record<string, string>>(OPENED_KEY, {}));
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  // The saved target positions live on the radar profile, so the two tabs stay
  // in agreement about what the owner is actually looking for.
  useEffect(() => {
    let active = true;
    fetch("/api/radar", { cache: "no-store" })
      .then((response) => readJsonResponse<RadarPayload>(response, "Your saved target positions could not be read."))
      .then((data) => {
        if (!active) return;
        setSuggestedKeywords((data.profile?.titles || []).filter(Boolean));
      })
      .catch((cause) => {
        if (!active) return;
        onError("job_search_titles_failed", cause);
      });
    return () => { active = false; };
    // The callbacks are stable in the parent; the titles only need one read.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function persist(next: Settings) {
    setSettings(next);
    try {
      window.localStorage.setItem(SETTINGS_KEY, JSON.stringify(next));
    } catch {
      // Private-mode storage refusals are not worth interrupting the search.
    }
  }

  // Until the owner edits the list, their saved target positions are the
  // search — three of them, which is a day's worth without being a wall.
  const keywords = settings.keywords ?? suggestedKeywords.slice(0, 3);
  const searches = useMemo(() => buildJobSearchUrls({
    keywords,
    locationIds: settings.locationIds,
    boardIds: settings.boardIds,
    postedWithinDays: settings.postedWithinDays,
  }), [keywords, settings.boardIds, settings.locationIds, settings.postedWithinDays]);
  const grouped = useMemo(() => groupJobSearchUrls(searches), [searches]);
  const unopenedCount = searches.filter((search) => !opened[search.key]).length;

  function toggle(field: "locationIds" | "boardIds", id: string) {
    const current = settings[field];
    persist({
      ...settings,
      [field]: current.includes(id) ? current.filter((value) => value !== id) : [...current, id],
    });
  }

  function addKeyword(value: string) {
    const keyword = value.trim();
    if (!keyword) return;
    if (keywords.some((existing) => existing.toLowerCase() === keyword.toLowerCase())) {
      onNotice(`“${keyword}” is already in the search.`);
      return;
    }
    persist({ ...settings, keywords: [...keywords, keyword] });
    setKeywordDraft("");
  }

  function removeKeyword(keyword: string) {
    persist({ ...settings, keywords: keywords.filter((value) => value !== keyword) });
  }

  function markOpened(keys: string[]) {
    const now = new Date().toISOString();
    setOpened((current) => {
      const next = { ...current };
      for (const key of keys) next[key] = now;
      try {
        window.localStorage.setItem(OPENED_KEY, JSON.stringify(next));
      } catch {
        // See persist(): storage is a convenience here.
      }
      return next;
    });
  }

  function openGroup(groupSearches: JobSearchUrl[]) {
    const queue = groupSearches.filter((search) => !opened[search.key]);
    const batch = (queue.length ? queue : groupSearches).slice(0, OPEN_ALL_LIMIT);
    let blocked = false;
    for (const search of batch) {
      const handle = window.open(search.url, "_blank", "noopener,noreferrer");
      if (!handle) blocked = true;
    }
    if (blocked) {
      onNotice("Your browser blocked some of these tabs. Allow pop-ups for this site, or open the links one at a time below.");
      return;
    }
    markOpened(batch.map((search) => search.key));
    const remaining = (queue.length ? queue.length : groupSearches.length) - batch.length;
    onNotice(remaining
      ? `${batch.length} searches opened. Press again for the next ${remaining}.`
      : `${batch.length} ${batch.length === 1 ? "search" : "searches"} opened in new tabs.`);
  }

  function resetOpened() {
    setOpened({});
    try {
      window.localStorage.removeItem(OPENED_KEY);
    } catch {
      // See persist().
    }
    onNotice("Every search is marked unopened again — useful at the start of a new search day.");
  }

  async function importJobLinks() {
    const links = importLinks.split(/[\s,]+/).map((link) => link.trim()).filter(Boolean);
    if (!links.length) { onNotice("Paste at least one public job link, one per line."); return; }
    setBusy("import");
    try {
      const response = await fetch("/api/radar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "import_job_links", links }),
      });
      const data = await readJsonResponse<RadarPayload>(response, "Those job links could not be read.");
      if (!response.ok || !data.ok) throw new Error(data.message || "Those job links could not be read.");
      const imported = data.result?.imported?.length || 0;
      const failed = data.result?.failures?.length || 0;
      // Keep only what failed, so a second press retries exactly those.
      setImportLinks(imported ? data.result?.failures?.map((failure) => failure.url).filter(Boolean).join("\n") || "" : importLinks);
      onNotice(imported
        ? `${imported} ${imported === 1 ? "role" : "roles"} scored and filed in the Job radar inbox${failed ? ` · ${failed} link${failed === 1 ? "" : "s"} could not be read` : ""}.`
        : `No role could be read from ${failed === 1 ? "that link" : "those links"}. ${data.result?.failures?.[0]?.message || ""}`);
    } catch (cause) {
      onError("job_search_import_failed", cause);
      onNotice(cause instanceof Error ? cause.message : "Those job links could not be read.");
    } finally {
      setBusy("");
    }
  }

  const unusedSuggestions = suggestedKeywords.filter(
    (title) => !keywords.some((keyword) => keyword.toLowerCase() === title.toLowerCase()),
  );

  return <div className="job-search-workspace">
    <section className="radar-hero">
      <div>
        <span>OPEN JOB SEARCH</span>
        <h2>Every board, one search, one click each</h2>
        <p>
          The Job radar scans company career pages by itself. The big boards forbid that — LinkedIn, Indeed, Glassdoor
          and the rest all block automated reading, and no amount of engineering changes it. So this tab does the next
          best thing: it builds the exact search you would have typed into each of them, already filtered to your roles,
          your places, and how fresh you want the postings, and remembers which ones you have already worked through.
        </p>
      </div>
      <div className="radar-connection ready">
        <i />
        <div>
          <strong>{searches.length} {searches.length === 1 ? "search" : "searches"} ready</strong>
          <span>{unopenedCount ? `${unopenedCount} not opened yet` : searches.length ? "All opened — reset below to start a new pass" : "Add a role to begin"}</span>
        </div>
      </div>
    </section>

    <section className="job-search-builder">
      <div className="card-heading">
        <div>
          <span>SEARCH BUILDER</span>
          <h3>What are you looking for?</h3>
        </div>
        <button onClick={resetOpened} disabled={!Object.keys(opened).length}>Start a new pass</button>
      </div>

      <div className="job-search-field">
        <label htmlFor="job-search-keyword">Roles and keywords</label>
        <div className="job-search-chips">
          {keywords.map((keyword) => <button key={keyword} className="chip active" onClick={() => removeKeyword(keyword)} title="Remove this keyword">{keyword} ×</button>)}
          {!keywords.length && <small className="job-search-hint">No keywords yet. Add a role title, or pick one of your saved target positions below.</small>}
        </div>
        <div className="job-search-add">
          <input
            id="job-search-keyword"
            value={keywordDraft}
            onChange={(event) => setKeywordDraft(event.target.value)}
            onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); addKeyword(keywordDraft); } }}
            placeholder="Creative Operations Manager"
          />
          <button onClick={() => addKeyword(keywordDraft)} disabled={!keywordDraft.trim()}>Add keyword</button>
        </div>
        {unusedSuggestions.length > 0 && <div className="job-search-chips suggestions">
          <small className="job-search-hint">From your saved target positions:</small>
          {unusedSuggestions.map((title) => <button key={title} className="chip" onClick={() => addKeyword(title)}>+ {title}</button>)}
        </div>}
      </div>

      <div className="job-search-field">
        <label>Where</label>
        <div className="job-search-chips">
          {JOB_SEARCH_LOCATIONS.map((location) => <button
            key={location.id}
            className={`chip ${settings.locationIds.includes(location.id) ? "active" : ""}`}
            onClick={() => toggle("locationIds", location.id)}
          >{location.label}</button>)}
        </div>
        {!settings.locationIds.length && <small className="job-search-hint warn">Pick at least one place — nothing is built without one.</small>}
      </div>

      <div className="job-search-field">
        <label htmlFor="job-search-freshness">How fresh</label>
        <select
          id="job-search-freshness"
          value={settings.postedWithinDays}
          onChange={(event) => persist({ ...settings, postedWithinDays: Number(event.target.value) })}
        >
          {POSTED_WITHIN_OPTIONS.map((option) => <option key={option.days} value={option.days}>{option.label}</option>)}
        </select>
        <small className="job-search-hint">Boards that cannot filter by date in a link ignore this — Wellfound, Work at a Startup, and the creative boards are all small enough to scan by eye.</small>
      </div>

      <div className="job-search-field">
        <label>Which boards</label>
        {JOB_BOARD_GROUPS.map((group) => <div key={group.id} className="job-search-chips">
          <small className="job-search-hint">{group.label}:</small>
          {JOB_BOARDS.filter((board) => board.group === group.id).map((board) => <button
            key={board.id}
            className={`chip ${settings.boardIds.includes(board.id) ? "active" : ""}`}
            onClick={() => toggle("boardIds", board.id)}
            title={board.note}
          >{board.label}</button>)}
        </div>)}
      </div>
    </section>

    {grouped.map((group) => <section key={group.id} className="job-search-group">
      <div className="radar-section-head">
        <div>
          <span>{group.label.toUpperCase()}</span>
          <h2>{group.searches.length} {group.searches.length === 1 ? "search" : "searches"}</h2>
          <small>{group.blurb}</small>
        </div>
        <button className="primary" onClick={() => openGroup(group.searches)}>
          Open {Math.min(OPEN_ALL_LIMIT, group.searches.filter((search) => !opened[search.key]).length || group.searches.length)} in tabs
        </button>
      </div>
      <div className="job-search-list">
        {group.searches.map((search) => <article key={search.key} className={opened[search.key] ? "opened" : ""}>
          <div className="job-search-row-main">
            <strong>{search.boardLabel}</strong>
            <span>{search.keyword}{search.locationId === "any" ? "" : ` · ${search.locationLabel}`}</span>
            <small>{search.note}</small>
          </div>
          <div className="job-search-row-status">
            {opened[search.key] ? <em>Opened {relativeTime(opened[search.key])}</em> : <em className="fresh">Not opened</em>}
          </div>
          <div className="radar-target-actions">
            <a className="board-link" href={search.url} target="_blank" rel="noreferrer" onClick={() => markOpened([search.key])}>Open ↗</a>
          </div>
        </article>)}
      </div>
    </section>)}

    {!searches.length && <section className="job-search-group">
      <div className="empty-state compact">
        <strong>Nothing to search yet.</strong>
        <span>Add at least one role keyword, one place, and one board above. Your saved target positions from the Job radar are offered as one-click keywords.</span>
      </div>
    </section>}

    <section className="radar-import">
      <div className="radar-section-head">
        <div>
          <span>BRING A ROLE BACK</span>
          <h2>Paste anything you found out there</h2>
          <small>
            Found something worth keeping on one of those boards? Paste its job link here. V’s reads that page only,
            scores it against your radar goals, and files it in the Job radar inbox alongside everything the automatic
            scan found — so a role you found by hand gets the same résumé and cover-letter treatment as one the radar
            caught. A LinkedIn link cannot be read: open it, copy the description, and start it from Role workspace.
          </small>
        </div>
      </div>
      <div className="radar-import-body">
        <label>Public job links <small>one per line</small>
          <textarea
            value={importLinks}
            onChange={(event) => setImportLinks(event.target.value)}
            placeholder={"https://boards.greenhouse.io/example/jobs/100\nhttps://jobs.lever.co/example/abc-123"}
          />
        </label>
        <div className="radar-import-actions">
          <button className="primary" onClick={importJobLinks} disabled={Boolean(busy) || !importLinks.trim()}>
            {busy === "import" ? "Reading job pages…" : "Import these roles"}
          </button>
          <small>Anything with a public job-details page works, including iCIMS career sites, Built In, Wellfound, and Work at a Startup. Links that fail stay in the box so you can retry just those.</small>
        </div>
      </div>
    </section>

    <section className="job-search-playbook">
      <div className="card-heading">
        <div>
          <span>HOW TO WORK THIS TAB</span>
          <h3>Twenty minutes, once a day</h3>
        </div>
      </div>
      <ol>
        <li><strong>Open the general boards first.</strong> They carry the most volume, and “Past week” keeps the same postings from coming back every day. On LinkedIn, switch the sort to “Most recent” once the tab opens — LinkedIn drops that setting from a link.</li>
        <li><strong>Paste anything promising into the box above</strong> rather than bookmarking it. Once it is in the inbox it gets a fit score, and Role workspace can draft against it.</li>
        <li><strong>Let the Job radar handle the companies you already know.</strong> Adding a company there is better than searching for it here — the radar rechecks it every twelve hours without you.</li>
        <li><strong>Press “Start a new pass” tomorrow.</strong> The opened marks are what tell you where you stopped; clearing them is how a new day begins.</li>
      </ol>
    </section>
  </div>;
}
