# CLAUDE.md

Shared repository-wide instructions for Split Ledger. Use proportional context: determine
what the request requires before opening files, inspect directly relevant sources, and
search or skim when sufficient. Broader review belongs to cross-cutting changes or
evidence-driven investigations, not every new session.

## Working with the owner

The owner is a product manager and a beginner with coding and GitHub. Use plain language
and avoid unexplained jargon. Explain what a tool or component is and where it lives when
that context affects understanding or a decision. Label fictional data when showing demo
content. For changed user workflows or owner-run checks, give exact steps, the expected
result, and what failure looks like. When starting a local server, state its URL and how to
restart it. Small questions and routine documentation work should stay concise.

## Authority and change safety

- A direct request to make a clearly described change is approval for that stated scope.
- Ask again before materially expanding scope, resolving a consequential product
  ambiguity, making a destructive or difficult-to-reverse change, or taking an external
  action such as commit, tag, push, publish, deploy, purchase, or account creation.
- Preserve unrelated and uncommitted owner work.
- Never commit credentials or real financial or retailer data. Fixtures must be fictional.
- Match verification to the affected behavior and risk. Documentation-only edits normally
  need diff inspection and formatting checks, not application tests.
- If verification fails, first determine whether the current change caused it. Never hide
  or weaken a failing check. Revert when the batch caused a regression that cannot be
  safely corrected within the approved scope.

## Document routing

| Need | Canonical source |
|---|---|
| Use and repository orientation | `README.md` |
| Product purpose, scope, and settled decisions | `PRODUCT.md` |
| Released `index.html` engineering rules | `docs/INDEX-INSTRUCTIONS.md` |
| Shipped release history | `CHANGELOG.md` |
| Unresolved released-app work | `docs/BACKLOG.md` |
| Current verification contract | `docs/TESTING.md` |
| Persisted and diagnostic contracts | `docs/DATA-FORMATS.md` |
| Experimental web-service architecture and status | `docs/WEBAPP.md` |
| Unresolved web-service work | `docs/WEBAPP-BACKLOG.md` |

Open only documents relevant to the request. Check `VERSION` and `CHANGELOG.md` for
released behavior or release work; check a backlog for planning or backlog changes. When
broader review is justified, use the working tree and active canonical documents rather
than a prose handoff. Active documents override archived history.

Do not read `resources/`, `design-reference/`, or `docs/archive/` routinely. Consult them
only for a specifically needed asset/reference, owner-requested history, or relevant
regression evidence.

Backlog entries use the next unused stable id and required date format; never renumber or
reuse one. `webapp/` items use `WEB-###` in `docs/WEBAPP-BACKLOG.md`; `index.html` items use
`OBS-###` or `IDEA-###` in `docs/BACKLOG.md`.

## Scoped instructions

- Before changing `index.html`, its tests, or its persisted formats, read
  `docs/INDEX-INSTRUCTIONS.md` in full.
- Work under `webapp/` follows the nearest `webapp/CLAUDE.md`.
