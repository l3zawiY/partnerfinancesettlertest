# Web-service backlog

Unresolved work for the `webapp/` experiment only. Items about the released single-file
`index.html` application belong in `docs/BACKLOG.md`. Completed engineering items are
removed and recorded in `docs/WEBAPP.md`; stable ids are never reused.

Batch 6h items (WEB-022 to WEB-035) were completed on 2026-10-24 and are recorded in
`docs/WEBAPP.md`. WEB-010, WEB-012, WEB-013, and WEB-020 closed on 2026-10-25 when the WEB-031
suite passed on staging (Batch 7a in `docs/WEBAPP.md`). WEB-050 (Time Travel rehearsal) and WEB-051
(volume check) closed on 2026-10-25 (R1 and R2 in `docs/WEBAPP.md`). Every item carries a **Priority** line: **Must before pilot** (blocks real data, per the
refined pilot roadmap of 2026-10-24 in `docs/WEBAPP.md`), **Should** (scheduled but not
blocking), or **Later**. Batch 7b's go/no-go requires no open Must item.

## Observations

### WEB-005 — Complete invited-partner household acceptance

Superseded as a standalone acceptance item by WEB-019. Owner testing on 2026-09-11 showed
that successful Clerk organization selection does not by itself establish an understandable
or verifiable two-person Split Ledger relationship. Retain this id for traceability: the
replacement acceptance must still prove invitation acceptance into the exact organization,
but now also proves stable pairing, privacy-safe participant identity, a visible handover,
and third-member refusal. Do not close WEB-005 before WEB-019 passes.

**Status 2026-10-25:** HC-02 passed on staging. Waits only for the owner spot-check 7b-6.

**Priority:** Must before pilot. Closed by the WEB-031 suite run on staging (HC-02) plus owner spot-check 7b-6.

*Noticed: 2026-09-07.*

### WEB-019 — Replace organization-only workflow with an explicit two-person collaboration model

The owner approved the complete direction on 2026-09-12 after the first full human run
showed that the two browser sessions appeared independent. Implement the canonical
requirements in `docs/WEBAPP.md` under **Approved collaboration model and implementation
contract** before any staging work.

Required outcome:

- Clerk user id remains the authenticated account identity and active Clerk organization
  remains the tenant/security boundary, but organization membership alone never grants
  access to shared financial workflow data.
- D1 binds exactly two verified accounts to stable household roles: `coordinator` and
  `partner`. Submission timing never assigns identity. Only paired participants may read or
  mutate period workflow data; a third organization member fails closed.
- Server-bound privacy-safe aliases identify participants in status, settlement, and
  archives. The backend does not trust a projection's browser-supplied `owner` label.
- The application provides a clear invite, accept, pairing-confirmation, and household-ready
  experience. Both participants see the same aliases, roles, and `2 of 2 connected` state.
- Share / Status implements a visible handover: who submitted, version/time, who acts next,
  and partner submit/replace/withdraw changes. It checks for changes while visible and has a
  **Check latest status** action.
- Stale recovery preserves private work, loads the authoritative shared version, explains
  the change, and does not remain stuck after recovery. A sequential single-tab
  withdraw/resubmit flow does not become stale without a real intervening change.
- Both participants may manage only their own submission and view the combined result. Only
  the stable coordinator may close; the Worker creates one immutable archive from the two
  stored current projections.
- Existing privacy allowlists remain. No email, Clerk id, raw/private row, card, rule,
  unfinished decision, or Amazon evidence enters financial projections or archives.
- The legacy local fictional database is migrated without editing an applied migration or
  silently deleting data. Ambiguous legacy participant records fail closed with explicit
  recovery guidance.
- Tests cover onboarding races, duplicate organization names, exact active-organization
  scope, two stable roles across months, third-member read/write denial, attribution,
  viewer orientation, handover refresh, stale recovery, coordinator-only close, privacy,
  and migration behavior. The new two-account owner acceptance must pass.

