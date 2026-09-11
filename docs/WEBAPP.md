# Web-service experiment

This is the canonical plan and continuation guide for the web-service experiment. Keep
it current instead of creating session handoffs or a separate plan for every batch.

## Current status — 2026-09-11

Local production hardening is implemented. The remaining gates are the owner's documented
human acceptance (WEB-005, WEB-010, WEB-012, and WEB-013) and separately authorized
Cloudflare/Clerk staging and production setup. No Cloudflare account, hosted Worker, hosted
D1 database, domain, or deployment exists.

The hardening batch made every multi-record workflow mutation transactional through D1
`batch()`, backed by a unique workflow-version event constraint and injected failures at
every submit, withdraw, and close statement boundary. It added exact scoped deletion of
private browser drafts, server-derived administrator capabilities, guarded cancellation of
empty abandoned periods, unresolved-replacement/current-draft close blocks, strict rejection
of private/unknown fields, and a single integer-cent rounding rule. Compatible Cloudflare
tooling was updated to Vite plugin 1.54.8, Wrangler 4.131.1, and Workers types
5.20260911.1; `npm audit` reports zero known vulnerabilities.

Batches 1 through 4b are complete, locally verified, committed, and pushed. **Batches 4c,
5, and 6a–6c are implemented and locally verified but not yet committed.** Batch 4 turned out
large enough that, per the roadmap's own note that it "may be split into Import and Review after
inspection," it was split three ways: 4a (the parsing engine), 4b (dedup, rules, refund
pairing, review UI), and 4c (Amazon matching, local draft persistence, export formats,
amount correction).

- Stable v1.0.0 remains the single-file `index.html` application on `main` at commit
  `8beb443`. It is the behavioral reference, is untouched by this branch, and passes 81/81.
  Batches 4a and 4b do not modify `index.html` at all — they read it (to prove parity) but
  never write to it.
- Commits on this branch before Batch 4c, oldest first: `8781ff4` safety commit,
  `74b3ce5` authenticated foundation, `3eb56bb` telemetry boundary, `8e8336b`
  documentation split, `7dcda00` household authorization and local database, `8fdbc63`
  continuation refresh, and `c6eb3ab` Batches 3 through 4b. All pushed.
- Web-app gate at this point: four TypeScript projects type-check; 77 pure/Worker tests and
  11 browser-like component/API/visual-contract tests pass. The production build also succeeds. Run
  `npm run check` in `webapp/`.
- Batch 5 established one coherent Setup → Import → Review → Share/Status → Settle primary
  journey, with lower-frequency Rules & Files in the footer. Batch 6 then swapped the
  product from the fictional local workflow adapter to the authenticated API adapter
  without rewriting those screens. The local adapter now exists only as a deterministic
  test fixture; private drafts remain account-and-organization-scoped browser state.
- Batch 6 replaces that local product adapter with authenticated Worker routes and a new
  local D1 workflow schema. The Worker derives the household and role from Clerk, limits a
  period to two submitters, enforces own-submission ownership and optimistic versions,
  creates the immutable archive itself, and provides guarded closed-archive export,
  administrator restore, and export-before-delete. The old Batch 3 shared-entry route is
  retired. The fictional adapter remains only as a deterministic UI test fixture.
- Verified by the owner in a browser on 2026-09-08: submitted two fictional shared entries
  (Batch 3) and saw them persist and list correctly; pasted a fictional BMO statement (1
  row, "Sample Restaurant", $146.67) and a fictional TD statement (2 rows, "Farm Boy"
  $84.26 and "Annual Cash Back" -$20.00) into the "Parse locally" panel (Batch 4a) and got
  exactly the expected merchant names, categories, and amounts; then exercised dedup,
  rules, refund pairing, and the no-persistence limitation in the Batch 4b review screen —
  catching and leading to a fix for a credit-row display bug (see the Batch 4b section).
- Verified by the coding agent in Chrome on 2026-09-08 with fictional data: imported a
  $3,500 Amazon charge and a private row, corrected the charge to $40.37 while retaining
  its original value, decided the two rows shared/private, parsed and confirmed an exact
  fictional Amazon order, reloaded and saw the complete private draft restore, and
  triggered both private-session and privacy-filtered shared downloads. The same pass
  caught and fixed an inherited presentation bug where an undecided charge said
  "Excluded" even though its underlying state was correctly undecided.
- Verified by the coding agent in Chrome on 2026-09-11 with fictional data: imported and
  decided two BMO rows privately, submitted the allowlisted projection through the
  authenticated Worker to migrated local D1, reloaded, and saw the submitted server record
  return. Two authenticated tabs then proved the real optimistic-concurrency path: one
  replaced version 1, the stale tab was stopped with a refresh-required response, and its
  recovery control loaded version 2. The connected UI showed no partner-simulation controls
  and correctly waited for a second member of the same household.
- Owner verification of Batch 4c is deliberately deferred until the owner has time. It is
  tracked as WEB-010 and remains required before Batch 4c is considered human-accepted;
  automated and coding-agent verification do not substitute for that product review.
- Exact owner scenarios, copyable fictional edge-case data, expected results, and failure
  symptoms for WEB-010, WEB-012, and WEB-013 live in
  `docs/WEBAPP-HUMAN-TESTING.md`.
- The owner holds Clerk development keys in ignored `webapp/.env.local`. Confirm the file
  exists without reading it. Do not record Clerk user or organization IDs in the repository.
- Verified by the owner in a browser: sign-in, sign-out, and two accounts in two separate
  organizations each seeing only their own household records.
- Not yet verified: two accounts in the *same* organization both seeing that household. It
  needs a member added to an existing organization in the Clerk Dashboard.
