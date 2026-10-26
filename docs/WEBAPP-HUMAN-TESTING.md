# Web-app human acceptance guide

> **Acceptance by the coding agent — owner decision 2026-10-24.** For the pilot, the owner
> delegated these scenarios to the coding agent. The agent runs them automatically in real
> browsers (the WEB-031 suite, locally and on staging) and records results in section 1;
> those runs count as acceptance evidence. The owner and partner perform only the short
> spot-check in `docs/WEBAPP.md` → Batch 7b, step 7b-6. Everything below remains the exact
> scenario definition the suite follows, and stays usable by hand.

> **Replacement acceptance active — 2026-09-12.** WEB-019 is implemented locally (Batch 6e in
> `docs/WEBAPP.md`). Run the replacement two-account suite HC-01 through HC-10 below, plus the
> reruns listed in section 8. The old H6-01 through H6-08 scenarios stay in section 6 as
> historical evidence only. WEB-005, WEB-012, WEB-013, and WEB-019 close only on the results
> of this run.

This guide covers the owner verification deliberately deferred from Batches 4c, 5, and
6a–6c. It is written for a product reviewer: follow the visible controls and judge both
correctness and clarity. Automated tests already protect calculations and boundaries, but
they cannot prove that the real invitation flow makes sense or that the product feels safe.

Every merchant, amount, order, person, and period below is **fictional test data**. Never
paste real statements, order history, names, email addresses, account numbers, card numbers,
or financial files into the development application.

## 0. Recorded owner evidence — 2026-09-11

Tester YL completed the first full run on a monitor. Results:

- Passed: H4C-01, H4C-02, H4C-04, H5-01, H5-02, H5-05, H6-01, H6-06, HX-01.
- Failed: H4C-03, H4C-05, H5-03, H5-04, H6-02, H6-05.
- Blocked: H6-03, H6-04, H6-07, H6-08, HX-02, HX-03.

Interpretation after review:

- H4C-03 is a real private-Review UX defect: an Amazon order already confirmed elsewhere
  remains apparently actionable on another charge. WEB-020 tracks explicit occupied-state
  labeling and a disabled conflicting action.
- H4C-05 was skipped because the owner expected full online persistence. It is not an
  accepted removal of private sessions: full ledgers intentionally remain browser-only,
  so private backup/recovery still needs human acceptance.
- H5-03 used a Remember control whose visibility depends on the row already being decided
  and not already having a saved rule. The replacement test must start from a known clean
  merchant-rule state.
- H5-04 produced an unclear `Stale — refresh required` state during withdraw/resubmit.
  Recovery purpose and result were not understandable. WEB-019 requires actor-aware,
  non-sticky stale recovery and same-tab sequential coverage.
- H6-02 demonstrated the release-blocking gap: two signed-in users looked independent, and
  the product did not prove they were the intended paired participants or visibly hand work
  from one to the other.
- H6-05 had no evidence of a real isolation violation and is treated as not completed, not
  a confirmed privacy defect.
- The remaining H6 cases could not be judged once the collaboration foundation failed.

Implementation response, 2026-09-12: all of the above is addressed locally in Batch 6e. The
sticky stale state had a concrete cause, a withdrawn month's participant row being inserted
again on resubmit, which is fixed and covered by a regression test. H4C-03's occupied Amazon
evidence (WEB-020) is fixed. H5-03 and H5-04 keep their clean-state reruns. H4C-05 still needs
the privacy explanation and a rerun.

## Replacement collaboration acceptance — HC-01 through HC-10 (active from 2026-09-12)

These scenarios use Clerk's real Development service plus the local Worker and local D1. They
replace the paused H6 suite. Run them in order in one sitting; later scenarios rely on the
state left by earlier ones. Use fictional data only. The same scenarios, with copy buttons
for every statement, are in `docs/webapp-human-testing-checklist.html`.

### Test roles

| Role | Account | Alias to type | Organization |
|---|---|---|---|
| Organization administrator, becomes coordinator | Account A | `Fictional A` | Fictional Household Alpha |
| Invited member, becomes partner | Account B | `Fictional B` | Fictional Household Alpha |
| Third member (optional) | Account C | none | Fictional Household Alpha |

