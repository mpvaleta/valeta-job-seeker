# Conecta (working name) — Expat Professional Directory

A platform connecting expats to professionals who speak their language or share
their country of origin. Launch market: **Brazilians in the United States**.
Website first, mobile app later — same API and database power both.

## Stack

| Layer | Technology | Why |
|---|---|---|
| Frontend | Next.js 14 (App Router) + TypeScript + Tailwind | Fast, SEO-friendly, huge ecosystem |
| Backend/API | Next.js Route Handlers | Same API serves the future mobile app |
| Database | Supabase (PostgreSQL) | Auth + database + storage + Row Level Security in one |
| Payments | Stripe | Recurring (card/wallets) + one-time (PIX/boleto for BRL, SEPA for EUR) |
| Hosting | Vercel | Free tier, automatic deploys, built-in cron |

## Design system

See `docs/DESIGN.md`. Short version: colors are CSS variables representing the
base theme — United States (Atlantic navy) + Brazil (Cerrado green, Ipê gold) —
so a future country pair can swap the palette without touching component code.
A small "PROTOTIPO" badge sits next to the wordmark in the header on every page.

## Project structure

```
expat-connect/
├── docs/                  # Plan, security, design, deploy, go-to-market docs
├── supabase/
│   ├── schema.sql         # Core schema + Row Level Security
│   ├── migration-002..009 # Self-registration, events, full-text search,
│   │                      # storage, hardening, attributes, notifications,
│   │                      # service-role plan fix
│   └── seed.sql           # Categories, languages, sample professionals
├── scripts/
│   └── import-professionals.mjs  # Bulk CSV seeding
├── tests/                 # Vitest — validation, rate limiting, attributes, billing
├── src/
│   ├── app/                # Pages + API routes (see docs/BACKEND.md)
│   ├── components/         # UI components (OriginBadge is the signature one)
│   └── lib/                # Supabase clients, validation, stripe, notifications
└── prototype.html          # Standalone instant preview (no setup needed)
```

## Getting started

1. Create a free Supabase project at supabase.com.
2. In the SQL editor, run in order:
   `schema.sql` → `migration-002-self-registration.sql` →
   `migration-003-events.sql` → `migration-004-fulltext-search.sql` →
   `migration-005-storage.sql` → `migration-006-hardening.sql` →
   `migration-007-attributes.sql` → `migration-008-notifications.sql` →
   `migration-009-service-role-plan-fix.sql` → `seed.sql`.
3. Copy `.env.example` to `.env.local` and fill in your Supabase values.
4. `npm install && npm run dev` → open http://localhost:3000

## Make yourself admin (one-time)

Sign up on the site, then in the Supabase SQL editor:

```sql
update profiles set role = 'admin' where id = (select id from auth.users where email = 'YOUR-EMAIL');
```

`/admin` then shows moderation queues, `/admin/stats` shows directory health,
`/admin/audit` shows the action log, and "+ Nova listagem" seeds a listing directly.

## Bulk seeding via CSV

Fill in `scripts/professionals-template.csv`, then:
```bash
NEXT_PUBLIC_SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/import-professionals.mjs your-file.csv
```

## Deploying

See `docs/DEPLOY.md` for the full non-technical, step-by-step guide (~30 min).

## Commands

`npm run dev` · `npm test` · `npx tsc --noEmit` · `npm run build`
