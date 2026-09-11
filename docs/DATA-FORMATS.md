# Data formats and privacy contracts

All formats evolve additively. Never rename or repurpose a field. Change a `format` suffix
only for a breaking contract and keep readers for supported older versions.

## Shared export — `split-ledger/v1` (frozen)

Produced by each person and sent directly to the settler. It contains only items whose
payer share is below 1; private transactions, private totals/counts, and Amazon context are
structurally absent.

Filename: `split-<period>-<owner>.json`

```json
{
  "format": "split-ledger/v1",
  "toolVersion": "1.0.0",
  "period": "2026-07",
  "owner": "Person A",
  "generated": "2026-08-01T18:22:00.000Z",
  "items": [
    {"date":"2026-07-16","merchant":"Sample Restaurant","category":"Restaurants","amount":146.67,"share":0.5}
  ],
  "totals": {"sharedPaidByOwner":146.67}
}
```

- `owner` identifies the payer. Loading one's own export as the partner file is rejected.
- `amount` is positive spend or a negative matched refund.
- `share` is the payer's fraction. A value of 1 is never exported.
- `category` supports future archive analytics without re-derivation.
- optional `edited: true` marks a payer-corrected import amount.

For each item, the non-payer owes `amount × (1 − share)`; settlement nets both directions.

### Monetary rounding policy

External v1 files retain decimal-dollar fields for compatibility, but the web application
converts each amount to integer cents before financial arithmetic. Decimal amounts exactly
halfway between cents round away from zero (`1.005` becomes `1.01`; `-1.005` becomes
`-1.01`). Each row's `amount × (1 − payer share)` claim is rounded once using the same
rule; integer claims are then summed and netted. Half of `$179.07` is therefore `$89.54`,
and half of a `-$1.01` refund is `-$0.51`.

## Month archive — `split-ledger-archive/v1` (frozen)

Written at close as the append-only permanent record and the only planned analytics input.
It merges both sides' shared items, sorts them by date, and excludes all private and Amazon
context fields.

Filename: `split-<period>-archive.json`

```json
{
  "format": "split-ledger-archive/v1",
  "period": "2026-07",
  "closed": "2026-08-02T14:12:00.000Z",
  "toolVersion": "1.0.0",
  "people": {"a":"Person A","b":"Person B"},
  "settlement": {"aPaidShared":812.40,"bPaidShared":604.15,"aClaim":406.20,"bClaim":254.65,"net":151.55,"direction":"b_owes_a"},
  "items": [
    {"date":"2026-07-16","merchant":"Sample Restaurant","category":"Restaurants","amount":146.67,"payer":"b","shareOfPayer":0.5,"owedToPayer":73.34}
  ]
}
```

`people` freezes display names at close. `payer` is `a` (settler) or `b` (partner).
`direction` is `b_owes_a`, `a_owes_b`, or `square`. Future readers must ignore unknown
additive fields and must not assume names stay constant across archives.

In the web service, the Worker creates this archive from the two stored, validated shared
projections. The browser may preview the same deterministic arithmetic, but it cannot send
an archive for the Worker to trust. Closing locks both stored projections; later downloads
therefore reproduce the same archive.

## Household closed-archive bundle — `split-ledger-household-archive/v1`

Portable recovery for shared web-service history. It contains closed month archives only,
ordered by period. Open projections are deliberately excluded: each person can resubmit
their allowlisted projection after recovery without putting account identifiers or mutable
workflow state in the portable file.

Filename: `split-ledger-household-archives.json`

```json
{
  "format": "split-ledger-household-archive/v1",
  "generated": "2026-09-10T18:00:00.000Z",
  "archives": [
    {
      "format": "split-ledger-archive/v1",
      "period": "2026-07",
      "closed": "2026-08-02T14:12:00.000Z",
      "toolVersion": "1.0.0",
      "people": {"a":"Person A","b":"Person B"},
      "settlement": {"aPaidShared":812.40,"bPaidShared":604.15,"aClaim":406.20,"bClaim":254.65,"net":151.55,"direction":"b_owes_a"},
      "items": []
    }
  ]
}
```

