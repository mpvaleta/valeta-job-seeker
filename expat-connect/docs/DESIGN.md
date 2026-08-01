# Design System

## The brief, restated
Every professional here is defined by two places at once: where they practice,
and where they (or their language) come from. The design makes that duality
visible instead of decorating around it. Base theme, chosen because launch is
Brazilians in the United States: **Atlantic** (US, "where you are") +
**Cerrado** (Brazil, "who you're looking for") + **Ipê** (the seam between them).

## Tokens (src/app/globals.css)

| Name | Hex | Role |
|---|---|---|
| Paper | `#F4F6F8` | Background — cool, institutional, not the cliché warm-cream SaaS default |
| Ink | `#13212F` | Text |
| Atlantic | `#1C2E4A` | "Where you are" — location, nav chrome. Named for the ocean between the two countries. |
| Cerrado | `#0E7A4C` | "Who you're looking for" — primary CTA/brand color. Named for the Brazilian biome. |
| Ipê | `#D9A441` | Ratings, verified badges, the seam color. Named for Brazil's national flower, the ipê tree. |
| Line | `#DDE3EA` | Hairlines/borders |

All colors are CSS custom properties, not hardcoded Tailwind values — swapping
a future country pair (e.g. US+Portugal, Canada+Brazil) means changing six
variables in `globals.css`, never touching a component. `tailwind.config.ts`
maps `brand` → Cerrado, `atlantic` → Atlantic, `gold` → Ipê, so most existing
components (which already used `bg-brand`, `text-brand-dark`, etc.) inherited
the new palette automatically.

## Typography

- **Fraunces** (display) — headlines only, used with restraint. A serif adds
  warmth/trust that a generic geometric sans wouldn't, fitting a brand about
  human connection across distance.
- **Public Sans** (body/UI) — a civic-service typeface, deliberately chosen for
  a product about navigating a new country's bureaucracy.
- **IBM Plex Mono** (data) — reserved for real numbers (stats, ratings, prices)
  so they read as data, not marketing copy.

All three load via `next/font/google` in `src/app/layout.tsx` as CSS variables,
referenced from `tailwind.config.ts` (`font-display`, `font-sans`, `font-mono`).

## The signature element: OriginBadge

`src/components/OriginBadge.tsx` — a two-tone pill, navy left / gold seam /
green right, showing **based-in** vs **origin/language** side by side. Used on
every ProCard and profile page. This isn't decoration: it's the product's core
premise (match by origin + location) made visible everywhere, with real data
from each professional's own `city`/`country`/`languages` fields — never
hardcoded copy.

## The PROTOTYPE badge

`src/components/PrototypeBadge.tsx` — a small chip next to the wordmark in the
sticky header (`src/components/Header.tsx`), visible on every page including
on scroll. Exists so the site is unambiguous as a work-in-progress whenever
it's shared with someone, before real deployment. Remove it (delete the
`<PrototypeBadge />` line in Header.tsx) once the site is genuinely launched.

## Honesty over polish

The homepage does NOT show fabricated stats ("500K users") or a fake customer
testimonial with a stock photo — there's nothing real to quote yet, and
inventing a quote would be dishonest. Instead: real counts pulled live from the
database (gracefully showing "—" when zero), and a "why the community trusts
this" section built from verifiable claims (credential verification, review
moderation, no paid intermediaries) rather than a persona that doesn't exist.
Replace that section with real testimonials once you have them.

## What's NOT built yet (front-end)

- Dynamic per-category attribute fields in the registration/edit forms (the
  backend — `src/lib/category-fields.ts`, `validateAttributes()` — is ready;
  the forms still show only the shared fields). Next front-end task.
- A UI for choosing billing mode (recurring vs. one-time/PIX) on the upgrade
  panel — currently defaults to recurring; the API already supports both.
- A country-pair theme switcher (the CSS-variable architecture supports it;
  no picker UI exists, since only one pair — US+BR — is needed at launch).

## Verifying visually

This was built and code-reviewed carefully, but not screenshotted — the build
sandbox used to write this code has no browser/rendering tool. Open
`prototype.html` in any browser for an instant look, or run `npm run dev` and
view the real app. Claude Code (or any environment with a browser) should take
a screenshot of the homepage as its first step and sanity-check spacing,
contrast, and the OriginBadge legibility before going further.
