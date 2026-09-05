# Split Ledger

A single-file, offline tool for reconciling shared expenses between two people who keep
separate bank cards.

Each person imports their own card transactions, decides how each purchase splits, and
exports a file containing **only the shared items**. One of them loads both files and
gets a settlement figure. Personal purchases never leave the device they were tagged on.

No accounts. No server. No dependencies. No network calls of any kind.

---

## Run it

Open `index.html` in a browser. That's the whole setup.

To try it without real data, use the **Sample TD** / **Sample BMO** buttons on step 01.

For the second person, either share the hosted URL or send them the file — either way
they need nothing else.

---

## The monthly loop

**Both people, independently:**

1. Set the period, e.g. `2026-07`
2. Pick the bank and card, paste the transaction table straight from the bank page
3. Repeat for the second card
4. Check the parsed count and total against what the bank shows
5. Review — most rows are pre-decided by rules; tag the rest with `1`–`5` and `J`/`K`
6. Download the shared file

**Then the settler:**

7. Load the partner's file
8. Work through the pre-settlement checks
9. **Close month** — downloads the archive and records the settlement

The tool auto-saves as you go, so step 5 can be spread over days. If you finish before
your partner sends their file, close the tab and come back — the banner will tell you
where you left off.

---

## Files

| Path | What |
|---|---|
| `index.html` | The entire application |
| `CLAUDE.md` | Operating instructions and invariants — read before changing anything |
| `PRODUCT.md` | Problem, users, jobs to be done, requirements, decisions |
| `docs/DATA-FORMATS.md` | The three JSON contracts |
| `docs/TESTING.md` | Test plan and manual checklist |
| `test/run-tests.js` | Headless test harness |
| `CHANGELOG.md` | Version history |

---

## Tests

```bash
node test/run-tests.js
```

Behavioural assertions over synthetic fixtures. Also runnable in-browser from step 04;
the command reports the current total.

Fixtures are synthetic on purpose — this repo is hostable publicly, and real bank
statements have no business in one.

---

## Data and privacy

Three files exist at runtime, with different sensitivities:

| File | Contains | Goes where |
|---|---|---|
| **Session** | Everything, including private purchases | Your own device or **private** cloud folder only |
| **Shared export** | Only shared items | Sent to the other person |
| **Month archive** | Only shared items, both sides, plus the settlement | Kept by the settler, feeds analytics later |

**Never put the session file in a folder shared with the other person.** That single
mistake defeats the entire privacy model.

None of these are committed — see `.gitignore`.

---

## Hosting

Any static host works, since the tool is one file that never calls out. GitHub Pages is
the simple option: push, enable Pages, bookmark the URL.

Hosting the code is not hosting the data — the page is served, then everything runs in
your browser exactly as it does locally.

If the repo is public, keep it clean: no names, no amounts, no real merchant strings.
Names are configured in the app and live in browser storage, not in the source.

---

## Deliberate non-features

No backend. No bank connections. No AI deciding splits. No budgeting or charts inside
this tool — analytics belongs in a separate tool reading archive files, so it can never
break settlement. Reasoning for each is in `PRODUCT.md`.
