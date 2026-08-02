# Project Plan

## Vision
Expats find trusted professionals who speak their language or share their
origin. Launch: Brazilians in the United States. Web → mobile app → monetization.

## Status: feature-complete for launch, base design system applied

### Foundation
- [x] Stack: Next.js + Supabase, app-ready from day one
- [x] Full database schema + Row Level Security on every table
- [x] Categories, languages, sample seed data

### Core product
- [x] Search (accent-insensitive Portuguese full-text), category pages, SEO city pages
- [x] Professional profiles, reviews (moderated), favorites, reports, profile claims
- [x] Professional self-registration + self-edit dashboard with analytics + photo upload
- [x] Admin: moderation queues, listing editor, platform stats, audit log
- [x] Account management (LGPD/CCPA): data export, deletion, password reset — real UI at `/account`

### Payments & category depth
- [x] Stripe: recurring (card/wallets) + one-time (PIX/boleto for BRL, SEPA for EUR), idempotent webhook
- [x] Category-specific profile fields (12 categories) with server-side validation

### Operations
- [x] DB-backed rate limiting (fixes a real serverless bypass), audit log, health check endpoint
- [x] Notifications/reminders queue — email + in-app now, WhatsApp/SMS ready via env config
- [x] 26 automated tests, TypeScript strict, production build verified (38 routes)

### Design (this round)
- [x] Base color theme: Atlantic (US) + Cerrado (Brazil) + Ipê (seam/ratings) —
      CSS-variable architecture so future country pairs can swap the palette
- [x] Typography: Fraunces (display) + Public Sans (body) + IBM Plex Mono (data)
- [x] Signature OriginBadge component — the "match" concept made visible everywhere
- [x] PROTOTYPE badge in the header, every page
- [x] Homepage rebuilt: real (not fabricated) stats, honest trust-signals section
      instead of an invented testimonial
- [x] docs/DESIGN.md documents the system and the extension path

## Not yet built (front-end)
- [ ] Dynamic category-attribute fields in registration/edit forms (backend ready)
- [ ] Billing-mode picker (recurring vs. PIX/one-time) in the upgrade UI
- [ ] Country-pair theme switcher UI (architecture supports it; not needed at launch)
- [ ] Visual QA pass with an actual browser/screenshot tool (not available in the
      environment that built this — see docs/DESIGN.md)

## Pre-launch (your action items)
- [ ] Choose final name + register domain (docs/NAME_SHORTLIST.md)
- [ ] Create Supabase + Vercel accounts, run migrations (docs/DEPLOY.md)
- [ ] Seed 50–100 real professionals (docs/RECRUITMENT_KIT.md + CSV importer)
- [ ] Verify credentials of health/legal professionals before approving
- [ ] Legal review of Terms/Privacy (currently marked RASCUNHO)
- [ ] Pick launch city (docs/LAUNCH_PLAYBOOK.md)

## Launch metric targets
100 approved professionals, 8+ categories, 3+ cities, review moderation < 48h.
