# Testing

Use fictional data and an isolated browser origin/profile. Never overwrite a real saved
session merely to test a change.

Deferred web-app owner acceptance has its own executable guide:
`docs/WEBAPP-HUMAN-TESTING.md`. It supplies copyable fictional TD, BMO, generic, refund,
correction, and Amazon data; exact click paths; expected results; failure symptoms; and
traceability to WEB-010, WEB-012, WEB-013, and the same-household invitation evidence.
Automated evidence does not close those human items.

The 2026-09-11 owner run is recorded in that guide. Two-account acceptance is paused until
WEB-019 replaces the organization-only/first-submit-slot model with stable paired roles and
an explicit handover. Existing automated tests remain required regression evidence, but
they do not prove that the superseded collaboration model is acceptable. The replacement
suite is outlined as HC-01 through HC-10 and must become executable before owner retest.

## Automated gate

```bash
node test/run-tests.js
```

The command and Rules & Files → Run self-test execute the same assertions. Both must be
green immediately before and after every edit batch. A red post-change run means revert
the batch, not patch forward. Run `git diff --check` before handoff.

Fixtures intentionally reproduce statement balance columns, empty credit columns, printed
block totals and date ranges, pending sections, signed BMO amounts, noisy merchants,
refunds, exclusions, duplicates, and noisy Amazon pages without using real financial data.

| IDs | Contract protected |
|---|---|
| T1–T11 | TD/BMO counts and totals, balance guard, pending flag, printed-total reconciliation, coverage |
| T12–T14e | Merchant families, repetition, and canonicalization |
| T15a–T18 | Duplicate policy, credit/refund evidence, exclusions, idempotent import |
| T19 | Settlement arithmetic |
| T20 | No runtime network calls in source |
| T21–T23 | Instalment rule protection and gated amount correction/audit state |
| T23a–T23b | January/December selected-month arithmetic |
| T24a–T28f | Amazon parsing, privacy filtering, match states, UI evidence, decisions, and trust corrections |
| T29a–T29f | Diagnostic usefulness/redaction, header drift guard, and `file:`/`http:`/`https:` classification |
| T30a–T30g | Amazon private restoration, validation, old sessions, recalculation, and public-output allowlists |

Add assertions with stable `T` identifiers and behavior-focused labels. Recompute affected
totals when changing fixtures. Never loosen an expectation merely to make a run green.

## Experimental web application gate

The experimental `webapp/` has a separate additive gate. From that directory run:

```bash
npm run check
```

It type-checks the browser, browser-test, pure-module, and Worker boundaries; runs tests
without contacting Clerk; and creates a production build. Pure and Worker/SQLite tests
run in Node. Rendered React behavior runs separately in jsdom, a lightweight browser-shaped
environment, through React Testing Library and `user-event`. Keeping those commands
separate prevents DOM globals from leaking into financial or backend tests.

The tests include a telemetry boundary check: one assertion deliberately builds a Clerk
collector left at its default, proving telemetry
would otherwise be on; the Worker assertion checks the real collector; and the rendered
browser assertion fails if the telemetry-off option is removed from `ClerkProvider`.
Household authorization is tested against a real in-memory SQLite database running the real
migration, so a cross-household read is genuinely refused by SQL rather than by a fake.
Batch 5 component coverage exercises the complete fictional journey, credit-row behavior,
undecided labels, five presets and custom share, rule removal, the privacy projection,
workflow transitions and recovery, close prerequisites, archive intent, ordinary keyboard
activation, and account/organization-scoped persistence.

Batch 6 adds a second level of workflow proof. Worker/SQLite tests act as two verified
members of one household and assert viewer-oriented submissions, a two-participant limit,
own-submission-only mutation, cross-household denial, stale versions, request replay,
server-created close archives, immutable closed periods, admin-only deletion, and
closed-archive restore. API-adapter tests assert bearer-token transport and fail if a
household id, private row, raw description, card label, rule, or Amazon-only field enters a
workflow request. A small visual-contract test protects the accepted menu/footer placement,
header/logo dimensions, and v1 greens; it supplements rather than replaces browser review.

