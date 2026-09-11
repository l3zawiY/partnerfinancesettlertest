# Web-app human acceptance guide

This guide covers the owner verification deliberately deferred from Batches 4c, 5, and
6a–6c. It is written for a product reviewer: follow the visible controls and judge both
correctness and clarity. Automated tests already protect calculations and boundaries, but
they cannot prove that the real invitation flow makes sense or that the product feels safe.

Every merchant, amount, order, person, and period below is **fictional test data**. Never
paste real statements, order history, names, email addresses, account numbers, card numbers,
or financial files into the development application.

## 1. Test record

Record the run without copying account identifiers or financial content into Git:

| Field | Value |
|---|---|
| Date | |
| Browser and width | |
| Scenario IDs passed | |
| Scenario IDs failed | |
| Defects added to `docs/WEBAPP-BACKLOG.md` | |

Do not mark WEB-010, WEB-012, or WEB-013 complete unless every scenario mapped to that
item passes or the item explicitly records an accepted exception.

## 2. Safety and preparation

### What physically runs where

- `npm run dev` starts Vite and Cloudflare's local Worker/D1 emulation on this Mac.
- Clerk sign-in still uses Clerk's Development service on the internet.
- Raw statement text, the full ledger, rules, card labels, Amazon evidence, and unfinished
  decisions stay in browser storage in the browser profile used for the test.
- Submitted privacy-filtered projections and workflow state go to ignored local D1 under
  `webapp/.wrangler/`. They do not go to a Cloudflare account.

### Before starting

1. Use a dedicated browser profile containing no real Split Ledger draft. Incognito can be
   used for the second participant, but closing it erases that participant's private draft.
2. Have two test email accounts you control. Call them **Account A** and **Account B** in
   notes; never put their addresses in repository files.
3. Keep a third existing test organization available for the isolation check if practical.
4. From `webapp/`, run `npm run db:migrate:local`, then `npm run dev`.
5. Open the URL printed by Vite. Confirm the page says **Web-service experiment · fictional
   data only**.

Failure signals:

- a command contains `--remote`;
- the page does not label the environment fictional;
- a real statement or account is about to be used;
- a test would overwrite a browser profile containing a real/private saved session.

Stop rather than work around any of those conditions.

## 3. Copyable fictional data

The Import screen also has **Fictional samples** buttons. The blocks below make the same
important data available for inspection and add edge cases not covered by the short built-in
samples.

### F-A — TD statement: ordinary purchases and non-spending credit

Select month `2026-07`, bank **TD**, and card label `Fictional TD Visa`.

```text
Posted Transactions2026-07-01 to 2026-07-31
Date	Transaction Description	Debit	Credit	Balance	
Jul 16, 2026	SAMPLE RESTAURANT	146.67		900.00	
Jul 18, 2026	SAMPLE BOOK SHOP	32.40		867.60	
Jul 20, 2026	ANNUAL CASH BACK		20.00	887.60	
```

Expected: three ledger rows. The two positive purchases need decisions. The `-$20.00`
cash-back row is visible but excluded and never receives ownership buttons.

### F-B — BMO statement: ordinary purchases

Select month `2026-07`, bank **BMO**, and card label `Fictional BMO Mastercard`.

```text
Posted
Jul 21, 2026	SAMPLE GROCER Toronto ON	-$84.26
Jul 22, 2026	SAMPLE PHARMACY Toronto ON	-$18.15
```

Expected: two positive purchase rows, `$84.26` and `$18.15`.

### F-C — BMO pending-to-posted replacement

First import this block with card label `Fictional Pending Card`:

```text
Pending
Jul 25, 2026	SAMPLE TRANSIT Toronto ON	-$12.34
```

Then import this block with the same card label:

```text
Posted
Jul 25, 2026	SAMPLE TRANSIT Toronto ON	-$12.34
```

Expected: the second import reports one posted upgrade rather than adding another logical
purchase. Any decision made while pending must remain attached after the upgrade.

### F-D — Generic correction, refunds, exclusions, and month boundary

Use bank **Other / generic paste**, card `Fictional Edge Card`, and month `2026-07`.

```text
2026-07-02 SYNTHETIC LARGE PURCHASE $3,500.00
2026-07-03 SAMPLE FULL REFUND STORE $50.00
2026-07-04 SAMPLE PARTIAL REFUND STORE $100.00
2026-07-05 SAMPLE DUPLICATE STORE $19.99
2026-07-06 SAMPLE AMBIGUOUS STORE $30.00
2026-07-07 SAMPLE AMBIGUOUS STORE $30.00
2026-07-08 ANNUAL CASH BACK -$15.00
2026-07-09 PAYMENT - THANK YOU $400.00
2026-08-01 SAMPLE OUTSIDE MONTH $22.00
THIS IS INTENTIONALLY MALFORMED
```

