# Operations dashboard (WEB-052)

A private page at **https://ops.tallywithus.com** that only the owner can open. It shows, on
one screen:

1. **Logbook**: errors and activity from the pilot logbook `split-ledger-telemetry` for
   the last 24 hours, 7 days, and 30 days. Errors are listed with the time in Toronto,
   route or screen, status, error type, and reference code. A link switches to the fictional
   staging logbook.
2. **Workers**: requests and failures for `split-ledger-production`, `split-ledger-staging`,
   `tallywithus-landing`, and this page's own Worker, from Cloudflare's analytics.
3. **Databases (D1)**: size, rows read, and rows written for each database, from
   Cloudflare's records *about* the databases, plus how much of the free daily limits is used.
4. **Visitors to the public page**: visits and page views for `tallywithus.com` and
   `www.tallywithus.com` from Cloudflare Web Analytics. Until Cloudflare has recorded
   visits, the section says "No visitor statistics yet".

It is its own Cloudflare Worker, `tallywithus-ops`, kept in this `ops-dashboard/` folder. It is
separate from the app (`webapp/`) and the public page (`landing/`). Nothing here changes them.

![Fictional preview of the dashboard](preview/desktop.png)

*Fictional preview: every number and row in `preview/` is made up.*

## How to read the page

Start at the top box. It sums up the page in one word and says what to do, if anything:

| Top box | Means | What to do |
|---|---|---|
| **All good** (green) | No errors in the last 24 hours, Workers not failing, far from the free limits | Nothing |
| **Worth a look** (amber) | 1–4 errors in the last 24 hours, a Worker failure, or a free limit over 50% | Read the amber line. For an error, check whether someone was blocked; send Claude the reference code |
| **Needs action** (red) | 5 or more errors in 24 hours, or a free limit over 80% | Send Claude the reference codes or a screenshot of the box the same day |

A blue line ("Nobody used the app in the last 7 days") is information, not a problem.

Then, only if you need detail:

1. **Logbook.** Three boxes count errors for 24 hours, 7 days, and 30 days; red means there
   were some. The error list says *what happened* in plain words, *where* (a screen or an
   address in the app), and the **reference code**: send Claude that code, nothing else.
   Activity shows what people did and how often, which tells you whether the partner is
   actually using the app. **Real pilot / Test copy** switches between the real logbook and
   the fictional test one.
2. **Traffic.** Requests to each part (app, test copy, public page, this dashboard).
   "Failures" should be 0. "Free limit used today" shows the share of the free plan's
   100,000 requests a day.
3. **Databases.** Three boxes show how much of the free database limits is used today
   (reading, writing, storage). The table shows each database's size and use.
4. **Visitors.** Visits and page views of tallywithus.com.

Decisions the page helps with: is something broken that I should report, is the partner
using the app, is the free plan still enough, is anyone visiting the public page.

## Safety rules built into the code

- **Databases:** the Worker can only reach the two logbook databases
  (`split-ledger-telemetry` and the fictional `split-ledger-telemetry-staging`). It is never
  connected to `split-ledger-production` or `split-ledger-staging`. Three fixed `SELECT`
  queries are the only ones it runs (`src/logbook.ts`). The browser can only choose "24h",
  "7d", "30d", or "production"/"staging", never SQL. A test and the deploy guard
  (`scripts/deploy-guard.mjs`) refuse any other database.
- **Privacy:** the page shows only logbook fields and Cloudflare's operational counts. The
  logbook's household digest is never selected. Names, amounts, emails, household ids, and
  request bodies are never shown.
- **Who can open it:** Cloudflare Access asks for a one-time code sent to the owner's email.
  The Worker then checks Access's signed token itself (signature, issuer, this application's
  audience tag, expiry, and that the email is the owner's). So even a mistaken Access policy,
  such as one that lets "everyone" in, cannot expose the page. Until the Access settings are
  filled in, the page refuses everyone. There is no `workers.dev` or preview address.
- **Secrets:** the Cloudflare token is read-only (Account Analytics Read and D1 Read). The
  owner pastes it straight into Cloudflare as a Worker **Secret**. It is never in this
  repository, never printed, and never shown on the page.

## Files

