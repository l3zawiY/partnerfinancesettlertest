# Web-service backlog

Unresolved work for the `webapp/` experiment only. Items about the released single-file
`index.html` application belong in `docs/BACKLOG.md`. Completed engineering items are
removed and recorded in `docs/WEBAPP.md`; stable ids are never reused.

## Observations

### WEB-005 — Complete invited-partner household acceptance

The Worker derives the household only from a verified Clerk organization token, and
automation proves same-household sharing, different-household isolation, and the two-person
limit. The remaining evidence requires the owner: invite a second Development account into
the existing fictional organization and verify that it joins rather than creating another
household. Follow H6-01 in `docs/WEBAPP-HUMAN-TESTING.md`.

*Noticed: 2026-09-07.*

### WEB-010 — Complete deferred Batch 4c owner verification

Automation and coding-agent browser checks cover Amazon evidence, amount correction,
private restoration, and allowlisted export. The owner must still judge the complete
fictional path and inspect both downloaded files. Follow H4C-01 through H4C-05 in
`docs/WEBAPP-HUMAN-TESTING.md`.

*Noticed: 2026-09-09.*

### WEB-012 — Complete deferred Batch 5 owner acceptance

Rendered tests cover the complete fictional journey, accessibility contracts, and narrow
layout structure. The owner must still accept the product journey and visual behavior in a
real browser. Follow H5-01 through H5-05 and H6-04.

*Noticed: 2026-09-10.*

### WEB-013 — Complete deferred Batch 6 two-account owner acceptance

Worker/SQLite tests model two verified identities in one household but cannot prove Clerk's
live invitation screens or two real sessions. With fictional data, follow H6-01 through
H6-07. Do not mark this complete from automation alone.

*Noticed: 2026-09-10.*

## Post-MVP evolutions

These ideas are deliberately outside the first production-ready release. They should not
delay the current MVP or be confused with completed behavior.

### WEB-017 — Search the Review ledger

Add a search field on the Review page so a person can quickly find transactions by merchant
or transaction description. Consider category search as part of the same design. Search
must work together with the existing review filters, be keyboard and screen-reader
accessible, and remain usable on a narrow phone layout.

*Noticed: 2026-09-11.*

### WEB-018 — Save settled shared transactions for historical expense analytics

When the partners settle a month, preserve the finalized **shared transactions for both
partners** as that month's shared-expense history. Retain the details needed to review past
spending: settlement month, transaction date, merchant, shared category, shared amount,
which partner paid, and the amount and percentage attributed to each partner. Then add
read-only analytics across previous settled months, including totals and breakdowns by
month, category, merchant, partner-paid amount, and partner-paid percentage.

Cloudflare D1 (the hosted SQL database already selected for the shared workflow) is the
expected storage location. The saved history must contain the finalized shared view, not a
copy of either partner's complete private ledger. Private transactions, card labels, private
rules, and Amazon-only evidence remain on that partner's device and must not be added merely
for analytics. Define retention, correction, deletion, authorization, schema migrations,
and privacy-projection tests when this evolution is designed.

*Noticed: 2026-09-11.*