It contains no household ID, Clerk user ID, private row, raw description, card label,
rule, unfinished decision, Amazon product/order/decision, or browser session. Any verified
household member may export it. Restore is limited to a verified organization administrator
and recreates immutable closed records only. Existing conflicting periods are never
overwritten.

Unknown fields are rejected throughout shared projection and archive-bundle input. Private
rows, raw descriptions, card labels, rules, original imported amounts, products, order ids,
Amazon context/matches/decisions, Clerk ids, and household ids make a request invalid rather
than being silently stripped.

## Private session — `split-ledger-session/v3`

The browser autosave and downloadable backup contain the full working state: identities,
cards, settings, rules, all local transactions, source ranges/totals, partner file,
acknowledgements, view state, closed-period summaries, and optional normalized Amazon
context. Keep this file only on the owner's device or private storage.

Relevant shape:

```json
{
  "format": "split-ledger-session/v3",
  "version": "1.0.0",
  "period": "2026-07",
  "names": ["Person A", "Person B"],
  "meIndex": 0,
  "cards": ["TD Visa", "BMO Mastercard"],
  "threshold": 0,
  "defaultUnknown": 1,
  "rules": [],
  "excludePatterns": [],
  "txns": [],
  "ranges": [],
  "blocks": [],
  "closedPeriods": {},
  "partner": null,
  "confirmedTotals": false,
  "view": {"groupBy":"day","onlyUndecided":false,"cursor":0},
  "amazonContext": {
    "orders": [{"orderId":"000-0000000-0000000","orderDate":"2026-07-10","total":42.50,"products":["Example product"],"monthlyPayments":false,"subscription":false}],
    "decisions": {},
    "advertisedOrderCount": 1,
    "duplicateBlocks": 0,
    "invalidBlocks": 0
  }
}
```

The reader accepts session v1, v2, and v3. Older name fields migrate into `names`.
`partner`, `confirmedTotals`, `view`, and `amazonContext` were added within v3 and must
remain optional so older files load safely.

Amazon restoration accepts only validated normalized fields and valid transaction
decisions. Raw Amazon paste and derived matches are never persisted; matches recalculate
from orders and current transactions. Loading an older session without `amazonContext`
clears unrelated in-memory Amazon state. Malformed entries are discarded.

## Safe diagnostic — `split-ledger-diagnostic/v1`

Built from an allowlist for deliberate support sharing. It may contain:

- application version, browser string, `file:`/`http:`/`https:`/`other` source class,
  and whether browser storage is available;
- counts of transactions, rules, cards, normalized Amazon orders/decisions/match states;
- grouping and undecided-filter settings;
- synthetic self-test totals and failures.

It must not contain identities, card labels, periods, transaction IDs/dates, merchants,
descriptions, amounts, product titles, order IDs, raw paste, filenames, local paths, URLs,
or session/partner contents. Browser details and counts are still metadata, so users must
share the report deliberately rather than publish it.

## Internal transaction shape

```js
{
  id, date, raw, merchant, key, family, processor, city, category,
  amount, originalAmount, bank, card, balance,
  pending, bnpl, subscription, refund, large,
  occurrences, share, decided, auto, pairedWith, pairedLabel, weakPair
}
```

- `id` is derived from imported date, canonical key, imported amount, and controlled card
  label. It remains stable after an amount correction.
- `raw` preserves the bank description for audit; canonicalization never overwrites it.
- `originalAmount` appears after correction and retains the bank-parsed value.
- `auto` distinguishes rule/threshold decisions from manual choices; manual choices are
  not overwritten by reapplying rules.
- `bnpl` rows may be split but cannot inherit or create merchant rules.