Expected July figures with F-A for Account A and F-G for Account B: Fictional B owes
Fictional A $89.54 ($73.34 + $16.20), Fictional A owes Fictional B $68.00 ($40.00 + $28.00),
so **Fictional B pays Fictional A $21.54**. Expected August figures with F-H: **Fictional B
pays Fictional A $10.00**.

### HC-01 — Coordinator initializes the household

1. In Account A’s browser profile, open the app URL and sign in. In the household switcher
   at the top right, select Fictional Household Alpha. If it does not exist yet, create it
   there; you must be its administrator.
2. Read the card headed Household pairing. It must say Split Ledger is not set up for this
   household yet, and the top bar must say Household not set up yet.
3. Type Fictional Household Alpha into Household name. Type person@example.com into Your
   alias and confirm the warning that aliases cannot contain an email address appears and
   Set up this household stays disabled. Replace the alias with Fictional A.
4. Tick I understand that as coordinator I am the one who closes each month. Choose Set up
   this household.
5. Choose Check latest pairing. Then reload the browser page.

Expected: Heading Waiting for your partner. The green pill says 1 of 2 connected — waiting
for partner. Coordinator shows Fictional A with a you tag and “Closes each month”; Partner
shows Vacant. An Invite exactly one partner panel with an email field and Send invitation
is present. The top bar says Fictional Household Alpha · 1 of 2 connected. Reload and
Check latest pairing show the same state and never a second setup form. The monthly tabs
(Setup, Import, Review…) are not shown yet.

Failure signals: A second setup form after reload, the monthly tabs appear before a
partner joined, the pill says 2 of 2, an email address is accepted as an alias, or a non-
administrator test account is offered the setup form.

### HC-02 — Invitation and explicit partner join

1. As Account A on the pairing card, type Account B’s test email into Partner’s email
   address and choose Send invitation. Expect the green note Invitation sent through
   Clerk… and the address listed under Pending invitations.
2. In a second browser profile, open Account B’s invitation email and accept it, signing
   in or signing up as Account B.
3. In Account B’s browser open the app URL. In the household switcher select Fictional
   Household Alpha. Do not create a new household.
4. Read the card: heading You are invited to pair with Fictional A, the household name,
   and the privacy text about what is and is not shared. Type Fictional B into Your alias
   and choose Join as partner.
5. In Account A’s browser choose Check latest pairing.
6. In both browsers open the Setup tab and compare the Household access panel on the
   right. Then compare the top bar and the header line that starts with You are.
7. Optional same-name check: if you have a second test household (Fictional Household
   Beta), switch Account B to it and read the pairing card; then switch back to Alpha.

Expected: Both browsers show 2 of 2 connected, household Fictional Household Alpha,
Coordinator Fictional A (Closes each month), Partner Fictional B (Submits and reviews),
each with a you tag beside their own alias. Account A’s header says You are Fictional A
(coordinator) · Settling with Fictional B; Account B’s says You are Fictional B (partner)
· Settling with Fictional A. The top bar says Fictional Household Alpha · 2 of 2 connected
· you are the coordinator (or partner). The monthly tabs appear only now. A different
household never shows Alpha’s aliases, and switching back restores 2 of 2.

Failure signals: Either side lacks 2 of 2, the roles or aliases differ between browsers,
Account B was able to create a second household by accident, Alpha’s aliases appear under
another household, or a Join as partner button is still offered after joining.

### HC-03 — Third-member refusal

1. Where practical, use a third test account, Account C. As Account A, open the household
   switcher, choose Manage organization, and invite Account C as a member of Fictional
   Household Alpha. Accept it in a third browser profile (or in Account B’s profile after
   signing out).
2. As Account C, open the app URL and select Fictional Household Alpha.
3. Read the whole page and try every visible control.
4. Optional: in Manage organization make Account C an administrator, then reload Account
   C’s page.

Expected: Heading This household already has two participants. The summary shows Fictional
A and Fictional B with no you tag. The text says household membership does not grant
access to shared financial records. There are no Setup, Import, Review, Share / Status, or
Settle tabs, no Join as partner button, no email addresses, and no amounts. The top bar
says Household already has two participants. Making Account C an administrator changes
nothing.

Failure signals: Account C sees the monthly tabs, a Join as partner button, any
submission, amount, or archive, an email address, or can close, restore, cancel, or delete
anything.

