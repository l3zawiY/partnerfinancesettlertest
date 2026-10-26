# Status — start here

Short snapshot of where the web pilot stands and what to do next. **Last updated:
2026-10-26.** Every session that changes the state updates this page before pushing.
`docs/WEBAPP.md` is long (~2,600 lines): do not read it in full; open only the sections
named below when a task needs them.

## TL;DR for the owner

- The app is **live** at https://app.tallywithus.com. You and your partner have accounts and
  are paired in the household. No statements or shared items have been submitted yet.
- **Your next step:** finish the spot-check with your partner (about 15 minutes each):
  fictional samples, 50/50, submit, close, compare, self-test, clean up.
- **Decision waiting on you:** Clerk colours, **A** dark green (recommended) or **B** lime
  (WEB-053).
- **The agent's next step:** the documentation split (WEB-054), then guide the spot-check.
- Go-live target: about 2026-10-31, after the spot-check, locking sign-up, scheduled
  logbook checks, and a go/no-go review.
- Your private operations dashboard is **live** at https://ops.tallywithus.com (your
  password). Its notes are in `ops-dashboard/README.md` on branch `ops-dashboard`.
- In VS Code, see the latest version with **Source Control → Sync / Pull** on branch
  `mac-unpushed-work`.

## For the agent: next actions, in order

1. **Start-up checks.** Work on `mac-unpushed-work` (never `main`); pull first. Confirm
   `webapp/.env.local` exists without reading it (recreate it from the
   `VITE_CLERK_PUBLISHABLE_KEY` and `CLERK_SECRET_KEY` environment values if missing,
   without printing them). Run `node test/run-tests.js` and, in `webapp/`,
   `npm ci && npm run check`. For hosted work: `CLOUDFLARE_API_TOKEN`,
   `CLOUDFLARE_ACCOUNT_ID`, and `VITE_CLERK_PUBLISHABLE_KEY_PRODUCTION` present (never
   print them); `npx wrangler whoami` shows "Hydrapeak8@gmail.com's Account".
2. **WEB-054, documentation split** (owner: "super important"). Plan in
   `docs/WEBAPP-BACKLOG.md` → WEB-054. This page becomes the TL;DR of the new main page.
3. **R8, rest of the owner spot-check (7b-6).** Done so far: both accounts signed up and
   paired; Clerk redirects set to `https://app.tallywithus.com`; production wording fixed.
   Remaining steps: `docs/WEBAPP.md` → "Owner steps for production" → 7b-6, from the
   Import step. Collect both safe diagnostic reports and the browsers used.
4. **WEB-053**, Clerk colours: ask A or B, then build per its plan in the backlog.
5. **R9** lock sign-up (7b-5; both sign out and back in), **R10** scheduled logbook
   checks, **R11** go/no-go review (template in `docs/WEBAPP.md` → "Go / no-go review
   template"). Then go-live, R12 (WEB-049), R13 (merge `landing-page`), and merge
   `ops-dashboard` the same way (only when the owner asks; it changes only
   `ops-dashboard/`, and its README moves into `docs/` then).

## Production at a glance

- Worker `split-ledger-production` at `https://app.tallywithus.com` (no workers.dev),
  version `6d2a3007-c0bc-40b4-a767-5e7d0ad35247`. Secret: `CLERK_SECRET_KEY` only.
- Databases: `split-ledger-production` (financial; **never read**) and
  `split-ledger-telemetry` (logbook; the only production data the agent may read).
- Staging: https://split-ledger-staging.hydrapeak8.workers.dev, fictional data only,
  Clerk Development.
- Operations dashboard: Worker `tallywithus-ops` at `https://ops.tallywithus.com`, one
  password (`OPS_PASSWORD` secret; Zero Trust declined, it needed a card), read-only token
  `CF_ANALYTICS_TOKEN` (Account Analytics, D1, Zone Analytics: Read). Reads only the
  logbook databases and Cloudflare's counts. Open: a better source for public-page visits.
- Cloudflare zone `tallywithus.com`: Always Use HTTPS on; Web Analytics kept for the
  public page (the app's policy blocks its script on purpose; one console message).

## Rules

- Production deploys and migrations need the owner's explicit approval in the session,
  and only after the WEB-031 suite (`webapp/e2e/acceptance.mjs`) passes on staging.
  Commands: `docs/WEBAPP.md` → "Operations runbook (hosted environments)".
- Never read production shared records or real data; never print keys; fictional data
  only on staging.
- Do not change branches `landing-page` (`landing/`) or `ops-dashboard` (`ops-dashboard/`,
  WEB-052) except to merge them by pull request when the owner asks.
- Commit and push per item; update this page, and record details in `docs/WEBAPP.md`.

## Facts that save time

- The Cloudflare API token cannot read DNS records; it could create the custom domain.
- Wrangler auto-confirms D1 restores and migrations in a non-interactive shell.
- This container's network proxy refuses `cdn.protect.clerk.com` and the bare
  `tallywithus.com`; failures to load them here are not app defects.
- The build prints "Using secrets defined in .env.local"; that file goes only into the
  ignored local `dist/.../.dev.vars` and is never uploaded.
- Owner decisions: Clerk "Allow new members to delete organizations" left unchanged; SSO
  connections off; "Allow user-created organizations" stays on until R9.
