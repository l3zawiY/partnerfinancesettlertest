# Web-service backlog

Unresolved work for the `webapp/` experiment only. Items about the released single-file
`index.html` application belong in `docs/BACKLOG.md`. The test is simple: if it touches
`webapp/`, it belongs here.

Architecture, batch roadmap, status, and open risks live in `docs/WEBAPP.md`. This file
holds only work that is not already scheduled in a batch.

IDs are permanent even after removal. Use the next unused `WEB-###`, keep gaps, never
renumber or reuse, and end entries with `*Noticed: YYYY-MM-DD.*` or `*Added: YYYY-MM-DD.*`.
`WEB-###` cannot collide with the `OBS-###` and `IDEA-###` ids used for v1.

## Observations

### WEB-001 — Assert the browser telemetry setting behaviourally

`worker/telemetry.test.ts` proves the Worker's Clerk collector is disabled by constructing
a real collector and checking it. The browser assertion is weaker: it checks only the value
of `BROWSER_CLERK_TELEMETRY`, so deleting the `telemetry` prop from `ClerkProvider` in
`src/main.tsx` would not fail the suite.

Closing this needs a browser-like test environment, which is a real dependency decision and
was deliberately not taken during Batch 1. Revisit if the frontend grows a DOM test setup
for other reasons, rather than adding one for this alone.

*Noticed: 2026-09-07.*

### WEB-004 — Run Worker tests inside workerd against real D1

Household tests currently execute against Node's SQLite engine through a small adapter.
That proves the schema, the queries and the household filter, but not D1's own behaviour.
`@cloudflare/vitest-pool-workers` would run the same tests inside workerd against a real
local D1, which is stronger. It requires Vitest 4 and this project is on Vitest 5, so
adopting it today would mean downgrading the test runner. Revisit when it supports
Vitest 5, rather than downgrading for it.

*Noticed: 2026-09-07.*

### WEB-005 — An invited partner is prompted to create their own household

With `hidePersonal` set, Clerk requires an active organization, so a second account signing
in with no invitation is shown "Setup your organization" and creates a household of its own.
That is correct for the first owner and wrong for a partner, who should join the existing
household instead. Two accounts each creating a household is the failure this tool exists to
avoid: they would never see each other's items.

The Worker needs no change; this is onboarding. Decide in Batch 5, alongside partner
workflow, whether an invitation is required before first sign-in, whether an uninvited
account is refused, and what the join screen says.

*Noticed: 2026-09-07.*

## Ideas

### WEB-002 — Decide retention and household deletion before real shared data

A database creates obligations the browser-only version never had: how long shared items
are kept, what happens when a household is deleted, whether one partner can remove data the
other submitted, and what a export-then-delete path looks like. These are product decisions,
not implementation details, and they must be settled before any real financial data is
stored. Blocks the real-data portion of the Batch 6 pilot.

*Added: 2026-09-07.*

### WEB-003 — Decide the offline and poor-connection story

v1 works with no network by construction. A hosted service does not, so a capability the
owner currently relies on would silently regress. Decide deliberately whether the web app
must keep working offline for private import and review work with only sharing requiring
connectivity, or whether being online is an accepted precondition. The answer shapes Batch 4
and may be a reason to keep v1 permanently rather than cut over.

*Added: 2026-09-07.*