### HC-04 — Stable roles independent of submission order

1. Account B: in the month control in the header choose August 2026 (2026-08). Each month
   keeps its own private draft, so this never erases July's rows and asks no question.
2. Account B: Import. Bank Other / generic paste, any fictional card label. Choose Copy
   Account B August statement on this page, paste it into Statement text, choose Parse and
   add. Review: choose 50/50 for Sample Bakery. Share / Status: choose Submit shared
   projection. Expect Waiting for Fictional A.
3. Account A: choose August 2026 in the header. Import: bank Other / generic paste, any
   fictional card. Choose Copy Account A August statement, paste, Parse and add. Review:
   50/50 for Sample Cinema.
4. Account A: Share / Status must already say Fictional B submitted August 2026 and Next:
   Your submission is needed. Choose Submit shared projection. Expect Both submissions
   ready.
5. Both accounts: Continue to Settle and compare.
6. Account A: tick I checked the private count and net against my bank, choose Close month
   and archive, keep the downloaded file, and open it in a text editor.
7. Account A: open Setup and change First person to Someone Else. Look at the header and
   reopen Settle.

Expected: Although Fictional B submitted first, both headers keep You are Fictional A
(coordinator) and You are Fictional B (partner). Both Settle screens say Fictional B pays
Fictional A $10.00 with Fictional B owes Fictional A $15.00, Fictional A owes Fictional B
$5.00, Offset $10.00. The archive file contains "people":{"a":"Fictional A","b":"Fictional
B"}, "direction":"b_owes_a", and "net":10. Changing a typed name in Setup changes nothing
in the header aliases, status, or archive.

Failure signals: Roles or aliases swap because of submission order, the archive lists a
typed name, Fictional A appears as payer b, the direction is inverted, or the two Settle
screens differ.

### HC-05 — Submission is a visible handover

1. Account A: choose July 2026 in the header. If Share / Status shows Recovery required
   for 2026-07, follow the Before scenario 1 note first.
2. Account A: Import. Bank TD, card Fictional TD Visa (add it in Setup if missing). Choose
   Copy TD statement, paste, Parse and add. Review: 50/50 for Sample Restaurant and 50/50
   for Sample Book Shop.
3. Account A: Share / Status. Read the right panel: Nothing submitted yet and Next:
   Whoever submits first hands the month to the other. Choose Submit shared projection.
4. Account A: read the screen. Expect Waiting for Fictional B, Version 1 · submitted with
   a time, and Next: Waiting for Fictional B to submit.
5. Account B (July 2026): open Share / Status. Do not reload the browser. Wait up to 20
   seconds or choose Check latest status.
6. Account B: Import. Bank Other / generic paste, any fictional card. Choose Copy Account
   B statement, paste, Parse and add. Review: 50/50 for Fictional Hardware and 30/70 for
   Fictional Tickets. Share / Status: Submit shared projection.
7. Account A: without reloading, wait up to 20 seconds or choose Check latest status.
8. Both: Continue to Settle and compare.

Expected: Account B saw Fictional A submitted July 2026, Fictional A: version 1, submitted
with a time, Next: Your submission is needed, and a Last checked time. After B submitted,
Account A saw a green notice Shared status updated while you were here. Fictional B
submitted (version 2, …), the heading Both submissions ready, Fictional B: version 2,
submitted, and Next: … You review the settlement and close the month. Both Settle screens
say Fictional B pays Fictional A $21.54 with Fictional B owes Fictional A $89.54,
Fictional A owes Fictional B $68.00, Offset $21.54.

Failure signals: Either side needs a browser reload to see the other’s submission, the
other person appears without an alias or with a typed name, versions or times are missing,
the next-step line is wrong, or the two Settle screens differ.

### HC-06 — Replace and withdraw revoke readiness

1. Account B: Review, change Fictional Tickets to 50/50. Share / Status: choose Replace
   submission. Expect Both submissions ready, Version 3, and Latest change: You replaced
   your submission (version 3…).
2. Account A: wait or choose Check latest status. Expect the notice Shared status updated
   while you were here. Fictional B replaced their submission (version 3…). Open Settle:
   expect Fictional B pays Fictional A $29.54.
3. Account B: Share / Status, choose Withdraw. Expect Withdrawn, Version 4, and Next: Your
   submission is needed.
4. Account A: wait or Check latest status. Expect Waiting for Fictional B, the notice …
   Fictional B withdrew their submission (version 4…), and on Settle the words Both
   current submissions are needed with Close month and archive disabled.
5. Account B: Review, set Fictional Tickets back to 30/70. Share / Status: Submit shared
   projection. Expect Both submissions ready, Version 5.
6. Account A: wait or Check latest status. Open Settle.
7. Account B: confirm that Share / Status shows Replace and Withdraw only for its own
   submission and no control for Fictional A’s side.

Expected: Every change by one person appears on the other screen without a browser reload,
named by alias and version. After the withdrawal the coordinator loses readiness and
cannot close; after the resubmission both return to Both submissions ready and Settle says
Fictional B pays Fictional A $21.54 again.

Failure signals: Account A keeps Both submissions ready after the withdrawal, B can change
A’s side, versions do not increase by one per action, or the settlement does not return to
$21.54.

### HC-07 — Stale recovery is safe and understandable

1. Account B: open Share / Status in two tabs of the same browser window (tab 1 and tab
   2). Both show Version 5.
2. Tab 1: Review, change Fictional Hardware to 70/30, return to Share / Status, choose
   Replace submission. Expect Version 6.
3. Switch to tab 2 and simply watch it.
4. Optional forced conflict (a race, not guaranteed): switch to tab 2 again after another
   Replace in tab 1 and click Withdraw immediately, before any notice appears. If you win
   the race you see Shared status changed after this screen loaded, Your private draft in
   this browser is safe and unchanged, Replace and Withdraw disabled, and a Load latest
   shared status button. Choose it.
5. In one tab: choose Withdraw, then Submit shared projection.
6. Open Review in that tab.

Expected: Step 3: tab 2 updates by itself with the green notice Shared status updated
while you were here. You replaced your submission (version 6, …) and Version 6, without a
reload. Step 4, if reached: Load latest shared status shows Loaded the latest shared
status. Your private draft was not changed. You replaced your submission (version …), the
buttons are enabled again, no review-needed wording remains, and your withdrawal was not
applied until you chose it again. Step 5: Withdrawn then submitted, versions increasing by
one, with no changed or review-needed message in between. Step 6: Fictional Hardware and
Fictional Tickets are still there with their decisions.

Failure signals: A stale message that stays after Load latest shared status, a resubmit
that reports a conflict when nobody else changed anything, an emptied private ledger, a
rejected action that was silently applied, or a page that only recovers after a browser
reload.

### HC-08 — Coordinator-only deterministic close

1. Account B: Review, set Fictional Hardware to 50/50 and Fictional Tickets to 30/70.
   Share / Status: choose Replace submission if the current submission differs. Open
   Settle.
2. Account B: read the Settle screen carefully. Try to find any close control.
3. Account A: open Settle and choose Check latest status. Read the amounts. Tick I checked
   the private count and net against my bank. Choose Close month and archive. Keep the
   downloaded file.
4. Account A: read the screen after closing. Choose Download fresh archive.
5. Account B: wait or choose Check latest status on Settle, then open Share / Status.
   Choose Download fresh archive on Settle.
6. Compare the two downloaded archive files in a text editor.

Expected: Account B’s Settle says Fictional B pays Fictional A $21.54, the eyebrow says
Waiting for Fictional A to close, the right panel is headed Coordinator closes and says
Only the coordinator, Fictional A, can close this month; there is no close button. After
Account A closes: Month closed, Closed with 4 shared item(s) on [time] by the coordinator
(you). Account B sees Month closed and by the coordinator (Fictional A), the same amounts,
and Share / Status shows Closed with no Submit, Replace, or Withdraw. The two files are
identical and contain "people":{"a":"Fictional A","b":"Fictional B"},
"direction":"b_owes_a", "net":21.54, and no email address, id, card label, rule, raw text,
or Amazon detail.

Failure signals: Account B can close, the archives differ, people show typed names,
Account A can replace or close again after closing, or the close is described as sending
money.

### HC-09 — Restart and browser persistence boundaries

1. Both accounts: reload the page after the close. Then fully quit each test browser
   profile, reopen it, open the app URL, and sign in again.
2. Both accounts: open Review for July 2026 and August 2026, open Setup, and read the
   Household access panel.
3. Account B: switch the household switcher to a different test household if you have one,
   then back to Alpha.
4. Note: a Restart this fictional month action (WEB-021) is not part of this batch. The
   only private erase is Rules & Files → Delete this private browser draft, which clears
   the whole account + household draft. Do not use it unless you intend to.

Expected: Private rows, decisions, and rules return for the same account and household;
the pairing summary still shows 2 of 2 with the same aliases; July and August stay Closed;
nothing from Alpha appears under another household, and switching back restores
everything.

Failure signals: Private rows lost, pairing lost or changed, a closed month reopened, or
private data visible under another household or account.

### HC-10 — Privacy and recovery regression

1. Account B: Rules & Files → Download closed shared archives. Open the file in a text
   editor and search for @, user_, org_, Visa, Mastercard, raw, rule, amazon, product,
   orderId, and originalAmount.
2. Account B: confirm Restore closed shared archives, the abandoned-period cancellation,
   and Delete shared workflow history are disabled with the administrator explanation.
3. Account A: Rules & Files → Download closed shared archives, type DELETE SHARED HISTORY,
   choose Delete shared workflow history. Reload. Open Share / Status for July and August,
   then Setup.
4. Account A: Restore closed shared archives with the file saved in step 3. Reload and
   open Settle for July and August in both accounts.
5. Account C, if available: open the app again and select Alpha.
6. Both accounts: use the browser’s responsive tools at about 390 × 844 on the pairing
   summary (Setup), Share / Status, and Settle. Open the browser console on those screens.
7. Account B: with Share / Status open, block requests to /api/workflows in the browser’s
   network tools and choose Check latest status. Then unblock and choose Check latest
   status again.

Expected: The archive file contains July and August only, with aliases Fictional A and
Fictional B (allowed) and none of the searched strings. Account B cannot restore, cancel,
or delete. After Account A deletes, July and August show Nothing submitted yet, the
pairing still shows 2 of 2, and both private drafts remain; after the restore both months
show Closed with the same archives in both accounts. Account C still sees This household
already has two participants. Narrow screens stack without page-level horizontal
scrolling; the console shows no application-origin errors. While blocked, a warning
message appears and private data remains; after unblocking, Check latest status works
normally.

Failure signals: Any searched string in the file, the partner can delete or restore,
deletion removes the pairing or a private draft, the restore fails or differs between
accounts, console errors from the application, or the blocked network changes any data.

WEB-019 owner acceptance passes when HC-01 through HC-10 pass or record an accepted exception.

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

### Automated pre-run — 2026-10-24 (not owner acceptance)

Run by the coding agent in a cloud container: Chromium + Playwright, three separate
persistent browser profiles, Clerk's real Development service, local Worker and local D1.
Accounts were fictional `+clerk_test` addresses created through the Clerk Backend API
(Clerk's Cloudflare **Verify you are human** check stops automated sign-up; sign-in was not
challenged), in a new household, **Fictional Household Gamma** (read "Gamma" wherever the
steps say "Alpha"). The optional same-name check used **Fictional Household Beta**.
Screenshots and archive files stayed outside the repository.

| Field | Value |
|---|---|
| Date | 2026-10-24 |
| Browser and width | Chromium (Playwright), 1400 × 1000; 390 × 844 for HC-10 step 6 |
| Scenario IDs passed | HC-01, HC-02, HC-03, HC-05, HC-06, HC-07, HC-08; HC-04 and HC-10 after Batch 6f fixes |
| Scenario IDs failed | HC-09 on the first run (one-month draft); passed on rerun after Batch 6g |
| Defects added to `docs/WEBAPP-BACKLOG.md` | WEB-022 to WEB-028 (WEB-026 completed the same day) |

Notes per scenario:

- **HC-01 pass.** Email alias refused with "Aliases and household names cannot contain an
  email address" and setup disabled; after setup and reload: Waiting for your partner, 1 of 2.
- **HC-02 pass.** No invitation email was needed: right after B signed in, Clerk's in-app
  **Choose an organization** step listed the household with **Join**. Both sides then showed
  2 of 2 with matching roles, aliases, and headers; Beta showed none of Gamma's aliases.
- **HC-03 pass.** C saw This household already has two participants, no tabs, amounts, or
  email addresses. Direct API calls as C were refused (403 on workflow routes, 409 on join),
  also after C was made a Clerk administrator.
- **HC-04 pass after fix.** Roles stayed stable although B submitted first; Settle and the
  archive matched ($10.00, `b_owes_a`, aliases in `people`). First attempt failed: **Close
  month and archive** stayed disabled because the draft-match check compared the
  server-relabeled `owner` (fixed in `0f14691`). Renaming First person in Setup changed nothing.
- **HC-05 pass.** A saw B's submission without reload; both Settle screens: B pays A $21.54
  ($89.54 / $68.00 / offset $21.54). Changing month then showed a browser confirm that
  erased the other month's rows; removed in Batch 6g.
- **HC-06 pass.** Replace → $29.54, withdraw blocked close, resubmit → $21.54; versions 3–5;
  A was notified within 9–13 seconds each time. B's own screen read "You replaced their
  submission" (fixed in `f0c0080`).
- **HC-07 pass with observation.** Tab 2 updated itself to version 6; the forced conflict
  showed review-needed with the private draft safe, and **Load latest shared status**
  cleared it without applying the withdrawal. Tab 2's in-memory draft then overwrote tab 1's
  decision on resubmit (WEB-027).
- **HC-08 pass.** B had no close control and a direct close request returned 403; A closed
  (with Setup name still "Someone Else"); both fresh archives were byte-identical with
  `net` 21.54 and none of the forbidden strings.
- **HC-09 fail (guide wording).** Sessions, pairing, July rows, and closed status survived a
  full profile restart, and switching households leaked nothing. But opening August after
  July erased July's private rows through the clean-workspace confirm, so "private rows
  return for July and August" could not hold. **Rerun after Batch 6g (one private draft per
  month, owner decision):** July and August rows both returned after a full profile restart,
  a July decision survived a round trip through August, and no confirmation appeared.