- Deferred by owner decision: closing Clerk enrollment to invite-only. The Development
  instance holds no real data and stays open for now. Required before production; tracked in
  Batch 7 and the open-risks list. Do not put real financial data in that instance.
- Local development database: one SQLite file under ignored `webapp/.wrangler/`. It is not
  in any cloud. `npm run db:migrate:local` applies the schema; deleting the file loses only
  fictional rows. Batch 3 added a second migration to that same local file.
- Owner explainers, published outside the repository. The repository documents stay
  canonical; these teach.
  - Batch 1: https://claude.ai/code/artifact/21d6c4df-322c-44a5-8174-56d9462314c9
  - Batch 2: https://claude.ai/code/artifact/c97caed7-8246-4b79-817a-af2196b543f9
- The local learning portfolio in `Claude artifacts/artifacts.MD` explains the product,
  architecture, request sequences, privacy boundary, batch history, and Batch 5 plan in
  beginner-friendly product/BA language. It is educational material, not a canonical
  source of implementation truth; this document remains canonical.
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
   - `docs/WEBAPP-HUMAN-TESTING.md` — for owner acceptance, mock data, and browser scenarios.
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
  - is the trusted gatekeeper; emulated locally now, hosted later
  - verifies the Clerk proof; never trusts a user ID supplied by the browser
  - applies household permissions and workflow rules
  - reads/writes deliberately shared data only
          |
          v
Cloudflare D1 database
  - is a local SQLite-compatible file now; a hosted database does not exist yet
  - stores household/workflow/shared records after the local migrations
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

The local development server currently serves both the compiled frontend and `/api/*`
routes from one origin. A future Cloudflare Worker deployment will preserve that shape.
The code layers stay separate, but one origin avoids CORS configuration, duplicated
deployments, and extra operational concepts.

### What “using Cloudflare” means today

There is an important difference between using a vendor's **software** and using its
**hosted account**:

| Layer | Used now? | Physical location today | Requires a Cloudflare account? |
|---|---:|---|---:|
| Wrangler command-line tool | Yes | Installed in `webapp/node_modules` on this Mac | No for local commands |
| Cloudflare Vite integration | Yes | Runs inside the local Vite development/build process | No |
| Worker runtime behavior | Yes, emulated | Local development process | No |
| D1 behavior | Yes, local | Ignored SQLite-compatible data under `webapp/.wrangler/` | No |
| Hosted Worker | No | Does not exist | Yes |
| Hosted D1 database | No | Does not exist; config uses `local-development-placeholder` | Yes |
| `workers.dev` or custom-domain URL | No | Does not exist | Yes |

