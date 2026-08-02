# Backend Reference

## Search — `GET /api/professionals`
Accent-insensitive full-text search via `search_professionals` RPC. Falls back
to ILIKE. Filters: q, category, country, city, language, online, page.

## Reviews, Favorites, Reports, Claims
Standard auth-required, rate-limited, RLS-backed CRUD. See route files under
`src/app/api/`. Claims transfer listing ownership on admin approval.

## Professional self-registration & self-edit
`POST /api/register-professional` (creates pending listing) and
`GET`/`PATCH /api/my-listing` (owner edits their own, plus 30-day analytics).
Both validate category-specific `attributes` via `validateAttributes()`
(drops unknown keys — injection defense).

## Photo upload — `POST /api/upload-photo`
multipart form. JPG/PNG/WebP, max 3MB. Owner/admin only, storage-level RLS too.

## Payments — multiple methods
Two billing modes on `/api/billing/checkout`:
- **recurring** (`mode: subscription`) — card + Apple/Google Pay automatically.
- **onetime** (`mode: payment`) — pay once for 12 months; unlocks local methods
  by currency (`BILLING_CURRENCY=brl` → PIX + boleto; `eur` → SEPA).
`/api/billing/portal` opens Stripe's customer portal. `/api/billing/webhook`
verifies signatures, records processed event IDs (idempotent), and is the only
place that flips `professionals.plan` and syncs `subscriptions`.

## Category-specific fields
`professionals.attributes` (JSONB) holds per-category data defined in
`src/lib/category-fields.ts` — 12 categories, each with relevant fields only
(doctor: specialties/insurers/telehealth; salon: services/price range; etc.).
Schema exposed at `GET /api/category-fields`. Deliberately excludes patient/
client health data — only the professional's own service info.

## Account & privacy
`GET /api/account/export`, `POST /api/account/delete`,
`POST /api/account/password-reset` — see docs/SECURITY.md. Now has a real
front-end at `/account`.

## Notifications & reminders
Queue table + `src/lib/notifications.ts` dispatcher. Email + in-app work now;
WhatsApp/SMS activate by setting `WHATSAPP_API_URL`/`WHATSAPP_API_TOKEN`
(Twilio, 360dialog, Meta Cloud API — any works). Processed every 10 min by a
Vercel Cron hitting `/api/notifications/dispatch` (see `vercel.json`).

## Admin — `POST /api/admin`, `GET`/`POST /api/admin/listing`
Role-checked in code AND RLS. Approve/reject/create/edit listings. Every action
is recorded in `audit_log` (viewable at `/admin/audit`).

## Operational hardening
DB-backed rate limiting (fixes a real serverless bypass — in-memory alone
doesn't hold across function instances), Stripe webhook idempotency, audit
log, `GET /api/health` for uptime monitoring.

## Turning on monetization
1. Create Stripe recurring + one-time Prices; copy IDs into env.
2. Set `STRIPE_SECRET_KEY`, `STRIPE_PRICE_FEATURED[_ANNUAL]`, `STRIPE_PRICE_PREMIUM[_ANNUAL]`.
3. Add a Stripe webhook → `https://yourdomain.com/api/billing/webhook`, subscribe
   to `checkout.session.completed`, `customer.subscription.updated/deleted`.
4. Copy the signing secret → `STRIPE_WEBHOOK_SECRET`. Done — the UpgradePanel
   on `/my-listing` already calls this.
