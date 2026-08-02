# Monetization

## Model: professional subscriptions
| | Free | Featured | Premium |
|---|---|---|---|
| Listed in search | ✅ | ✅ | ✅ |
| Position in results | Normal | Boosted in category | Top of city + category |
| Badge | — | ✅ | ✅ |
| Homepage spotlight | — | — | ✅ |
| Analytics | — | ✅ | ✅ |

## Payment methods (already built, see docs/BACKEND.md)
- **Recurring** (monthly): card + Apple/Google Pay, via Stripe Checkout subscription mode.
- **One-time** (12 months): unlocks local methods by currency —
  `BILLING_CURRENCY=brl` adds PIX + boleto (important: many Brazilians avoid
  leaving a card on file for recurring charges); `eur` adds SEPA. Defaults to
  card-only for `usd`, the launch currency.

## Why this model, and when to turn it on
Users never pay — directory value depends on volume. Don't charge
professionals before ~500 monthly users; charging too early kills the
recruitment your launch depends on. See docs/LAUNCH_PLAYBOOK.md.

## Later options
1. Sponsored category placement
2. Lead fees (pay per contact unlock)
3. In-platform booking with a per-booking fee
