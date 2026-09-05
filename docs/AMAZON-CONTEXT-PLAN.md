# Amazon order context plan

Status: implementation in progress; Phases 1–4 and the corrective trust batch complete.

This document scopes S6 in `PRODUCT.md`. It is a working implementation plan, not a
description of shipped behaviour.

## Execution tracker

This file is the source of truth while S6 is being built. Before each batch, identify
the active phase, confirm the work fits its scope, name the acceptance criteria it
advances, and state what remains for later. A phase is complete only after its required
tests pass. Update this tracker and the implementation log after every approved batch.

| Phase | Status | Exit condition |
|---|---|---|
| 1. Parser | Complete | Synthetic noisy Amazon text becomes safe normalized orders |
| 2. Matcher | Complete | Exact, ambiguous, combination, instalment, and unmatched results are deterministic |
| 3. Import UI | Complete | Optional paste flow reports results without disturbing bank rows |
| 4. Review UI | Complete | Full product context and honest evidence appear on Amazon rows |
| 4b. Corrective trust | Complete | Real-test gaps in completeness, interpretation, and order consumption are closed |
| 5. Persistence and privacy | Not started | Context survives privately and cannot enter shared outputs |
| 6. Release | Not started | Durable docs, version, changelog, and manual checks are complete |

### Settled decisions

- Display full Amazon product names verbatim on as many Review-row lines as needed.
- Do not summarize, shorten, or rewrite product names with AI.
- Matching supplies evidence only; it never chooses or recommends a split.
- The MVP is deterministic and offline. AI reconciliation is a separate backlog idea.
- Normalized Amazon context stays private; shared exports and archives never receive it.
- Real discovery files stay ignored and never become committed fixtures.

### Implementation log

Record each completed batch as: date, phase, version if changed, files, test count before
and after, and a one-line outcome.

| Date | Phase | Version | Files | Tests | Outcome |
|---|---|---|---|---|---|
| 2026-09-04 | 1. Parser | 0.4.1 | `index.html`, architecture/testing/release docs | 34/34 → 40/40 | Noisy copied order text becomes deduplicated, privacy-filtered orders with verbatim products |
| 2026-09-04 | 2. Matcher | 0.4.2 | `index.html`, testing/changelog/tracker docs | 40/40 → 48/48 | Amazon charges receive deterministic evidence states without mutating financial inputs |
| 2026-09-04 | 3. Import UI | 0.4.3 | `index.html`, testing/changelog/tracker docs | 48/48 → 49/49 | Optional local paste flow enables from Amazon bank rows and summarizes every match state |
| 2026-09-04 | 4. Review UI | 0.4.4 | `index.html`, testing/changelog/tracker docs | 49/49 → 53/53 | Review rows show verbatim products and explicit confirm, reject, ambiguity, and limitation states |
| 2026-09-04 | 4b. Corrective trust | 0.4.5 | `index.html`, testing/changelog/tracker docs | 53/53 → 59/59 | Real-test findings now produce clearer counts and dates, incomplete-paste guidance, clean products, and safe order consumption |

### Accepted corrective enhancements from real testing

The first grouped-Review tests made these six findings part of the feature rather than
future backlog ideas:

1. Amazon navigation labels such as `Next` must never become product context.
2. An ordinary confirmed order is consumed by that charge; only a detected split order
   may be confirmed across its explicitly linked charges.
3. When Amazon advertises more orders than the paste contains, Import gives an advisory
   completeness warning without rejecting the usable orders.
4. Review shows the bank charge date beside the Amazon order date.
5. Import distinguishes unique orders, repeated blocks, monthly-payment orders found,
   and possible monthly-payment charge matches; ambiguity explains the actual competing
   order and charge counts.
6. Amazon occurrence chips say `bank charges` instead of using an unexplained multiplier.

These corrections do not broaden matching: there is still no fuzzy assignment, automatic
date-based choice, product rewriting, or AI inference.

## Next-session handoff

