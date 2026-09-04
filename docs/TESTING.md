# Testing

Two layers. The automated layer runs in a second and protects the parsing and settlement
logic. The manual layer covers what a headless test can't see.

---

## Automated

```bash
node test/run-tests.js
```

Exits `0` on all-green, `1` on any failure, naming the assertion and printing actual vs
expected. The same assertions run in-browser from step 04 → **Run self-test**.

### Fixtures are synthetic — deliberately

They reproduce every structural quirk of the real bank pastes:

- A running-balance column that must never be read as an amount
- Double tabs where a credit column is empty
- Two statement blocks in one paste, each with its own printed total
- A `Minimum payment and due date: $10.00 by ...` line that has both a date and a dollar
  amount and therefore looks exactly like a purchase
- A `Pending` section that must be parsed but excluded from settlement
- Signed amounts (`-$` spend, `+$` credit) in the second bank's format
- City and province suffixes appended to merchant names
- A refund that returns under a *different* merchant string than the charge
- A same-day duplicate that should be flagged
- A small merchant repeating every few days that should **not** be flagged

They are synthetic because this repo is hostable publicly and real statements have no
business in one.

### Assertions

| ID | Behaviour |
|---|---|
| T1–T3 | Bank-1 row count, net, and credit-row count for the period |
| T4 | Zero amounts equal to a balance value — the guard against the worst parsing bug |
| T5–T7 | Bank-2 row count, net, pending row flagged |
| T8 | Combined period totals |
| T9 | Parsed sums reconcile against each block's printed total |
| T10–T11 | Coverage asserted from printed date ranges; gap detected when a block is missing |
| T12, T12b, T12c | Merchant-name variants collapse to the right families; families that split differently stay separate |
| T13 | A repeated merchant collapses to one key |
| T14a–T14e | Canonicalisation: processor prefix stripped, city captured, store number stripped, order id stripped, instalment provider flagged |
| T15a–T15b | Duplicate detection fires on a same-day repeat and stays quiet on small innocent repeats |
| T16a–T16c | Refund pairing: certain, likely-cross-merchant, unmatched |
| T17a–T17c | Card payments, internal transfers, and the minimum-payment line all excluded |
| T18 | Re-importing the same paste adds nothing |
| T19 | Settlement arithmetic |
| T20 | No network calls anywhere in the source |
| T21 | An instalment charge never inherits a merchant rule |
| T22 | Hand-correcting an amount is gated at $1,000, and a corrected row stays editable |
| T23 | A corrected row reports itself as edited; an untouched one does not |

### Adding assertions

Give it a `T`-prefixed id and label the *behaviour*, not the implementation. Several
assertions share the same fixture, so new fixture rows mean recomputing the affected
totals. **Never loosen an assertion to make it pass** — if behaviour changed on purpose,
change the expectation and record why in `CHANGELOG.md`.

---

## Manual checklist

Run the rows relevant to what you touched.

| Area | Test | Pass condition |
|---|---|---|
| Self-test | Click Run self-test | all green |
| Hosting | Open the URL in a fresh browser | loads, version matches, browser storage works |
| Import | Paste a real statement, compare count and net to the bank's own display | match |
| Import | Paste without tab characters (retyped or reformatted) | refused with a clear message, nothing added |
| Import | Same card imported twice | second import adds 0 rows |
| Identity | Switch "I am" and export | filename and `owner` change accordingly |
| **Identity** | **Load your own export as the partner file** | **rejected with an explanation** |
| Identity | Load a file from an unrecognised name | asks for confirmation first |
| Export | Open the export in a text editor | every item has a category; **no private items present** |
| Review | Tag with 1–5 and J/K only | no mouse needed |
| Review | Shift+number on a merchant | rule created, visible in the rules list |
| Review | Cmd+C / Ctrl+C, Cmd+1, Cmd+K with a row highlighted | copies / does nothing — no dialog, no split reassigned |
| Review | Click an amount under $1,000 | nothing happens; no dashed underline on it |
| Review | Click an amount of $1,000+, correct it | chip reads edited, sub-line shows the bank figure, checks list it, the count-and-net tick clears |
| Review | Correct an amount, then correct it back | still editable below the gate; edited chip and check row disappear |
| Review | Pin a Klarna instalment row | refused with an explanation; the merchant rule is not created |
| Review | Set a rule on a merchant that also appears as a Klarna charge | the ordinary rows auto-split, the instalment stays undecided |
| Review | Group by merchant, use a bulk button | all rows for that merchant change together |
| State | Tag, quit the browser completely, reopen tomorrow | work intact, banner states where you are |
| State | Load a partner file, tick count-and-net, group by merchant, reload | all three come back; toggle labels match what is on screen |
| State | Load a session file saved by 0.3.x | loads; a partner file already open is not wiped |
| Settle | Close month, open the archive in a text editor | valid, matches the on-screen figure to the cent |
| Settle | Close the same month twice | warns; the first archive file is untouched |

---

## Regression protocol

1. Run the tests **before** touching anything. Record the baseline.
2. One coherent change. No bundling.
3. Run again. **Red means revert, not patch forward.**
4. Bump `VERSION` and add a `CHANGELOG.md` entry.
5. Run the manual rows for the area you touched.

Rollback is always: open the previous version of the file. The version stamp in the
header tells you which one is running, so a confused report from the other user is
diagnosable at a glance.

---

## Not covered, knowingly

- **The other person's bank pages.** Assumed to render identically. Untested.
- **A paste arriving as spaces rather than tabs.** There's a sign-anchored fallback for
  the three-column format; it has never seen real output.
- **Unusual months:** a card with zero transactions, a period spanning a year boundary,
  a refund larger than its original charge, a month with no shared items at all.
- **Browser storage durability across days.** The single most load-bearing untested
  assumption in the design — if it doesn't hold, the whole storage approach changes.
  Test it by tagging a few transactions, quitting the browser, and reopening tomorrow.
