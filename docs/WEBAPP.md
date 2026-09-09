# Web-service experiment

This is the canonical plan and continuation guide for the web-service experiment. Keep
it current instead of creating session handoffs or a separate plan for every batch.

## Current status — 2026-09-08

Batches 1 through 4b are complete and locally verified — by automated tests and, for the
web app, by the owner in a browser. Batches 1 and 2 are committed and pushed; **Batches 3,
4a, and 4b are implemented, verified, and about to be committed** in this session. Batch 4
turned out large enough that, per the roadmap's own note that it "may be split into
Import and Review after inspection," it is now split three ways: 4a (the parsing engine)
and 4b (dedup, rules, refund pairing, review UI) are done; 4c (Amazon matching, local
draft persistence, export formats, amount correction) is proposed scope, not started.

- Stable v1.0.0 remains the single-file `index.html` application on `main` at commit
  `8beb443`. It is the behavioral reference, is untouched by this branch, and passes 81/81.
  Batches 4a and 4b do not modify `index.html` at all — they read it (to prove parity) but
  never write to it.
- Commits on this branch before this session, oldest first: `8781ff4` safety commit,
  `74b3ce5` authenticated foundation, `3eb56bb` telemetry boundary, `8e8336b`
  documentation split, `7dcda00` household authorization and local database. All pushed.
- Web-app gate at this point: three TypeScript projects type-check, 50 tests pass (up from
  13 at the start of Batch 3), and the production build succeeds. Run `npm run check` in
  `webapp/`.
- Verified by the owner in a browser on 2026-09-08: submitted two fictional shared entries
  (Batch 3) and saw them persist and list correctly; pasted a fictional BMO statement (1
  row, "Sample Restaurant", $146.67) and a fictional TD statement (2 rows, "Farm Boy"
  $84.26 and "Annual Cash Back" -$20.00) into the "Parse locally" panel (Batch 4a) and got
  exactly the expected merchant names, categories, and amounts; then exercised dedup,
  rules, refund pairing, and the no-persistence limitation in the Batch 4b review screen —
  catching and leading to a fix for a credit-row display bug (see the Batch 4b section).
- The owner holds Clerk development keys in ignored `webapp/.env.local`. Confirm the file
  exists without reading it. Do not record Clerk user or organization IDs in the repository.
- Verified by the owner in a browser: sign-in, sign-out, and two accounts in two separate
  organizations each seeing only their own household records.
- Not yet verified: two accounts in the *same* organization both seeing that household. It
  needs a member added to an existing organization in the Clerk Dashboard.
- Deferred by owner decision: closing Clerk enrollment to invite-only. The Development
  instance holds no real data and stays open for now. Required before production; tracked in
  Batch 6 and the open-risks list. Do not put real financial data in that instance.
- Local development database: one SQLite file under ignored `webapp/.wrangler/`. It is not
  in any cloud. `npm run db:migrate:local` applies the schema; deleting the file loses only
  fictional rows. Batch 3 added a second migration to that same local file.
- Owner explainers, published outside the repository. The repository documents stay
  canonical; these teach.
  - Batch 1: https://claude.ai/code/artifact/21d6c4df-322c-44a5-8174-56d9462314c9
  - Batch 2: https://claude.ai/code/artifact/c97caed7-8246-4b79-817a-af2196b543f9
- `resources/` (about 92 MB) and `design-reference/` (about 1.7 MB) remain local-only and
  ignored, with no backup from this branch.

## How to continue in a new coding-agent session

1. Read `AGENTS.md`, then `CLAUDE.md`, in full.
2. Read this document and `docs/WEBAPP-BACKLOG.md`. Inspect the working tree and current
   branch. Preserve all uncommitted owner work.
3. Read nothing else by default; context spent on the wrong documents is context lost. Add
   a document only when the task needs it:
   - `docs/DATA-FORMATS.md` — before defining any shared payload, from Batch 3 onward.
   - `PRODUCT.md` and `docs/BACKLOG.md` — for Batch 4 parity work, or any `index.html` task.
   - `docs/TESTING.md` — when changing commands or test expectations.
   - `README.md`, `CHANGELOG.md`, `VERSION` — only for a real v1 release change.
   - `resources/`, `design-reference/`, `docs/archive/` — only on owner request, or when a
     specific asset or regression investigation requires the evidence.