Partner replacement, coordinator transfer, and lost-account recovery require a separate
approved design. The first implementation must refuse unsafe rebinding rather than infer it.

**Status 2026-09-12:** implemented locally as Batch 6e in `docs/WEBAPP.md`, with automated
coverage for every bullet above; later committed as `f1766cb`.

**Status 2026-10-24 (later):** the committed WEB-031 suite passed every scenario locally
(14 scenarios, 73 checks, including HC-09 after the per-month draft). Per the owner's
decision these runs count as acceptance; the items close after the same suite passes on
staging (Batch 7a) and the owner spot-check 7b-6.

**Status 2026-10-24:** an automated pre-run of HC-01 through HC-10 (section 1 of
`docs/WEBAPP-HUMAN-TESTING.md`) passed every scenario except HC-09, after the Batch 6f fixes.
It is not owner acceptance. Remaining before this item closes: the owner's acceptance
decision on the pre-run (or a manual spot-check). WEB-026 (one private draft per month) was
decided and completed the same day as Batch 6g in `docs/WEBAPP.md`. Do not close WEB-005,
WEB-012, or WEB-013 before then.

**Status 2026-10-25:** the WEB-031 suite passed every scenario on staging; WEB-012 and
WEB-013 closed. Waits only for the owner spot-check 7b-6 (with WEB-005).

**Priority:** Must before pilot. Closes with WEB-005 after the owner spot-check 7b-6.

*Noticed: 2026-09-12.*

### WEB-021 — Add a safe fictional-month restart action

Human testing needs a clear way to restart one fictional month without confusing routine
test cleanup with permanent privacy erasure. Design an explicit **Restart this fictional
month** action that previews its exact local scope, requires confirmation, clears only the
active account+household+month private draft, and does not change Clerk membership, another
scope, shared workflow records, or closed archives. It must refuse or clearly resolve an
existing submitted projection rather than creating a private/shared mismatch. This is a
testability and recovery control, not permission to weaken production deletion safeguards.

Not retained in the WEB-019 batch; still open. HC-09 runs without it.

**Priority:** Later. Not needed for the pilot; the per-month draft and private-draft deletion cover testing.

*Noticed: 2026-09-11.*

### WEB-045 — Keep browser storage bounded as months accumulate

The 2026-10-24 volume check (200 fictional transactions a month for each person) measured
about 200 KB of browser storage per saved month and person, and month drafts are never
pruned. Browsers allow roughly 5 MB per site, so this lasts about two years. Offer to
remove private drafts of closed months older than a chosen age (after a backup download),
and warn before storage is nearly full; auto-save already reports when it fails.

**Priority:** Later (before the second pilot year).

*Noticed: 2026-10-24.*

### WEB-046 — Raise contrast of small grey labels

An automated WCAG A/AA scan on 2026-10-24 found only colour-contrast failures: the small
uppercase eyebrow labels (`#75916e`) and faint fine print (`--ink-faint` `#88958c`) on the
pale background are below 4.5:1. They come from the accepted v1 look, so changing them is
an owner visual decision; darkening both by one step (for example `#5f7a58`) would pass.

**Priority:** Later. Owner decision 2026-10-24: after the pilot.

*Noticed: 2026-10-24.*

### WEB-047 — Upgrade build and deploy tooling once fixes have aged

`npm audit --omit=dev` reports zero vulnerabilities in what the browser receives. The full
audit reports nine issues in developer tools only (Vite, Vitest, and the Cloudflare plugin's
Wrangler, Miniflare, undici, sharp). Fixed versions exist (`vite@8.3.5`, `vitest@5.0.5`,
`@cloudflare/vite-plugin@1.65.0` with `wrangler@4.152.0`), but on 2026-10-24 they were
3, 9, and 1 days old and the plugin depends on a beta Miniflare. Upgrade once each is at
least two weeks old and not depending on a beta, then run `npm run check`, the WEB-031
suite, and a staging deploy.

