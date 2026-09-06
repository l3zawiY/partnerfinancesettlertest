# Split Ledger

Split Ledger is a single-file, offline tool for reconciling shared expenses between two
people who keep separate cards. Each person imports their own transactions, decides the
shared portion, and exchanges a JSON file containing only shared items. The settler loads
both sides and closes the month with one deterministic result.

No accounts, backend, bank connection, telemetry, build step, or runtime network call.

## Run

Open `index.html` directly in a modern browser. Use the fictional TD, BMO, posted-update,
and Amazon samples under Import to try the full workflow without real data.

## Monthly workflow

1. Choose the calendar month and import each card's bank table.
2. Optionally paste Amazon Your Orders text for private product context.
3. Reconcile imported counts and totals, then review ownership with the mouse or keyboard.
4. Download the privacy-redacted shared file and exchange it directly with the partner.
5. The settler loads the partner file, reviews checks, and closes the month.

The browser autosaves the private working state. Closing creates an append-only archive
and offers a clean next-month workspace while retaining settings, rules, and history.

## Data and privacy

| File | Contents | Destination |
|---|---|---|
| Private session | Full ledger, rules, loaded partner data, normalized Amazon context | Own device or private storage only |
| Shared export | Shared items paid by one person | The other person |
| Month archive | Both sides' shared items and settlement | Settler's private records |

Never place a session file in a shared folder. Private purchases and Amazon product/order
context are structurally absent from shared exports and archives. Raw statement and Amazon
pastes are discarded after processing.

## Tests

```bash
node test/run-tests.js
```

The same synthetic assertions run from Rules & Files → Run self-test. Committed fixtures
are fictional because the repository may be public.

## Documentation map

| File | Purpose |
|---|---|
| `AGENTS.md` | Concise Codex entry point and approval gate |
| `CLAUDE.md` | Shared engineering constraints and repository routing |
| `PRODUCT.md` | Product purpose, boundaries, requirements, and decisions |
| `docs/TESTING.md` | Current automated and manual release checks |
| `docs/DATA-FORMATS.md` | Persisted JSON and privacy contracts |
| `docs/BACKLOG.md` | Unresolved observations and uncommitted ideas |
| `CHANGELOG.md` | Release history |

`docs/archive/` is historical evidence, not routine context. Active documents and the
verified implementation take precedence.

## Hosting

Any static host can serve `index.html`. Hosting the code does not host user data: all
processing and persistence remain in the browser. A public repository must contain no
real names, statements, merchants, amounts, orders, sessions, exports, or archives.
