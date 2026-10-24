# CLAUDE.md

Claude instructions for the experimental `webapp/` service. Read the relevant parts of
`docs/WEBAPP.md` before implementation and use `docs/WEBAPP-BACKLOG.md` only for planning
or backlog work.

- This is an authorized learning experiment, not the released offline product.
- React, TypeScript, a build step, Clerk authentication, and an allowlisted Cloudflare API
  are permitted here; these exceptions never apply to root `index.html`.
- Keep complete bank histories, private transactions, Amazon context, merchant rules, and
  draft decisions in the browser. The service may receive only explicitly allowlisted
  shared items.
- Never commit credentials or real financial data.
- Authentication proves identity; every API route must separately enforce authorization.
- Keep financial arithmetic deterministic and testable outside UI and network layers.
- Match tests and manual checks to the changed area and risk; use the commands and
  acceptance criteria documented for the web app.