**Priority:** Should (around 2026-11-07; before any production redeploy after that).

*Noticed: 2026-10-24.*

### WEB-048 — Pilot logbook: automatic error and activity records

Owner decision 2026-10-25 (plan in `docs/WEBAPP.md` → "Remaining roadmap to go-live").
A separate D1 database per hosted environment (`split-ledger-telemetry-staging`,
`split-ledger-telemetry`), never the financial database. The Worker accepts only rows from
a fixed allowlist and refuses anything else:

- *errors* from the Worker and both browsers: time, environment, app version, screen or
  route, error type, status code, code location, reference code; never error message text;
- *activity*: time, role (coordinator or partner), month, one of about 15 event names,
  counts and durations only.

Never merchants, amounts, names, emails, card labels, Clerk ids, or request bodies. Rows
delete themselves after 180 days through a free scheduled Worker trigger. The error message
a person sees carries the reference code. Rules & Files and `docs/PARTNER-GUIDE.md` say what
is recorded. Ready-made Cloudflare D1 console queries for the owner go in the operations
runbook. A weekly scheduled Claude check and one after each month close read only this
database and write a summary without financial content in `docs/WEBAPP.md`. Done when unit
tests cover the allowlist and refusals, and on staging the WEB-031 suite plus a deliberate
browser crash whose message contains a fictional merchant leave rows with no message text,
merchant, amount, or id.

**Status 2026-10-25:** built and verified on staging (R4 in `docs/WEBAPP.md`): unit tests,
the logbook privacy probe, and the WEB-031 suite. Remaining: the production logbook
database and deploy (R5), a production test error (R7), and the weekly and after-close
scheduled checks (R10).

**Priority:** Must before pilot.

*Noticed: 2026-10-25.*

### WEB-049 — Pilot activity page

A screen inside the app, visible to both participants, that lists the household's logbook
rows from WEB-048 (newest first, errors and activity, filter by month) with **Download as
spreadsheet** (CSV). Shows only the logbook's allowlisted fields. Both people see the same
rows, so the partner can see exactly what is recorded about them.

**Priority:** Should, right after go-live (owner decision 2026-10-25); deploy only after
October 2026 is closed and its archive exported.

*Noticed: 2026-10-25.*

### WEB-052 — Private operations dashboard for the owner

A page at `ops.tallywithus.com` that only the owner can open (Cloudflare Access, with the
Worker also checking the Access token), showing logbook errors and activity from
`split-ledger-telemetry`, request and error counts for the app, staging, and public-page
Workers, D1 usage, and later the public page's visitor statistics. Its own Worker and
folder; never binds or reads the financial databases. Unlike WEB-049, it is for the owner
only and covers operations, not one household's activity.

**Priority:** Should; side project in parallel with go-live, owner request 2026-10-26.
Handover in `docs/WEBAPP.md` ("Handover for the operations dashboard side project").

*Noticed: 2026-10-26.*

### WEB-053 — Match Clerk's sign-in and account windows to the app's look

Clerk's sign-in window, organization switcher, and account menu use Clerk's default blue,
which does not match the app's green theme. `ClerkProvider` accepts an `appearance`
setting (primary colour, text colours, font, corner radius) that can reuse the app's
colour tokens and Inter font. Check contrast and both Clerk instances after the change.

**Priority:** Could; cosmetic, owner noticed during the first production sign-in.

*Noticed: 2026-10-26.*

### WEB-036 — Email nudges between the two participants

Notify the other person by email when someone submits, and the coordinator when both
submissions are ready. Emails carry no amounts, merchants, or aliases beyond the household
name. Requires choosing an email service and a privacy review.

**Priority:** Later (after the pilot; first candidate if chasing shows up).

*Noticed: 2026-10-24 (JTBD review).*

### WEB-037 — History of past settlements

A screen listing closed months with the result line and the archive download, read from
the existing closed archives. No private data.