4. Confirm that `webapp/.env.local` exists without reading, displaying, copying, or
   committing its contents. Only `.env.example` is a public template.
5. Before editing, run `node test/run-tests.js`, inspect and reason read-only, present an
   exact file-by-file batch plan with cost, risk, and tradeoffs, and wait for explicit
   approval. Run the same legacy test immediately after the batch. If it fails, revert
   that batch rather than patching forward.
6. Also run `npm run check` in `webapp/` for web-app batches and `git diff --check` before
   handoff.
7. Do not commit, tag, push, deploy, change account settings, or delete local material
   without explicit permission for that action.
8. At the end of every batch, update the status, evidence, decisions, and next step here
   so another session can resume without relying on chat history.

The owner is a seasoned product manager and a beginner coder. Explain each architectural
concept in plain language, show the meaningful alternatives and their pros/cons, and state
why one is recommended. The coding agent may do the implementation, but should make the
code and decisions understandable. Prefer one substantial, reviewable batch over many
tiny iterations.

## Goal, privacy boundary, and non-goals

The experiment asks whether a small hosted service can replace manual shared-file
exchange while keeping each partner's private financial history out of the cloud. It is
also a structured way to learn frontend, backend, APIs, authentication, databases,
testing, and deployment.

Only information intentionally shared with a partner may reach the backend. Raw bank
paste, complete ledgers, private items, Amazon context, categorization rules, and unfinished
drafts must stay in the browser. Do not add analytics, telemetry, advertising trackers, or
server logs containing financial values.

This is not a rewrite-for-its-own-sake, a multi-developer architecture, a mobile app, a
subscription business, or an immediate replacement for v1. The experiment must preserve
portable exports and a practical route back to the static version.

## Architecture in plain language

```text
Browser
  React + TypeScript frontend
  - draws screens and handles clicks
  - performs private import/review work locally (later batches)
  - asks Clerk for a short-lived proof of sign-in
          |
          | HTTPS request to /api/* with proof of sign-in
          v
Cloudflare Worker backend
  - is the trusted gatekeeper running on the internet
  - verifies the Clerk proof; never trusts a user ID supplied by the browser
  - applies household permissions and workflow rules
  - reads/writes deliberately shared data only
          |
          v
Cloudflare D1 database (from Batch 2)
  - stores household/workflow/shared records
  - stores no raw private financial history

Clerk
  - owns sign-up/sign-in screens, sessions, passwordless login, and invitations
  - later supplies the household/organization membership used for authorization
```

The **frontend** is code downloaded into the browser. It is responsible for presentation
and immediate interaction, but it cannot be trusted to grant access because a user can
modify browser code. The **backend** is code on Cloudflare's servers. It is the authority:
it checks identity and permission before returning or changing shared data. An **API** is
the small, documented vocabulary they use to communicate—for example, `GET /api/me` asks
the backend who the currently signed-in user is.

The Worker serves both the compiled frontend and `/api/*` routes from one deployment.
The code layers stay separate, but using one origin avoids CORS configuration, duplicated
deployments, and extra operational concepts.

## Decisions, alternatives, and reasoning

