# Split Ledger product definition

## Purpose

Two people share household costs but keep separate cards. The arithmetic is simple; the
failure mode is the recurring burden of cleaning statements, recalling vague purchases,
making roughly 90 decisions across about 130 monthly transactions, and coordinating two
people. Split Ledger reduces that effort without taking financial judgment away from them.

The core job is: turn each person's bank paste into a trustworthy calendar-month ledger,
make human ownership decisions fast, exchange only shared items, and produce one auditable
settlement.

## Users and success

- The settler configures their device, reconciles their cards, loads the partner file,
  closes the month, and retains archives.
- The partner must remain effectively stateless: open, import, review, export, send.
- Both use separate laptops and browsers; the cadence is calendar-month, not statement-
  period.

Primary success is three consecutive months completed without chasing either person.
Supporting targets are at most 45 minutes in month one, at most 15 minutes combined by
month three, no more than 30 explicit decisions in steady state, and results within $20 of
a fully manual reconciliation.

## Approved web-service collaboration direction — 2026-09-12

The released v1 file-exchange workflow above remains unchanged. The experimental web
service may replace the manual file handover only if it makes the two-person relationship
and responsibility clearer without moving either person's private ledger to the server.

Implementation status: implemented on 2026-09-12 (Batch 6e in `docs/WEBAPP.md`), committed,
with an automated two-account pre-run on 2026-10-24. The owner approved a real pilot with
the partner, targeted for about 2026-10-31 on the October 2026 month, following the refined
pilot roadmap in `docs/WEBAPP.md`; acceptance testing is delegated to the coding agent. Two implementation rules were
settled there: a shared alias may not contain an email address and the two aliases must
differ, and the coordinator is always archive payer `a`.

Owner decision, 2026-10-24: each browser keeps a separate private draft per month for each
account and household, so changing the month never erases private work; names, cards, and
rules stay shared across months, and deleting the private draft erases every month in that
scope.

The web service separates three concepts that must never be treated as interchangeable:

1. **Account identity:** Clerk authenticates one person and supplies a verified user id.
2. **Household access:** an active Clerk Organization supplies the verified security scope.
3. **Financial role:** Split Ledger binds exactly two verified accounts to stable
   `coordinator` and `partner` roles for that household.

Organization membership is necessary but is not sufficient financial authorization. Only
the two paired Split Ledger participants may read or change monthly shared financial
workflow records. A third organization member must not see or claim a participant's data.
The first person to submit a month must not determine permanent identity or role.

The coordinator owns the operational close, consistent with v1's settler model. Both
participants may prepare privately, submit, replace, and withdraw only their own
privacy-filtered projection, and inspect the combined result. Only the coordinator may
close a month after both current submissions exist and the coordinator completes the
required private checks. Closing never sends money.

The handover is the server-recorded submission, not a file or an implied browser state.
Each person must see the paired participant aliases, who is expected to act next, current
submission versions and times, and whether the other participant submitted, replaced, or
withdrew. Share / Status and Settle must check for server changes automatically while
visible and also offer an explicit **Check latest status** action. A version conflict must
preserve the private draft, load the authoritative shared state, and explain what changed
in ordinary language.

Shared aliases are identity labels bound by the server to verified participant accounts.
A browser-provided export `owner` string is never authoritative for attribution or archive
creation. Email addresses, Clerk ids, raw statements, complete ledgers, private rows,
rules, card labels, unfinished decisions, and Amazon evidence remain outside shared
workflow responses and archives.

The required onboarding and monthly journey is:

1. A verified organization administrator initializes Split Ledger and becomes the stable
   household coordinator.
2. The coordinator invites one partner through an explicit in-product invitation path.
3. The invited account accepts, selects that exact organization, reviews the pairing, and
   explicitly joins the vacant partner role.
4. Both screens show the same privacy-safe household identity and `2 of 2 connected` state.
5. Each person independently imports and reviews private data in their own browser.
6. Each submits only their allowlisted shared projection; submission visibly hands the
   month to the other person.
7. When both current projections exist, both may inspect the same deterministic preview.
8. The coordinator performs the final check and closes one immutable archive.

