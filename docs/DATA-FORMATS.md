# Data formats

Three JSON contracts. Two are frozen because other things depend on them; one is
internal and may evolve.

**Rules for all three:** additive changes only. Never rename or repurpose a field.
Bump the version suffix in `format` only for a genuinely breaking change, and keep the
reader able to load the old version.

---

## 1. Shared export — `split-ledger/v1`  *(frozen)*

Produced by each person, sent to the settler. **Contains only shared items.** Anything
split entirely to its card owner is absent — that absence is the privacy guarantee, so
never add a field that would reveal private spending (a total including private items, a
transaction count, a date range covering everything).

Filename: `split-<period>-<owner>.json`

```json
{
  "format": "split-ledger/v1",
  "toolVersion": "0.3.0",
  "period": "2026-07",
  "owner": "Person A",
  "generated": "2026-08-01T18:22:00.000Z",
  "items": [
    {
      "date": "2026-07-16",
      "merchant": "Sample Restaurant",
      "category": "Restaurants",
      "amount": 146.67,
      "share": 0.5
    }
  ],
  "totals": { "sharedPaidByOwner": 146.67 }
}
```

| Field | Meaning |
|---|---|
| `owner` | Who paid. Checked on import: a file whose owner matches the importer's own name is **rejected**, because loading it would double-count every item and produce a plausible wrong figure |
| `amount` | Positive is spend, negative is a refund |
| `share` | Fraction the **owner** bears. `0.5` even, `0` partner owes all. Never `1` — those aren't exported |
| `category` | Present so the analytics tool can group without re-deriving. Only ever describes shared spending |
| `edited` | Optional, `true` only when the payer corrected a mis-parsed amount by hand. Additive in 0.4.0; older readers ignore it. Absent means the amount is exactly as the bank produced it |

Settlement: for each item the non-payer owes `amount × (1 − share)`. Net the two
directions.

---

## 2. Month archive — `split-ledger-archive/v1`  *(frozen)*

Written once when a month is closed. The permanent record, and the **only** input to the
future analytics tool. Append-only: never rewritten after the fact.

Filename: `split-<period>-archive.json`

```json
{
  "format": "split-ledger-archive/v1",
  "period": "2026-07",
  "closed": "2026-08-02T14:12:00.000Z",
  "toolVersion": "0.3.0",
  "people": { "a": "Person A", "b": "Person B" },
  "settlement": {
    "aPaidShared": 812.40,
    "bPaidShared": 604.15,
    "aClaim": 406.20,
    "bClaim": 254.65,
    "net": 151.55,
    "direction": "b_owes_a"
  },
  "items": [
    {
      "date": "2026-07-16",
      "merchant": "Sample Restaurant",
      "category": "Restaurants",
      "amount": 146.67,
      "payer": "b",
      "shareOfPayer": 0.5,
      "owedToPayer": 73.34
    }
  ]
}
```

| Field | Meaning |
|---|---|
| `people` | Maps `a` and `b` to display names *as they were at close time*, so renaming later doesn't corrupt old archives |
| `payer` | `"a"` (the settler) or `"b"` (the partner) |
| `direction` | `b_owes_a`, `a_owes_b`, or `square` |
| `items` | One flat list, both sides merged, sorted by date — easier to concatenate across months than two arrays |

Only shared items appear. This is why joint analytics is safe: the archive can't leak
private spending because private spending never entered it.

**Design note for the analytics tool:** it should accept N archive files, concatenate
`items`, and group by `category`, `merchant`, and `period`. It must not assume every
archive has the same `people` values, and it must ignore fields it doesn't recognise.

---

## 3. Session — `split-ledger-session/v3`  *(internal, may evolve)*

The settler's full working state, including **private** transactions. Written to browser
storage automatically and downloadable as a manual backup.

**This file must never go in a folder shared with the partner.** It contains everything.

```json
{
  "format": "split-ledger-session/v3",
  "version": "0.3.0",
  "period": "2026-07",
  "names": ["Person A", "Person B"],
  "meIndex": 0,
  "cards": ["Bank1 Card", "Bank2 Card"],
  "threshold": 0,
  "defaultUnknown": 1,
  "rules": [{ "type": "family", "pattern": "some-family", "share": 0.5, "label": "Display Name" }],
  "excludePatterns": ["..."],
  "txns": [],
  "ranges": [],
  "blocks": [],
  "closedPeriods": { "2026-07": { "closedAt": "...", "net": 151.55, "direction": "...", "items": 42 } },

  "partner": null,
  "confirmedTotals": false,
  "view": { "groupBy": "day", "onlyUndecided": false, "cursor": 0 }
}
```

`partner`, `confirmedTotals` and `view` were added in 0.4.0 **without bumping the version**,
because they are additive: an older build reads the same `v3` file and ignores them. Each is
read only when present, so an older session file cannot wipe a partner file just loaded.

`applySession()` reads `v1`, `v2`, and `v3`. Older sessions stored only `meName` and
`youName`; those migrate into `names` on load. **Keep this backward compatibility** —
dropping it silently orphans saved state with no error message.

---

## Internal transaction shape

Not persisted as a contract, but stable enough that changing it ripples widely.

```js
{
  id, date, raw, merchant, key, family, processor, city, category,
  amount, originalAmount, bank, card, balance,
  pending, bnpl, subscription, refund, large,
  occurrences, share, decided, auto, pairedWith, pairedLabel, weakPair
}
```

- `id` is `date|key|amount|card` — the deduplication key. **This is why the card label is
  a dropdown rather than free text**: `TD Visa` and `TD visa` produce different ids and
  let the same transaction import twice.
- `raw` is the verbatim bank description and is never overwritten. It's the audit trail
  when canonicalisation gets something wrong.
- `auto: true` means a rule or the threshold decided it; a manual decision sets it false
  and is never overwritten by `applyRules()`.
- `originalAmount` is absent until someone corrects the amount by hand, and then holds the
  figure as imported. `id` keeps the **imported** amount even after a correction — rules,
  refund pairings and closed archives all reference it, so it must not move.
- `bnpl: true` (a Klarna charge) means the row takes no merchant rule: the same key covers
  both a normal purchase at that merchant and whatever the instalment plan financed.
