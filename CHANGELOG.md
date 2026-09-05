# Changelog

The version here matches `VERSION` in `index.html`, which is stamped into every export
and archive. Bump both together.

---

## 0.4.5

**Added**

- Amazon Import now reports unique orders, repeated order blocks, monthly-payment orders
  found, and possible monthly-payment charge matches as separate concepts. When Amazon's
  advertised order count exceeds the pasted unique orders, an advisory explains that
  missing pages can prevent matches without rejecting the usable context.
- Amazon Review shows the bank charge date beside each Amazon order date. Equal-total
  ambiguity now states the competing order and bank-charge counts, and Amazon occurrence
  chips use an explicit label such as `16 bank charges`.

**Fixed**

- Amazon page-navigation labels such as `Next` no longer leak into product names.
- Confirming an ordinary Amazon order consumes it for other charges, preventing the same
  order from being assigned twice. Detected split orders remain deliberately available to
  each of their linked charges.
- Assertions T28a–T28f cover parser noise, paste completeness metadata, confirmation
  consumption, the split-order exception, occurrence wording, and concrete ambiguity.

## 0.4.4

**Added**

- **Amazon evidence in Review.** Amazon rows now show every matched product title
  verbatim on additional lines while retaining the original bank description, amount,
  and split controls. Exact suggestions can be confirmed or rejected; ambiguous rows
  show every candidate for explicit selection; split-order, monthly-payment, and
  unmatched states explain their limits instead of guessing.
- Confirmed and rejected suggestions can be reconsidered. These actions change only
  local context state and never touch transaction amounts, split decisions, or
  settlement arithmetic.
- Assertions T27a–T27d covering Review order resolution, ambiguity, confirmation, and
  rejection, plus manual checks for multiline content and keyboard behavior.

**Known limitation**

- Amazon orders, matches, and confirmations still live in memory only and disappear on
  reload. Phase 5 will add private-session persistence and output privacy assertions.

## 0.4.3

**Added**

- **Optional Amazon context paste in Import.** Section 3 enables after a posted Amazon
  charge enters the ledger, accepts copied Your Orders text, runs the tested parser and
  matcher locally, and summarizes exact, ambiguous, possible split-order,
  monthly-payment, and unmatched results. Empty or unusable input leaves existing data
  unchanged, and clearing Amazon context never clears bank transactions.
- Assertion T26 for complete match-state summary counts, plus manual checks for enablement,
  valid and invalid paste, clearing, and the temporary reload limitation.

**Known limitation**

- Version 0.4.3 keeps Amazon orders and matches in memory only. Reloading clears them,
  and Review rows are not enriched yet; both facts are stated in the preview UI.

## 0.4.2

**Added**

- **Pure Amazon order matcher**, the second internal phase of PRODUCT S6. It produces
  explained results for unique exact totals, repeated-total ambiguity, constrained
  two- or three-charge order sums, monthly-payment orders, and unmatched charges. It
  matches only posted Amazon spending, uses integer cents and an explicit date window,
  and never mutates transactions, amounts, split decisions, or orders. There is still
  no user-facing Amazon interface.
- Assertions T25a–T25h covering each match state, the three-charge search limit,
  non-Amazon exclusion, and input immutability.

## 0.4.1

**Added**

- **Pure Amazon Your Orders parser**, the first internal phase of PRODUCT S6. It extracts
  order date, total, order number, verbatim product titles, subscription status, and
  monthly-payment status from noisy copied page text. It deduplicates repeated order
  blocks and adjacent short/full title variants, discards shipping identity and page
  controls, and reports incomplete blocks rather than guessing. There is no user-facing
  import or matching UI yet.
- Synthetic Amazon fixture and assertions T24a–T24f covering fields, deduplication,
  verbatim titles, flags, privacy filtering, and malformed input.

**Fixed**

- The architecture map now includes the existing Policy section and the new Amazon
  Context section, and fixed assertion totals were removed from evergreen docs.
- The stale hardcoded header version was removed; startup fills it from `VERSION`.

## 0.4.0

**Added**

- **Correct a mis-parsed amount by hand**, gated at $1,000 (`EDIT_MIN`). Click the amount
  on a review row. The imported figure is kept in `originalAmount`, the row wears an
  `edited` chip showing what the bank line said, a new check lists every corrected row,
  the "I checked the count and net" tick is cleared, and the shared export carries
  `edited: true`. Gated high because the rows that get mis-parsed are the big ones — a
  running balance read as an amount — and a low gate turns the ledger into a spreadsheet.
  A row already corrected stays editable so a bad correction can be undone.
- **Session storage now keeps the loaded partner file, the count-and-net tick, and the
  view toggles** (grouping, undecided-only, cursor). Previously all four reset on reload.
  Additive to `split-ledger-session/v3` — the version is deliberately *not* bumped, so an
  older build still reads the file and ignores the new fields. Reading is guarded: a
  session file written before these existed no longer wipes a partner file just loaded.
- Assertions T21, T22, T23 covering instalment rule-eligibility, the edit gate and the
  edited flag. 31 -> 34.

**Fixed**

- **Cmd+C in step 02 opened the custom-share dialog.** The keyboard handler matched bare
  letters and digits without checking for a modifier, so every OS shortcut in the review
  view was also a split command — Cmd+C prompted for a percentage, Cmd+1..5 reassigned the
  highlighted row, Cmd+K moved the cursor. Meta, Ctrl and Alt now bail out; Shift stays
  live because the shifted digits are the remember-as-rule shortcuts.
- **Klarna instalments inherited the financed merchant's rule.** `KLARNA*Walmart` cleans
  down to the same key as an ordinary Walmart run, so a "Walmart 50/50" rule silently
  auto-split whatever the plan was financing. Instalment rows no longer take merchant
  rules (`ruleEligible()`) and can no longer have one pinned from them. They are otherwise
  ordinary rows — counted, splittable, exported — and the amount threshold still applies,
  so small instalments are not new work.

**Changed**

- The two review toggles render their labels from one place (`hydrateView()`), so restored
  state and button text cannot disagree.

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