| Choice | Alternatives considered | Why this path |
|---|---|---|
| Experiment branch in the existing repository | Change `main`; create another repository | A branch protects v1 while keeping history and parity tests nearby. A new repository would add coordination without useful isolation yet. |
| React + TypeScript + Vite | Continue one HTML file; Next.js | React matches the v0-style prototype and teaches components. TypeScript catches interface mistakes. Vite is smaller and easier to see through than Next.js because Cloudflare already provides the backend. |
| TypeScript for frontend and backend | Different backend language such as Python | One language reduces beginner overhead while still teaching the frontend/backend boundary. The boundary is the API, not the programming language. |
| Cloudflare Worker serves assets and API | Vercel frontend plus separate Worker; traditional server | One deploy and one origin keep cost and operations low. We can split services later only if a real constraint appears. |
| Clerk authentication | Build passwords; Cloudflare Access; Supabase/Firebase/Auth0 auth | Building authentication is security-sensitive. Clerk offers the least custom credential code and usable invitation/organization concepts. Access protects a site but is a poorer product login; broader platforms add overlapping services. |
| Passwordless, invite-only enrollment | Open public sign-up; custom allow-list | Fits a private partner tool and limits unwanted accounts. The first owner account had to be created before closing enrollment. |
| One Clerk Organization represents one household | Home-grown membership first | Clerk can establish who belongs together; the Worker still enforces which records that organization can access. Validate this model in Batch 2 before depending on it widely. |
| Real SQLite in tests, not a hand-written fake database | `@cloudflare/vitest-pool-workers`; a fake D1 object | D1 is SQLite and Node ships a SQLite engine, so tests execute the real migration and the real `WHERE` clause. A fake would implement whatever filtering we told it to, making a cross-household test prove nothing. The pool plugin runs tests inside workerd, which is stronger still, but it requires Vitest 4 and this project is on Vitest 5. Revisit when it supports Vitest 5. |
| Separate TypeScript project for tests | One config covering runtime and test code | The Worker config deliberately excludes Node types, so nobody can write `process.env` in Worker code and have it compile — the exact mistake the telemetry work uncovered. Tests need Node APIs, so they get their own config rather than weakening that guard. |
| Cloudflare D1 for shared records | Browser-only files; another hosted database | D1 integrates with the Worker and has a useful free tier. A database is justified only for shared coordination, not private source data. |
| Reuse the v1 interface, never redesign it | Design a new web interface; restyle during the port | `index.html` carries an owner-accepted UX and visual language that already works monthly. Batch 4 ports that interface; it does not redesign it. `design-reference/` is inspiration only if a genuine gap appears, and is not a licence to restyle. Changing behaviour and appearance at the same time also makes parity failures impossible to diagnose. |
| Plain CSS initially | Tailwind or a component framework | Keeps one learning layer visible and reuses the settled visual language. Add a styling framework only if repetition becomes a demonstrated problem. |
| Existing export formats remain portable | Cloud-only state | Exports support audit, recovery, parity checking, and a return to v1. |
| Telemetry disabled in code rather than by environment variable | Clerk's documented `CLERK_TELEMETRY_DISABLED`; leaving SDK defaults | Neither a Worker nor a browser has `process.env`, so the documented variable silently does nothing here. Explicit code options are the only controls that take effect, and unlike an environment variable they can be asserted by a test. |
| No analytics | Product analytics from the start | Financial privacy and simplicity matter more during a tiny invite-only pilot. Use direct feedback and privacy-safe operational errors. |

## Batch roadmap

Each batch should produce a vertical slice that can be explained, tested, and, after
separate permission, committed. Scope may change after inspection, but any revised file
plan must pass the repository approval gate.

### Batch 1 — Authenticated frontend-to-backend foundation (implemented, finishing)

Learning objective: see the full request path without mixing in a database or financial
logic.

Delivered:

- A small React + TypeScript interface with Clerk signed-in/signed-out states.
- A TypeScript Cloudflare Worker serving the frontend and `GET /api/me`.
- Server-side Clerk token verification with a deliberately small, no-store response.
- Dependency lockfile, Cloudflare/Vite configuration, public environment template, and
  injected-verifier backend tests that never call Clerk.
- Documentation routes in `CLAUDE.md` and web-app commands in `docs/TESTING.md`.

Finish in this order:

1. Deferred to pre-production by owner decision on 2026-09-07. Clerk enrollment stays
   open on the Development instance, which contains no real data. Invite-only enrollment
   must be configured on the Production instance before any real pilot, and is tracked in
   Batch 6 and the open-risks list.
2. Done. Clerk's controls were verified against both the installed packages and Clerk's
   published telemetry documentation. The documented `CLERK_TELEMETRY_DISABLED` variable
   is read from `process.env`, which exists in neither a Worker nor the browser, so
   `shared/telemetry.ts` supplies explicit code options to both layers instead. Wrangler's
   own metrics are disabled with `WRANGLER_SEND_METRICS=false` in the `dev` and `build`
   scripts; its error reporting already defaults to off. `worker/telemetry.test.ts`
   asserts the boundary.
3. Done. `/api/me` rejects a request with no token and one with an invalid token, and the
   owner confirmed in the browser that signing out removes the protected result.
4. Done. `npm run check`, `node test/run-tests.js`, and `git diff --check` all passed, and
   no secret is tracked. Only `.env.example` is committed.
5. Done. Committed as two commits by owner request: `Build authenticated React-to-Worker
   foundation`, then `Disable Clerk and Wrangler telemetry`. Push was not requested.