Then import this second block with the same card:

```text
2026-07-10 SAMPLE FULL REFUND STORE -$50.00
2026-07-11 SAMPLE PARTIAL REFUND STORE -$75.00
2026-07-12 SAMPLE AMBIGUOUS STORE -$30.00
2026-07-13 SAMPLE UNMATCHED RETURN -$44.00
```

Expected:

- payment, out-of-period, and malformed lines do not become July purchases;
- the full refund offsets the `$50.00` purchase;
- the partial refund offsets `$75.00` of the `$100.00` purchase;
- the ambiguous and unmatched credits stay visible but excluded;
- credits have explanations rather than ownership controls;
- importing either block again does not duplicate its rows.

### F-E — Amazon bank charges for every evidence state

Use bank **Other / generic paste**, card `Fictional Amazon Card`, and month `2026-07`.

```text
2026-07-12 AMAZON MARKETPLACE $40.00
2026-07-13 AMAZON MARKETPLACE $25.00
2026-07-15 AMAZON MARKETPLACE $23.00
2026-07-15 AMAZON MARKETPLACE $37.00
2026-07-18 AMAZON MARKETPLACE $120.00
2026-07-25 AMAZON MARKETPLACE $77.00
```

### F-F — Amazon order evidence

Paste this into **Amazon order context**, not the bank-statement box:

```text
6 orders placed in
Order placed
July 10, 2026
Total
$40.00
Order # 000-0000000-0000001
Fictional kitchen tool — demonstration only
Order placed
July 11, 2026
Total
$25.00
Order # 000-0000000-0000002
Fictional book A — demonstration only
Order placed
July 12, 2026
Total
$25.00
Order # 000-0000000-0000003
Fictional book B — demonstration only
Order placed
July 14, 2026
Total
$60.00
Order # 000-0000000-0000004
Fictional household bundle — demonstration only
Order placed
July 17, 2026
Total
$120.00
Order # 000-0000000-0000005
Fictional instalment item — demonstration only
Purchased with monthly payments
Order placed
July 20, 2026
Total
$99.00
Fictional incomplete order with no order number
```

Expected after **Read Amazon orders**:

- `$40.00` is an exact candidate;
- `$25.00` is ambiguous between two orders;
- `$23.00 + $37.00` are evidence for one split order;
- `$120.00` is labelled as possible instalment evidence;
- `$77.00` is unmatched;
- the incomplete sixth block is reported;
- none of this evidence chooses a share or changes an amount.

### F-G — Participant B data

Account B may use the built-in BMO sample or this smaller generic statement for a visibly
different projection:

```text
2026-07-12 FICTIONAL HARDWARE $80.00
2026-07-24 FICTIONAL TICKETS $40.00
```

Choose `50/50` for Fictional Hardware and `30/70` for Fictional Tickets. Here, `30/70`
means the card owner bears 30% and the partner bears 70%.

## 4. WEB-010 — Batch 4c private workflow acceptance

### H4C-01 — Large-amount correction remains auditable

1. Import F-D and open **Review**.
2. Find **Synthetic Large Purchase** and choose **Details**.
3. Enter `40.37` in its corrected-amount field and choose **Correct amount**.
4. Choose `50/50` for that row.
5. Open Share / Status and inspect the shared preview.

Expected:

- Review shows `$40.37` and an `edited` marker;
- Details retain the bank value `$3,500.00`;
- the shared preview uses `$40.37`, not `$3,500.00`;
- the exported shared JSON may contain `"edited": true` but not `originalAmount`.

Failure signals: the row ID/decision disappears, the old amount reaches settlement, the
original bank value cannot be audited privately, or editing is silently allowed on any
small ordinary row.

### H4C-02 — Refund and credit policy

1. Decide the full-refund purchase `50/50` and the partial-refund purchase `70/30`.
2. Inspect their credit rows.
3. Inspect the ambiguous, unmatched, and cash-back credits.

Expected: matched refunds inherit the purchase split automatically. Full refund nets its
purchase contribution to zero; partial refund reduces it by exactly `$75.00`. Other credits
remain visible but excluded. No credit has preset or custom-share controls.

Failure signals: a credit can be manually allocated, an unmatched credit changes the claim,
or a refund precedes/matches the wrong purchase.

### H4C-03 — Amazon is evidence, not financial authority

