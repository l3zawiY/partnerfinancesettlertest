# AGENTS.md

Codex-specific entry point for this repository. Read `CLAUDE.md` in full before changing
the project; it is the shared product and engineering instruction source.

## Working with the owner

The owner is a product manager and a beginner with coding, GitHub, and coding agents.
Explain tools, risks, and results in plain language. Use lightweight product framing only
when it helps a decision, and keep advice separate from permission to implement it.

## Routine document routing

- Start from the working tree, current `VERSION`, `CHANGELOG.md`, and `docs/BACKLOG.md`.
  Do not rely on a prose "current handoff."
- Active canonical documents override archived implementation history.
- Do not read `resources/`, `design-reference/`, or `docs/archive/` unless the task
  specifically requires one of them. Archived plans are for owner-requested history or
  a relevant regression investigation, not routine context.
- Use the next unused stable id and the required date format when adding backlog items.
  Never renumber or reuse an id.

## Approval gate

Never edit a file without completing this gate for each coherent batch:

1. Inspect and reason read-only.
2. Present a file-by-file plan, including each change's cost, risk, and tradeoff.
3. Keep recommendations separate from implementation permission.
4. Wait for explicit approval covering that exact batch. Revised scope needs new approval.

## Change safety

- Run `node test/run-tests.js` immediately before and after every approved edit batch and
  report both assertion counts.
- If the post-change suite is red, revert the batch rather than patching forward.
- Preserve unrelated and uncommitted owner work.
- Treat the `==ENGINE-START==` / `==ENGINE-END==` block in `index.html` as frozen and
  DOM-free.
- Keep application JavaScript ES5-compatible and runnable directly from `file://`.
- Do not add a password gate to the hosted static page; it cannot protect files delivered
  with the page, and the URL contains no user data.
