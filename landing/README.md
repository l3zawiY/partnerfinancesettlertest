# Tally with us — landing page

A one-page public "hello" for **tallywithus.com** and **www.tallywithus.com**, just for fun.
It shows the name, the tagline "Shared life, simply kept.", and "Private pilot, by invitation".
It does not link to the app and collects nothing: plain HTML and CSS, no JavaScript, no
cookies, no analytics, no external fonts or scripts, no forms. Colours match the web app.
The window under the headline is an abstract drawing of the app: shapes only, no text or
figures.

It is completely separate from the app (app.tallywithus.com, Workers `split-ledger-staging`
and `split-ledger-production`). Nothing in `webapp/` or `index.html` uses it.

**Status:** live since 2026-10-26 on the Cloudflare free plan. Lives on branch `landing-page`.

## Files

| File | What it is |
|---|---|
| `public/index.html` | The page |
| `public/style.css` | Its look, including dark mode |
| `public/favicon.svg` | The logo icon in the browser tab |
| `public/fonts/` | The Inter font, served from our own domain, and its free licence (`OFL.txt`) |
| `public/_headers` | Security headers Cloudflare adds to every response |
| `wrangler.jsonc` | Cloudflare settings: Worker `tallywithus-landing`, the two domains |

## Change the wording

The three lines of text are in `public/index.html`: the name (twice: `logo-word` and
`<title>`), the tagline (`<h1>` and the `description` line), and the badge (`badge`).
Keep to what was agreed: no link to the app, nothing about money, no names. Preview,
then redeploy.

## Preview on your computer

From this `landing/` folder run `python3 -m http.server 8787 --directory public`, then open
<http://localhost:8787>. Stop it with Ctrl+C; run the same command again to restart.

## Deploy (free plan)

Needs the `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` environment values. From this
`landing/` folder run:

```
npx wrangler@4.40.0 deploy
```

Wrangler (Cloudflare's command-line tool) uploads the `public/` files to the Worker
`tallywithus-landing` and attaches both domains. Cloudflare creates their DNS records
itself. Redeploying after an edit is the same command.

Check: open <https://tallywithus.com> and <https://www.tallywithus.com>. Both should show
the page within a few minutes, with a padlock in the address bar. If the deploy says a
DNS record already exists for one of the names, do not delete anything in a hurry. First
check what that record is for.

## Security and privacy

- Nothing to attack: no JavaScript, forms, logins, cookies, or stored data.
- `public/_headers` blocks outside scripts, fonts, and framing. To check it is working,
  enter tallywithus.com at securityheaders.com: expect grade A or A+.
- `noindex` keeps it out of search results. Remove that line in `index.html` to be found.
- The real risk is the accounts, not the page: keep two-step login on Cloudflare and
  GitHub, and keep `CLOUDFLARE_API_TOKEN` out of files and chats. It can change every
  Worker, including the app.
- Key scan, 2026-10-26: gitleaks plus exact searches over all branches and history found no
  real keys. The only hits were `STORE_KEY` in `index.html` (a browser-storage label) and
  `sk_test_...` placeholders. Rerun before making the repository private or widening the
  pilot.

## Later

- **Make the repository private** once v1 no longer depends on GitHub Pages: on the free
  GitHub plan, Pages stops working when a repository goes private.
- **Host v1 on Cloudflare** the same way as this page (for example `v1.tallywithus.com`), so
  the repository can go private sooner. Pilot users then need the new address.

## Remove it

In the Cloudflare dashboard go to Workers & Pages, open `tallywithus-landing`, then
Settings, then Delete. That also removes its two custom domains. The app is unaffected.