Status: **planned, not implemented; request an explicit green light for each batch in
the next session.**

Verified checkpoint on 2026-09-04:

- application version `0.4.5`;
- 59/59 automated assertions passing before and after the last approved batch;
- real private Amazon paste: 20 unique orders, 10 repeated blocks, 52 advertised
  orders, one monthly-payment order, zero invalid blocks, and zero navigation leaks;
- owner confirmed the revised Import and Review experience works and looks correct;
- Amazon context and decisions still disappear on reload, as disclosed in the UI.

### Batch D — safe diagnostic report (`0.4.6` proposed)

**Job:** let the owner paste useful debugging evidence into Codex or Claude without
copying the ledger, session, bank paste, or Amazon paste.

Add **Copy safe diagnostic report** beside the self-test. The copied JSON may contain:

- diagnostic format and application version;
- browser identification and whether the page uses `file://` or hosting;
- whether browser storage is available;
- counts of transactions, rules, cards, Amazon orders, decisions, and match states;
- non-sensitive view settings;
- self-test totals and synthetic-fixture failures.

It must exclude names, card labels, period, transaction dates, merchants, bank
descriptions, amounts, product titles, order IDs, raw pasted text, and session or partner
file contents. Browser details and counts are still metadata, so the UI should tell the
user to share the report deliberately rather than publish it.

Use a visible selected-text fallback when automatic clipboard access is unavailable from
`file://`. Remove the stale hardcoded self-test assertion count while touching that panel.
Document the report as `split-ledger-diagnostic/v1` and add a shipped product requirement.

Planned files: `index.html`, `PRODUCT.md`, `docs/DATA-FORMATS.md`, `docs/TESTING.md`, and
`CHANGELOG.md`. Required verification: fresh baseline, synthetic redaction assertions,
manual clipboard/fallback check, post-change test run, and revert the batch if red.

### Batch E — Phase 5 persistence and privacy (`0.4.7` proposed)

**Active phase:** Phase 5. This advances session compatibility, private-context survival,
and shared-output privacy. Phase 6 release documentation and final manual checks remain.

**Job:** reopening the browser or loading a private session restores Amazon products and
confirmation decisions without another Amazon paste.

Extend `split-ledger-session/v3` additively with an optional private `amazonContext`
object containing normalized orders, confirmation/rejection decisions, and advertised,
repeated, and invalid-block counts. Do not store raw Amazon text or derived match results;
recalculate matches from restored orders and transactions so conclusions cannot go stale.

Autosave after Amazon import, confirmation, rejection, reconsideration, and clearing.
Validate restored fields and discard malformed entries safely. Loading a session with no
Amazon context clears any currently loaded Amazon context so products cannot attach to an
unrelated ledger. Sessions `v1`, `v2`, and earlier `v3` files must remain readable.

The private session file becomes more sensitive because it contains product names and
order references. Update its warning accordingly. Shared exports and month archives must
remain unchanged and must reject Amazon-private fields. Add automated assertions for
round-trip restoration, old-session compatibility, malformed data, derived-match
recalculation, raw-paste absence, clearing, and both shared-output privacy boundaries.

Planned files: `index.html`, `docs/DATA-FORMATS.md`, `README.md`,
`docs/AMAZON-CONTEXT-PLAN.md`, `docs/TESTING.md`, and `CHANGELOG.md`. Required
verification: fresh baseline after Batch D, automated privacy assertions, relevant manual
session/export/archive checks, post-change test run, and revert the batch if red.

Do not add either batch to `docs/BACKLOG.md`: the owner accepted both as planned work.
Do not commit automatically; report the completed diff and let the owner request a commit.

---

## Problem and outcome

Amazon bank rows identify the retailer but not the products. During Review, the user
must repeatedly search Amazon before choosing a split.

**Job to be done:** when reviewing an Amazon charge, show the likely products beside
the bank row so the user can choose the split without repeating that search.

Success means materially faster review without weakening settlement accuracy, local
privacy, the partner's stateless workflow, or the no-network design.

