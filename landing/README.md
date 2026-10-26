# Tally with us — landing page

A one-page public "hello" for **tallywithus.com** and **www.tallywithus.com**, just for fun.
It shows the name, the tagline "Shared life, simply kept.", and "Private pilot, by invitation".
It does not link to the app and collects nothing: plain HTML and CSS, no JavaScript, no
cookies, no analytics, no external fonts or scripts, no forms. Colours match the web app.
The window under the headline is an abstract drawing of the app: shapes only, no text or
figures.

It is completely separate from the app (app.tallywithus.com, Workers `split-ledger-staging`
and `split-ledger-production`). Nothing in `webapp/` or `index.html` uses it.

## Files

| File | What it is |
|---|---|
| `public/index.html` | The page |
| `public/style.css` | Its look, including dark mode |
| `public/favicon.svg` | The logo icon in the browser tab |
| `public/fonts/` | The Inter font, served from our own domain, and its free licence (`OFL.txt`) |
| `public/_headers` | Security headers Cloudflare adds to every response |
| `wrangler.jsonc` | Cloudflare settings: Worker `tallywithus-landing`, the two domains |

## Preview on your computer

From this `landing/` folder run `python3 -m http.server 8787 --directory public`, then open
<http://localhost:8787>. Stop it with Ctrl+C; run the same command again to restart.

## Deploy (free plan)

Needs the `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` environment values. From this
`landing/` folder run:

```
npx wrangler@4 deploy
```

Wrangler (Cloudflare's command-line tool) uploads the `public/` files to the Worker
`tallywithus-landing` and attaches both domains. Cloudflare creates their DNS records
itself. Redeploying after an edit is the same command.

Check: open <https://tallywithus.com> and <https://www.tallywithus.com>. Both should show
the page within a few minutes, with a padlock in the address bar. If the deploy says a
DNS record already exists for one of the names, do not delete anything in a hurry. First
check what that record is for.

## Remove it

In the Cloudflare dashboard go to Workers & Pages, open `tallywithus-landing`, then
Settings, then Delete. That also removes its two custom domains. The app is unaffected.
