# Split Ledger v1 implementation history

Historical evidence consolidated on 2026-09-06 from the completed Amazon Context and v1
Frontend Migration plans. This is not a current handoff or specification. Current product,
engineering, testing, format, and backlog documents take precedence.

## Outcome

Split Ledger v1 adapted the approved v0 desktop language into the existing vanilla,
single-file production application, then added optional Amazon order context. It retained
the working parsers, payer-share arithmetic, rules, persistence, privacy-redacted outputs,
and settlement rather than adopting the prototype's React runtime and mocked controllers.

The owner accepted Import, Review, Settle, Rules & Files, Amazon context, and the overall
desktop UI. v1.0.0 was prepared locally after 81/81 assertions and a comprehensive
fictional release workflow.

## Why the architecture stayed vanilla

The reference prototype was one monolithic client component whose parsing, calculations,
file controls, persistence, and settlement were demonstrations. Keeping its Next.js/React
runtime would have required replacing nearly every proven controller while adding a build
and dependency surface. The production app therefore reused the prototype as a visual and
interaction contract only.

Presentation markup and CSS could change. Parsing, matching, rules, persistence, export,
archive, settlement logic, direct `file://` operation, and saved-file compatibility could
not be reinterpreted. The frozen engine block stayed DOM-free and ES5-compatible.

## Amazon context product decision

Amazon bank rows identify a retailer but not the products, forcing repeated account lookup
during Review. The chosen job was to show likely products beside the charge without
weakening privacy or making a financial decision.

The MVP:

- accepts manually copied Your Orders text and parses it locally;
- keeps verbatim full product titles and discards shipping identity, addresses, delivery
  messages, navigation, and other page noise;
- produces deterministic exact, ambiguous, constrained split-order, possible monthly-
  payment, and unmatched evidence;
- requires explicit confirmation where context can be selected and never recommends or
  assigns an ownership split;
- stores validated normalized orders and decisions only in the private session;
- stores neither raw Amazon text nor derived matches;
- excludes every Amazon-private field from shared exports and month archives;
- does not sign in, scrape, call an API, read email, allocate products to component
  charges, or support other retailers.

Integer cents and a bounded posting-date window govern matching. A unique exact total may
be suggested; repeated totals stay ambiguous. Only constrained nearby two/three-charge
sums may become order-level split evidence. Ordinary confirmed orders are consumed, while
an explicitly detected split order remains available to its linked charges.

## Amazon implementation record

| Date | Version | Phase and verified result | Assertions |
|---|---|---|---|
| 2026-09-04 | 0.4.1 | Noisy copied text became deduplicated, privacy-filtered normalized orders with verbatim products | 34→40 |
| 2026-09-04 | 0.4.2 | Pure matcher added deterministic evidence states without mutating financial inputs | 40→48 |
| 2026-09-04 | 0.4.3 | Optional Import flow summarized all match states without disturbing bank rows | 48→49 |
| 2026-09-04 | 0.4.4 | Review displayed products and explicit confirm/reject/ambiguity/limitation states | 49→53 |
| 2026-09-04 | 0.4.5 | Real-test completeness, interpretation, and order-consumption gaps were corrected | 53→59 |
| 2026-09-05 | 0.4.6 | Allowlisted safe diagnostic preceded private-context persistence | 59→62 |
| 2026-09-05 | 0.4.7 | Normalized context restored privately; shared/archive allowlists stayed clean | 62→69 |
| 2026-09-05 | 0.4.8 | Engineering documentation and focused acceptance scenario completed | 69→69 |
| 2026-09-05 | 0.9.4 | Valid orders could be normalized before a charge existed; matching stayed charge-driven | 69→69 |
| 2026-09-05 | 0.9.6 | Month-relative bank/Amazon samples exercised every state through production paths | 76→78 |

The first real grouped-Review tests produced six accepted trust corrections: navigation
labels cannot become products; ordinary confirmed orders cannot be reused; incomplete
pastes warn without discarding valid orders; bank and order dates appear together;
repeated/invalid/monthly counts and ambiguity evidence are explicit; and occurrence chips
say `bank charges` rather than using an unexplained multiplier.

## Frontend migration contract

The v0 appearance was treated as an implementation target:

- paper `#f6f8f2`, foreground `#1f2a25`, rule `#dfe6dc`, focus `#95c65a`;
- identity green `#c8f15d`, control green `#315b2d`, pale selected surfaces, restrained
  warnings, and quiet partner allocation color;
