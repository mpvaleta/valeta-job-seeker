# Handoff to Claude Code

This is a complete Next.js + Supabase application: an expat professional
directory connecting Brazilians in the United States (launch market) to
professionals who speak Portuguese or share their origin. It has a working
backend, a full API, and a base visual design already applied — but it has
**never been run**, deployed, or seen in a real browser. That's the first job.

## Start here, in order

1. **Read `CLAUDE.md`** — project rules, architecture, and the design system
   in one page. Read it before writing or changing anything.
2. **Install and run it:**
   ```bash
   npm install
   npm run dev
   ```
3. **Set up a real Supabase project** (free tier is fine) — follow
   `docs/DEPLOY.md` steps 1–2. Run the SQL files in `supabase/` in the exact
   order listed in `README.md` (schema.sql, then migration-002 through
   migration-008, then seed.sql).
4. **Take a screenshot of the homepage** and sanity-check spacing, color
   contrast, and that the `OriginBadge` component (the two-tone pill on every
   card) is legible. This has been code-reviewed carefully but never actually
   rendered — the environment that built it had no browser tool.
5. **Verify the full check suite passes:**
   ```bash
   npm test          # 26 tests should pass
   npx tsc --noEmit  # should be clean
   npm run build     # should compile with no errors
   ```

## What already works
Search, professional profiles, reviews (moderated), favorites, reports,
profile claims, professional self-registration + self-edit dashboard with
analytics + photo upload, admin moderation + listing editor + stats + audit
log, account management (LGPD/CCPA: export, delete, password reset), Stripe
billing (recurring + PIX/boleto/SEPA one-time), notifications/reminders
(email + in-app now, WhatsApp/SMS ready), SEO city pages, sitemap, full
design system (see `docs/DESIGN.md`).

## What's genuinely unfinished (good first tasks)
- Category-specific fields (`src/lib/category-fields.ts`, already validated
  server-side) aren't rendered in the registration/edit forms yet.
- The Stripe upgrade panel only offers recurring billing — no UI toggle for
  one-time/PIX yet, though the API supports both.
- ~~No screenshot/visual QA has been done~~ — first pass done. The app now
  renders; contrast on the `OriginBadge` measured 11.5:1 (navy side) and 6.7:1
  (green side), both above WCAG AA. Two defects found and fixed: the `ProCard`
  verified mark was being clipped away by the name's `truncate`, and a city
  card read "1 profissionais". Still open from that pass:
  - `docs/DESIGN.md` assigns verified badges to Ipê gold, but both `ProCard`
    and the profile page render them in Cerrado green — doc and code disagree.
  - At 390px the hero "Como funciona a busca" panel squeezes its two boxes
    either side of the gold seam; the labels wrap awkwardly.

## Full document map
- `README.md` — setup and stack
- `CLAUDE.md` — rules and architecture (read first)
- `docs/DESIGN.md` — the color/type system and why
- `docs/BACKEND.md` — every API endpoint
- `docs/DATABASE.md` — data model
- `docs/SECURITY.md` — protections and compliance
- `docs/DEPLOY.md` — step-by-step go-live (Portuguese)
- `docs/PRELAUNCH_QA.md` — pre-launch checklist
- `docs/PROJECT_PLAN.md` — full status, done vs. not-done
- `docs/MONETIZATION.md`, `docs/APP_ROADMAP.md` — business/product context
- `docs/RECRUITMENT_KIT.md`, `docs/LAUNCH_PLAYBOOK.md`, `docs/NAME_SHORTLIST.md` — go-to-market, not code

## Commands
`npm install` · `npm run dev` · `npm test` · `npx tsc --noEmit` · `npm run build`