The signed-in development application uses the real API adapter and the ignored local D1.
The fictional local adapter is retained only as a deterministic component-test fixture.
Apply migration `0003_period_workflows.sql` with `npm run db:migrate:local`. Never add
`--remote` during ordinary development verification.
Apply `0004_workflow_hardening.sql` the same way; it adds the concurrency uniqueness guard
and period-scoped replay-receipt index used by atomic writes. Apply
`0005_household_pairing.sql` the same way; it adds the stable two-person pairing tables and
a nullable event `actor_role` column, and touches no existing row. Migration files are
ordered and must not be edited after remote application.

WEB-019 coverage (Batch 6e) adds pure tests for the pairing vocabulary and strict response
guards, Worker/SQLite tests for administrator-only atomic initialization, atomic partner
claims, alias and same-name isolation, third-member denial on every workflow route,
server-bound attribution, stable roles across months, withdraw-then-resubmit without a
false conflict, role-labelled handover events, coordinator-only close, recovery-required
legacy months, and migration 0005 applied over a database seeded in the pre-0005 shape.
Component tests render the onboarding states with an injected invitation surface, and a
deterministic two-viewer fixture (`src/testing/PairedFixtureServer.ts`) proves partner and
coordinator see the same settlement, only the coordinator can close, stale recovery keeps
private work and requires an explicit retry, and automatic status checks never write.
WEB-020 adds pure and component coverage for occupied Amazon evidence. After Batch 6e the
gate reports 98 pure/Worker tests and 28 browser-like tests. A 2026-09-12 owner review
against the original collaboration-gap analysis added `src/identity.ts`, the single rule
picking server-bound aliases over locally typed Setup names, with pure and component
coverage proving Review can no longer show a renamed Setup field once the household is
paired.

Production-hardening coverage includes exact half-cent/refund rounding, strict rejection
of unknown private fields, scoped private-browser deletion, server-derived recovery roles,
unresolved-replacement blocking, current-draft close checks, and narrow-layout/focus/
reduced-motion contracts. Failure injection interrupts every statement boundary of first
submit, withdrawal, and close batches and proves their related records roll back together.
Apply the local database schema once with `npm run db:migrate:local` before using
`npm run dev`. The existing `node test/run-tests.js` gate remains required before and after
every repository edit batch. Real credentials and financial data are never required for
automated verification.

Batch 6h (2026-10-24) adds migration `0006_partner_invitation.sql` (apply it the same
way) and coverage for the invited-partner check with a fictional Clerk directory
(`worker/testing/fixtureDirectory.ts`), coordinator-only recovery, restore alias checks,
coordinator-only deletion tokens, cross-tab draft adoption, Apply to group, the default
month in two time zones, the your-turn message, the backup reminder, environment labels,
security headers, plain storage messages, the in-browser self-test (`shared/selfTest.ts`,
v1's T assertions on v1's own fictional statements), and the safe diagnostic. After Batch
6h the gate reports 109 pure/Worker tests and 42 browser-like tests.

### Two-account acceptance suite (WEB-031)

A real-browser suite runs HC-01 to HC-10 and the reruns H4C-03, H4C-05, H5-03, and H5-04
against a running app with real Clerk Development sign-in. It is not part of
`npm run check`, because it needs the network, Clerk, and Playwright. From `webapp/`, with
the app running (`npm run dev`, or a staging address):

```bash
CLERK_SECRET_KEY=sk_test_... node e2e/acceptance.mjs                      # local
CLERK_SECRET_KEY=sk_test_... node e2e/acceptance.mjs --base https://split-ledger-staging.<account>.workers.dev
```

It creates three fresh fictional `+clerk_test` users and a fresh household through Clerk's
Backend API, signs in through the real screens (code 424242 for new-device checks), reads
the fictional statements from `docs/WEBAPP-HUMAN-TESTING.md`, prints a pass/fail line per
scenario, writes screenshots, downloaded archives, `results.json`, and `summary.txt` to a
temporary folder outside the repository, and deletes its users and household at the end
(`--keep` leaves them for inspection). It refuses a live Clerk key and any address other
than localhost or `*.workers.dev`. Playwright comes from the project if installed,
otherwise from the machine-wide install (pre-installed in the cloud container). It
contains no login bypass.

