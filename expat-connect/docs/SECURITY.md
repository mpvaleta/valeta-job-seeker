# Security & Compliance

## Built into the schema
- Row Level Security on every table. Public sees ONLY approved listings and
  approved reviews. Users edit only their own data. Admin checked at the DB level.
- One review per user per professional (prevents review bombing); moderated
  (pending → approved) before appearing publicly.
- Professionals cannot self-elevate: a DB trigger (migration-002) blocks
  non-admins from changing their own `status`, `verified`, or `plan`.

## Application layer
- All input validated with Zod before touching the database (`src/lib/validation.ts`).
  `safeUrl` rejects `javascript:` URIs — a real vulnerability caught by the test suite.
- Rate limiting: in-memory fast path + a shared Postgres counter
  (`rate_limit_check`, migration-006) so limits hold across serverless instances.
- Category attributes (`src/lib/attributes-validation.ts`) drop any unknown key
  the client sends — defends against injecting fields like `is_admin` through
  the flexible JSONB column.
- Stripe webhook verifies signatures and records processed event IDs
  (`processed_stripe_events`) so duplicate deliveries are safely ignored.
- `SUPABASE_SERVICE_ROLE_KEY` used only where there's no user session:
  the Stripe webhook, account deletion, and the notification dispatcher.

## Trust & safety
- Verification badge: admin checks credentials (medical licenses, bar numbers)
  before marking `verified = true`. Health/legal categories should require this.
- Claims flow: a professional proves identity before controlling a listing.
- Reports: any signed-in user can flag wrong info or abuse; admin resolves.
- Audit log (migration-006, `/admin/audit`): every moderation action recorded.

## LGPD / CCPA / privacy
Launch is US-based with a Brazilian user base — CCPA (California) and LGPD
(Brazil) both matter.
- `GET /api/account/export` — right of access, downloads all user data as JSON.
- `POST /api/account/delete` — right to erasure; typed confirmation; cascades
  cleanly; detaches+suspends (doesn't silently delete) any listing the user owns.
- `POST /api/account/password-reset` — anti-enumeration (always returns ok).
- Professional contact info is public BY THEIR CONSENT (stated in the
  registration flow), not scraped or assumed.

## Before launch checklist
- [ ] Enable Supabase email confirmation for signups
- [ ] Turn on leaked-password protection in Supabase Auth settings
- [ ] Add CAPTCHA (Cloudflare Turnstile) to signup + review forms
- [ ] Write Terms of Service including professional listing consent
- [ ] Set up daily database backups (Supabase dashboard, one click)
- [ ] Legal review of Terms/Privacy drafts (`/terms`, `/privacy` — currently marked RASCUNHO)