The discovery exercise matched 13 of 16 sample bank charges by exact order total and
linked two more to a possible split order by combination. Those are promising candidate
rates, not verified ground truth; all production matches remain reviewable.

## Product boundaries

The MVP:

- accepts a manual paste from Amazon's **Your Orders** page after bank rows are loaded;
- parses locally and makes deterministic suggestions from amount and date evidence;
- shows full Amazon product names verbatim on additional Review-row lines;
- asks the user to resolve ambiguous suggestions;
- never assigns or recommends a financial split;
- stores normalized, confirmed context in the private session only;
- never stores the raw Amazon paste, shipping identity, or delivery details;
- never includes product names or order numbers in shared exports or archives.

The MVP does not sign in to Amazon, call an API, scrape a page, import emails, allocate
individual items across split charges, or support other retailers.

## User flow

### Import: optional section 3

After **2 · Paste the transaction table**, show **3 · Add Amazon order context —
optional**. It becomes available after the ledger contains at least one Amazon charge.
The user pastes one or more copied Your Orders pages and selects **Match Amazon orders**.

Report how many orders were parsed and how many Amazon bank rows are exact candidates,
ambiguous, possible split orders, or unresolved. Bad input must not alter bank rows.
The user may replace or clear Amazon context at any time.

### Review: enriched Amazon rows

Keep the current merchant, bank description, card, amount, and split controls. Insert
one line per matched product between the merchant line and the raw bank-description
line. Allow the row to grow vertically; do not summarize, rewrite, or truncate product
names. CSS may wrap a title naturally across lines.

Then show the evidence, for example `Amazon order Aug 23 · exact total match`.

- **Exact candidate:** show the full product lines and exact-total evidence; require
  confirmation in the MVP.
- **Ambiguous:** show the possible orders and ask the user to choose.
- **Possible split order:** show the same order-level product context on the related
  charges and state that the app cannot allocate individual products to a charge.
- **Unresolved:** say no reliable order match was found; normal splitting still works.

The existing merchant-occurrence chip may remain, but product context is visually more
important for Amazon rows.

## Parsed order shape (proposed, internal)

```text
{
  orderId,
  orderDate,
  total,
  products: [verbatim title, ...],
  monthlyPayments,
  subscription
}
```

Parse order blocks using the repeated `Order placed`, `Total`, and `Order #` anchors.
Discard names, addresses, delivery messages, return windows, and action labels. Deduplicate
repeated blocks by order number. Where Amazon prints adjacent short and long variants of
one title, use deterministic adjacency/prefix rules to retain the longer verbatim source
title; never use AI to rewrite it. If that rule is not safe, preserve both lines rather
than silently dropping a real product.

Confirmed transaction context should record the normalized order reference, verbatim
products, match kind, evidence, and confirmation state. The exact session field remains
an implementation decision until the parser and matcher interfaces are tested.

## Matching policy

Apply evidence in this order:

1. Filter to the selected period plus a small boundary window for posting delays.
2. Exclude monthly-payment orders from ordinary matching and flag them for manual review.
3. Suggest a unique exact amount within the allowed date window.
4. Leave repeated exact totals ambiguous and rank them by date without auto-selecting.
5. For unmatched rows, test combinations of at most two or three nearby charges whose
   cent values sum exactly to one unmatched order total.
6. Label a combination as order-level only; do not infer which product belongs to which
   charge.
7. Leave every other charge unresolved.

Represent money as integer cents during matching. One Amazon order may link to several
charges, but a charge cannot be consumed by two confirmed matches. Every suggestion must
carry a plain-language explanation of its evidence.

The date window must be chosen from synthetic boundary tests and verified against the
real workflow before release; it must not become an unexplained magic number.

## Implementation sequence

Each phase is a separate approved edit batch with the required before/after test run.

1. **Parser:** add a pure Amazon-order parser and synthetic noisy fixtures outside the
   frozen engine block.