- **HC-10 pass after fixes.** Archive file: July and August only, no forbidden strings. B
  could not restore or delete. A's delete was first refused because B's later export
  cancelled A's token (WEB-025); after re-export, delete left 2 of 2 and drafts intact, and
  restore returned both months with an identical archive. C still refused. 390 px: no
  horizontal scroll. Two app-caused issues fixed: a 403 console error from Clerk invitations
  on the partner's screens (`d35e743`) and the bare "Failed to fetch" warning (`9780545`).

### WEB-031 suite and extended checks — 2026-10-24 (agent acceptance runs, local)

| Field | Value |
|---|---|
| Date | 2026-10-24 |
| Browser and width | Chromium (Playwright), 1400 × 1000; 390 × 844 in HC-10 |
| Scenario IDs passed | HC-01 to HC-10, H4C-03, H4C-05, H5-03, H5-04 (in HC-05 and HC-07); console clean |
| Scenario IDs failed | none in the final run |
| Defects added to `docs/WEBAPP-BACKLOG.md` | WEB-045, WEB-046, WEB-047 |

- **Suite:** `webapp/e2e/acceptance.mjs`, final run 14 scenarios and 73 checks passing with
  fresh fictional users and household, removed afterwards. Earlier runs failed only on test
  script issues (fixture block selection, a hidden input, an expired dev server).
