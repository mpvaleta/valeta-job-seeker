# Mobile App Roadmap

Every page's data flows through `src/app/api/*` — the mobile app is just
another client of the same endpoints, same database, same RLS. Recommended
stack: React Native + Expo (Supabase has a first-class RN SDK). App-specific
additions only: push notifications (the `notifications` table/dispatcher
already exists — WhatsApp/SMS channels are provider-agnostic and ready),
location permission for "near me," offline favorites caching.

Sequence: web launch + traction first → optional Capacitor wrap as a cheap
test → full Expo app once features stabilize.

Rule: never put business logic in page components — keep it in API routes and
`src/lib/`. The codebase already follows this, which is what keeps the app free.
