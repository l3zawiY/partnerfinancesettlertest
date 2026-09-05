# CLAUDE.md

Operating instructions for anyone — human or agent — changing this project.
Read this before touching `index.html`.

---

## Working agreement

The project owner is a beginner in coding, GitHub, and AI coding agents. Explain tools,
platform behaviour, risks, and results in plain language; don't assume prior knowledge.
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

Before editing any file, follow this approval gate for **each batch of edits**:

1. Inspect and reason read-only as needed.
2. Present a file-by-file plan. For every file, explain the proposed change and its
   tradeoff: why it might not be worth doing, what could go wrong, and what it costs.
3. Keep advice separate from implementation. Agreement with a recommendation is not
   permission to edit. If the recommendation is to do nothing, do nothing by default
   and offer each optional change separately.
4. Wait for an explicit green light covering that exact batch. If the scope changes,
   present the revised batch and wait again.

After approval, follow the regression protocol below. Run `node test/run-tests.js`
immediately before and after every approved batch and quote both assertion counts to
the project owner. Make one coherent change at a time. If the post-change test is red,
revert the batch rather than patching forward.

One settled decision: do not add password protection to the hosted page. A static-page
password check is delivered to the visitor with the content it claims to protect, and
the URL contains no user data. See `PRODUCT.md` section 7 for the underlying product
decisions.

---

## What this is

A single-file, offline, no-account web tool that reconciles shared expenses between
two people who keep separate bank cards. Each person imports their own card
transactions, decides how each purchase splits, and exports a **redacted** file
containing only shared items. One of them loads both files and gets a settlement figure.

See `PRODUCT.md` for the problem being solved. See `docs/DATA-FORMATS.md` for the
JSON contracts.

---

## Hard invariants

These are not preferences. Breaking any of them is a defect, not a design change.

1. **No network calls, ever.** No `fetch`, no `XMLHttpRequest`, no CDN links, no
   analytics, no fonts loaded from a URL. The tool works with the network cable
   unplugged. Test T20 enforces this.
2. **No dependencies, no build step.** One HTML file, opened directly. No npm at
   runtime, no bundler, no framework, no TypeScript compile. Node is used only to run
   the test harness.
3. **Private purchases never leave the device.** An item split 100% to its card owner
   must be *absent* from the shared export — not hidden, not zeroed, absent. This is
   the whole reason the two people trust the tool.
4. **The LLM is not in the money path.** No model call computes, checks, or adjusts a
   settlement. Arithmetic is deterministic JavaScript.
5. **No real bank data in this repo.** Test fixtures are synthetic. No real merchant
   strings, no real amounts, no names. `.gitignore` covers the runtime files; don't
   defeat it.
6. **The running balance is never an amount.** TD's paste has a balance column. Reading
   it as the transaction amount produces plausible, entirely wrong rows. There is a
   guard that refuses such an import; don't remove it.
7. **Archives are append-only.** Once a month is closed, its archive is never rewritten.
   Losing a month is annoying; silently rewriting one corrupts every comparison built
   on it.

---

## Architecture map

`index.html` is one file in five sections, in this order:

| Section | Marker | Contents | Change frequency |
|---|---|---|---|
| Styles | `<style>` | CSS variables and layout | Occasional |
| Markup | `<body>` | Four step panels: Import, Review, Settle, Rules & files | Occasional |
| **Engine** | `==ENGINE-START==` / `==ENGINE-END==` | Pure functions: parsers, canonicalisation, coverage, date/money helpers. **No DOM access.** | **Rare — treat as frozen** |
| Fixtures & self-test | after `==ENGINE-END==` | Synthetic pastes and 31 assertions | When behaviour changes |
| App | after fixtures | State, rules, rendering, persistence, events | Most changes land here |

**The engine is deliberately DOM-free** so the test harness can load and exercise it in
Node without a browser. Any DOM access added inside the engine markers breaks
`test/run-tests.js`. Put it in the app section instead.

### Key concepts

- **`share`** — the fraction of a transaction the *card owner* bears. `1` = entirely
  theirs, never exported. `0.5` = even split. `0` = the partner owes all of it.
- **`amount`** — positive is money spent, negative is money returned. Both bank formats
  normalise into this convention on import.
- **`key`** — the canonical merchant identifier that rules match against. Derived from
  merchant family where one exists, otherwise the cleaned display name.
- **`family`** — a group of merchant name variants that mean the same thing
  (`uber-eats`, `uber-ride`, `amazon`). Families that split differently must stay
  separate: Uber Eats is not Uber rides.

---

## How to test

**In the browser:** open `index.html`, go to step 04, click **Run self-test**. Expect
31/31 green.

**Headless, for agents and CI:**

```bash
node test/run-tests.js
```

Exits `0` on all-green, `1` on any failure, and prints which assertion failed with
actual vs expected.

---

## Change protocol

Follow this in order. It exists because a wrong settlement figure is worse than a
missing feature — it looks correct.

1. Run `node test/run-tests.js` **before** changing anything. Record the baseline.
2. Make one coherent change. Don't bundle unrelated work.
3. Run the tests again. **Any red means revert, not patch forward.**
4. If you changed behaviour deliberately, update the assertion *and* say so in
   `CHANGELOG.md`. Never loosen an assertion to make it pass.
5. Bump `VERSION` in `index.html` and add a `CHANGELOG.md` entry.
6. Run the manual checklist in `docs/TESTING.md` for the area you touched.

### When adding a test

Add it to `runSelfTest()` with a `T`-prefixed id and a one-line label describing the
*behaviour*, not the implementation. If a test needs new fixture data, recompute the
affected totals — several assertions share the same fixture.

---

## Code conventions

- ES5-compatible syntax: `var`, `function`, no arrow functions, no template literals,
  no optional chaining. The file must run from `file://` in any browser without
  transpilation.
- No classes. Plain functions and one `state` object.
- `esc()` every user-derived string before it reaches `innerHTML`. Merchant names come
  from pasted text and are untrusted input.
- Comments explain *why*, especially where the code looks wrong but isn't. The
  refund-pairing precedence and the explicit city list both have non-obvious reasons.

---

## Common tasks

**Adding a merchant family** — add to `FAMILIES` in the engine. Order matters: more
specific patterns first (`UBEREATS` must precede the bare `UBER CANADA` pattern).
Families are matched against the *original* description, before processor prefixes are
stripped.

**Adding a payment processor** — add to `PROCESSORS`. The prefix is stripped from the
display name but retained as a detail (`via Square`).

**Adding a bank** — write a new `parseXYZ(text, opts)` in the engine returning
`{rows, dropped, blocks, ranges, tabs}`, add it to `parsePaste()`, add an option to the
bank `<select>`, and add a synthetic fixture plus assertions.

**Changing a data format** — read `docs/DATA-FORMATS.md` first. Additive changes only.
Never rename or repurpose an existing field. `applySession()` must keep reading older
versions.

---

## Deliberately not here

Don't add these without a conversation; each was considered and rejected for a reason
recorded in `PRODUCT.md`.

- A backend, accounts, or any server-side storage
- Live bank connections or transaction aggregators
- An AI agent that decides splits — the intent behind a purchase exists only in the
  users' heads
- Budgeting, forecasting, or category charts (analytics belongs in a **separate** tool
  reading archive files, so it can never break settlement)
- A browser extension or scraper for bank pages
- Payment execution
