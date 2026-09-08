# CLAUDE.md

Shared product and engineering instructions for anyone changing Split Ledger. Read this
before touching `index.html`.

## Working agreement and approval

The owner is a product manager and a beginner with coding, GitHub, and coding agents.
Explain platform behaviour, risks, and results in plain language. Use lightweight product
methods when they clarify a decision; avoid ceremony and unexplained jargon.

Before editing any file, for each coherent batch:

1. Inspect and reason read-only.
2. Present a file-by-file plan with the benefit, cost, risk, and tradeoff.
3. Keep advice separate from permission to edit.
4. Wait for explicit approval of that exact scope. Revised scope requires new approval.
5. Run `node test/run-tests.js` immediately before and after the batch and report both
   assertion counts. A red post-change run means revert the batch, not patch forward.

Preserve unrelated and uncommitted owner work. Do not commit, tag, push, publish, or deploy
unless the owner explicitly requests that separate action.

## Document routing

| Need | Canonical source |
|---|---|
| Use and repository orientation | `README.md` |
| Product purpose, scope, and settled decisions | `PRODUCT.md` |
| Shipped release history | `CHANGELOG.md` |
| Unresolved work and ideas | `docs/BACKLOG.md` |
| Current verification contract | `docs/TESTING.md` |
| Persisted and diagnostic contracts | `docs/DATA-FORMATS.md` |
| Experimental web-service architecture and status | `docs/WEBAPP.md` |

Start a session from the working tree, current application version, changelog, and
backlog. Active canonical documents take precedence over archived implementation history.
Do not read `resources/`, `design-reference/`, or `docs/archive/` during routine work.
Consult them only when the task specifically requires an asset/reference, the owner asks
for the history, or a relevant regression investigation needs its evidence.

Backlog entries use stable Jira-style ids and dates. Always use the next unused id; never
renumber or reuse one.

## Product and architecture

Split Ledger is a local-first tool for two people who keep separate cards. Each person
imports their transactions, chooses ownership, and exports only shared items. One person
loads both shared files and computes settlement. See `PRODUCT.md` for the full product
definition and deliberate non-features.

The application is one offline HTML file with no runtime dependencies or build step.
`index.html` is ordered as follows:

| Section | Responsibility |
|---|---|
| Styles and markup | Four production views and their presentation |
| Engine markers | Frozen pure parsing and canonicalisation functions; no DOM access |
| Policy | Pure financial and application rules exposed to tests |
| Amazon context markers | Pure parsing and matching evidence; no DOM access |
| Fixtures and self-test | Synthetic behavioural assertions |
| App | State, rendering, persistence, files, and events |

The headless harness evaluates the DOM-free sections directly. DOM access inside the
engine markers breaks `test/run-tests.js`; place presentation behaviour in the App section.

### Experimental web application scope

The `webapp/` directory on `experiment/web-service` is an authorized learning experiment,
not the released product. It may use React, TypeScript, a build step, Clerk authentication,
and an allowlisted Cloudflare API. These exceptions do not weaken the offline, dependency-
free, and no-network rules for `index.html`.

Keep complete bank histories, private transactions, Amazon context, merchant rules, and
draft decisions in the browser. The service may eventually receive allowlisted shared
items only. Never commit credentials or real financial data. Authentication proves an
identity; every API route must separately enforce application authorization. Financial
arithmetic remains deterministic and testable outside the UI and network layers.

Key terms:

- `share` is the fraction borne by the card owner: `1` is private, `0.5` is even, and
  `0` means the partner owes all.
- Positive `amount` is spending and negative `amount` is money returned.
- `key` is the canonical merchant rule identifier; `family` groups safe name variants.

## Hard invariants

Breaking any of these is a defect:

1. No runtime network calls: no `fetch`, `XMLHttpRequest`, CDN, analytics, telemetry, or
   remotely loaded font or asset. The app must work offline from `file://`; T20 enforces
   the source-level network boundary.
2. No backend, accounts, uploads, runtime package, framework, transpilation, or build step.
3. A transaction borne entirely by its card owner is absent from shared exports and
   archives. It is not hidden or zeroed.
4. All arithmetic is deterministic JavaScript. Amazon matching and any future assistant
   may supply evidence only; neither may choose a split or enter the money path.
5. No real financial or retailer data in the repository. Fixtures must be fictional and
   date-stable unless intentionally month-relative.
6. TD's running balance is never a transaction amount. Preserve the refusal guard.
7. Closed archives are append-only; never silently rewrite an earlier archive.
8. Preserve `split-ledger/v1`, `split-ledger-archive/v1`, and readable session v1-v3
   contracts. Format changes are additive unless explicitly approved as breaking.
9. Normalized Amazon context is private session data. Raw Amazon paste and derived matches
   are not stored; Amazon fields never enter shared exports or archives.

## Implementation rules

- Keep application JavaScript ES5-compatible: use `var` and functions; no classes, arrow
  functions, template literals, optional chaining, or required transpilation.
- Escape every user-derived string with `esc()` before it reaches `innerHTML`.
- Keep comments explaining non-obvious financial or parsing decisions.
- Family patterns are ordered from specific to general and match the original description.
- Instalment transactions do not inherit ordinary merchant rules.
- Public output builders are allowlists. Never create them by redacting a private session.
- When changing a data format, read `docs/DATA-FORMATS.md`; never rename or repurpose an
  existing field, and keep older sessions readable.
- Do not add client-side password protection. It cannot protect a static file delivered to
  the same visitor, and the hosted URL contains no user data.

## Verification

Run the complete automated suite with:

```bash
node test/run-tests.js
```

The same assertions run in Rules & Files through **Run self-test**. New assertions use a
`T`-prefixed id and describe behaviour, not implementation. Never loosen an assertion to
make a change pass; update an expectation only for an explicitly approved behaviour change
and record that reason in `CHANGELOG.md`.

Use `docs/TESTING.md` for manual checks relevant to the changed area. Versioned behaviour
changes update `VERSION` in `index.html` and `CHANGELOG.md` together.
