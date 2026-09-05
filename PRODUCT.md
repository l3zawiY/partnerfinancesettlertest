# PRODUCT.md

What this is for, who it's for, and why it looks the way it does.

---

## 1. The problem

Two people share a household but keep separate finances — four credit cards across two
banks, no joint account. Shared spending gets paid ad hoc by whoever is present.

Settling up means deciding, per purchase, who bears what share: roughly **90 decisions
across ~130 transactions a month**. The manual spreadsheet version of this works and is
accurate. It is also abandoned within two months, every time.

### Root causes, in order of weight

| # | Cause | Evidence |
|---|---|---|
| 1 | **Decision volume** — ~90 judgement calls per cycle | The spreadsheet was accurate and still got dropped |
| 2 | **Context isn't in the data** — ~40% of transactions can't be classified from merchant and amount alone | The same merchant needs different splits on different occasions: a rideshare can be solo, shared, or a favour |
| 3 | **Manual data preparation** — copying from bank pages, cleaning until one purchase equals one clean row | Named as a pain point directly |
| 4 | **Two-party coordination** — both people must finish before anything settles | "Asking my partner to do the same" |
| 5 | **Recall decay** — a three-week-old charge is hard to reconstruct | Confirmed, partly mitigable by grouping purchases by day |

### The framing that matters

This is **not an AI problem and not a data-availability problem.** It's a deterministic
data problem with a UX bottleneck. The split decisions are irreducibly human — the users
are willing to make them. The product's job is to make 90 decisions cost what 10
currently cost.

---

## 2. Users

| | |
|---|---|
| **Settler** | Technical. Does setup, imports both of their own cards, tags, receives the partner's file, produces the settlement, keeps the history. |
| **Partner** | Non-technical requirement: **must be stateless.** Opens the page, pastes, tags, exports, sends the file. Nothing to save, nothing to configure, nothing to lose. |
| Devices | Two separate laptops, two browsers, no shared machine |
| Cadence | Monthly, calendar month — **not** statement period |

The partner being stateless is a design rule, not an accident. Every feature must be
checked against it: if it requires the partner to remember, save, or configure
something, it's wrong.

---

## 3. Jobs to be done

1. **When the month ends**, I want all four cards' transactions in one clean list
   without manual cleaning, so I don't lose twenty minutes before the real work starts.
2. **When reviewing a transaction**, I want enough context on screen to decide in one
   second, so I don't have to remember or go hunting in another app.
3. **When most transactions are obvious**, I want them decided for me, so I only spend
   attention on the ambiguous ones.
4. **When we've both tagged**, I want one settlement number we both trust, without
   either of us auditing the other.
5. **When I tag my transactions**, I want my personal purchases never to be visible to
   my partner.
6. **When I've finished but my partner hasn't**, I want to come back days later and find
   my work exactly where I left it.
7. **When several months have closed**, I want to see what we spend on together and how
   it's changing.

---

## 4. Hard constraints

- **C1 — Privacy by construction.** Personal purchases are structurally absent from what
  gets exchanged, not filtered out of a view.
- **C2 — No agentic bank access.** Browser-agent access to banking domains is blocked at
  the platform level. Any design depending on it is non-viable.
- **C3 — Partner-compatible.** Cannot require a subscription, a developer environment,
  or a build step on the partner's side.
- **C4 — Calendar month.** The transaction-date boundary rule is defined once and applied
  identically by both people.
- **C5 — Local-first.** Full transaction histories stay on each person's device.

---

## 5. Requirements

### Shipped

| ID | Requirement |
|---|---|
| M1 | Import a calendar month per card from a bank paste (tab-separated) or CSV |
| M2 | Parse to normalised rows: date, merchant, amount, card, bank |
| M3 | Exclude non-purchases: card payments, transfers, interest, fees |
| M4 | Refunds handled as negative amounts and paired to their original charge |
| M5 | Deduplicate on re-import |
| M6 | Five split presets — all mine, 70/30, 50/50, 30/70, all theirs — plus any custom percentage |
| M7 | Persistent merchant rules; a merchant tagged once is pre-filled thereafter |
| M8 | Materiality threshold auto-defaults small unmatched items (ships at 0 — see §7) |
| M9 | Day-clustered review, so surrounding purchases supply the missing context |
| M10 | Keyboard-driven tagging, no mouse required |
| M11 | Redacted shared-items export |
| M12 | Import partner's file, compute net settlement, one number and a direction |
| M13 | Reject a partner file whose owner matches your own |
| M14 | Pre-settlement checks: coverage, bank-total reconciliation, undecided items, duplicates, instalments, pending, unmatched refunds, large auto-assigned items |
| M15 | Coverage assertion from the bank's own printed date ranges |
| M16 | Close month, writing a frozen archive file |
| M17 | Built-in self-test over synthetic fixtures |

