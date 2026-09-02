---
name: capturar
description: Captura, com o Marcos presente, as vagas das buscas configuradas no V's Job Seeker (LinkedIn, Indeed, Google Jobs) usando o Chrome conectado, e arquiva na caixa "Captured results list" do app. Só lê páginas de resultados — nunca abre vaga por vaga, nunca roda sem ele, nunca recebe token. Use quando ele disser "captura", "/capturar" ou pedir para trazer as vagas das buscas.
---

# /capturar — one command, the boards' search results land in the radar inbox

Marcos types `/capturar` (optionally `/capturar linkedin`, `/capturar indeed`, `/capturar google`,
`/capturar posts`). You do everything below, in his own Chrome, while he is present. Speak to him
in Brazilian Portuguese; keep the tool mechanics in English.

## The rules (non-negotiable)

- **Results pages only.** Open a handful of *search-results* pages. Never open individual job pages
  on linkedin.com, indeed.com or glassdoor.com in sequence — that is the scraper signature that gets
  a LinkedIn account restricted. Never click "Easy Apply", "Apply", "Save", "Follow" or any card.
- **Never unattended.** If Marcos is not around (no reply, late hour, he said he is leaving), stop.
- **Read, don't crawl.** Read each results page once (a11y tree + page text). No scrolling loops on
  LinkedIn. One page per search is enough with the 24-hour freshness window.
- **No token.** Filing goes through the app tab, which is already signed in (HttpOnly cookie).
  If the app shows the access gate, stop and tell him to sign in there himself.
- **Never file blindly.** Only rows plausibly in his discipline go in; everything else is listed to
  him as "deixei de fora" so nothing disappears silently.
- Close the tabs you opened when done. Leave the app tab.

## Step 1 — read the searches from the app (single source of truth)

The app's "Open job search" tab holds the keywords, places, boards and freshness window Marcos
chose. Read them there — never keep a copy in this file.

1. `tabs_context_mcp` (createIfEmpty). Find or `navigate` a tab to
   `https://valeta-job-seeker.marcos-valeta.workers.dev/`. Confirm the app rendered (page text shows
   "Role workspace / Job radar / Open job search…"). If it shows a sign-in screen, stop.
