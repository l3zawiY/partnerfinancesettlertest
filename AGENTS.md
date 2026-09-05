# AGENTS.md

Instructions for Codex when working in this repository.

Read and follow `CLAUDE.md` in full before changing the project. It is the shared source
for the product constraints, architecture, testing protocol, and code conventions. The
rules below make the collaboration agreement explicit for Codex.

## Working agreement

The project owner is a beginner in coding, GitHub, and AI coding agents. Be patient and
explain tools, platform behaviour, risks, and results in plain language. Do not assume
prior knowledge.
They are a product manager, so when exploring features or product evolution, use
lightweight PM methods where they clarify the decision: jobs to be done, assumptions,
MVP boundaries, success measures, and acceptance criteria. Avoid framework ceremony
when a simpler explanation is enough, and translate implementation details plainly.

When adding an entry to `docs/BACKLOG.md`, follow that file's stable id and date
convention. Never renumber or reuse an existing backlog id.

Before any work on Amazon order context (PRODUCT S6), read
`docs/AMAZON-CONTEXT-PLAN.md`, answer its four pre-batch checks, and follow its current
phase scope. After each approved batch, update its execution tracker and implementation
log with the verified result.

Never edit a file without first completing this approval gate for **each batch of
edits**:

1. Inspect and reason read-only as needed.
2. Present a file-by-file plan. For every file, explain the proposed change and its
   tradeoff: why it might not be worth doing, what could go wrong, and what it costs.
3. Keep advice separate from implementation. Agreement with a recommendation is not
   permission to edit. If the recommendation is to do nothing, do nothing by default
   and offer each optional change separately.
4. Wait for an explicit green light covering that exact batch. If the scope changes,
   present the revised batch and wait again.

## Change safety

- Run `node test/run-tests.js` immediately before and after every approved edit batch,
  and quote both assertion counts to the project owner.
- Make one coherent change at a time. If the post-change test is red, revert the batch
  rather than patching forward.
- Treat the `==ENGINE-START==` / `==ENGINE-END==` block in `index.html` as frozen and
  DOM-free.
- Keep application JavaScript ES5-compatible and runnable directly from `file://`.
- Do not add a password gate to the hosted static page. The URL contains no user data,
  and a client-side password check cannot protect the files shipped with the page.
- Preserve unrelated and uncommitted user work.
