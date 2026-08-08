# Changelog

The version here matches `VERSION` in `index.html`, which is stamped into every export
and archive. Bump both together.

---

## 0.3.0

**Added**

- **Self-test** — 31 assertions over synthetic fixtures, runnable in-browser (step 04)
  or headless via `node test/run-tests.js`
- **Version stamp** in the header, written into every export and archive
- **"I am" toggle** replacing free-text names; names configured once in setup
- **Card dropdown** replacing the free-text card label — the label is part of the
  deduplication key, so a typo let the same transaction import twice
- **Self-import guard** — a partner file whose owner matches your own is rejected, with
  a confirmation prompt for an unrecognised owner
- `category` added to the shared export, so the future analytics tool doesn't have to
  re-derive it
- **Status banner** stating where the current month stands: nothing imported, in
  progress, your side done and waiting, ready to settle, or closed
- **Close month** — writes a frozen `split-ledger-archive/v1` file and records the month
  in a Closed months list

**Fixed**

- **Refund pairing matched on merchant alone, ignoring amount.** It would attach a
  refund to an unrelated charge at the same merchant. Precedence is now: same merchant
  and same amount (certain) → different merchant, same amount within 3 days (likely,
  flagged for confirmation) → same merchant, different amount (partial refund). Caught
  by the fixtures on their first run.

**Changed**

- Session format `v3`; still reads `v1` and `v2`, migrating older name fields

---

## 0.2.0

**Added**

- Per-bank **column parsers** replacing heuristic amount detection
- **Balance guard** — an import is refused outright if any parsed amount equals that
  row's running balance
- **Coverage assertion** from the bank's own printed date ranges, so a gap in the month
  is detected rather than assumed away
- **Bank-total reconciliation** against each block's printed total
- Merchant **canonicalisation**: processor prefixes stripped, store numbers and order
  ids removed, city captured, name variants grouped into families
- Per-transaction detail: category, processor, city, occurrence count, flags for
  instalment, pending, refund, and large amounts
- **Pending section** parsed but excluded from settlement
- **Dropped-lines panel** — every line the parser discarded, with a reason
- Group-by-merchant view with bulk apply for recurring merchants
- Pre-settlement checks: coverage, totals, undecided, pending, instalments, unmatched
  refunds, duplicates, large auto-assigned items

**Fixed**

- **The parser read the running balance as the transaction amount** on the five-column
  format, producing plausible but wildly wrong rows
- Exclusion patterns missed the real wording used by both banks for card payments and
  internal transfers
- A minimum-payment line has both a date and a dollar amount and was importing as a
  purchase
- Duplicate detection flagged small legitimate repeats at the same merchant; the 3-day
  window now applies only to amounts of $50 or more

**Changed**

- Default threshold lowered to **0** — see the reasoning in `PRODUCT.md` §7

---

## 0.1.0

Initial version. Heuristic paste parsing, day-clustered review, keyboard tagging,
merchant rules, redacted export, settlement, session save/load.