## Release smoke test

### Import and month boundaries

- Run the selected-month TD and BMO samples. Confirm 14 + 9 rows, net $1,917.49, two
  out-of-period rows per main paste, and TD printed totals $1,522.04 and $252.54.
- Import the BMO posted update after deciding its pending row. It must update one row,
  retain the decision, and leave the net unchanged.
- Repeat samples with January and December selected; only the selected calendar month
  enters the ledger while the generated ±1-month data crosses the year correctly.
- Re-import the same card, try malformed non-tabular text, and review coverage evidence.
  Nothing may silently duplicate, import, or claim stronger coverage than the source.

### Review and arithmetic

- Exercise all five presets, a custom share, grouping, undecided-only, merchant rules,
  J/K, 1–5, Shift+number, and guarded OS shortcuts.
- Verify a full refund nets its purchase to zero and a 75% partial refund reduces only
  the returned cents. Cashback, rewards, ambiguous/unmatched credits, and pending rows
  remain visible but excluded from ordinary completion and settlement.
- Verify a large corrected amount retains the imported value, clears the totals
  acknowledgement, and is marked in checks and shared output. Instalments must not inherit
  or create merchant rules.

### Amazon context

- Import the fictional Amazon sample after both banks. Expect five valid orders and seven
  charges: one exact, two ambiguous, two split-order, one possible monthly-payment, and one
  unmatched; the incomplete order block is reported.
- Inspect every Review state. Confirm/reject/reconsider candidates and make ownership
  decisions independently; amounts and settlement must not move because of context.
- Reload and load an older or malformed fictional session. Normalized valid context and
  decisions restore, suggestions recalculate, and unrelated/malformed context clears.
- File-inspection and clear-then-reload acceptance remaining after v1 is OBS-003.

### Settlement, persistence, and privacy

- Reconcile count and net, inspect all checks and shared preview, then load a fictional
  partner file where practical. Self-owned files are rejected and unknown owners require
  confirmation.
- Close a fictional month. Its archive result must equal the on-screen settlement; closing
  again must not overwrite the first saved file. Start next month and confirm the active
  ledger/context is empty while names, cards, rules, preferences, and closed history stay.
- Quit/reload after decisions and after partner-file/check/view changes. State must return.
  Load a session from v1, v2, or older v3 and verify additive compatibility.
- Inspect generated JSON against `docs/DATA-FORMATS.md`: private items never enter shared
  files; Amazon-private fields enter neither shared files nor archives.

### Delivery and layout

- Open `index.html` directly with the network unavailable. Inter must render locally, all
  tabs/actions must work, self-test must pass, and the diagnostic must report `file:`.
- Repeat at 1100×800 and 1920×1080. Check header access, wrapping, amount/ownership columns,
  long Amazon text, keyboard focus, disclosures, scrolling, sticky rails, and reduced
  motion. The optional heavy-volume run is OBS-004.

## v1.0.0 evidence — 2026-09-06

- Node and in-browser suites: 78/78 before release correction; 81/81 after.
- Owner had already accepted the comprehensive TD, BMO, posted-update, Amazon, and overall
  UI workflow at v0.9.6.
- Release audit repeated the full fictional workflow, financial edge cases, automatic
  restoration, privacy preview, one-sided close, clean next month, and both desktop sizes.
- Browser automation could not navigate a `file://` URL due its security policy. Direct-
  file use remains owner-accepted and was checked structurally through embedded assets,
  the no-network assertion, and explicit `file:` diagnostics.

## Known evidence gaps

- The other person's live bank pages are assumed to have equivalent copy structure.
- Browser storage has been tested across reloads, not a long real-world multi-day gap.
- OBS-003 and OBS-004 are optional post-v1 acceptance depth, not known correctness defects.