1. Import F-E, then load F-F under **Amazon order context**.
2. Open each Amazon row's **Details** in Review.
3. Confirm the exact `$40.00` candidate.
4. Reject and then reconsider an ambiguous candidate if those controls are offered.
5. Decide ownership independently using the normal share controls.

Expected: every evidence state is distinct; full fictional product titles are visible only
inside the private Review context; confirming/rejecting evidence never changes amount,
share, totals, or settlement.

Failure signals: Amazon makes an ownership decision, changes money, allows the same order
to be confirmed for two charges, or exposes product/order information in Share / Status.

### H4C-04 — Autosave and scoped restoration

1. Set names, cards, threshold, rules, Review grouping, decisions, correction, and Amazon
   confirmation.
2. Reload the page.
3. Return to Review and Rules & Files.
4. Switch to Account B or another organization, then switch back.

Expected: the same user+organization restores its complete private draft. Another account
or organization does not render that draft. Switching back restores it again.

Failure signals: reload loses state, one account sees another scope's draft, or signing out
is described as deleting local data. Signing out leaves the scoped draft on disk; explicit
scope deletion is tested available in Rules & Files and exercised in H6-08.

### H4C-05 — Private session versus shared file

1. In Rules & Files, choose **Download private session**.
2. Choose **Download shared file**.
3. Open copies of both JSON files in a text editor; do not edit the originals.
4. Search each for `raw`, card labels, `originalAmount`, `amazonContext`, `products`,
   `orderId`, `decisions`, and a private merchant.
5. Load the private session back with **Load private session**.

Expected:

- the private session is `split-ledger-session/v3` and may contain private ledger/card/rule/
  normalized-Amazon information;
- it never contains the raw Amazon paste or derived matches;
- the shared file is `split-ledger/v1` and contains only date, merchant, category, amount,
  payer share, optional edited flag, and safe envelope/totals fields;
- loading the private session restores the draft.

Failure signals: any Amazon-only/private field appears in the shared file, raw Amazon paste
appears in either persisted file, or unrelated/malformed JSON is accepted as a session.

WEB-010 passes only after H4C-01 through H4C-05 pass.

## 5. WEB-012 — Batch 5 product and visual acceptance

### H5-01 — Coherent navigation and private journey

1. Start at **Setup** and move in order through **Import**, **Review**, **Share / Status**,
   and **Settle**.
2. Open **Rules & Files** from the footer and return to a primary screen.
3. Use both the header month control and Setup month control.

Expected: exactly five primary menu items remain in the header; Rules & Files stays in the
footer; the two month controls agree; navigation never clears the private draft. The old
draft-status strip and device/lock badge are absent.

Failure signals: hidden screens, dead controls, lost state, duplicate navigation, or Clerk
controls displacing the product menu.

### H5-02 — Review controls and labels

1. Load F-A.
2. Confirm both purchases initially say they need a decision.
3. Exercise **Mine**, **70/30**, **50/50**, **30/70**, and **Theirs** across repeated runs.
4. Enter custom payer share `65` and choose **Apply custom**.
5. Toggle grouping by day/merchant and Undecided/All transactions.
6. Focus a menu button with Tab and activate it using Enter and Space.

Expected: the visible allocation always matches the chosen payer percentage; a custom 65%
payer share says 35% to partner; ordinary keyboard activation works; the credit stays
excluded and has no allocation controls. Keyword shortcuts are intentionally out of scope.

Failure signals: “Excluded” on an undecided purchase, reversed percentages, controls on a
credit, invisible keyboard focus, or filters changing financial state.

### H5-03 — Remember and remove a rule

1. Choose `50/50` for Sample Restaurant.
2. Choose **Remember**.
3. Confirm a saved-rule marker appears.
4. Open Rules & Files and choose **Remove** beside Sample Restaurant.
5. Reapply rules in Review.

Expected: remembering is deliberate, visible, and reversible. Removing the rule does not
rewrite an already manual decision. Instalment rows cannot create merchant rules.

### H5-04 — Submission boundary and simulated-state vocabulary

The signed-in product now uses the real local API, so its fictional simulation buttons are
not visible. Use the observable connected states here and rely on automated component proof
for fixture-only controls.

1. Leave one purchase undecided and open Share / Status.
2. Confirm submission is disabled with a clear reason.
3. Finish decisions and inspect **Exact shared-data preview**.
4. Submit, replace, and withdraw; then resubmit.

Expected: statuses progress through ready, submitted, replaced, withdrawn, and submitted;
versions advance on real changes; only the allowlisted projection is visible. With no second
participant, partner status says it is waiting rather than offering a fake partner button.

Failure signals: submit while decisions remain, simulation controls in connected mode,
private details in the preview, silent overwrite, or no explanation for a disabled control.