2. Click the nav button **"Open job search"** (`find` → the button, then `computer left_click` by ref).
3. Read the settings with `javascript_tool` (return text only — the extension blocks any return value
   that looks like a URL query string, so never return hrefs from JS):

   ```js
   JSON.stringify({
     chips: [...document.querySelectorAll('.chip.active')].map(b => b.textContent.trim().replace(/\s*×$/, '')),
     stored: JSON.parse(localStorage.getItem('vjs.job-search.settings.v1') || 'null')
   })
   ```

   `stored.keywords` (null means the radar's target titles are in use — then take the keyword chips),
   `stored.locationIds` (`bay-area`, `remote-us`, `new-york`, `los-angeles`, `seattle`, `chicago`),
   `stored.boardIds`, `stored.postedWithinDays`.

## Step 2 — build ONE combined search per board × place

Combine the keywords with OR so a run opens ~5 pages, not 70. Quote multi-word titles.

- **LinkedIn**: `https://www.linkedin.com/jobs/search/?keywords=<("kw1" OR "kw2" OR …)>&f_TPR=r<days*86400>&location=<place>`
  places: bay-area → `San Francisco Bay Area`; remote-us → `United States` **plus** `&f_WT=2`;
  new-york → `New York, New York, United States`; los-angeles → `Los Angeles, California, United States`;
  seattle → `Seattle, Washington, United States`; chicago → `Chicago, Illinois, United States`.
- **Indeed**: `https://www.indeed.com/jobs?q=<(kw1 OR "kw2" …)>&fromage=<days>&l=<place>`
  places: bay-area → `San Francisco Bay Area, CA`; remote-us → drop `l`, add `&sc=0kf:attr(DSQF7);`;
  new-york → `New York, NY`; los-angeles → `Los Angeles, CA`; seattle → `Seattle, WA`; chicago → `Chicago, IL`.
- **Google Jobs**: `https://www.google.com/search?q=<(kw1 OR "kw2" …) jobs <place or "remote">>&ibp=htl;jobs&htichips=date_posted:<today|3days|week|month>`
  (`today` ≤1 day, `3days` ≤3, `week` ≤7, else `month`); place bay-area → `San Francisco Bay Area`.
- Skip ZipRecruiter, Glassdoor and the niche boards in this routine (bot walls); the app's own links
  stay available to him for those.

If he passed a board name (`/capturar linkedin`), do only that board.

## Step 3 — open and read each search, one at a time

For each search URL: `tabs_create_mcp` once for the whole run, then per search `navigate` → `computer wait 3`
→ extract → next. A few seconds between pages, like a person.

Extraction that is known to work (verified 2026-09-02):

- **Indeed** — `javascript_tool` (return bare ids, never URLs):
  ```js
  const seen = new Set(); const rows = [];
  for (const el of document.querySelectorAll('[data-jk]')) {
    const jk = el.getAttribute('data-jk'); if (!jk || seen.has(jk)) continue; seen.add(jk);
    const root = el.closest('li') || el;
    const t = (sel) => (root.querySelector(sel)?.innerText || '').replace(/\s+/g, ' ').trim();
    rows.push([jk, t('h2, .jobTitle').slice(0, 90), t('[data-testid="company-name"]').slice(0, 60), t('[data-testid="text-location"]').slice(0, 60), root.innerText.replace(/\s+/g, ' ').replace(/[=?&#]/g, ' ').slice(0, 200)].join(' | '));
  }
  rows.join('\n');
  ```
  Job URL = `https://www.indeed.com/viewjob?jk=<jk>`. If the output is truncated, call again with `.slice(10)`, `.slice(20)`.
  **Indeed + remote (`sc=0kf:attr(DSQF7);`) ignores the OR grouping** and returns unrelated remote jobs
  (verified: purchasing, security engineering, real-estate agents, insurance "producers"). For the
  remote place on Indeed, run two or three single-keyword searches (`q=producer`, `q="project manager"`,
  `q="creative operations"`) instead of the combined one — or skip Indeed remote when time is short;
  LinkedIn remote covers it well.
- **LinkedIn** (classic `/jobs/search/` list, verified 2026-09-02) — `read_page` does **not** list the
  job cards, and cards outside the viewport are *occluded* (their `li[data-occludable-job-id]` keeps the
  id but loses its text). So: scroll the results list with the native `computer scroll` action at the
  list's coordinates (left column, e.g. `[350, 500]`), 8 ticks at a time, and after each scroll run a
  **short** `javascript_tool` that appends the visible cards to `window.__vcap` (no `await`, no loops
  with waits — a long-running evaluate on a LinkedIn tab hangs the debugger for 45 s and returns nothing):
  ```js
  (() => { const clean = s => String(s||'').replace(/[=?&#]/g,' ').replace(/\s+/g,' ').trim();
    const acc = window.__vcap = window.__vcap || {};
    for (const li of document.querySelectorAll('li[data-occludable-job-id]')) {
      const id = li.getAttribute('data-occludable-job-id').trim();
      const lines = (li.innerText||'').split('\n').map(s=>s.trim()).filter(Boolean);
      if (!lines.length || acc[id]) continue;
      const u = lines.filter((l,i)=>i===0||l!==lines[i-1]);   // the title is rendered twice
      acc[id] = [id, clean(u[0]).slice(0,80), clean(u[1]).slice(0,40), clean(u[2]).slice(0,40), clean(u.slice(3).join(' · ')).slice(0,70)].join(' | ');
    }
    return Object.keys(acc).length; })()
  ```
  Do it as one `browser_batch`: `window.__vcap = {}` → scroll up 30 → collect → (scroll down 8 → wait 1 →
  collect) × 5. Page 1 holds ~25 cards (about half are "Promoted" duplicates of each other; dedupe by id).
  Then read `Object.values(window.__vcap)` in slices of 7–8 (the tool truncates long returns).
  Lines are `id | title | company | location (On-site/Remote/Hybrid) | extras (posted, Promoted…)`.
  Job URL = `https://www.linkedin.com/jobs/view/<id>/`. Never return hrefs from JS on LinkedIn.
  A remote-US search is the same URL with `&f_WT=2&location=United States`.
- **Google Jobs** (new `udm=8` jobs UI, verified end-to-end 2026-09-02) — `get_page_text` gives title /
  company / "location • via Board" / "N days ago" per card, but the list holds **no job links**: each
  card is a button, and the apply links only render in the detail panel after the card is clicked.
  Google has no account of his at stake, so clicking cards there is allowed. Take a `screenshot`,
  then for each card you intend to keep: `computer left_click` on the card title (coordinates from
  the screenshot) → `wait 2` → this short JS, which returns host + path only (a full URL with a
  query string would be blocked):
  ```js
  (() => [...document.querySelectorAll('a[href]')].filter(a => /apply/i.test(a.innerText)).slice(0, 4)
    .map(a => { const u = new URL(a.href); return a.innerText.replace(/\s+/g,' ').trim().slice(0,30) + ' -> ' + u.hostname + u.pathname.slice(0,100); }).join('\n'))()
  ```
  Prefer the employer / ATS link (e.g. `pra.isolvedhire.com/jobs/…`) or Mediabistro over LinkedIn /
  Indeed mirrors, because the server can then read the full description itself; a LinkedIn mirror
  gives `…/jobs/view/<slug>-<id>` → use `https://www.linkedin.com/jobs/view/<id>/`. Scroll the list
  (`computer scroll` at the list's coordinates) and re-screenshot to reach the cards below the fold.
  Google ignored `htichips=date_posted`: results were 2–4 weeks old, so read the "N days ago" text
  and tell him the age; file with `source: "google"` (lands as "Imported by you").
- **Page 2.** A run less than a day after the previous one will re-find page 1. Reading page 2 of a
  LinkedIn search (`&start=25`) is still a results page and is fine; page 3+ only if he asks.
- If a page shows a login wall, a captcha, or "no results", record that and move on — never retry in a loop.

## Step 4 — judge, dedupe, summarise

You are the filter the app cannot be. Keep a row when its title is one of his target titles or a
close sibling **and** the role is plausibly creative / brand / marketing / production / operations
in an organisation where that makes sense. Drop construction, clinical, IT/engineering, finance,
supply-chain, sales-comp and clearly unrelated "Project Manager" hits — and list them.
Dedupe by URL across searches. Cap at 100 rows.

Tell him, in Portuguese, before filing:
`N resultados em K buscas · M na sua área` + the M rows as `Título — Empresa (local)` + `Deixei de fora: …`.

## Step 5 — file into the app (verified mechanics)

Back on the app tab (still on "Open job search"), fill the **Captured results list** box and press
**File this list**. The textarea is React-controlled, so set it through the native setter and
dispatch `input` — plain `form_input` leaves the button disabled:

```js
const capture = { schema: "v-jobs-list-capture-v1", source: "<linkedin|indeed|google>", sourceUrl: "<search host>", capturedAt: new Date().toISOString(),
  rows: [ { title, company, location, url, description } /* ≤100 rows, description ≤600 chars */ ] };
const ta = document.querySelector('#job-search-capture');
Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set.call(ta, JSON.stringify(capture));
ta.dispatchEvent(new Event('input', { bubbles: true }));
await new Promise(r => setTimeout(r, 200));
document.querySelector('#job-search-capture-file').click();
await new Promise(r => setTimeout(r, 3500));
JSON.stringify({ emptied: ta.value === '' });
```

Use `source: "linkedin"` for LinkedIn rows (they file as "Saved on LinkedIn" provenance) and
`"captured"` for every other board. One filing per board. The app answers with a notice
("N new roles filed …"); the box empties on success. If it did not empty, read the page text for the
error and tell him — do not retry more than once.

Then confirm in Portuguese: `Arquivadas: N novas (M atualizadas). Estão na caixa do Job radar com nota.`

## `/capturar posts` — LinkedIn posts, not jobs (optional mode)

Same rules, one page: `https://www.linkedin.com/search/results/content/?keywords=<("hiring" OR "we're hiring" OR "looking for") AND (producer OR "project manager" OR "creative operations")>&sortBy=%22date_posted%22`.
Read with `get_page_text`. A post is a lead, not a posting: file only posts that name a role and a
company, as rows `{ title: "<role> (post)", company, location: "", url: <post href from read_page>, description: <first 600 chars> }`
with `source: "linkedin"`. List the rest to him.

## Mobile

This routine needs his Mac's Chrome, because Claude drives that browser. The iPhone does not need
Claude at all: on a LinkedIn or Indeed results page he taps the V's autofill bookmark, presses
"Copy N roles", and pastes into "Paste a captured list" in Open job search. The reader behind that
button is `extension/results-capture.js`, the same module the Chrome extension loads — fix a
selector once and both companions get it. He must re-add the bookmark after any change to the
bookmarklet, since its code lives inside the saved URL.
