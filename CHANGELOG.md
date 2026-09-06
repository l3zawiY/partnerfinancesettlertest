# Changelog

`VERSION` in `index.html` is authoritative and is stamped into exported files. Release
changes must update both places. Detailed implementation evidence through v1 is preserved
in `docs/archive/V1-IMPLEMENTATION-HISTORY.md`.

## 1.0.0 — 2026-09-06

Split Ledger's owner-accepted Import, Review, Settle, Rules & Files, Amazon context, and
responsive desktop workflow are released locally as v1.0.0.

### Release changes

- Embedded the Inter 4.1 variable font and its SIL Open Font License notice in
  `index.html`, completing direct-file and offline single-file packaging.
- Corrected the safe diagnostic to classify `file:`, `http:`, and `https:` distinctly;
  removed completed OBS-001 and added three regression assertions.
- Consolidated active documentation around current product, engineering, testing, format,
  backlog, and release responsibilities; moved detailed v1 plans to one historical record.
- Preserved the no-backend, no-account, no-upload, no-telemetry, and no-network boundary,
  plus all parser, arithmetic, ownership, privacy, persistence, and saved-file contracts.

### Release evidence

- Automated and in-browser suites: 78/78 before release edits; 81/81 after.
- Fictional selected-month workflow: TD 14 rows / $1,568.05, BMO 9 rows / $349.44,
  combined 23 rows / $1,917.49; printed TD block totals $1,522.04 and $252.54 reconciled.
- Verified adjacent-month filtering, pending-to-posted replacement with ownership retained,
  full and 75% partial refunds, cashback/reward exclusion, ambiguous/unmatched credits,
  ownership presets, remembered rules, keyboard review, settlement checks, one-sided close,
  archive redaction, automatic restoration, closed history, and clean next month.
- Amazon sample produced all seven charge states: one exact, two ambiguous, two split-order,
  one possible monthly-payment, and one unmatched; match decisions did not change money.
- Verified 1100×800 laptop and 1920×1080 desktop layouts. Direct `file://` UI automation
  was blocked by browser tooling; direct-file behavior remains owner-accepted and is
  protected by source, offline, and protocol assertions.

## Earlier milestones

| Version | Shipped outcome |
|---|---|
| 0.9.6 | Month-relative TD/BMO/Amazon samples and January/December boundary assertions; 78/78 |
| 0.9.5 | Confident full/partial-refund policy and exclusion of other credits; 76/76 |
| 0.9.4 | Reliable month switching, next-month flow, qualified coverage, early Amazon paste, pending-row continuity |
| 0.9.3 | Accepted v0-style Import, Review, and Settle composition without logic changes |
| 0.9.2 | Inter typography and intentional monospace scope corrected |
| 0.9.1 | Four-column Review workspace, progress, allocation evidence, details, and sticky rail |
| 0.9.0 | v1 visual tokens, shared shell, focus, reduced motion, and local Inter checkpoint |
| 0.4.8 | Amazon release-candidate documentation and focused owner scenario |
| 0.4.7 | Private Amazon session persistence and public-output privacy assertions; 69/69 |
| 0.4.6 | Allowlisted safe diagnostic and maintenance-header correction; 62/62 |
| 0.4.5 | Amazon completeness, navigation filtering, dates, counts, and order-consumption corrections; 59/59 |
| 0.4.4 | Amazon Review evidence and explicit confirm/reject/ambiguity states; 53/53 |
| 0.4.3 | Optional local Amazon Import flow and match-state summary; 49/49 |
| 0.4.2 | Pure deterministic Amazon matcher; 48/48 |
| 0.4.1 | Privacy-filtered Amazon order parser with verbatim products; 40/40 |
| 0.4.0 | Gated amount correction, fuller reload persistence, shortcut and instalment-rule fixes; 34/34 |
| 0.3.0 | Synthetic self-test, controlled identity/cards, shared categories, status, close/archive, safer refunds |
| 0.2.0 | Per-bank parsers, balance guard, coverage/totals, canonicalization, checks, and pending handling |
| 0.1.0 | Initial local import, review, rules, redacted export, settlement, and session workflow |

All changes through v1 used additive compatibility where possible. Shared export v1 and
archive v1 remain frozen; session readers still accept v1–v3.
