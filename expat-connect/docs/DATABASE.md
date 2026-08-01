# Database Model

## Core tables
- **profiles** — every signed-up person (user, professional, or admin role)
- **categories** — professions, PT+EN, admin-editable
- **languages** — languages professionals speak
- **professionals** — the listings. Key fields: `status` (pending→approved),
  `verified`, `plan` (free/featured/premium), `owner_id`, `origin_country`,
  `attributes` (JSONB, category-specific — see `src/lib/category-fields.ts`)
- **professional_languages** — many-to-many
- **reviews** — 1–5 stars, moderated, one per user per pro, auto-aggregated via trigger
- **favorites**, **claims**, **reports** — user actions
- **subscriptions** — Stripe-synced plan state
- **profile_events** — anonymous view/click tracking (analytics)
- **notifications** — the reminder/notification queue
- **audit_log**, **processed_stripe_events**, **rate_limit_hits** — operational hardening

## Search
`search_professionals()` RPC (migration-004): accent-insensitive Portuguese
full-text search ("joao" matches "João"), weighted name > headline > bio/city,
GIN-indexed. Search API falls back to ILIKE if the RPC isn't installed yet.
Results always order by `plan` first — meaning monetization requires zero
search-code changes when switched on.

## Adding content without code
New category → insert into `categories` (or the admin panel). New professional
→ admin panel "+ Nova listagem" or the CSV bulk importer.