- 68px desktop header, approximately 1380px Review and 1180px Import/Settle frames,
  310–330px rails, and dedicated amount/ownership columns;
- Inter for interface text and monospace/tabular numerals only for money, identifiers,
  keys, version, and pasted data;
- 16px cards, light rules/shadows, calm spacing, long-text wrapping, visible focus, and
  reduced motion.

Mobile redesign was out of scope. Desktop rails followed the working reference source,
including Review's sticky rail, despite a conflicting prose handoff note.

### Production adaptations

The shared shell bound the reference header to real month, identity, workflow, version,
and storage state. Review retained grouping, filters, bulk assignment, custom shares,
remembered rules, amount correction, refund/credit evidence, pending/instalment states,
keyboard flow, details, and Amazon states. Import retained every parser result, refusal,
drop reason, balance guard, reconciliation total, coverage, and Amazon control. Settle
derived all incomplete/warning/ready/square/closed presentations from production state and
kept identity guards, checks, preview, one-sided warning, and append-only close. Rules &
Files applied the same frame and typography to existing settings, session, diagnostics,
history, and rule controls without creating new behavior.

Prototype behavior deliberately rejected included keyword demo parsing, fixture values,
absolute-value refund math, visually treating undecided as 50/50, alphabetical grouping,
mixing both people's cards locally, mocked Amazon counts, a hardcoded ready state,
presentational file buttons, and Vercel Analytics or any dependency/network request.

## Migration checkpoints

| Version | Accepted result |
|---|---|
| 0.9.0 | Local Inter, visual tokens, shared shell, desktop frames, focus, reduced motion |
| 0.9.1 | Four-column Review ledger, ownership controls, evidence, toolbar, progress, sticky rail |
| 0.9.2 | Reference Inter scale/weights and limited monospace scope |
| 0.9.3 | Production Import and Settle composed in the accepted page architecture |
| 0.9.4 | Reliable months, explicit reset/next month, qualified coverage, early Amazon context, pending continuity |
| 0.9.5 | Credits left ordinary Review; confident full/partial refunds netted through purchase splits |
| 0.9.6 | Rules & Files plus comprehensive selected-month production samples |
| 1.0.0 | Embedded Inter, source-mode correction, full audit, documentation consolidation |

## Acceptance findings retained

- Header and Import use synchronized, keyboard-usable month selectors. A populated month
  clears only after confirmation; durable settings and closed history remain.
- Closed months restore for inspection and offer an explicit clean next-month action.
- Coverage wording distinguishes printed statement headings from inferred transaction
  bounds and never claims that unseen rows were pasted.
- Pending rows are visible but non-blocking; an early optional decision survives the
  posted replacement.
- Credits keep their audit rows but not ownership controls. Confident refunds inherit the
  purchase split; other credits remain advisory and excluded.
- A shared-items preview and allowlisted builders enforce public-output privacy.

## Verification history

Every implementation batch ran the full suite before and after, with a revert-on-red rule.
Synthetic fixtures protected bank columns/totals, exclusions, coverage, duplicates,
canonicalization, ownership, refunds/credits, settlement, Amazon states, persistence,
privacy, saved-file compatibility, and the no-network invariant.

The v0.9.6 owner workflow accepted month-relative TD, BMO, posted-update, and Amazon
samples. The v1 audit repeated 23 rows across two cards, $1,917.49 imported net, printed
TD totals, adjacent filtering, posted replacement, full and 75% refunds, excluded rewards,
rules, keyboard actions, all Amazon states, reload restoration, shared preview privacy,
one-sided close, clean August transition, and 1100×800/1920×1080 layouts. v1 added exact
source-protocol assertions and finished at 81/81.

Direct-file browser automation was blocked by the automation browser's local-navigation
policy, not by the application. Owner acceptance, the embedded font, no-network assertion,
protocol classification, and direct-open architecture supply the v1 evidence. Remaining
downloaded-file inspection/clear-reload depth and heavy-ledger stress testing were routed
to OBS-003 and OBS-004 and explicitly do not block v1.

## Ideas deliberately left outside v1

Search was deferred as new capability. Private notes and stronger file-freshness signals
were not added without product decisions. Any AI fallback would require an explicit online
privacy/consent architecture and could only rank unresolved evidence—never confirm an
order, change money, choose a split, or enter settlement arithmetic.
