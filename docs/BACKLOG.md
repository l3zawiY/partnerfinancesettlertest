# Backlog

Things noticed but not acted on. Nothing here is a commitment — it's a place to park
an observation so it survives until there's a reason to discuss it.

**Observations** are small, verified, and usually correct-in-place: a stale number, a
doc that drifted from the code. **Ideas** need a conversation first, because they touch
what the tool is for. Check `PRODUCT.md` before promoting an idea — several plausible
features are rejected there on purpose.

When something here is done, delete the entry and say so in `CHANGELOG.md`. This file
is not a history; the changelog is.

Every entry has a stable, Jira-style id and a date:

- Observations use `OBS-001`, `OBS-002`, and so on, and end with
  `*Noticed: YYYY-MM-DD.*`
- Ideas use `IDEA-001`, `IDEA-002`, and so on, and end with
  `*Added: YYYY-MM-DD.*`

Use the next unused number within that type. Never renumber entries or reuse an id after
an entry is removed; gaps preserve references made in conversations, plans, and commits.

---

## Observations

*(none)*

---

## Ideas

### IDEA-001 — Optional AI fallback for unresolved Amazon matches

After the deterministic Amazon matcher has exhausted exact, ambiguous, and constrained
split-order candidates, an optional cheap model could compare or rank the remaining
possibilities. This is an idea, not an implementation commitment.

It would break the product's current fully offline model and introduce sensitive-data
handling, consent, cost, and nondeterministic results. It therefore needs a separate
product and architecture decision. AI may rank or explain candidates only; it must never
confirm a match, change an amount, choose a split, or participate in settlement
arithmetic. See `docs/AMAZON-CONTEXT-PLAN.md` for the offline MVP and its boundaries.

*Added: 2026-09-04.*