Batch 1 is closed. Do not add D1, organizations, or financial fields to it retroactively;
that work belongs to Batch 2.

### Batch 2 — Household membership and an empty local database (implemented, unreviewed)

Learning objective: distinguish authentication (who are you?) from authorization (which
household may you access?) and persistence (what survives a reload?).

Delivered:

- `migrations/0001_households.sql`: a `households` table keyed by Clerk organization id and
  a fictional `household_notes` table, with an index matching the only access pattern.
- `worker/db.ts`: a typed access layer whose every function takes the household id as an
  explicit argument. It depends on a narrow `SqlDatabase` interface rather than on D1.
- `GET /api/household`: verifies the session, refuses `403` when there is no active
  organization, then reads only that household's rows. The route creates the household row
  on first read and is safe to repeat.
- `worker/testing/sqliteDatabase.ts`: an in-memory SQLite database that applies the real
  migration, with foreign keys enabled to match D1.
- `worker/household.test.ts`: seven assertions covering no session, no household, repeat
  safety, scoped reads, cross-household denial, method refusal, and `no-store`.
- Frontend: an `OrganizationSwitcher` and a household panel that reloads when the active
  organization changes.
- `tsconfig.test.json` so tests may use Node APIs while Worker code still may not.

Evidence: legacy suite 81/81 before and after; web-app type checking across three projects,
13 tests (up from 6), and a production build passed. The migration applied to a real local
D1 and both tables plus the index exist there. Against the running Worker with the real D1
binding, `/api/household` returned `401` signed out and `405` for `POST`. Deleting the
`WHERE household_id = ?` filter was verified to fail two tests, so they are not vacuous.

Owner verification on 2026-09-07: Organizations enabled in the Development instance. Two
separate accounts each signed in, each created its own organization, and each saw only its
own household with a distinct organization id and an empty record list. This proves the
per-session household boundary against real Clerk sessions and a real local D1.

Still unproven: the actual partner case, where two accounts are members of the *same*
organization and must both see the same household. That needs an invitation rather than a
second organization, and is the last Batch 2 verification. Cross-household denial in a real
browser also remains proven only by the automated tests, because a second organization
cannot currently be reached from a session that does not belong to it.

Original scope, for reference:

- Enable and configure Clerk Organizations; create/invite a two-person test household.
- Add a local D1 database, versioned SQL migration, and typed access layer.
- Decide the minimum schema after inspection. Prefer Clerk organization IDs as household
  boundaries; avoid copying profile data or building a second membership system unless a
  demonstrated need requires it.
- Add a protected household endpoint returning only non-financial test metadata.
- Test missing session, missing organization, wrong organization, valid membership, and
  cross-household denial using fakes/local D1.
- Use fictional records only. Do not create real shared-finance storage yet.

Main risk: confusing identity with data access. Every database query must be scoped by
the verified organization on the server; a household ID sent by the browser is never
sufficient authorization.

### Batch 3 — Fictional shared-submission vertical slice (implemented, uncommitted)

Learning objective: build one complete feature through UI, API, business logic, and D1.

Delivered:

- `migrations/0002_shared_entries.sql`: a `shared_entries` table (fictional data only,
  same spirit as `household_notes`) with `amount_cents` as an integer — money is never a
  float anywhere in this path — a `version` counter, and an index matching the only read
  pattern, mirroring `0001_households.sql`'s conventions.
- `shared/settlement.ts`: a pure, deterministic `computeSettlement()` function with no DOM
  and no database access, adapted from the `aClaim`/`bClaim`/`net`/`direction` logic in
  `index.html`'s `buildArchive()`. It works entirely in integer cents and groups by
  submitter id rather than a hardcoded two-name shape, since this module has no way to
  know who a household's members are.
- `shared/api.ts`: runtime-validated request/response contracts for the new endpoint
  (`SharedEntrySubmission`, `SharedEntryResponse`, `SharedEntriesListResponse`), following
  the existing hand-written-guard convention (`isHouseholdResponse` and siblings).