### H5-05 — Close prerequisites and visual parity

1. Before Account B submits, open Settle.
2. Confirm close is disabled and every missing prerequisite is explained.
3. Inspect at approximately `1440 × 900`, then at `390 × 844` using browser responsive tools.
4. Check the top utility bar, 32-pixel lime `S`, month pill, menu, panels, tables, footer,
   focus outlines, wrapping, and horizontal scrolling.

Expected: signature green remains visibly present; the desktop hierarchy follows v1; at
390 pixels the content stacks without page-level horizontal overflow or clipped controls.

Failure signals: inaccessible menu items, tiny tap targets, unreadable tables with no local
scroll, overlapping Clerk controls, missing focus, or a generic redesign unrelated to v1.

WEB-012 passes after H5-01 through H5-05 and the complete two-person close in H6-04 pass.

## 6. WEB-013 — Batch 6 two-account and recovery acceptance

These scenarios use Clerk's real Development service plus the local Worker and local D1.
They do not use Cloudflare hosting.

### Test roles

| Role | Account | Organization |
|---|---|---|
| Household administrator / participant A | Account A | Fictional Household Alpha |
| Household member / participant B | Account B | Fictional Household Alpha |
| Isolation observer | either test account where possible | Fictional Household Beta |

### H6-01 — Invitation joins one household

1. Sign in as Account A and select Fictional Household Alpha.
2. Through Clerk's organization management UI/dashboard, invite Account B as a member.
3. Open the invitation with Account B in a separate browser profile.
4. Accept it and select Fictional Household Alpha.

Expected: both sessions say **Household authorized** with the same organization selected.
Account B does not create another household. Never record the organization ID in the repo.

Failure signals: “Setup your organization” leads B to create a second organization, the
invitation opens the wrong account, or either user cannot select the shared household.

### H6-02 — Two viewer-oriented submissions

1. Account A imports F-A, makes all positive purchases `50/50`, and submits.
2. Account B imports F-G, assigns the specified shares, and submits.
3. Refresh Share / Status in both sessions.

Expected: each user sees their own projection as **Your submission** and the other as the
partner; both show partner ready. Neither sees the other's raw descriptions, cards, private
rows, rules, unfinished decisions, products, or order IDs.

Failure signals: submissions are reversed inconsistently, a full private ledger crosses the
boundary, one user can mutate the other user's projection, or a third person can claim a
participant slot.

### H6-03 — Real stale-tab recovery

1. In Account A, open Share / Status in two tabs and confirm both show the same version.
2. Choose **Replace submission** in tab 1.
3. Without refreshing tab 2, choose **Replace submission** there.
4. Choose **Refresh and review** in tab 2.

Expected: tab 1 advances the version; tab 2 is stopped with **Stale — refresh required**;
refresh/review loads the authoritative version without silently overwriting it.

Failure signals: both writes succeed against the same expected version, the version goes
backward, or recovery clears the private ledger.

### H6-04 — Deterministic close and immutable archive

1. In Settle, compare both submitted sides with the source fictional data.
2. Confirm the predicted transfer manually:
   - Account A's `$146.67 + $32.40` at 50/50 produces two row claims: `$73.335` rounds to
     `$73.34` and `$16.20` remains `$16.20`, for a `$89.54` claim;
   - Account B's `$80.00` at 50/50 contributes `$40.00`, and `$40.00` at 30/70 contributes
     `$28.00`, for a `$68.00` claim;
   - if A claimed participant slot `a` and B slot `b`, the expected net is `$21.54` from B
     to A. If the submission order was reversed, the displayed names/direction reverse but
     the absolute net remains `$21.54`.
3. Select **I checked the private count and net against my bank**.
4. Choose **Close month and archive**.
5. Save the downloaded archive, reload both sessions, and attempt replace/withdraw/close.

Expected: the Worker—not the browser—creates one `split-ledger-archive/v1`; both accounts
see the same closed values; the period remains locked; repeat close cannot replace the
archive. Closing does not send money. Exact half cents round away from zero once per row;
the rounded cent claims are then summed.

Failure signals: client-supplied archive data is trusted, the two accounts see different
settlements, a closed projection changes, or repeat close creates a different record.

### H6-05 — Different-household isolation

1. Switch one test session to Fictional Household Beta.
2. Open the same `2026-07` period.
3. Switch back to Fictional Household Alpha.

Expected: Beta cannot see Alpha's submissions/archive; returning to Alpha restores its
state. The browser never asks you to type or paste a household ID.

Failure signal: any Alpha shared record appears under Beta.

### H6-06 — Closed archive export