**Priority:** Later (after the pilot).

*Noticed: 2026-10-24 (JTBD review).*

### WEB-038 — Suggest remembering a merchant after repeated choices

When the same merchant receives the same share several months in a row, offer to
remember it. The person confirms; nothing is remembered automatically (PRODUCT decision
"Remembering is deliberate").

**Priority:** Later (after the pilot).

*Noticed: 2026-10-24 (JTBD review).*

### WEB-039 — Faster statement import

Detect the bank format from the pasted text, remember each card's bank, and allow
several cards in one pass, keeping the TD balance-column safety refusal.

**Priority:** Later (after the pilot).

*Noticed: 2026-10-24 (JTBD review).*

### WEB-040 — Carry a balance when a transfer slips

When a month's transfer is not made, carry it into the next settlement transparently
(PRODUCT S3).

**Priority:** Later.

*Noticed: 2026-10-24 (JTBD review).*

### WEB-041 — Shared note for an agreed unusual split

Let a participant attach a short note to a shared item explaining a verbally agreed split
(PRODUCT S4), within the shared allowlist.

**Priority:** Later.

*Noticed: 2026-10-24 (JTBD review).*

### WEB-042 — Encrypted private backup across devices

Back up the private draft and rules so a second device or a new laptop can restore them,
without the service being able to read them (for example, encrypted in the browser with a
key only the person holds). Needs a design that keeps the privacy boundary.

**Priority:** Later (design first).

*Noticed: 2026-10-24 (JTBD review).*

### WEB-043 — Partner replacement, coordinator transfer, and account recovery

These lifecycle operations currently fail closed and need support. Design and implement
them before the household depends on the service long term.

**Priority:** Later (before retiring v1).

*Noticed: 2026-10-24 (JTBD review).*

### WEB-044 — Uber and Amazon evidence with less manual work

From the 2026-10-24 spike in `docs/WEBAPP.md`: first an "Uber context" paste box with a
parser and the existing private evidence display (trips and Uber Eats orders, exact-total
pairing, tolerance for tips), then a "Split Ledger helper" Chrome extension that collects
the visible Amazon orders and Uber trips for the chosen month from the person's own
signed-in pages and produces the same normalized text. Evidence never chooses a split;
nothing leaves the browser. Decide extension distribution (developer mode versus an
unlisted Web Store listing with a one-time fee) and read Amazon's and Uber's terms first.

**Priority:** Later (first after-pilot candidate for recall time).

*Noticed: 2026-10-24.*

## Post-MVP evolutions

These ideas are deliberately outside the first production-ready release. They should not
delay the current MVP or be confused with completed behavior.

### WEB-017 — Search the Review ledger

Add a search field on the Review page so a person can quickly find transactions by merchant
or transaction description. Consider category search as part of the same design. Search
must work together with the existing review filters, be keyboard and screen-reader
accessible, and remain usable on a narrow phone layout.

**Priority:** Later (post-pilot).

*Noticed: 2026-09-11.*

### WEB-018 — Save settled shared transactions for historical expense analytics

When the partners settle a month, preserve the finalized **shared transactions for both
partners** as that month's shared-expense history. Retain the details needed to review past
spending: settlement month, transaction date, merchant, shared category, shared amount,
which partner paid, and the amount and percentage attributed to each partner. Then add
read-only analytics across previous settled months, including totals and breakdowns by
month, category, merchant, partner-paid amount, and partner-paid percentage.

Cloudflare D1 (the hosted SQL database already selected for the shared workflow) is the
expected storage location. The saved history must contain the finalized shared view, not a
copy of either partner's complete private ledger. Private transactions, card labels, private
rules, and Amazon-only evidence remain on that partner's device and must not be added merely
for analytics. Define retention, correction, deletion, authorization, schema migrations,
and privacy-projection tests when this evolution is designed.

**Priority:** Later (post-pilot).

*Noticed: 2026-09-11.*