- `worker/db.ts`: `upsertSharedEntry` (an idempotent create-or-edit: the client-generated
  `id` is the idempotency key, and re-submitting it with the same household is a safe
  retry that never lets one household overwrite another's row even on an `id` collision)
  and `listSharedEntries`, both household-scoped like Batch 2's functions.
- `worker/index.ts`: `GET /api/shared-entries` (list plus the computed settlement) and
  `POST /api/shared-entries` (validate, then upsert), using the same authenticate-then-
  authorize order and `no-store` response as `/api/household`.
- `worker/shared-entries.test.ts` (16 assertions) and `shared/settlement.test.ts` (9
  assertions): no session, no household, wrong method, invalid body (non-integer cents,
  out-of-range share), create, idempotent retry, edit, cross-household write denial,
  settlement math for two submitters and the undetermined edge cases (0, 1, 3+
  submitters), and a floating-point-drift regression case for the settlement module.
- `worker/testing/sqliteDatabase.ts`: applies both migrations in order and adds
  `seedSharedEntry`, matching `seedNote`'s role.
- Frontend: a minimal, functional (not restyled) panel to submit one fictional shared
  entry and see the household's entries and settlement — enough to exercise the slice in
  a browser, not a port of the v1 interface (that is Batch 4).

Evidence: legacy suite 81/81 before and after; web-app type checking across three
projects, 33 tests (up from 13, all passing), and a production build passed. The migration
applied cleanly to the real local D1. Against the running local Worker with the real D1
binding, `GET /api/shared-entries`, `GET /api/me`, and `POST /api/shared-entries` each
returned `401` signed out, matching the automated no-session assertions.

Verified by the owner in a browser on 2026-09-08: signed in, submitted two fictional
shared entries with different merchants, and saw both persist and list correctly. Not yet
committed, pending an explicit go-ahead.

A design note for the next session: `upsertSharedEntry` bumps `version` on every write,
including a retry with byte-identical fields — it cannot tell "identical retry" from "real
edit" apart, because no version history is retained. That distinction, plus
replace/withdraw/lock semantics, is explicitly deferred to Batch 5.

### Batch 4a — Import parsing engine, ported and proven against v1 (implemented, uncommitted)

Learning objective: migrate mature browser behavior without weakening privacy or silently
changing results — starting with the highest-value, lowest-risk slice: the parser itself.

Delivered:

- `shared/engine.ts`: a typed, line-by-line port of the pure, DOM-free code between the
  `==ENGINE-START==`/`==ENGINE-END==` markers in `index.html` — `canonicalise`, `parseTD`,
  `parseBMO`, `parseGeneric`, `parsePaste`, `balanceViolations`, `mergeRanges`,
  `coverageGap`, and their constants (`PROCESSORS`, `FAMILIES`, `CATEGORIES`,
  `EXCLUDE_DEFAULT`, etc.). Every regex and bank-specific comment is unchanged; this is a
  translation, not a rewrite. `index.html` itself was not modified.
- `shared/engine.parity.test.ts` (6 assertions): rather than hand-typing expected outputs
  (which could bake in the same porting mistake on both sides), this test reads
  `index.html`'s actual source at test time, runs the real `==ENGINE-START==`/`==ENGINE-END==`
  block in a Node `vm` sandbox, and asserts it produces byte-identical results to
  `shared/engine.ts` on the same fixture statements (a TD block, a BMO block, the generic
  fallback, several merchant-canonicalisation cases, a contrived balance-violation row, and
  a coverage-gap case). If a future edit to either side breaks agreement, this fails — the
  "parity fixtures against v1" the roadmap calls for, enforced by a test rather than a
  one-time comparison.
- `src/Import.tsx`: a minimal panel — bank selector, card-label field, paste box, "Parse
  locally" button — that calls the ported engine directly in the browser and lists the
  resulting rows, dropped-line count, and any balance-violation refusal. It has no submit
  action and makes no network request; parsing is entirely on-device, matching the private
  data boundary from day one of this batch rather than as an afterthought.

Evidence: legacy suite 81/81 before and after; web-app type checking across three
projects, 39 tests (up from 33 after Batch 3), and a production build passed.

Verified by the owner in a browser on 2026-09-08: pasted a fictional BMO statement (1 row,
"Sample Restaurant", $146.67) and a fictional TD statement (2 rows, "Farm Boy" $84.26 and
"Annual Cash Back" -$20.00) and got exactly the expected merchant names, categories, and
amounts. A side-by-side paste of a real statement into `index.html` itself is still worth
doing at some point, but the vm-based parity test already proves agreement against v1's
actual code, so this is a nice-to-have rather than a gap. Not yet committed, pending an
explicit go-ahead.

### Batch 4b — Dedup, rules, refund pairing, and a review screen (implemented, uncommitted)

Learning objective: the roadmap flagged Batch 4 as "likely the highest-risk batch" that
"may be split... after inspection." Having now read the full 3,400-line file, that
judgment held even for the remaining piece — rules, refund pairing, Amazon order
matching, the review UI, and local autosave/session persistence are each substantial and
mostly independent of one another. This batch takes dedup, rules, refund pairing, and a
working (if unsaved) review screen; Amazon matching, local persistence, export formats,
and manual amount correction move to Batch 4c.

Delivered:

- `shared/importMerge.ts`: a pure port of the dedup/period-filter core of `doImport()`.
  Unlike the engine or the rules below, `doImport()` is itself entangled with the DOM
  (reads `#pasteBox`, writes result HTML, calls `renderAll()`), so there is no way to load
  the real function into a sandbox and run it standalone the way `engine.parity.test.ts`
  does. This module is the computation lifted out by hand, covered instead by
  `importMerge.test.ts` (7 assertions) reasoning through each case directly: fresh add,
  exact duplicate, paste-internal duplicate, pending-to-posted upgrade, an already-posted
  duplicate (no upgrade), and out-of-period rows set aside rather than dropped.
- `shared/rules.ts`: a parameterized port of `ruleFor`, `rememberRule`, `hasRule`,
  `applyRules`, and the `ruleEligible` gate. v1 reads and mutates a global `state`
  directly; this takes plain arrays and returns new ones, matching how React expects
  state to be treated as immutable — the matching logic itself (family match first, then
  longest-pattern key match, instalments never eligible) is unchanged.
- `shared/refunds.ts`: a parameterized port of `pairFor`, `pairRefunds`,
  `creditDaysAfter`, `isNonSpendingCredit`, and `REFUND_WINDOW_DAYS` — same
  immutable-array treatment. Also defines `LedgerRow`, the type for a row once refund
  fields exist, and `toLedgerRow()` to promote a freshly parsed row into one.
- `shared/ledger.parity.test.ts` (4 assertions): loads index.html's actual rules/refunds
  code into a sandbox, seeds a `state` object exactly as the real app would, runs the
  real `applyRules()`/`pairRefunds()`, and compares to `rules.ts`/`refunds.ts` on the
  same fixture rows — same proof-by-real-code technique as `engine.parity.test.ts`.
- `src/Import.tsx` (rewritten): the Batch 4a paste-and-parse demo now merges parsed rows
  into an in-memory ledger (deduped, rule-decided, refund-paired), and each charge row
  gets "50/50" / "Private" / a custom-share input, each with an optional "remember"
  checkbox that writes a merchant rule. No submit button, no network call, and no
  persistence — the ledger lives in React state only and is lost on reload. That gap is
  called out in the panel's own copy, not hidden.

A bug the owner's browser testing caught before this was committed: the first version of
`Import.tsx` offered decide buttons on every row, including credits (refunds and
cashback). v1 never lets a credit be manually decided — `pairRefunds()` always resolves
it, either by inheriting the matched charge's split or by excluding it entirely
(`share: null` for cashback/rewards, per `index.html:2280` and the credit-treatment text
at `index.html:2360-2363`). The UI's share-label logic also didn't handle `share === null`
and computed a nonsense "Shared 100%" from JavaScript's `1 - null` coercion. Fixed by
hiding the decide controls on any row with a negative amount and showing the same
excluded/refund-offset explanation text v1 uses instead. This particular class of bug —
correct data, wrong presentation — sits below the pure-function test suite (`Import.tsx`
has no automated coverage; see WEB-001 for the same DOM-test-dependency tradeoff from
Batch 1), so the manual click-through in "Manual verification" below is what actually
caught it, not `npm run check`.

Evidence: legacy suite 81/81 before and after; web-app type checking across three
projects, 50 tests (up from 39 after Batch 4a), and a production build passed.

Verified by the owner in a browser on 2026-09-08: pasted a TD statement, decided a share,
re-pasted the same statement (0 added, 2 already on the ledger — dedup held), pasted a
second statement containing a matching charge/refund pair (the refund correctly showed
"refund of 2026-07-10 Sample Alpha Store" and inherited the charge's share), and
confirmed reloading the page empties the ledger, matching the documented no-persistence
limitation. This pass is what surfaced the credit-row bug described above.

A design note for the next session: deciding a share client-side re-runs `applyRules`
over the whole ledger so refund pairing stays consistent (a refund's share follows its
matched charge's share). That is the same order v1 uses, just invoked more often — from a
UI event instead of only after an import — which is fine because both functions are
already pure and cheap at the row counts this tool handles.

### Batch 4c — Amazon matching, local persistence, export formats, and amount correction (proposed, not started)

Proposed scope, in roughly this order:

- Port Amazon order-paste parsing and matching (`parseAmazonOrders`, `matchAmazonOrders`,
  and neighbors) as a pure module, parity-tested the same way. Normalized Amazon context
  and raw paste must stay browser-only per invariant 9 — this module produces evidence
  only and must not choose a split, per invariant 4.
- Port `canEditAmount`/`amountEdited` and the manual amount-correction flow.
- Decide and implement local draft persistence (session autosave/load, matching
  `split-ledger-session/v3` where practical) — this is also where WEB-003 (the offline
  story) needs a real decision, not a deferral. Right now closing the tab loses the
  in-progress ledger entirely, which is a real regression from v1 that this batch must
  close before the web app could replace it for actual use.
- Preserve the established export formats (`split-ledger/v1`, `split-ledger-archive/v1`)
  so a portable route back to v1 stays real, not aspirational.
- Keep raw input and private line items client-side; any future API call must carry only
  an explicit shared projection, never a full imported statement.

The frozen engine markers in `index.html` remain untouched throughout Batches 4a-4c — all
three port from them, never edit them.

### Batch 5 — Partner workflow, close, portability, and recovery

Learning objective: model a multi-person workflow and its failure cases.

Proposed scope:

- Add partner readiness/submission state and clear pre-close checks.
- Define whether a submission can be replaced, withdrawn, or locked and show that state
  explicitly.
- Make close/finalization auditable and append-only where practical; prevent double-close
  and handle retries safely.
- Produce portable exports/archives compatible with the recovery strategy.
- Test stale tabs, interrupted requests, duplicate requests, partner disagreement,
  unauthorized access, and recovery from an export.

No destructive cloud-only workflow is acceptable without a tested export and restore
story.

### Batch 6 — Production deployment and parallel pilot

Learning objective: understand environments, secrets, domains, deployment, monitoring,
and rollback.

Proposed scope:

- Create production Cloudflare resources and apply reviewed D1 migrations.
- Configure production Clerk keys, invite-only access, allowed origins, and an owned
  custom domain. Keep secrets in provider configuration, never Git.
- Add privacy-safe operational error reporting without transaction content.
- Document deploy, rollback, export, restore, and account-recovery steps.
- Run v1 and the web service in parallel with fictional data first, then a deliberately
  limited real pilot for roughly two or three settlement cycles.
- Make an explicit keep/stop/cutover decision based on reliability, privacy, effort, and
  actual workflow improvement. Do not retire v1 automatically.

## Files and commands introduced in Batch 1

```text
webapp/
  src/                 React frontend
  worker/              Cloudflare backend and authentication boundary
  shared/              API types and telemetry settings safe for both layers
  package.json         scripts and dependencies
  package-lock.json    exact dependency resolution
  vite.config.ts       React + Cloudflare build/dev integration
  vitest.config.ts     backend test setup
  wrangler.jsonc       Worker/static-assets configuration
  .env.example         public variable-name template only
```

Toolchain recorded for reproducibility: Node.js 22.14.0 and npm 10.9.2 were used.
Important direct packages at Batch 1 are React 19, TypeScript 7, Vite 8, Vitest 5,
Wrangler 4, the Cloudflare Vite plugin, and Clerk's React/backend SDKs. The lockfile is
the authoritative exact dependency record; `npm install` reported no known vulnerabilities
at installation time.

From `webapp/`:

```bash
npm install       # install the lockfile dependencies
npm run dev       # local frontend + Worker development server
npm run typecheck # TypeScript only
npm test          # web-app tests only
npm run build     # production compilation only
npm run check     # typecheck + tests + build
```

From the repository root:

```bash
node test/run-tests.js
git diff --check
git status --short --branch
```

`WRANGLER_LOG_PATH` is set by the npm scripts to a repository-local ignored directory so
the tooling does not need to write logs in the user's protected home Library.

## Secrets and local setup

1. Use a Clerk **Development** instance for local work.
2. Copy `webapp/.env.example` to `webapp/.env.local`.
3. Put the development publishable key and secret key directly in `.env.local`. The
   publishable value is browser-visible; the secret must remain backend-only.
4. Never paste secrets into chat, screenshots, documentation, test fixtures, source code,
   or Git. Vite exposes variables prefixed `VITE_` to browser code, so a secret must never
   use that prefix.
5. Extra local environment-file copies are ignored, but they may still contain secrets
   and should not be retained unnecessarily. Do not delete an owner's file without
   approval.

## Cost expectation

Local development is free. The intended pilot should fit the free tiers of Clerk,
Cloudflare Workers, and D1, subject to their current limits and terms. A Vercel subdomain
could be free, but this architecture does not need Vercel; production Clerk configuration
generally makes an owned domain the sensible path. Expect roughly USD 10–25 per year for
a domain and USD 0 per month while usage stays within free tiers. Re-check provider prices
and limits immediately before production because they can change.

The real cost is maintenance and learning time: dependency updates, authentication and
authorization testing, backups, migrations, and incident recovery. The migration is only
worth keeping if shared workflow and remote access improve enough to justify that ongoing
surface area.

## Documentation policy

- Keep this one living document for architecture, roadmap, status, decisions, operational
  setup, and the next-session continuation point.
- Unresolved web work that is not already scheduled in a batch goes to
  `docs/WEBAPP-BACKLOG.md` under `WEB-###` ids. Keep `docs/BACKLOG.md` for `index.html`.
- The shared v1 documents stay dedicated to `index.html`. `README.md` and `docs/BACKLOG.md`
  carry only a pointer to the web documents; nothing was removed from them, because
  `PRODUCT.md` and the v1 backlog remain the parity specification for Batch 4.
- Update `CLAUDE.md` only for durable instructions that every agent must follow.
- Update `docs/TESTING.md` only when commands or test expectations change.
- Update `PRODUCT.md`, `README.md`, `CHANGELOG.md`, `VERSION`, and `docs/BACKLOG.md` only
  when their established routing rules or a real product/release change requires it.
- Treat code, types, SQL migrations, tests, the dependency lockfile, and Git history as
  implementation evidence. Do not duplicate their full contents in prose.
- Do not create chronological handoff files, session diaries, or per-batch plan documents.
  This avoids documentation bloat while leaving one obvious place for Claude or Codex to
  resume.

## Open risks and decisions to revisit

- The ignored local reference folders are not backed up by this branch.
- Clerk and Cloudflare free-tier limits, production-domain requirements, and SDK behavior
  may change; verify from official documentation before deployment.
- Telemetry is off and asserted, but the two assertions differ in strength. The Worker
  test constructs a real Clerk collector and checks it is disabled; the browser test only
  checks the shared setting, because rendering `ClerkProvider` in a test would add a DOM
  testing dependency. Deleting the prop from `main.tsx` would therefore not fail the
  suite. Revisit if the frontend grows a DOM test setup for other reasons.
- `WRANGLER_SEND_METRICS=false` is set in the repository's npm scripts, so a bare
  `npx wrangler` command run outside those scripts is not covered by it.
- Clerk enrollment is deliberately still open on the Development instance. Anyone who
  learns the development sign-up URL could create an account there. This is acceptable
  only while the instance holds no real data, and must be closed before a production
  pilot. Do not reuse the Development instance for real financial data.
- Organization-as-household is implemented but still unproven until two real accounts sign
  in to the same organization. The server-side boundary is tested; the Clerk membership and
  invitation flow is not yet exercised.
- The household tests run against SQLite, not D1 itself. They prove our schema, queries and
  scoping, not D1 behaviour under replication or its API edge cases. See WEB-004.
- Browser-only private processing becomes harder as the React migration grows; parity and
  network-boundary tests are mandatory.
- Dependencies add supply-chain and upgrade work that the single HTML version avoids.
- A database introduces migrations, recovery, retention, and deletion responsibilities.
- The project must decide explicit data retention and household deletion behavior before
  storing real shared finance data.
- Production should remain an experiment until a parallel pilot demonstrates a concrete
  benefit over v1.
