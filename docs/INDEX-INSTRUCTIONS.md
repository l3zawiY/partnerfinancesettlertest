# Released application engineering instructions

Read this document in full before changing `index.html`, its automated tests, or its
persisted and exported data formats. These rules apply to the released, single-file Split
Ledger application, not the experimental `webapp/` service.

## Product and architecture

Split Ledger is a local-first tool for two people who keep separate cards. Each person
imports transactions, chooses ownership, and exports only shared items. One person loads
both shared files and computes settlement. `PRODUCT.md` defines the full product scope and
deliberate non-features.

The application is one offline HTML file with no runtime dependencies or build step.

| Section | Responsibility |
|---|---|
| Styles and markup | Four production views and their presentation |
| Engine markers | Frozen pure parsing and canonicalisation functions; no DOM access |
| Policy | Pure financial and application rules exposed to tests |
| Amazon context markers | Pure parsing and matching evidence; no DOM access |
| Fixtures and self-test | Synthetic behavioural assertions |
| App | State, rendering, persistence, files, and events |

The headless harness evaluates the DOM-free sections directly. DOM access inside the
`==ENGINE-START==` / `==ENGINE-END==` block breaks the test harness; place presentation
behavior in the App section.

Key terms:

- `share` is the fraction borne by the card owner: `1` is private, `0.5` is even, and `0`
  means the partner owes all.
- Positive `amount` is spending and negative `amount` is money returned.
- `key` is the canonical merchant-rule identifier; `family` groups safe name variants.

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
5. No real financial or retailer data. Fixtures are fictional and date-stable unless
   intentionally month-relative.
6. TD's running balance is never a transaction amount. Preserve the refusal guard.
7. Closed archives are append-only; never silently rewrite an earlier archive.
8. Preserve `split-ledger/v1`, `split-ledger-archive/v1`, and readable session v1-v3
   contracts. Format changes are additive unless explicitly approved as breaking.
9. Normalized Amazon context is private session data. Raw Amazon paste and derived matches
   are not stored; Amazon fields never enter shared exports or archives.

Do not add client-side password protection. It cannot protect a static file delivered to
the same visitor, and the hosted URL contains no user data.

## Implementation rules

- Keep application JavaScript ES5-compatible: use `var` and functions; no classes, arrow
  functions, template literals, optional chaining, or required transpilation.
- Escape every user-derived string with `esc()` before it reaches `innerHTML`.
- Keep comments explaining non-obvious financial or parsing decisions.
- Family patterns are ordered from specific to general and match the original description.
- Instalment transactions do not inherit ordinary merchant rules.
- Public output builders are allowlists. Never create them by redacting a private session.
- For data-format changes, read `docs/DATA-FORMATS.md`; never rename or repurpose an
  existing field, and keep older sessions readable.

## Proportional verification

Use the smallest checks that fully cover the risk:

- Financial logic, parsing, persistence, exports, archives, privacy boundaries, engine or
  policy code, and other application behavior: run `node test/run-tests.js` immediately
  before and after the batch and report both assertion counts.
- Test-only changes: run the affected checks during development and the complete suite
  before completion. Establish a pre-change baseline when existing failures are plausible.
- Styles or markup: run the automated suite after the change and perform the relevant
  checks from `docs/TESTING.md`. Run a pre-change baseline when the work overlaps existing
  owner changes or a regression is under investigation.
- Documentation and agent-instruction changes: inspect the diff and run formatting or link
  checks that apply. Do not run the application suite unless executable behavior changed.
- Formatting-only changes: run only the relevant formatter or validation.

Never loosen an assertion merely to make a change pass. Update an expectation only for an
explicitly approved behavior change and record the reason in `CHANGELOG.md`. If a
post-change check fails, determine whether the current batch caused it; revert when it
caused a regression that cannot be safely corrected within the approved scope.

New assertions use a `T`-prefixed id and describe behavior, not implementation. The same
assertions run in Rules & Files through **Run self-test**. Versioned behavior changes update
`VERSION` in `index.html` and `CHANGELOG.md` together.

