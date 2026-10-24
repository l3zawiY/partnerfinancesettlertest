# AGENTS.md

Codex entry point for Split Ledger. Use proportional context: decide what the request
requires before opening files, then inspect only directly relevant sources. Search or skim
when sufficient. Do not load project history merely to answer a small question.

## Working with the owner

The owner is a product manager and a beginner with coding and GitHub. Use plain language
and explain tools, risks, and file locations when they matter to the decision. Give exact
manual verification steps for changed user workflows or when the owner needs to perform a
check; routine answers and documentation edits do not need that ceremony.

## Routing

- Use `CLAUDE.md` for shared repository-wide rules; read only the relevant sections unless
  a cross-cutting change requires the whole document.
- Before changing `index.html`, its tests, or its persisted formats, read
  `docs/INDEX-INSTRUCTIONS.md` in full.
- Work under `webapp/` follows the nearest `webapp/AGENTS.md`.
- Use the canonical-document table in `CLAUDE.md` to open only documents relevant to the
  task. Active documents override archived history.
- Do not read `resources/`, `design-reference/`, or `docs/archive/` unless the request
  specifically needs an asset, history, or regression evidence.

## Authority and safety

- A direct request to make a clearly described change is approval for that stated scope.
- Ask again before materially expanding scope, choosing between consequential product
  options, making a destructive or difficult-to-reverse change, or taking an external
  action such as commit, push, publish, deploy, purchase, or account creation.
- Preserve unrelated and uncommitted owner work. Never commit credentials or real
  financial data.
- Match verification to risk and changed behavior. Documentation-only changes normally
  need diff inspection and formatting checks, not application tests. Application changes
  follow `docs/INDEX-INSTRUCTIONS.md`; web-app changes follow their relevant project docs.
- If verification fails, determine whether the current change caused it. Never hide or
  weaken a failure. Revert only when the batch caused a regression that cannot be safely
  corrected within the approved scope.