- **Volume:** 200 fictional purchases a month for each person (40 merchants, repeats) over
  three months: import about 2 s, deciding all rows with 37–39 Apply to group clicks about
  4 s, submit about 1 s; storage grows about 200 KB a month per person (WEB-045). Each
  archive matched an exact integer recalculation row by row and in total.
- **v1 fallback drill:** a month imported in the web app, exported as the coordinator's
  private session and the partner's shared file, was finished in `index.html` with the same
  result ("Fictional D owes Fictional E $32.72"). The first attempt failed because exported
  files used the local name "Me"; fixed by labelling exports with server aliases.
- **Other checks:** Toronto time zone opens the expected month; signing out in another tab
  shows the sign-in screen and keeps the private draft; a 500 HTML error shows a plain
  message; a blocked network shows "Could not reach the Split Ledger service"; no page-level
  horizontal scroll at 390 px; the production build under its content-security policy signs
  in, loads the sign-up anti-bot frame, and logs no policy violation of ours.
- **Accessibility scan (WCAG A/AA):** a progress-bar role and a missing label were fixed;
  small grey label contrast remains (WEB-046).
- **Live WEB-022 check against Clerk Development:** a member invited only through Clerk was
  refused ("sent to a different email address"); the person invited from Split Ledger
  joined.

