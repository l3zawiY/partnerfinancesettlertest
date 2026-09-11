# Testing

Use fictional data and an isolated browser origin/profile. Never overwrite a real saved
session merely to test a change.

Deferred web-app owner acceptance has its own executable guide:
`docs/WEBAPP-HUMAN-TESTING.md`. It supplies copyable fictional TD, BMO, generic, refund,
correction, and Amazon data; exact click paths; expected results; failure symptoms; and
traceability to WEB-010, WEB-012, WEB-013, and the same-household invitation evidence.
Automated evidence does not close those human items.

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
activation, and account/organization-scoped persistence. Keyword shortcuts from v1 are
intentionally out of web-app scope by owner decision; normal keyboard accessibility remains.

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
and period-scoped replay-receipt index used by atomic writes. Migration files are ordered
and must not be edited after remote application.

Production-hardening coverage includes exact half-cent/refund rounding, strict rejection
of unknown private fields, scoped private-browser deletion, server-derived recovery roles,
unresolved-replacement blocking, current-draft close checks, and narrow-layout/focus/
reduced-motion contracts. Failure injection interrupts every statement boundary of first
submit, withdrawal, and close batches and proves their related records roll back together.
Apply the local database schema once with `npm run db:migrate:local` before using
`npm run dev`. The existing `node test/run-tests.js` gate remains required before and after
every repository edit batch. Real credentials and financial data are never required for
automated verification.

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