2. **Matcher:** add pure exact, ambiguous, constrained-combination, instalment, and
   unmatched results without touching settlement state.
3. **Import UI:** add optional section 3, paste validation, summary, replace, and clear.
4. **Review UI:** render multiline verbatim product context and match evidence; add
   confirm, reject, and choose-another interactions without breaking keyboard review.
5. **Persistence and privacy:** save normalized confirmed context in sessions, keep old
   sessions readable, and prove exports and archives cannot receive the new fields.
6. **Release:** update durable format/testing/readme documentation, bump `VERSION`, add
   the changelog entry, and run the relevant manual checklist.

If a phase fails its post-change tests, revert that phase rather than patching forward.

## Automated test plan

Add behaviour assertions for:

| Area | Required behaviour |
|---|---|
| Parse anchors | Extract order date, total, order number, and products from noisy copied text |
| Privacy filtering | Discard shipping identity, addresses, delivery messages, and page controls |
| Duplicate blocks | Repeated order numbers produce one normalized order |
| Product repetition | UI-repeated titles do not create false products; retained text stays verbatim |
| Multiple products | Preserve every distinct product in source order |
| Invalid input | Report failure and leave bank transactions unchanged |
| Period boundary | Include the justified posting-delay boundary and exclude unrelated orders |
| Exact match | A unique equal-cent total in the date window creates an explained candidate |
| Equal totals | Multiple plausible equal totals stay ambiguous |
| Date evidence | A distant equal amount is not labelled exact |
| Combination | Two or three nearby charges may link to one equal-total order |
| Combination limit | Do not search larger arbitrary combinations |
| Split evidence | Do not allocate order products to individual component charges |
| Monthly payments | Keep marked instalment orders out of ordinary matching |
| Consumption | One charge cannot belong to two confirmed matches |
| No money mutation | Matching never changes amount, share, decided state, or settlement totals |
| Re-paste | Repeating the same order paste creates no duplicates |
| Session compatibility | Old sessions load; confirmed context survives reload |
| Shared-export privacy | Product names and order numbers are absent |
| Archive privacy | Product names and order numbers are absent |
| Offline invariant | T20 continues to prove no network calls |

Use invented products, people, order numbers, dates, and amounts in every committed
fixture. Never copy discovery data into source or tests.

## Manual test plan

- Try Amazon paste before any bank import and confirm the guidance is clear.
- Import multiple cards, then paste several noisy and repeated Amazon order pages.
- Confirm an exact candidate, reject one, and change a confirmation.
- Resolve two equal-amount candidates.
- Inspect a split-order candidate and verify that item-to-charge uncertainty is explicit.
- Review an unresolved and a monthly-payment charge normally.
- Verify long, full product names wrap into additional lines without hiding controls.
- Verify keyboard navigation and split shortcuts still work on taller Amazon rows.
- Reload and confirm normalized context remains; clear it and confirm bank rows remain.
- Inspect a saved session, shared export, and archive in a text editor. Only the private
  session may contain Amazon product or order context.
- Open from `file://` with the network unavailable and repeat the import/review flow.

## Release acceptance

- Most exact-total Amazon charges receive useful, explained candidates.
- No candidate is silently confirmed in the MVP.
- No match changes settlement arithmetic or makes a split decision.
- Full source product names are visible in Review without AI transformation.
- Ambiguous, split-order, instalment, and unresolved states are honest and actionable.
- Raw Amazon page text and shipping identity are not persisted.
- Amazon context is absent from shared exports and archives.
- All automated tests and relevant manual checks pass.

## Possible later evolution: AI fallback

A later, explicitly online feature could send only unresolved candidate data to a cheap
model to compare likely matches. This may help with messy titles, split shipments, or
weak evidence, but it adds network access, cost, nondeterminism, consent, and sensitive
data handling to a deliberately offline product. It would require a separate product
decision and architecture review.

If explored, AI may rank or explain reconciliation candidates only. It must never alter
amounts, confirm a match, choose a split, or participate in settlement arithmetic.