| File | What it does |
|---|---|
| `src/index.ts` | Entry point: checks access first, then builds the one page |
| `src/auth.ts` | Cloudflare Access token check, and the password fallback |
| `src/logbook.ts` | The three fixed logbook queries |
| `src/cloudflare.ts` | Cloudflare analytics and D1 metadata requests |
| `src/render.ts`, `src/format.ts` | The page's HTML and the Toronto time and number formats |
| `wrangler.jsonc` | Worker name, address, the two logbook databases, plain settings |
| `scripts/deploy-guard.mjs` | Refuses a deploy that breaks the rules above |
| `scripts/fictional-logbook.sql`, `scripts/seed-local.mjs` | FICTIONAL rows for local trials |
| `test/` | Tests for the queries, formatting, access check, and the page |

## Commands (run inside `ops-dashboard/`)

| Task | Command |
|---|---|
| Install | `npm install` |
| Type check and tests | `npm run check` |
| Fill the local logbook copies with fictional rows | `npm run seed:local` (always local, never Cloudflare's databases) |
| Try it locally | Create `.dev.vars` with `AUTH_MODE=password` and `OPS_PASSWORD=<any 20+ characters>`, run `npm run dev`, open `http://localhost:8787` and enter that password. Stop with Ctrl+C. The three Cloudflare sections say the token is not set up, which is expected locally. |
| Deploy (agent, only after the owner approves) | `CONFIRM_DEPLOY=yes OWNER_EMAIL=<owner's Access email> npm run deploy` |

## Owner steps

These steps are for the owner. Each one says what you should see. Cloudflare sometimes
renames buttons. If a name differs slightly, pick the closest match. If anything looks
different from what is described, stop and ask.

### Step A: Turn on Cloudflare Access for ops.tallywithus.com (about 10 minutes)

*About Cloudflare Access:* it puts a sign-in screen in front of the page. You type your
email and Cloudflare emails you a 6-digit code. The Zero Trust **Free** plan costs $0 for up to
50 users ([Cloudflare plans](https://www.cloudflare.com/plans/sase-zero-trust.md)). We
could not confirm whether sign-up asks for a payment card for the free plan. If it does
and you'd rather not add one, use Step C instead. The code goes to **Hydrapeak8@gmail.com**
(owner decision 2026-10-26).

1. Go to https://dash.cloudflare.com and sign in to **Hydrapeak8@gmail.com's Account**.
2. In the left menu, click **Zero Trust**.
   - If this is your first time, Cloudflare asks for a **team name**. Type `tallywithus`
     (or another name if that one is taken). Your team domain becomes
     `<team name>.cloudflareaccess.com`. Write it down.
   - Choose the **Free** plan ($0, up to 50 users). Cloudflare may ask for a payment card even
     for the free plan. If you don't want to add one, stop here and tell me. We'll use the
     password option (Step C) instead.
3. Switch on email codes: in Zero Trust, go to **Integrations** (or **Settings**) →
   **Identity providers** (or **Authentication** → **Login methods**). If **One-time PIN**
   is not listed, click **Add new** and choose **One-time PIN** → **Save**. Without this,
   Cloudflare does not send codes.
4. In Zero Trust, go to **Access** (or **Access controls**) → **Applications** → **Add an
   application** → **Self-hosted**.
5. Fill in:
   - **Application name:** `Tally with us operations`
   - **Session duration:** `24 hours`
   - **Public hostname** (or **Application domain**): subdomain `ops`, domain
     `tallywithus.com`, path left empty.
6. Under **Policies**, choose **Add a policy** (or **Create new policy**):
   - **Policy name:** `Owner only`
   - **Action:** `Allow`
   - **Include** → selector **Emails** → type `Hydrapeak8@gmail.com`. Do **not** choose
     "Everyone" or an "Emails ending in" rule.
7. Under **Login methods** (or **Authentication**), make sure **One-time PIN** is selected.
8. Click **Save** (or **Next** until **Add application**).
9. Open the new application and find **Application Audience (AUD) Tag**, a long string of
   letters and numbers. Copy it.
10. Send me two things in the chat: the **team domain** (step 2) and the **AUD tag**
    (step 9). Neither is a secret. Do not send any token.

*What failure looks like:* there's no **Zero Trust** item, or Cloudflare insists on a paid
plan. Tell me and we'll use Step C.

### Step B: Create the read-only token and paste it into Cloudflare (about 5 minutes)

Do this after I tell you the Worker `tallywithus-ops` is deployed.

1. In https://dash.cloudflare.com, click the person icon (top right) → **My Profile** →
   **API Tokens** → **Create Token**.
2. Next to **Create Custom Token**, click **Get started**.
3. **Token name:** `tallywithus-ops read-only`.
4. **Permissions**, set two rows (use **+ Add more** for the second):
   - `Account` | `Account Analytics` | `Read`
   - `Account` | `D1` | `Read`

   Nothing else. No "Edit" permissions.
5. **Account Resources:** `Include` | `Hydrapeak8@gmail.com's Account`.
6. Leave the other fields as they are. Click **Continue to summary**, check that it lists
   only the two "Read" permissions, then click **Create Token**.
7. Click **Copy** to copy the token. Cloudflare shows it only once. Don't paste it into the
   chat, an email, or a file.
8. Go to **Workers & Pages** → **tallywithus-ops** → **Settings** → **Variables and
   Secrets** → **+ Add**.
   - **Type:** choose **Secret** (not Text)
   - **Variable name:** `CF_ANALYTICS_TOKEN`
   - **Value:** paste the token
9. Click **Deploy** (or **Save and deploy**).
10. Reload https://ops.tallywithus.com. Sections 2 and 3 now show numbers instead of "The
    read-only Cloudflare token is not set up yet".

*What failure looks like:* a section says "Cloudflare answered 400: Authentication
failed". The token was copied incompletely. Repeat steps 7 to 9 with a new token and delete
the old token in **API Tokens**. Or a section says "Cloudflare answered 403". One of the
two permissions in step 4 is missing.

### Step C (only if you decline Zero Trust): one password

1. Tell me you prefer a password. I switch `AUTH_MODE` to `password` and redeploy (with your
   approval).
2. Make a long password (at least 20 characters, for example from your password manager)
   and save it in your password manager.
3. In Cloudflare: **Workers & Pages** → **tallywithus-ops** → **Settings** → **Variables
   and Secrets** → **+ Add** → Type **Secret**, name `OPS_PASSWORD`, value your password →
   **Deploy**.
4. Open https://ops.tallywithus.com. The browser asks for a user name (type anything) and
   the password.

### Checking the page (after Step A, and again after Step B)

1. In a **private browser window**, open https://ops.tallywithus.com.
2. Expected: a Cloudflare page asks for your email. Enter it. You get a 6-digit code by
   email. Enter it. The page **Tally with us — operations** opens with four numbered
   sections.
3. In another private window, try an email that is *not* yours. Expected: Cloudflare does
   not send a code, and the page does not open.
4. *What failure looks like:* the page shows "Not available: Not allowed." after the code.
   The email in Access and the email I deployed with don't match. It must be
   Hydrapeak8@gmail.com. If it says "Access is not configured yet.", I haven't entered the AUD tag yet.

## Visitor statistics (section 4)

Cloudflare Web Analytics on the zone already adds its counting script to pages on
`tallywithus.com` (recorded in `docs/WEBAPP.md`, R7). Section 4 reads those counts for
`tallywithus.com` and `www.tallywithus.com` only. If it keeps saying "No visitor statistics
yet" after people have visited, check Cloudflare → **Analytics & Logs** → **Web
Analytics** to see whether a site for `tallywithus.com` exists and is collecting. No code
change should be needed.

## Status log

- **2026-10-26 (later):** made easier to read after the owner's review: an "at a glance"
  box with a verdict and what to do (`src/health.ts`), plain names for events, errors,
  screens, Workers, and databases (`src/labels.ts`), a one-line "how to read" under each
  section, and the phone layout. 46 tests pass. Fictional previews in `preview/`. Access code
  email: Hydrapeak8@gmail.com. Still not deployed.
- **2026-10-26:** built on branch `ops-dashboard`. 39 tests pass. Tried locally with
  fictional logbook rows (password mode, local database copies only) at desktop and phone
  widths. The three Cloudflare sections were checked against the real analytics API with
  operational counts only. Cloudflare had not yet named traffic for
  `split-ledger-production` and `tallywithus-landing` (both deployed that hour), so they
  showed 0. Not deployed yet: waiting for the owner's approval and Step A.
- **Moving notes into `docs/`:** when the owner asks to merge this branch by pull request,
  the operations parts of this file move into `docs/WEBAPP.md` and WEB-052 is updated in
  `docs/WEBAPP-BACKLOG.md`.
