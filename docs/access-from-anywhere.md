# Access from anywhere

V's Job Seeker is not a browser-local app. It deploys as a Cloudflare Worker, and
everything that matters lives server-side, so the same workspace is reachable
from any signed-in device — laptop, phone, or a borrowed browser.

## What lives where

| Data | Where it lives | Reachable from |
| --- | --- | --- |
| Radar: monitors, discoveries, decisions, learning history | D1 database | Everywhere |
| Workspace: profile, facts, knowledge sources, résumé versions, applications, drafts | R2 + D1 (append-only revisions, autosaved ~8s after every change) | Everywhere |
| Fast working copy + freshness stamp | Browser `localStorage` | That browser only (a cache, never the source of truth) |
| Autofill package | Chrome extension storage | That browser only — by design, it has to sit next to the application form |
| API keys and secrets | Worker secrets (`wrangler secret put`) | Server only; never sent to a browser |

## Opening the app on a new device

1. Open the deployed Worker URL with your access token once:
   `https://<your-worker-domain>/?token=YOUR_APP_TOKEN`
2. The app stores the token as a cookie (valid one year) and strips it from the
   visible URL, so every later visit is just the plain address.
3. On a phone, use the browser's **Add to Home Screen** — the app ships a PWA
   manifest and installs as a standalone app.

Giving someone else access does not mean sharing your token: add a
`EXTRA_ACCESS_TOKENS` secret formatted `email:token,email:token`. Each token
proves that specific identity, and each identity gets its own separate radar
and workspace.

## When two devices disagree

Every save creates an immutable private revision; nothing is ever overwritten
destructively. On load, a device compares the newest durable revision against
its own last-reconciled stamp:

- If the durable revision is **newer** (you edited somewhere else since this
  device last opened), the remote side wins conflicts. Records that exist only
  on this device are still kept.
- If this device's copy is **newer**, it stands, exactly as before.

Older states remain recoverable on the **Data** tab — restore or merge any
revision without deleting the current workspace.

## The radar runs while everything is closed

The Worker's cron trigger checks for due monitors every two hours
(`wrangler.toml → [triggers]`), so discoveries accumulate with every device
off. An external scheduler can alternatively call `POST /api/radar/cron` with
the `RADAR_CRON_SECRET` as a bearer header.

## Required server configuration

Set with `wrangler secret put <NAME>`: `APP_TOKEN` (the login credential),
`RADAR_CRON_SECRET` (background scans), plus any AI provider keys. The owner
identity `APP_OWNER_EMAIL` is a plain var in `wrangler.toml`.
