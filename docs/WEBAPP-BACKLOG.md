# Web-service backlog

Unresolved work for the `webapp/` experiment only. Items about the released single-file
`index.html` application belong in `docs/BACKLOG.md`. Completed engineering items are
removed and recorded in `docs/WEBAPP.md`; stable ids are never reused.

Every item carries a **Priority** line: **Must before pilot** (blocks real data, per the
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

**Priority:** Must before pilot. Closed by the WEB-031 suite run on staging (HC-02) plus owner spot-check 7b-6.

*Noticed: 2026-09-07.*

### WEB-010 — Complete deferred Batch 4c owner verification

Owner testing on 2026-09-11 passed H4C-01, H4C-02, and H4C-04. H4C-03 exposed the occupied
Amazon-recommendation defect now tracked as WEB-020. H4C-05 was skipped because the owner
expected online persistence; the privacy boundary still requires private-session recovery
because complete ledgers deliberately remain browser-only. Complete WEB-020 and rerun only
H4C-03 and H4C-05 under the revised guide.

**Priority:** Must before pilot. Closed by the WEB-031 suite (H4C-03, H4C-05) on staging.

*Noticed: 2026-09-09.*

### WEB-012 — Complete deferred Batch 5 owner acceptance

Owner testing on 2026-09-11 passed H5-01, H5-02, and H5-05. H5-03 used a state-dependent
Remember control and needs a clean-state rerun. H5-04 exposed unclear/sticky stale recovery;
Batch 6e found and fixed its root cause (a withdrawn month's participant row was re-inserted
on resubmit, which failed inside the transaction). H6-04 could not run because the two-person
workflow was not understandable. WEB-012 remains open; rerun H5-03, the revised H5-04, and
HC-08.

**Priority:** Must before pilot. Closed by the WEB-031 suite (H5-03, H5-04, HC-08) on staging.

*Noticed: 2026-09-10.*

### WEB-013 — Complete deferred Batch 6 two-account owner acceptance

Owner testing on 2026-09-11 found that two authenticated sessions appeared independent and
the application did not prove who the paired participants were, who should act next, or how
submission hands work to the other person. H6-02 and H6-05 were recorded as failures;
H6-03, H6-04, H6-07, and H6-08 were blocked. This is an architecture/product gap rather
than missing evidence. WEB-013 is blocked by WEB-019 and must use the replacement
collaboration acceptance suite after that work lands.

**Priority:** Must before pilot. Closed by the WEB-031 suite (HC-01 to HC-10) on staging.

*Noticed: 2026-09-10.*

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

**Status 2026-10-24:** an automated pre-run of HC-01 through HC-10 (section 1 of
`docs/WEBAPP-HUMAN-TESTING.md`) passed every scenario except HC-09, after the Batch 6f fixes.
It is not owner acceptance. Remaining before this item closes: the owner's acceptance
decision on the pre-run (or a manual spot-check). WEB-026 (one private draft per month) was
decided and completed the same day as Batch 6g in `docs/WEBAPP.md`. Do not close WEB-005,
WEB-012, or WEB-013 before then.

**Priority:** Must before pilot. Closes with WEB-005, WEB-012, and WEB-013.

*Noticed: 2026-09-12.*

### WEB-020 — Make occupied Amazon evidence explicit

When an Amazon order is already confirmed for another charge, another transaction may
still legitimately show it as evidence, but the UI currently leaves **Use this order**
looking actionable and then only emits an easy-to-miss message. Mark the candidate visibly
as already used, identify the other fictional charge without exposing data outside private
Review, disable the conflicting action, and explain how to change the earlier match. Keep
suggestions non-financial and allow reconsideration. Add component and pure-state coverage.

**Status 2026-09-12:** implemented locally in Batch 6e. An order already confirmed for a
different charge now shows **Already used for [merchant] on [date] ([amount])** inside
private Review, its button reads **Already used** and is disabled, and the note explains
that **Change match** on the other charge frees it. Pure and component tests cover the rule.
Closes after the owner reruns H4C-03.

**Priority:** Must before pilot. Closes when the WEB-031 suite passes H4C-03.

*Noticed: 2026-09-11.*

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

### WEB-022 — Let only the invited account claim the partner role

While the partner slot is empty, any member of the Clerk organization can choose **Join as
partner**, not only the account the coordinator invited. Bind the claim to the pending
invitation (for example, the invited email's Clerk user) or require coordinator
confirmation, and refuse others with a plain message. Add Worker tests for an uninvited
member racing the invited one.

**Priority:** Must before pilot (Batch 6h).

*Noticed: 2026-10-24 (code review of `f1766cb`).*

### WEB-023 — Tie shared-history administration to the coordinator role

Delete, restore, and abandoned-period cancellation are gated on Clerk `org:admin`, not on
the server-bound coordinator. The participant check still refuses a non-participant
administrator (verified in the 2026-10-24 pre-run with Account C), but promoting the
partner to Clerk administrator, or demoting the coordinator, would move these powers.
Decide whether they belong to the coordinator only, then align the Worker, the
capabilities route, and the "requires a household administrator" wording.

**Priority:** Must before pilot (Batch 6h).

*Noticed: 2026-10-24.*

### WEB-024 — Validate restored archive aliases

Restore accepts archives without checking `people.a` and `people.b` against the alias
rules (no email address, distinct aliases) or against the current pairing. Reject or
explain mismatches before writing. Add Worker tests.

**Priority:** Must before pilot (Batch 6h).

*Noticed: 2026-10-24.*

### WEB-025 — Keep one participant's export from cancelling the other's deletion token

Confirmed in the 2026-10-24 pre-run: after Account A downloaded closed archives, Account B
downloaded them too, and A's **Delete shared workflow history** then failed with **Export
again before deleting shared history.** Scope the deletion token to the account that
exported. The partner also sees "The deletion token is valid for 15 minutes" although the
partner cannot delete; show that line only to someone who can.

**Priority:** Must before pilot (Batch 6h).

*Noticed: 2026-10-24.*

### WEB-027 — Stop two tabs from silently overwriting each other's private draft

In the HC-07 pre-run, tab 1 changed Fictional Hardware to 70/30 and replaced the
submission; tab 2, opened earlier, kept 50/50 in memory and its later resubmission sent
50/50, quietly reverting tab 1's private decision. Both tabs auto-save to the same browser
storage, last writer wins. Detect a newer saved draft from another tab (a `storage` event)
and ask before overwriting, or reload it.

**Priority:** Must before pilot (Batch 6h).

*Noticed: 2026-10-24.*

### WEB-028 — Clean up leftover fictional-adapter and closed-month wording

Small copy issues seen in the 2026-10-24 pre-run: the Settle check **Partner projection
ready** says "The fictional partner submission is present" with a real paired partner; after
an archive restore, a closed month's handover panel says "Fictional A has no current
submission for this month". Replace with paired-participant wording.

**Priority:** Should, in Batch 6h (small).

*Noticed: 2026-10-24.*

### WEB-029 — In-browser self-test (web equivalent of v1 M17)

v1 has **Run self-test** in Rules & Files: it runs the calculation engine on built-in
fictional data inside the user's own browser and reports pass/fail, proving that this
computer and this copy of the app calculate correctly. It is not user testing. Add the same
to the web app: run the shared parsing, refund, rule, settlement (including half-cent
rounding), and projection-allowlist logic on built-in fictional fixtures, with no network
request and no storage write, and show the pass count and any failure in plain language.
Reuse the existing parity fixtures. Used by both participants in owner spot-check 7b-6 and
before each pilot month after a deploy.

**Priority:** Must before pilot (Batch 6h).

*Noticed: 2026-10-24.*

### WEB-030 — Copy safe diagnostic report (web equivalent of v1 M18)

v1 has **Copy safe diagnostic report**: a short text a user can paste into a support
conversation that describes the app and browser state without any personal or financial
content. Add the web version, following `split-ledger-diagnostic/v1` in
`docs/DATA-FORMATS.md` (extend that section rather than invent a new format): app version
and build, environment (local, staging, production), browser family, storage
availability, number of saved private months, counts of rows by state, rule and card
counts, self-test totals, pairing state as connected count and own role, and the last
workflow API status codes. Never include aliases, household name, emails, Clerk ids,
periods, dates, merchants, amounts, card labels, raw text, or URLs. During the pilot this is
the agent's only window into a participant's problem.

**Priority:** Must before pilot (Batch 6h).

*Noticed: 2026-10-24.*

### WEB-031 — Automated two-account acceptance suite

Turn the 2026-10-24 Playwright pre-run into a committed, repeatable suite under `webapp/`
that runs HC-01 to HC-10 and the reruns H4C-03, H4C-05, H5-03, and H5-04 against a
configurable base URL (local or staging). It creates three fictional `+clerk_test` users
through Clerk's Backend API in the **Development** instance only, uses separate browser
profiles, saves screenshots and archives outside the repository, prints a pass/fail table,
and removes its fictional users and household at the end. No login bypass in the
application; the suite refuses to run against a production URL or with a `sk_live_` key.
Not part of `npm run check` (it needs network and Clerk); document its command in
`docs/TESTING.md`.

**Priority:** Must before pilot (Batch 6h); run before every staging and production deploy.

*Noticed: 2026-10-24.*

### WEB-032 — Apply one share to every purchase from a merchant

v1 shows **Apply to group** on each merchant group in Review: one click sets the same
share on every positive purchase of that merchant and re-pairs refunds. The web app has no
equivalent, so a merchant with eight purchases needs eight clicks. Add the same control on
merchant groups (presets 100/70/50/30/0), mark rows as manual decisions, keep credits
without controls, and never overwrite another month. Parity-test against v1's behavior.

**Priority:** Should before pilot (Batch 6h); the largest time saver for the JTBD target.

*Noticed: 2026-10-24 (JTBD review).*

### WEB-033 — Open the month that just ended by default

The month control defaults to the current month in UTC. People settle after a month
ends, and a Toronto evening on the last day is already the next month in UTC. Default to
the previous calendar month during the first days of a month (proposed: days 1–15), in the
browser's own time zone, and keep any month already being worked on.

**Priority:** Should before pilot (Batch 6h).

*Noticed: 2026-10-24 (JTBD review).*

### WEB-034 — Ready-to-send "your turn" message

After submitting, the person often has to tell the other one. Show a short, copyable
message with the app address, for example "I submitted October 2026 in Split Ledger; your
turn when you have 15 minutes", and after closing, "October is closed: B pays A $X" for
the coordinator to send. No email service, no stored contact data; copying is the user's
choice.

**Priority:** Should before pilot (Batch 6h).

*Noticed: 2026-10-24 (JTBD review).*

### WEB-035 — Backup reminder after closing

Remembered rules and the private ledger live only in this browser. After a month
closes, remind the person once to **Download private session** (and say where to keep it),
so a cleared browser or a new laptop does not lose the rules that make later months fast.

**Priority:** Should before pilot (Batch 6h).

*Noticed: 2026-10-24 (JTBD review).*

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