Account removal, partner replacement, household transfer, and a lost-coordinator recovery
are consequential lifecycle operations. Until a separately approved recovery design is
implemented, the product must fail closed and direct the users to support rather than
silently rebinding a role or exposing an existing household to a replacement account.

## Released v1 product invariants

1. Private purchases are absent from exchanged files by construction.
2. Full histories and normalized retailer context remain local to each person.
3. The partner needs no account, subscription, build environment, or saved configuration.
4. Both sides apply the same calendar-month and payer-share rules.
5. Humans decide ownership; matching and rules provide evidence or defaults only.
6. Settlement is deterministic, auditable, and independent from future analytics.

## Shipped in v1.0

| ID | Requirement |
|---|---|
| M1–M3 | Import TD, BMO, or generic tabular data; normalize rows; exclude payments, transfers, interest, and fees |
| M4 | Keep full/partial refunds as negative audit rows; inherit only a confident purchase split; exclude other credits from expenditure |
| M5 | Deduplicate repeated imports |
| M6 | Mine, 70/30, 50/50, 30/70, theirs, and custom payer-share decisions |
| M7–M8 | Deliberate remembered-merchant rules and an optional small-unknown threshold that defaults to zero |
| M9–M10 | Day/merchant review and focus |
| M11–M13 | Privacy-redacted shared export, partner-file settlement, and self-import protection |
| M14–M15 | Pre-settlement checks and statement-date coverage evidence |
| M16–M17 | Append-only month close/archive and synthetic self-test |
| M18 | Allowlisted support diagnostic with no ledger, identity, amount, or retailer-detail values |
| S6 | Optional local Amazon Your Orders parsing and deterministic match evidence with verbatim products, explicit ambiguity, private restoration, and no financial mutation |

Refunds may match only after their purchase, within 120 days, and never beyond the
remaining refundable cents. A unique same-merchant candidate may support a partial refund;
ambiguous, cross-name, unmatched, cashback, reward, and statement credits remain visible
for reconciliation but stay out of settlement and public files. Full refunds net their
purchase to zero without deleting either row.

Amazon context is evidence, never an ownership recommendation. Unique exact totals,
ambiguous equal totals, constrained split-order sums, possible monthly payments, and
unmatched charges remain visibly distinct. Full product titles stay verbatim. Raw Amazon
text, shipping identity, products, order references, matches, and decisions cannot enter
shared exports or archives.

## Next candidates

| ID | Candidate |
|---|---|
| S1 | Separate archive-reading analytics tool |
| S2 | Rules-table sync between installations |
| S3 | Running balance when settlement slips a month |
| S4 | Shared note for verbally agreed asymmetric splits |
| S5 | Multi-currency and foreign-exchange fees |

These are directions, not authorized work. Smaller unresolved items and speculative ideas
live in `docs/BACKLOG.md`.

## Explicitly out of scope for released v1

- Live bank or retailer connections, scraping, email imports, and account access
- A backend, user accounts, uploads, telemetry, or background synchronization
- Budgeting, forecasting, charts, or analytics inside the settlement application
- Mobile-app development or executing payments
- AI choosing splits, confirming matches, or participating in arithmetic

## Decisions not to re-litigate casually

**Threshold starts at zero.** Small spending is repetitive, so month-one human decisions
can become safe rules. A non-zero default before that would create systematic bias.

**Families are narrower than brands.** Descriptor variants may collapse, but services
that split differently (for example rides, food delivery, and subscriptions) stay apart.

**Remembering is deliberate.** Automatic rule creation would encode the context-dependent
merchants that most need human judgment.

**The settler is operationally authoritative.** Independent cross-checking is possible,
but a single settler keeps the partner workflow stateless.

**Analytics stays separate.** Exploratory reporting must not be able to change monthly
parsing or settlement behavior.

**The application remains vanilla and single-file.** The accepted v0 visual language was
adapted into the working ES5-compatible app instead of retaining the prototype's React
runtime and mocked controllers.

## Known weaknesses

- Nothing enforces adherence or reminds the slower participant.
- Day grouping and Amazon context reduce recall work but cannot recover private intent.
- Instalment charges are flagged, not modeled across months.
- The other person's live bank pages and long-term browser-storage durability have not
  been independently observed.
- Optional Amazon file-inspection acceptance and a large-ledger stress run remain in the
  backlog; neither blocks v1.