### Next

| ID | Requirement |
|---|---|
| S1 | Analytics tool — **separate file**, reads archive files, shared spend by category, vendor, and month |
| S2 | Rules table sync between the two installs |
| S3 | Running cumulative balance so settlement can slip a month |
| S4 | Ingest a shared note capturing the handful of asymmetric splits agreed verbally |
| S5 | Multi-currency and foreign-exchange fee handling |
| S6 | Optional Amazon order-context paste: match order totals and full product names to imported Amazon charges, show the evidence in Review, and keep every split decision human |

### Explicitly out of scope

- Live bank connections or aggregators
- Budgeting, forecasting, charts inside the settlement tool
- A mobile app
- Executing payments
- Any AI deciding splits autonomously
- Automatic retailer connections, browser scraping, or account access

---

## 6. Success metrics

| Metric | Target |
|---|---|
| Time to reconcile a month, steady state (month 3+) | ≤ 15 minutes combined |
| Month 1, with an empty rules table | ≤ 45 minutes |
| Accuracy vs a fully manual reconciliation | within ±$20 |
| Transactions needing an explicit decision, month 3+ | ≤ 30 of ~130 |
| **Adherence** | **3 consecutive months completed without either person being chased** |

Adherence is the only metric that matters. The previous solution failed on adherence,
not accuracy. A tool that is precise and unused has failed completely.

---

## 7. Decisions worth not re-litigating

**Threshold ships at 0.** Roughly half of transactions fall under $25 but they're only
about a sixth of the money — so auto-defaulting them halves the review load. But
assigning them all one direction is *systematically* biased, not randomly, so the errors
don't cancel. What makes it safe is that small spending is **repetitive**: after one
fully tagged month those merchants are all rules, and the threshold only ever sees
genuinely new small merchants. Hence month one at 0, raised afterwards.

**Merchant families, not merchant strings.** A rideshare company appears under many
distinct descriptors. Collapsing them to one merchant would be wrong — food delivery and
rides split differently. Families group name variants; things that split differently stay
apart.

**Remembering a merchant is a deliberate action.** Auto-remembering every tag would
create rules for exactly the merchants that must stay manual — the context-dependent
ones. Plain keypress assigns; shift assigns *and* remembers.

**The settler is the single source of truth.** Both sides *could* compute the settlement
independently from the same two files, and a mismatch would be a useful signal. In
practice only the settler does. That's an accepted trade: it makes the partner stateless,
at the cost of losing the cross-check.

**Analytics lives in a separate tool.** Settlement runs monthly and must be exactly
right. Analytics is exploratory and will change constantly. Separate files make it
structurally impossible for an analytics experiment to break parsing or settlement.

**No agent decides splits.** The information required — was this dinner shared, was this
ride a favour — exists only in the users' heads and is not recoverable from bank data.
An agent would guess at the one thing only they know, add nondeterminism to arithmetic
that must be exact, and still need every guess reviewed.

**Amazon context is evidence, not a decision.** A manually pasted Amazon order page may
help identify what produced a vague bank charge. Matching stays local and deterministic,
ambiguous results stay visible, full product names are shown verbatim, and no match ever
assigns a split. Product and order details remain private session context and never enter
the shared export or month archive. See `docs/AMAZON-CONTEXT-PLAN.md`.

---

## 8. Known weaknesses

- **Nothing forces adherence.** No reminder, no shared visibility of whose turn it is.
  The tool can be excellent and still go unused. This is the original problem and it
  remains unsolved.
- **Recall for context-dependent purchases** is mitigated by day grouping, not solved.
  The planned Amazon context helper addresses one high-friction merchant only; other
  context-dependent merchants remain manual.
- **Instalment purchases** (buy-now-pay-later) are flagged but not modelled — the charge
  isn't the purchase, so a split item can span several months.
- **The partner's bank pages are untested.** They're assumed to render identically.