### WEB-031 suite on fictional staging — 2026-10-25 (agent acceptance runs, hosted)

| Field | Value |
|---|---|
| Date | 2026-10-25 |
| Address | https://split-ledger-staging.hydrapeak8.workers.dev (Cloudflare Worker and D1, Clerk Development) |
| Browser and width | Chromium (Playwright), 1400 × 1000; 390 × 844 in HC-10 |
| Scenario IDs passed | HC-01 to HC-10, H4C-03, H4C-05, H5-03, H5-04 (in HC-05 and HC-07); console clean |
| Scenario IDs failed | none in the final run |
| Defects added to `docs/WEBAPP-BACKLOG.md` | none; three found and fixed the same day (below) |

- **Final run:** 14 scenarios and 73 checks passing, with three fresh fictional
  `+clerk_test` users and a fresh fictional household, removed afterwards. HC-10 covers
  archive export, coordinator deletion, and restore on the hosted database.
- **Before the final run:** every hosted API call first answered 503 because the Worker
  had no Clerk publishable key (fixed in the deploy scripts). Run 1 then passed 12 of 14:
  the console check failed on a content-security policy violation for `img.clerk.com`, and
  H4C-05 missed the **Private session loaded** confirmation. Run 2, with the policy fixed,
  showed the notice had been replaced by "Private draft auto-saved in this browser."; that
  was fixed and covered by a component test. Run 3 passed everything.
