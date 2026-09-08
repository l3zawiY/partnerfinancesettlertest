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