Creating an account is therefore not the next automatic step. First complete the owner
acceptance and local production-hardening gates. Then create a Cloudflare account for a
fictional-data staging environment. Cloudflare documents account creation as a prerequisite
for hosted D1, and Wrangler environments can create separately named staging and production
Workers. See the official [D1 getting-started guide](https://developers.cloudflare.com/d1/get-started/)
and [Wrangler environments guide](https://developers.cloudflare.com/workers/wrangler/environments/).

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
| Complete UI against a typed local workflow adapter before cloud integration | Build UI and backend together; make static mockups | Batch 5 can expose missing workflow states cheaply while every action remains executable with fictional local data. A shared TypeScript contract prevents the local simulation from becoming throwaway work: Batch 6 replaces the adapter, not the UI. Static mockups would not prove interaction behavior; simultaneous UI/backend work would make product and authorization defects harder to isolate. |
| Plain CSS initially | Tailwind or a component framework | Keeps one learning layer visible and reuses the settled visual language. Add a styling framework only if repetition becomes a demonstrated problem. |
| Existing export formats remain portable | Cloud-only state | Exports support audit, recovery, parity checking, and a return to v1. |
| Telemetry disabled in code rather than by environment variable | Clerk's documented `CLERK_TELEMETRY_DISABLED`; leaving SDK defaults | Neither a Worker nor a browser has `process.env`, so the documented variable silently does nothing here. Explicit code options are the only controls that take effect, and unlike an environment variable they can be asserted by a test. |
| No analytics | Product analytics from the start | Financial privacy and simplicity matter more during a tiny invite-only pilot. Use direct feedback and privacy-safe operational errors. |

## Batch roadmap

Each batch should produce a vertical slice that can be explained, tested, and, after
separate permission, committed. Scope may change after inspection, but any revised file
plan must pass the repository approval gate.

Priority order approved on 2026-09-10:

1. **Must-have:** preserve private/browser-only processing, server authorization, strict
   projection allowlists, two-person workflow correctness, server-created close records,
   export-before-delete recovery, explicit deferred human acceptance, atomic workflow
   writes, and a deliberate way to erase private browser data before real use.
2. **Should-have next:** production dependency/security review, offline policy, privacy-safe
   role-aware recovery controls, operations, deployment/rollback documentation, and a
   parallel pilot. Convenience ideas such as search, AI assistance, and deeper diagnostics
   do not displace these controls.

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
   Batch 7 and the open-risks list.
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
replace/withdraw/lock semantics, will be modeled visibly in Batch 5 and enforced by the
real service in Batch 6.

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

### Batch 4c — Amazon matching, local persistence, export formats, and amount correction (implemented, uncommitted)

Learning objective: complete a recoverable private browser workflow while preserving
v1's evidence, correction, and portable-file contracts without opening a path to the
backend.

Delivered:

- `shared/amazon.ts`: a typed port of the complete pure Amazon context block — parsing,
  deterministic matching, review states, confirmation conflicts, summaries, and strict
  persisted-context validation. `amazon.parity.test.ts` runs v1's actual engine and Amazon
  marker blocks beside the port. Raw Amazon paste is cleared after parsing and is never
  placed in React state that is persisted; derived matches always recalculate.
- `shared/amountCorrection.ts`: the same $1,000 edit gate and edited-state rule as v1.
  Corrections retain `originalAmount`, leave the stable transaction id unchanged, update
  refund/large flags, and rerun refund pairing because a correction can change both value
  and sign. Its policy functions are parity-tested against v1.
- `shared/session.ts`: allowlisted creation and runtime-validated reading of the relevant
  `split-ledger-session/v3` shape, including v1-v3 format acceptance and old-name migration.
  Draft keys are scoped by the signed-in Clerk user and active organization so switching
  accounts or households cannot accidentally render the previous draft. Storage remains
  in that browser profile; it is not sent to Clerk, the Worker, or D1.
- `shared/formats.ts`: an allowlisted `split-ledger/v1` builder that structurally excludes
  private, pending, undecided, raw-bank, card, and Amazon fields, plus a tested
  `split-ledger-archive/v1` builder ready for Batch 5. The archive is intentionally not
  downloadable yet: presenting a "close month" action before a real partner workflow
  would imply finalization that the experiment cannot yet perform.
- `src/Import.tsx`: private names, account-and-household-scoped browser autosave, private
  session download/load, Amazon paste and confirmation UI, deliberate amount-correction
  controls, and a privacy-filtered shared download. The existing import, dedup, rules, and
  refund behavior remains local. `src/styles.css` adds only supporting presentation, and
  `src/App.tsx` now identifies Batch 4c accurately.

Evidence: the legacy suite passed 81/81 before the batch. Three TypeScript projects
type-check and 64 web-app tests pass (up from 50); the new assertions cover Amazon parity,
amount correction, session validation and privacy, frozen shared/archive shapes, and
settlement arithmetic. Chrome verification with fictional data covered the frontend,
live local Worker authentication/household responses, import, correction, decisions,
Amazon matching/confirmation, reload restoration, and both downloads.

Browser autosave closes the immediate reload-data-loss regression. Batch 6d later settled
the broader policy: the web app is online-required, preserves private drafts through API
interruptions, and retains v1 as the supported offline fallback.

The frozen engine markers in `index.html` remain untouched throughout Batches 4a-4c — all
three port from them, never edit them.

### Batch 5 — Complete end-to-end UI with a local workflow adapter (implemented, uncommitted)

Learning objective: understand how product journeys become screens, components, states,
and a typed boundary that a backend can later implement.

Why this batch came before real workflow integration: before Batch 5, the experiment
contained two valid but disconnected slices. The authenticated demo wrote fictional shared
entries to D1, while the imported private ledger stayed in the browser and produced files.
Connecting them before the full workflow is visible would force database and API decisions
from an incomplete user journey. Batch 5 first makes the journey executable with fictional
local state; Batch 6 then replaces that local adapter with authorized Worker routes.

Delivered product journey:

1. Sign in and select or join a household.
2. Configure local names, cards, rules, and period.
3. Import and reconcile private statement data locally.
4. Review every posted purchase and supporting Amazon evidence locally.
5. Preview the exact privacy-filtered projection that would be shared.
6. Submit or replace that projection through a local workflow simulation.
7. See explicit waiting, partner-ready, changed, stale, and error states.
8. Review both sides, complete pre-close checks, and preview deterministic settlement.
9. Close in the simulation and download a portable archive/recovery file.

Delivered interface structure, reusing v1 rather than redesigning it:

- An application shell with Setup, Import, Review, Share / Status, and Settle in the
  primary menu. Lower-frequency Rules & Files is reachable from the footer.
- The accepted v1 hierarchy and visual language: a compact utility bar for Clerk account
  controls, the 68-pixel product header, 32-pixel lime `S` mark, month control, pale-green
  pill navigation, v1 content widths, panels, ledger columns, and settlement hierarchy.
  The redundant draft/status banner and the prominent device/lock badge are intentionally
  absent. `design-reference/v0/` informed only gaps that `index.html` did not cover.
- A clear separation between private local work and household-shared workflow state.
- A review screen with v1's five one-click presets, custom share, remembered-rule status,
  rule removal, refund treatment, Amazon context, amount correction, progress, and filters.
- A partner-status area for not submitted, submitted, replaced, withdrawn, partner ready,
  stale, and locked/closed examples. All examples are visibly labelled fictional.
- A settle screen with both parties' shared projections, asymmetric-claim warnings,
  pre-close checks, deterministic net, and archive preview/download.
- Accessible empty, loading, permission, validation, retry, and recovery states. No control
  may be a decorative dead end: it either performs a local simulated action or clearly
  explains why it is unavailable.

Delivered architecture contract:

- `shared/workflow.ts` defines the narrow `WorkflowGateway`, its status vocabulary, a
  strict shared-projection validator, and pure state transitions. `src/workflow/LocalWorkflowGateway.ts`
  implements it with explicitly fictional, account-and-organization-scoped browser state.
- Pass only `split-ledger/v1`-shaped shared projections across that gateway. Full ledgers,
  private rows, raw descriptions, rules, Amazon context, and unfinished decisions remain
  outside it.
- `shared/preClose.ts` owns close prerequisites and settlement calculation remains in the
  existing pure engine. React renders results and actions; it is not the financial or
  workflow authority.
- Batch 6 will implement the same gateway with authenticated API calls. This is an adapter
  swap, not a second UI rewrite.

Testing delivered and dependency decision:

- A browser-like component-test environment and React Testing Library/user-event let
  tests interact with controls as a person would. This is justified now because it closes
  WEB-001 and WEB-006 together, rather than adding a DOM dependency for one isolated test.
- Tests assert navigation, visible state, ordinary keyboard use, credit-row controls,
  share labels,
  privacy projection, submit/replace/withdraw states, pre-close gates, error/retry states,
  and archive download intent.
- Pure financial, parsing, matching, session, and format tests remain independent of React.
- Worker/SQLite tests remain green even though Batch 5 does not expand the backend.
- Manual Chrome verification completed the fictional happy path and a retryable-error
  recovery path, inspected desktop and 390-pixel layouts, and checked console output.
  The app produced no console errors. Clerk produced its expected development-key warning;
  the automation extension produced one unrelated extension-origin error.

Owner decision on 2026-09-09: v1's keyword shortcuts are intentionally not part of the
web-app version because the owner never used them. Normal keyboard focus, labels, native
controls, and activation remain required accessibility behavior.

Owner decision on 2026-09-10: restore direct visual and information-hierarchy parity with
the accepted v1 instead of treating Batch 5 as a new design. Clerk's organization and user
controls live in a small top utility bar; they do not require moving or restyling the main
menu. Setup and Share / Status remain primary destinations, Rules & Files moves to the
footer, and the removed v1 draft/status strip and device/lock badge stay removed. Import,
Review, Amazon evidence, Share / Status, Settle, and Rules & Files were audited together so
the correction applies inside screens as well as to the shell.

Implementation map:

- `src/Workspace.tsx` is the authenticated five-stage shell plus a footer utility route.
  `SetupScreen.tsx`, `Import.tsx`, `ReviewScreen.tsx`, `ShareStatusScreen.tsx`,
  `SettleScreen.tsx`, and `RulesFilesScreen.tsx` each own one clear screen responsibility.
- `src/usePrivateWorkspace.ts` coordinates private draft state, autosave, parsing, refunds,
  Amazon evidence, corrections, rules, sessions, and exports without sending that state
  to the workflow gateway.
- `src/AppProviders.tsx` makes Clerk's telemetry-off browser configuration render-testable.
- React Testing Library (a test tool that clicks and reads rendered React screens like a
  user) and `user-event` run in jsdom (a lightweight browser-shaped test environment).
  Their configuration is separate from pure modules and Worker/SQLite tests.
- Stable, explicitly fictional fixtures live in `src/testing/fictionalFixtures.ts`.

Evidence: the required legacy gate passed 81/81 immediately before edits. `npm run check`
passes with 70 pure/Worker tests, 4 component tests, all four TypeScript projects, and the
production build. Component coverage includes five presets plus custom share, credits,
undecided labels, rule removal, navigation, account/organization persistence isolation,
the exact privacy boundary, submit/replace/withdraw, partner-ready, stale recovery,
close prerequisites, retry recovery, close, archive intent, and rendered Clerk telemetry
configuration. The privacy test fails if any private or Amazon-only field reaches the
gateway. Final legacy and whitespace evidence is recorded at handoff.

Acceptance criteria:

- A first-time user can explain where private work ends and shared workflow begins from
  the screen copy and actions alone.
- A complete fictional month can travel from setup through simulated close without a dead
  button, hidden prerequisite, or cloud mutation.
- The local gateway receives only the allowlisted shared projection; an automated test
  fails if a private or Amazon-only field crosses it.
- Refresh restores the private draft and the simulated workflow state without mixing
  accounts or organizations.
- Each important workflow state has a distinct label, allowed actions, and recovery path.
- Closing is blocked while decisions or required checks remain incomplete, is idempotent
  in the simulation, and produces the established archive format.
- Frontend component tests catch the two classes of UI defect already found manually:
  incorrect controls for credits and misleading share labels.
- `node test/run-tests.js`, `npm run check`, and `git diff --check` pass; only fictional,
  date-stable data appears in tests and screenshots.

Non-goals:

- No new D1 migration or real partner-workflow API.
- No real cross-account synchronization, invitation enforcement, or production data.
- No final visual redesign, styling framework, PWA/offline decision, deployment, or domain.
- No retirement or modification of v1.

Remaining risk: a local simulation can create false confidence if it invents behavior the
real service cannot enforce. The mitigation is to define one narrow gateway contract, model
failure and concurrency-visible states explicitly, and carry those exact contracts into
Batch 6. Coding-agent verification does not replace owner acceptance; the owner should
review the complete journey in a browser before treating Batch 5 as product-accepted.

### Batch 6a–6c — Real partner workflow, integration, close, and recovery (implemented, uncommitted)

Learning objective: understand how a trusted backend enforces the workflow that the UI
can display but must not authorize by itself.

Delivered policy (Batch 6a):

- The verified Clerk organization is the household. The browser never sends a household
  id. Development permits the first owner to create an organization; a partner must accept
  an invitation and select that same organization. Production invite-only configuration
  remains Batch 7 and no Clerk setting changed in this batch.
- A period permanently allocates at most two participant slots. Each participant can
  submit, replace, or withdraw only their own current projection. A closed period is
  immutable. A third organization member may not become a submitter for that period.
- Every write carries a request id; optimistic versions detect stale tabs. Exact request
  replay, identical submission, repeated withdrawal, and repeated close are safe.
- The Worker accepts only the existing strict `split-ledger/v1` projection, with bounded
  item/string sizes, valid period dates, finite numbers, and a recomputed total. Unknown,
  private, and Amazon-only fields are rejected rather than redacted.
- The Worker—not the browser—constructs the final `split-ledger-archive/v1` from the two
  stored projections. The browser calculation is a preview only.
- Shared records have no automatic expiry. Deletion is allowed only for a verified
  organization administrator, after a fresh closed-archive export, with exact typed
  confirmation, and only when no period is open. It deletes shared workflow/D1 records,
  never private browser drafts or the Clerk organization.

Delivered backend and adapter (Batch 6b):

- Migration `0003_period_workflows.sql` adds household/period records, two participant
  slots, current projections, append-only non-financial events, request receipts, immutable
  archives, and short-lived deletion tokens. It was applied only to ignored local D1.
- Authenticated period routes cover status, submit, replace, withdraw, and close. Separate
  routes export closed archives, restore them without overwriting conflicts, and perform
  guarded deletion. The Batch 3 `/api/shared-entries` route now returns `410 Gone` and
  cannot bypass the workflow.
- `ApiWorkflowGateway` implements the Batch 5 interface over HTTP. The signed-in product
  uses it; `LocalWorkflowGateway` remains only as a deterministic component-test fixture.
  A production/API failure never falls back to local fictional state.
- Connected UI copy distinguishes the local API from private browser work. Partner/stale/
  error simulation buttons exist only in the test fixture. Rules & Files separates private
  session files from shared closed-archive export, administrator restore, and deletion.

Delivered verification (Batch 6c):

- Worker/SQLite tests model two verified members in one household, a third submitter,
  another household, a non-member, and an administrator. They cover viewer orientation,
  ownership, stale versions, request replay, server close, closed locking, open-period
  deletion refusal, admin enforcement, privacy, export, deletion, and restore.
- API-adapter tests assert bearer transport and the exact request body; component tests
  keep the full fictional journey while proving connected mode contains no simulation
  controls. A lightweight visual contract guards the accepted header/menu/footer and
  signature palette discovered during Batch 5 review.
- Chrome used explicitly fictional BMO rows to verify private Import/Review, authenticated
  projection submission to local D1, persistence after reload, and stale-tab recovery after
  another tab advanced the shared version. The connected Share/Status screen was inspected
  at desktop width and at 390 px; neither emitted an application console error. Live
  two-account Clerk invitation/settlement acceptance is deliberately deferred and remains
  tracked; automated identities do not replace that human evidence.

No destructive cloud-only workflow exists: only closed privacy-filtered archives can be
exported and restored, and open work blocks deletion. Authentication proves identity;
authorization, current version, ownership, and close prerequisites are independently
enforced by the Worker.

### Batch 6d — Local production hardening (implemented; owner acceptance deferred)

The code is locally failure-safe; product acceptance remains deliberately deferred. D1
transaction batches now cover submit, replace, withdraw, close, archive restore, export-token
rotation, deletion, and empty-period cancellation. A stale concurrent operation collides on
the one-event-per-version database constraint and rolls back as a unit. Exact request replay,
two participant slots, own-submission mutation, and closed immutability remain intact.

Rules & Files now separates three physical data locations: the active private draft in this
browser, portable files downloaded by the user, and shared workflow records in D1. Private
deletion requires `DELETE PRIVATE DRAFT`, affects one exact Clerk user+organization storage
key, and pauses autosave so the erased draft is not recreated. Any member can export closed
archives; only the server-verified administrator can restore, delete, or cancel an abandoned
period. An abandoned period must have no current submissions before cancellation.

The web application is explicitly online-required for authentication and shared workflow.
Private data remains browser-only, survives ordinary connection failures, and never falls
back to a fictional adapter, but this version is not a service worker/PWA. Released v1.0.0
remains the supported offline fallback. Adding offline synchronization would create a second
conflict/retry system and is not justified for the two-person pilot.

SQLite tests prove schema, SQL, transaction rollback, authorization filters, and migration
order. The local Vite/Cloudflare development path exercises workerd and local D1, but tests
do not model hosted D1 replication. That hosted-runtime evidence belongs to the separately
authorized fictional staging gate; adopting an incompatible test-runner downgrade locally
would add more risk than evidence.

Owner acceptance is not complete. Follow `docs/WEBAPP-HUMAN-TESTING.md`, including H6-08,
and keep WEB-005, WEB-010, WEB-012, and WEB-013 open until the owner performs them.

#### Operations and recovery contract

- **Local start:** from `webapp/`, run `npm run db:migrate:local`, then `npm run dev` and
  use the URL Vite prints. This starts processes on this Mac; it does not create a hosted
  service. Stop with Ctrl+C and restart with the same two commands.
- **Migration:** back up/export closed archives first, review every pending SQL file, apply
  migrations in numeric order, and run the complete check. Never edit a migration already
  applied remotely and never make a script remote-by-default.
- **Application rollback:** redeploy the last known-good Worker build only after confirming
  its code understands the current schema. Database rollback means restore/recovery, not
  blindly running reverse SQL. Preserve immutable closed archives.
- **User recovery:** any household member exports closed shared archives. An administrator
  may restore a validated bundle only where periods do not conflict. A fresh export token,
  exact confirmation, administrator role, and no open period are all required for shared
  deletion.
- **Abandoned work:** each participant withdraws any current submission; an administrator
  exports, selects the exact empty open period, enters `CANCEL ABANDONED PERIOD`, and cancels
  it. Active submissions and closed periods are refused.
- **Private-device recovery:** signing out does not erase browser data. Download a private
  session if recovery is desired, then use Rules & Files → Delete this private browser draft
  and enter `DELETE PRIVATE DRAFT`. Lost-device response also requires revoking the Clerk
  session/account access externally; local deletion cannot reach a lost device.
- **Incident triage:** record UTC time, environment, route name, HTTP status, safe request
  correlation if available, and whether retry/read shows a committed version. Never record
  tokens, user/organization ids, request bodies, merchants, amounts, raw statements, Amazon
  content, private files, or stack traces. The Worker returns generic errors and emits no
  application logs containing financial or identity values.
- **Configuration:** browser code receives only the Clerk publishable key. The Clerk secret
  belongs only in local ignored configuration or Cloudflare's encrypted secret store.
  Missing keys fail closed; no development credential or local database may be reused for
  production.

### Batch 7a — Cloudflare account and fictional staging (proposed)

Learning objective: introduce a hosted environment without exposing real financial data.

This is when a Cloudflare account first becomes necessary. Account creation, login, hosted
database creation, remote migrations, secrets, and deployment are external state changes
and require a new, explicit owner authorization. Reading this runbook or approving local
code does **not** authorize those actions.

#### What the services are and where they live

- **Cloudflare Worker:** the hosted API and web files. It runs in Cloudflare's systems, not
  on this computer.
- **D1:** Cloudflare's hosted SQL database. It stores only shared workflow records and
  privacy-filtered closed archives; it is not the private browser ledger.
- **Wrangler:** Cloudflare's command-line program. The project already installs it inside
  `webapp/node_modules`; commands are run from the repository's `webapp/` directory.
- **`workers.dev`:** Cloudflare's free starter web address. It avoids buying or connecting a
  domain for fictional staging.
- **Clerk:** the separate sign-in and organization service. A Clerk publishable key may be
  visible in the browser; its secret key must exist only in protected server configuration.

#### Free-only boundary (verified 2026-09-11)

Choose **Workers Free**, not Workers Paid. Cloudflare says Free is the default and currently
includes 100,000 Worker requests per day with 10 ms of CPU time per invocation. D1 Free
currently includes 5 million rows read per day, 100,000 rows written per day, and 5 GB total
storage. If a D1 daily allowance is exhausted, queries fail until the reset at 00:00 UTC;
the application must show a safe failure rather than silently losing work.

Choose Clerk **Hobby**, which currently costs USD 0 and requires no credit card. It includes
up to 50,000 monthly retained users and 100 monthly retained organizations per application.
For this fictional staging exercise, use a separate Clerk **Development** instance. Clerk
currently limits a Development instance to 100 users and explicitly says it is not suitable
for production workloads.

Stop and ask the owner before continuing if either vendor asks for a payment method, a paid
plan, an add-on, a domain purchase, or an automatic paid conversion. Do not start a trial.
Free allowances and screens can change, so re-check the linked official pricing immediately
before account creation and again before deployment.

#### Part 1 — actions the owner performs after separately authorizing staging

1. Open Cloudflare's official sign-up page, enter the email address that should own the
   service, create a strong unique password, and select **Create account**. Open the
   verification email and verify the address. A business-controlled mailbox is preferable
   to an address that only one person can recover.
2. In the Cloudflare dashboard, confirm the account is on **Workers Free**. Do not select an
   upgrade, Workers Paid, or a trial. No custom domain is needed for staging.
3. In the account profile, open **Authentication**, add an authenticator-app or security-key
   MFA method, save the recovery codes somewhere separate from the computer, sign out, and
   confirm sign-in and MFA work before creating resources.
4. Create or open a free Clerk account. Confirm the workspace is on **Hobby** and create a
   new application named clearly for fictional staging, such as `Partner Finance Settler –
   fictional staging`. Keep it separate from any future production application and never
   add real users or financial information.
5. In that Clerk application's **Development** instance, enable Organizations. Use exactly
   one fictional two-person organization for acceptance. Copy the `pk_test_...` publishable
   key and `sk_test_...` secret only when the authorized setup session asks for them. Never
   paste the secret into chat, documentation, screenshots, Git, or a `VITE_` variable.

Menu labels sometimes move. If a named screen is not visible, stop and use the current
official documentation rather than guessing or enabling an adjacent product.

#### Part 2 — repository preparation in a separately approved coding batch

Before any remote command, the coding session must make and test a small configuration
batch. It will add explicit `staging` and `production` environments to
`webapp/wrangler.jsonc`, while leaving the existing local database command local-only. The
staging Worker and D1 names must include `staging`; production must have separate names,
IDs, keys, and bindings. The session must run the normal approval gate and automated tests.

Do not deploy the current top-level configuration: its database ID is intentionally
`local-development-placeholder`. Do not turn `db:migrate:local` into a remote command.

#### Part 3 — Cloudflare connection and resource creation

Run these only from `webapp/`, only after the owner authorizes external staging actions:

1. Run `npx wrangler login`. Wrangler opens Cloudflare in the browser. Read the requested
   permissions, select the intended account, approve only if it is correct, and return to
   the terminal. Expected result: Wrangler reports a successful login.
2. Run `npx wrangler whoami`. Expected result: the intended account name appears. If it is
   the wrong account, stop and log out; do not create anything.
3. Run `npx wrangler d1 create split-ledger-staging`. Expected result: Cloudflare creates
   one D1 database and prints its database name and generated ID. This is an external
   resource even though it is on the free plan.
4. Put that generated ID only in the approved `staging` D1 binding in
   `webapp/wrangler.jsonc`. Re-run type checking and local tests. Never place it into the
   production binding or replace the local placeholder.
5. Run `npx wrangler d1 migrations list split-ledger-staging --remote --env staging` and
   compare the listed files with `webapp/migrations/`. Expected result: only the reviewed,
   committed-order migration filenames are pending.
6. Run `npx wrangler d1 migrations apply split-ledger-staging --remote --env staging`.
   Read Wrangler's confirmation carefully before answering. Expected result: every pending
   migration reports success. Wrangler says a failed migration is rolled back while earlier
   successful migrations remain applied; stop and investigate rather than rerunning
   blindly if anything fails.

Record the resource names and non-secret IDs in the staging operations record. Do not
record access tokens or Clerk secrets there.

#### Part 4 — keys, build, and first fictional deployment

1. Configure `VITE_CLERK_PUBLISHABLE_KEY` with the staging application's `pk_test_...`
   value in the approved staging environment. It is deliberately browser-visible.
2. Run `npx wrangler secret put CLERK_SECRET_KEY --env staging`, paste the matching
   `sk_test_...` value only into Wrangler's hidden prompt, and press Return. Expected result:
   Wrangler confirms the encrypted staging secret was stored. Do not put it in a file.
3. Run the complete automated checks locally. Because this project uses Cloudflare's Vite
   plugin, select the staging environment at build/deploy time with `CLOUDFLARE_ENV=staging`
   as documented by Cloudflare; verify the command and generated target before approving
   its first use.
4. Deploy the named staging environment. Expected result: Wrangler prints a URL whose host
   ends in `.workers.dev` and whose Worker name clearly ends in `-staging`. If the output
   names production, an unnamed Worker, a custom domain, or a different account, stop.
5. Open only that printed HTTPS URL. Confirm the page identifies fictional staging and can
   sign in through the separate Clerk Development application. Never upload a real bank or
   Amazon file.

The exact build/deploy command must be copied from the tested package/configuration at that
time; do not improvise a production command from this prose guide.

#### Part 5 — hosted verification and recognizable failures

Using fictional fixtures only, repeat authentication, invitation, same-household sharing,
cross-household denial, replacement blocking, stale-version recovery, retry/idempotency,
close/settle, archive export, deletion, restore, accessibility, narrow-layout, and console
checks from `docs/WEBAPP-HUMAN-TESTING.md`. Human checks remain pending until the owner
actually performs and records them; automation cannot mark them passed.

- A `401` means the session/token was absent or invalid; a `403` means the authenticated
  person or organization was not authorized. Neither should expose data.
- A conflict/stale-version message should prompt a refresh and review, not overwrite the
  other partner's newer work.
- A D1 limit error means the free daily allowance was reached. Stop writes and wait for the
  midnight UTC reset; do not upgrade automatically.
- A migration error means staging is not ready. Do not deploy forward or apply production
  migrations.
- A blank page, raw stack trace, secret, transaction details in logs, or data crossing
  organizations is a release-blocking failure.

In Cloudflare, open **Workers & Pages**, select the staging Worker, and inspect metrics and
logs. Then open **D1**, select `split-ledger-staging`, and inspect row read/write and storage
metrics. These surfaces may show operational counts, timings, status codes, and safe route
names only. They must not contain tokens, user/organization identifiers, merchants,
amounts, request bodies, statement rows, or Amazon content.

#### Part 6 — rollback, credential response, and cleanup

- Before calling staging ready, identify the previous Worker version in Cloudflare and
  rehearse rollback using Cloudflare's current documented version procedure. A code
  rollback does not reverse a database migration.
- If a Clerk secret or Cloudflare credential is exposed, revoke/rotate it in the vendor
  dashboard, replace the stored staging secret, invalidate affected sessions where
  appropriate, and record a privacy-safe incident note. Removing it from a local file is
  not sufficient.
- If the staging experiment is abandoned, export any required **fictional** evidence, then
  separately authorize deletion of the staging Worker, D1 database, and Clerk application.
  Verify their absence in both dashboards. Resource deletion is destructive and is never
  implied by permission to deploy.

Use current official instructions at execution time:

- [Create a Cloudflare account](https://developers.cloudflare.com/fundamentals/account/create-account/)
- [Workers pricing and free limits](https://developers.cloudflare.com/workers/platform/pricing/)
- [D1 pricing and free-limit behavior](https://developers.cloudflare.com/d1/platform/pricing/)
- [D1 getting started](https://developers.cloudflare.com/d1/get-started/)
- [D1 Wrangler migration commands](https://developers.cloudflare.com/d1/wrangler-commands/)
- [Wrangler environments and environment secrets](https://developers.cloudflare.com/workers/wrangler/environments/)
- [Workers routes and domains](https://developers.cloudflare.com/workers/configuration/routing/)
- [Clerk pricing](https://clerk.com/pricing)
- [Clerk Development, Production, and staging guidance](https://clerk.com/docs/guides/development/managing-environments)

Exit criteria: fictional two-account staging evidence passes, a staging export can be
restored, deployment and rollback are rehearsed, and no production resource contains real
data.

### Batch 7b — Production environment readiness (proposed)

Learning objective: configure the real security and recovery boundary before a pilot.

1. Acquire or choose an owned domain. For this architecture the Worker is the origin, so a
   Cloudflare Custom Domain is preferable to a Route in front of another server. Cloudflare
   can create the DNS record and certificate for a domain already active in the account.
2. Activate/configure Clerk's Production instance for that domain. Disable uncontrolled
   organization creation, require invitation-based household membership, review default
   roles, and configure allowed redirect/origin URLs. Clerk invitations fit a two-person
   known-membership workflow and are administrator-controlled by default.
3. Create a separate production D1 database and Worker environment. Never share the staging
   database, keys, or names accidentally.
4. Add and verify security headers, content-security policy compatible with Clerk, bounded
   request handling, authorization-denial behavior, token/member-revocation behavior, and
   privacy-safe error correlation. Do not log request bodies or financial values.
5. Write an operations runbook for deploy, migration, rollback, archive export, D1 recovery,
   household deletion, Clerk recovery/revocation, and incident triage.
6. Use application-level closed-archive export for portable long-term evidence. Also verify
   Cloudflare D1 Time Travel for infrastructure recovery; current Cloudflare documentation
   says it is automatic, with retention depending on the plan, so verify the current limit
   immediately before relying on it.

References:

- [Cloudflare Worker Custom Domains](https://developers.cloudflare.com/workers/configuration/routing/custom-domains/)
- [Cloudflare D1 Time Travel](https://developers.cloudflare.com/d1/reference/time-travel/)
- [Clerk production environments](https://clerk.com/docs/guides/development/managing-environments)
- [Clerk organization invitations](https://clerk.com/docs/guides/organizations/add-members/invitations)

Exit criteria: a written go/no-go review confirms invite-only access, separate environments,
tested recovery, privacy-safe operations, accepted retention/offline behavior, and no open
must-have backlog item.

### Batch 7c — Parallel pilot and decision (proposed)

Learning objective: measure whether hosting improves the real monthly job enough to justify
its security and maintenance costs.

1. Rehearse the production configuration with fictional data and both real participant
   accounts.
2. Keep v1 available as the fallback and run a deliberately limited web pilot for roughly
   two or three settlement cycles.
3. Before each cycle, export closed shared history and confirm recovery readiness.
4. Record time to complete, number of explicit decisions, coordination/chasing effort,
   discrepancies, failures, recovery effort, and user confidence—without analytics or
   financial-content telemetry.
5. Make an explicit **keep**, **continue experiment**, **return to v1**, or **cut over**
   decision. Do not retire v1 automatically.

### Copy-paste handover for the next implementation session

```text
Read AGENTS.md, then CLAUDE.md, then docs/WEBAPP.md and
docs/WEBAPP-BACKLOG.md in full. Read docs/WEBAPP-HUMAN-TESTING.md because it is the
owner-acceptance contract. Preserve the entire working tree, including uncommitted
Batches 4c–6c and the untracked "Claude artifacts/" directory. Do not commit, push,
deploy, delete data, create/change Clerk or Cloudflare resources, or use real financial
data without separate explicit permission.

We are on experiment/web-service. Batches 4c through 6d are implemented, uncommitted,
and locally verified. Owner acceptance WEB-010, WEB-012, WEB-013, and the same-household
invitation evidence in WEB-005 remain open. Local production hardening is complete; Batch 7
requires separate permission because it creates external Cloudflare/Clerk resources.

Start read-only. Confirm branch/status and that webapp/.env.local exists without reading
it. Inspect only files needed for Batch 6d. Run node test/run-tests.js, then present one
exact file-by-file plan with benefit, cost, risk, and tradeoff and wait for the mandatory
approval. After approval, implement autonomously and run the complete required gates.
Cloudflare is currently local tooling only: no Cloudflare account, hosted Worker, hosted
D1 database, domain, or deployment exists. Do not begin Batch 7a unless I explicitly
authorize those external account/resource changes.
```

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

Local development is free. Fictional staging can also be USD 0 by using Cloudflare Workers
Free, D1 Free, Clerk Hobby, and the generated `workers.dev` address. No Vercel account,
custom domain, payment method, or paid trial is required for that staging path. Stay within
the dated Batch 7a limits, monitor usage, and accept a safe service refusal when a free
limit is reached rather than enabling paid overages.

Production is a separate decision. Clerk's production configuration generally makes an
owned domain the sensible path, and a domain normally has an annual cost; do not purchase
or connect one without explicit authorization. Re-check provider prices, limits, and terms
immediately before staging and production because they can change.

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
- Telemetry is off and asserted at both runtime boundaries. The Worker test constructs a
  real Clerk collector and checks it is disabled; the browser-like component test renders
  the provider boundary and fails if its explicit telemetry-off prop is removed.
- `WRANGLER_SEND_METRICS=false` is set in the repository's npm scripts, so a bare
  `npx wrangler` command run outside those scripts is not covered by it.
- Clerk enrollment is deliberately still open on the Development instance. Anyone who
  learns the development sign-up URL could create an account there. This is acceptable
  only while the instance holds no real data, and must be closed before a production
  pilot. Do not reuse the Development instance for real financial data.
- Organization-as-household is implemented but still unproven until two real accounts sign
  in to the same organization. The server-side boundary is tested; the Clerk membership and
  invitation flow is not yet exercised.
- The household tests run against SQLite and the local development path uses workerd/local
  D1. Hosted replication behavior remains a fictional-staging check, not a local code gap.
- Browser-only private processing becomes harder as the React migration grows; parity and
  network-boundary tests are mandatory.
- Dependencies add supply-chain and upgrade work that the single HTML version avoids.
- Cloudflare's local toolchain is pinned to compatible patched releases; `npm audit` reports
  zero known vulnerabilities as of 2026-09-11. Re-run it before staging and production.
- Shared workflow retention is now explicit: no automatic expiry, closed-archive export
  before deletion, no deletion while a period is open, and administrator-only restore or
  deletion. This still needs owner acceptance and production runbook verification before
  real shared finance data.
- Workflow mutations use transactional D1 batches plus one-event-per-version uniqueness;
  injected failures prove submit, withdraw, and close roll back at every statement boundary.
- Signing out deliberately preserves the scoped private draft. Rules & Files provides exact-
  scope deletion and explains the distinction before action.
- A narrow server capability makes restore/delete/cancel controls role-aware; the Worker
  independently rechecks administrator authorization on every request.
- Production should remain an experiment until a parallel pilot demonstrates a concrete
  benefit over v1.