- **Hosted checks:** signed-out API calls return 401; security headers present; a live log
  tail showed no log lines or exceptions; rollback to the previous version and back
  rehearsed (details in `docs/WEBAPP.md` → Batch 7a → staging operations record).

### Volume check on fictional staging — 2026-10-25 (agent run, hosted)

`webapp/e2e/volume.mjs` against https://split-ledger-staging.hydrapeak8.workers.dev: 5
scenarios, 20 checks, all passing, console clean. Three months of 200 fictional purchases
each per person; every archive matched an exact integer-cent recalculation (316, 318, and
314 shared items). Timings and storage are in `docs/WEBAPP.md` (R2).

### Logbook on fictional staging — 2026-10-25 (agent runs, hosted)

`webapp/e2e/logbook-probe.mjs` passed 6/6 (deliberate crashes with fictional merchant,
amount, and email text were recorded by type and screen only). The WEB-031 suite then
passed 14 scenarios and 73 checks on the logbook build, console clean, and its 41 logbook
rows held only allowlisted fields. Details in `docs/WEBAPP.md` (R4).

### Production signed-out checks (R7) — 2026-10-26 (agent run, hosted)

Against https://app.tallywithus.com (Worker `split-ledger-production`, Clerk Production),
no account and no data:

| Check | Result |
|---|---|
| Page over HTTPS, sign-in screen shown (Chromium, Playwright) | pass |
| `http://app.` and `http://www.tallywithus.com` redirect 301 to `https://`, no loop | pass (after the owner turned on **Always Use HTTPS**) |
| Security headers: content-security policy, HSTS, nosniff, no-referrer, frame denial, permissions, opener policy | pass |
| Signed out: `/api/me`, `/api/household`, `/api/workflows`, `/api/workflows/export` 401; `POST /api/logbook` 401; retired `/api/shared-entries` 410 | pass |
| Only secret is `CLERK_SECRET_KEY`; no workers.dev address (404) | pass |
| Logbook received a test error (the pre-R6 503 on `/api/me`) with no household, role, or personal text | pass |
| No console errors | pass with one accepted exception: Cloudflare's Web Analytics script is blocked by the app's policy (owner keeps Web Analytics for the public page) |

Found and fixed: the policy blocked Clerk Production's protection script
(`cdn.protect.clerk.com`); `*.protect.clerk.com` added per Clerk's CSP guide, the WEB-031
suite rerun on staging (14 scenarios, 73 checks, console clean), then production
redeployed with owner approval. Authenticated production checks are the owner spot-check
(R8, 7b-6).

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
4. From `webapp/`, run `npm run db:migrate:local`, then `npm run dev`. The migration step
   applies `0005_household_pairing.sql` if it has not been applied yet; it adds tables and
   deletes nothing.
