# Project guide for Claude Code

Read this first when opening the repo.

## What this is
An expat professional directory — connects Brazilians in the United States
(launch market) to professionals who speak Portuguese or share their origin.
Web now, mobile app later (same API + DB). Working name "Conecta" (not final).
UI language is Portuguese (pt-BR).

## Stack
Next.js 14 App Router + TypeScript (strict) + Tailwind. Supabase: PostgreSQL +
Auth + Storage, secured by Row Level Security. Stripe for payments (recurring +
PIX/boleto/SEPA one-time). Deployed on Vercel (cron included via vercel.json).

## Design system — READ docs/DESIGN.md BEFORE touching any styling
Base theme: Atlantic navy (US, "where you are") + Cerrado green (Brazil,
"who you're looking for") + Ipê gold (the seam/ratings/verified). All colors
are CSS variables in `globals.css` — never hardcode a hex value in a component;
use the Tailwind tokens (`bg-brand`, `text-atlantic`, `text-gold`, etc.) so a
future country-pair theme can swap the palette without touching component code.
The `OriginBadge` component (`src/components/OriginBadge.tsx`) is the signature
element — reuse it, don't invent a new "location vs origin" display elsewhere.
A `PrototypeBadge` sits in the header on every page; remove it only when
instructed that the site is genuinely launching, not before.

**First thing to do in a real browser environment**: run `npm run dev`,
screenshot the homepage, and sanity-check spacing/contrast/OriginBadge
legibility — this was built and reviewed carefully but never actually
rendered, since the environment that wrote it had no browser tool.

## Golden rules (do not break these)
1. Never put business logic in page components — it all goes through
   `src/app/api/*` route handlers, so the future mobile app can reuse them.
2. Security lives in the database, not just the app. Every table has RLS
   (`supabase/schema.sql` + migrations). Add policies in the same migration
   as any new table.
3. Validate all input with Zod (`src/lib/validation.ts`). Use the `safeUrl`
   helper for any URL field — plain `z.string().url()` allows `javascript:` URIs.
4. Professionals must never self-elevate. `status`, `verified`, `plan` are
   admin-only, enforced by a DB trigger (migration-002). Don't add a code path
   that lets an owner set these directly.
5. Only approved listings/reviews are public. Don't add a service-role query
   that leaks pending rows to the client.
6. Never expose `SUPABASE_SERVICE_ROLE_KEY` to the client. It's used in exactly
   three places, all server-only with no user session: the Stripe webhook,
   account deletion, and the notification dispatcher.
7. No invented data — this is a real directory. Don't fabricate testimonials,
   stats, or professional details; see docs/DESIGN.md's "Honesty over polish."
8. Category-specific fields go through `validateAttributes()`
   (`src/lib/attributes-validation.ts`), which drops unknown keys — don't
   bypass it when writing to `professionals.attributes`.

## Where things are
- `supabase/schema.sql` + `migration-002` through `migration-009` — run in order.
- `src/lib/` — Supabase clients, validation, rate limiting, Stripe, notifications,
  category fields + their validator, audit, email.
- `src/app/api/` — the REST API (see docs/BACKEND.md for the full list).
- `src/app/` — pages: home, search, pro/[slug], local/[country]/[city] (SEO),
  dashboard, my-listing, account (LGPD/CCPA controls), admin (+ listing editor,
  stats, audit log), auth pages, legal pages.
- `src/components/` — UI. `OriginBadge`, `PrototypeBadge`, `CategoryIcon` are
  the design-system pieces; the rest are functional (forms, admin actions).
- `scripts/import-professionals.mjs` — bulk CSV seeding.
- `docs/` — plan, design, security, backend reference, deploy guide, QA
  checklist, go-to-market kit.
- `tests/` — vitest: validation, rate limiting, attributes, Stripe plan mapping.

## Commands
`npm run dev` · `npm run build` (must pass before deploy) · `npm test` ·
`npx tsc --noEmit`

## Before committing
`npm test && npx tsc --noEmit && npm run build` — all three green. Note: the
build fetches fonts from Google Fonts at build time; if that ever fails in a
sandboxed environment, it's a network issue, not a code issue.

## Good next tasks
- Dynamic category-specific fields in the registration/edit forms (backend
  ready — `src/lib/category-fields.ts`; forms don't render them yet)
- Billing-mode picker (recurring vs. one-time/PIX) on the upgrade panel
- Stripe subscription checkout buttons wired to real Price IDs once created
- Expo mobile app consuming `src/app/api/*` (see docs/APP_ROADMAP.md)
