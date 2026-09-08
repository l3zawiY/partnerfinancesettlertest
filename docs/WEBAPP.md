# Web-service experiment

This is the canonical plan and continuation guide for the web-service experiment. Keep
it current instead of creating session handoffs or a separate plan for every batch.

## Current status — 2026-09-07

Batch 2 is implemented and uncommitted, pending owner review. Batch 1 is committed and
pushed. The bullets below cover Batch 1; Batch 2 evidence is in its roadmap entry.

- Active branch: `experiment/web-service`.
- Stable v1.0.0 remains the single-file `index.html` application on `main`, at commit
  `8beb443`. It is the behavioral reference and has not been replaced.
- Safety commit `8781ff4` is already pushed on the experiment branch.
- Batch 1 is implemented but not yet committed. It adds a React frontend, Clerk sign-in,
  a Cloudflare Worker, and protected `GET /api/me` endpoint.
- The owner added Clerk development keys to ignored `webapp/.env.local` and manually
  verified the complete signed-in path: Clerk created a session, the frontend sent its
  token, and the Worker accepted it. Do not record the displayed Clerk user ID.
- Clerk and Wrangler telemetry are now disabled in code and configuration, and the
  boundary is asserted by automated tests. The local collection warning no longer appears
  in development output, including after real `/api/me` requests.
- Automated evidence: legacy suite passed 81/81 before and after the telemetry batch;
  web-app type checking, 6 backend tests, and a production build passed. Signed-out
  requests to `/api/me` returned `401` with `Cache-Control: no-store`, an unknown API
  route returned `404`, and a `POST` to `/api/me` returned `405`.
- The owner manually verified browser sign-out: the protected result and the Clerk user
  ID disappear and the signed-out state returns. Batch 1 is functionally complete.
- Deferred by owner decision: closing Clerk enrollment to invite-only. The Development
  instance stays open for now because it holds no real data and open enrollment keeps
  local experimentation and future test accounts frictionless. This is a required
  pre-production task, not a dropped one. See Batch 6 and the open-risks list.
- Remaining Batch 1 work: none. The batch is committed on this branch as two commits, one
  for the foundation and one for the telemetry boundary. Pushing was not requested and has
  not been done.
- Batch 1 explainer for the owner, published outside the repository:
  https://claude.ai/code/artifact/21d6c4df-322c-44a5-8174-56d9462314c9 — the architecture,
  request path, and privacy boundary in plain language. The repository documents remain
  canonical; the explainer teaches.
- `resources/` (about 92 MB) and `design-reference/` (about 1.7 MB) remain local-only and
  ignored. They were deliberately not included in the safety commit and have no new
  backup from this work.

## How to continue in a new coding-agent session

1. Read `AGENTS.md`, then `CLAUDE.md`, in full.
2. Inspect the working tree, current branch, `VERSION`, `CHANGELOG.md`,
   `docs/BACKLOG.md`, and this document. Preserve all uncommitted owner work.
3. Do not routinely read `resources/`, `design-reference/`, or `docs/archive/`. Use one
   only when the requested task specifically requires it.
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

### Batch 3 — Fictional shared-submission vertical slice

Learning objective: build one complete feature through UI, API, business logic, and D1.

Proposed scope:

- Define small runtime-validated API contracts shared by frontend and backend.
- Create/read fictional shared entries for one household.
- Store money as integer cents, never floating-point currency.
- Make submissions safely retryable (idempotent) and define edit/version behavior.
- Extract or adapt settlement calculation as a shared, deterministic module.
- Add API, database, authorization, and settlement integration tests.

This proves the architecture before private import logic is moved. If the slice feels
more complex than v1 for no user benefit, stop and reassess rather than accelerating the
migration.

### Batch 4 — Private Import and Review parity

Learning objective: migrate mature browser behavior without weakening privacy or silently
changing results.

Proposed scope:

- Port the private import/review workflow into browser-side TypeScript components.
- Preserve parsing, bank handling, deduplication, refund treatment, rules, Amazon context,
  local draft behavior, and established export formats.
- Keep raw input and private line items client-side; API calls must contain only an
  explicit shared projection.
- Build parity fixtures against v1 before changing algorithms or UX.

This is likely the highest-risk batch and may be split into `Import` and `Review` after
inspection. Splitting for risk is useful; splitting merely to create more sessions is not.
The frozen engine markers in `index.html` remain untouched.

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