5. Open the URL printed by Vite. Confirm the page says **Web-service experiment · fictional
   data only**.
6. Pairing comes first. Until HC-02 completes, the monthly tabs are not shown; that is
   expected.
7. If, after pairing, July 2026 shows **Recovery required for 2026-07**, an earlier fictional
   run left a July slot that belongs to an account that is not the coordinator. As Account A,
   open Rules & Files, choose **Download closed shared archives**, then under **Cancel an
   abandoned open period** select `2026-07`, type `CANCEL ABANDONED PERIOD`, and cancel it. It
   has no submissions, so nothing financial is lost. Alternatively, and only by your own
   decision, stop the dev server and delete the ignored folder `webapp/.wrangler/state` to
   start from an empty fictional database.

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

### F-H — August statements for the stable-role check

Select month `2026-08`, bank **Other / generic paste**, and any fictional card label.

Account A:

```text
2026-08-03 SAMPLE CINEMA $30.00
```

Account B:

```text
2026-08-05 SAMPLE BAKERY $10.00
```

Both rows are decided `50/50`. Expected settlement: Fictional B pays Fictional A `$10.00`.

### F-E2 — A second $25.00 Amazon charge for the occupied-evidence check

Import after F-E on the same Fictional Amazon Card, month `2026-07`:

```text
2026-07-14 AMAZON MARKETPLACE $25.00
```

Expected: a second ambiguous `$25.00` charge sharing the two `$25.00` fictional orders.

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

1. Import F-E, then F-E2 on the same card, then load F-F under **Amazon order context**.
2. Open each Amazon row's **Details** in Review.
3. Confirm the exact `$40.00` candidate.
4. On the Jul 13 `$25.00` row choose **Use this order** for *Fictional book A*. Then open
   **Details** on the Jul 14 `$25.00` row.
5. Reject and then reconsider an ambiguous candidate if those controls are offered.
6. Decide ownership independently using the normal share controls.

Expected: every evidence state is distinct; full fictional product titles are visible only
inside the private Review context; on the Jul 14 row *Fictional book A* is labelled **Already
used for Amazon Marketplace on 2026-07-13 ($25.00)** with its button reading **Already used**
and disabled, the note explains to use **Change match** on the other charge first, and
*Fictional book B* stays usable; confirming/rejecting evidence never changes amount, share,
totals, or settlement.

Failure signals: Amazon makes an ownership decision, changes money, allows the same order
to be confirmed for two charges, leaves a used order looking actionable, or exposes
product/order information in Share / Status.

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
excluded and has no allocation controls.

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

Expected: statuses progress through ready, submitted, replaced, withdrawn, and submitted
without any changed-or-review-needed message in between; versions advance by one on real
changes; only the allowlisted projection is visible. While the other participant has not
submitted, the handover panel says **Waiting for [partner alias]** and offers a **Check
latest status** button, never a fake partner button.

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

WEB-012 passes after H5-01 through H5-05 and the coordinator-only close in HC-08 pass.

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

This legacy WEB-013 rule is superseded by WEB-019. Preserve its results, but do not use it
to close acceptance. After implementation, WEB-013 passes only through the executable
replacement HC-01 through HC-10 suite with two real test accounts.

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
| WEB-019 — collaboration redesign | HC-01 through HC-10 (executable above) |
| WEB-020 — occupied Amazon evidence | Revised H4C-03 |
| WEB-010 — Batch 4c remainder | Revised H4C-03 and H4C-05 with the privacy boundary explained |
| WEB-012 — Batch 5 remainder | Clean-state H5-03, revised H5-04, and replacement HC-08 |
| WEB-013 — Batch 6 | Replacement HC-01 through HC-10; legacy H6 evidence is insufficient |
| WEB-005 — invitation evidence | Replacement HC-02 and HC-03 |
| OBS-003 — optional v1 Amazon/file depth | H4C-03 through H4C-05 may provide related evidence but do not automatically close the v1 item |

When a scenario fails, record the smallest reproducible set of actions, expected result,
actual result, screenshot if safe, browser/width, and whether reload changes the result.
Never attach raw statements, credentials, tokens, downloaded private sessions, or console
logs containing private values.