1. As either Alpha member, open Rules & Files.
2. Choose **Download closed shared archives**.
3. Inspect the JSON in a text editor.

Expected: `split-ledger-household-archive/v1` contains closed archives only and no household
ID, Clerk ID, card label, raw description, rule, private row, unfinished decision, product,
order ID, or Amazon decision. Export works for a member as well as an administrator.

### H6-07 — Guarded deletion and administrator restore

This intentionally deletes **local fictional shared workflow records**. Keep the exported
bundle from H6-06. It does not erase browser drafts or the Clerk organization.

1. Perform this step immediately before H6-04 closes the existing two-person test period:
   export and confirm deletion remains disabled with that open period listed. Do not create
   a throwaway open period solely for this check.
2. Complete H6-04 so both participants close that period, then export again. Withdrawal does
   not close a period and therefore does not remove the deletion block.
3. As a non-admin member, confirm restore/delete/cancel controls are disabled before action
   and the UI explains that administrator permission is required.
4. As Account A administrator, type exactly `DELETE SHARED HISTORY`.
5. Choose **Delete shared workflow history** once.
6. Reload the closed period: shared D1 history should be absent, while the private browser
   draft and Clerk household still exist.
7. Load the saved bundle with **Restore closed shared archives**.
8. Reload the period and inspect the restored immutable archive.
9. Attempt to restore a conflicting existing period.

Expected: export is required within 15 minutes; open periods block deletion; only an admin
can delete/restore; delete is limited to local D1 shared workflow data; restore recreates
closed canonical archives and refuses conflicts without overwriting them.

Failure signals: deleting without a recent export/exact phrase, deleting open work, a member
performing an admin action, private browser data disappearing, Clerk organization removal,
or restore overwriting a period.

### H6-08 — Private deletion, visible roles, and abandoned-period recovery

1. As Account B (member), open **Rules & Files**. Confirm closed-archive export remains
   available while restore and shared destructive controls explain that an administrator is
   required before action.
2. As Account A (administrator), submit an otherwise disposable fictional period, withdraw
   the submission, export closed history, select that now-empty open period, type exactly
   `CANCEL ABANDONED PERIOD`, and cancel it. Export again; it must no longer block deletion.
3. In a scope with a private fictional draft, download a private session, type exactly
   `DELETE PRIVATE DRAFT`, and delete it. Reload and switch away/back to the same household.

Expected: role restrictions are visible before a request; an open period with any current
submission cannot be cancelled; only the selected empty open period is removed; private
deletion clears only the active account+household browser draft, pauses autosave until
reload, and does not affect another scope, D1 history, or Clerk. Signing out alone does not
claim to erase private data.

Failure signals: a member sees enabled restore/delete/cancel controls, an active submission
is discarded, a different period disappears, erased private rows return after reload, or
shared/Clerk records change during private deletion.

WEB-013 passes only after H6-01 through H6-08 pass with two real test accounts.

## 7. Cross-cutting regression pass

### HX-01 — Refresh, browser restart, and scope

Reload after import, after decisions, after submit, and after close. Then fully quit and
reopen the test browser profile. Expected: private state returns only in the same user+
organization scope; shared state returns from local D1; no duplicate write occurs.

### HX-02 — Network interruption language

With the browser's network tools, temporarily block requests to the local `/api/workflows`
path after private Review is complete. Attempt a shared action, restore connectivity, and
refresh/retry.

Expected: private work remains; the UI reports a recoverable service problem; it never
pretends a failed/unknown close succeeded and never falls back to fictional local workflow.

### HX-03 — Console and visible-control audit

Visit every screen at desktop and narrow width. Click every visible control at least once
or confirm its disabled explanation. Check the browser console.

Expected: no application-origin errors, uncaught promises, dead buttons, unlabeled fictional
records, or unexplained disabled controls. Clerk may show its expected Development-key
warning; browser-extension errors are not application errors.

## 8. Acceptance traceability

| Backlog item | Required scenarios |
|---|---|
| WEB-010 — Batch 4c | H4C-01 through H4C-05 |
| WEB-012 — Batch 5 | H5-01 through H5-05 and H6-04 |
| WEB-013 — Batch 6 | H6-01 through H6-08 |
| WEB-005 — invitation evidence | H6-01 |
| OBS-003 — optional v1 Amazon/file depth | H4C-03 through H4C-05 may provide related evidence but do not automatically close the v1 item |

When a scenario fails, record the smallest reproducible set of actions, expected result,
actual result, screenshot if safe, browser/width, and whether reload changes the result.
Never attach raw statements, credentials, tokens, downloaded private sessions, or console
logs containing private values.
