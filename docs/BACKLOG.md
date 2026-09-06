# Backlog

Only unresolved work belongs here. An observation is a verified follow-up; an idea needs a
product decision before implementation. Completed items are removed and recorded in
`CHANGELOG.md`.

IDs are permanent even after removal. Use the next unused `OBS-###` or `IDEA-###`, keep
gaps, never renumber or reuse, and end entries with `*Noticed: YYYY-MM-DD.*` or
`*Added: YYYY-MM-DD.*`.

## Observations

### OBS-003 — Complete deferred Amazon restoration and privacy acceptance

In a fictional isolated browser state, inspect the downloaded private session, shared
export, and month archive; verify automatic restoration and clear-then-reload behavior.
The session may contain validated normalized Amazon orders and decisions but no raw paste
or stored derived matches. Shared exports and archives must contain no Amazon-private
fields, and clearing context must survive reload without removing bank rows.

Automation already protects restoration, older-session clearing, validation, match
recalculation, raw/derived omission, and public-output allowlists. This hands-on evidence
is useful but does not block v1.

*Noticed: 2026-09-06.*

### OBS-004 — Optional large-ledger desktop stress test

Exercise a fictional heavy month at laptop and external-monitor widths. Check scrolling,
sticky rails, keyboard navigation, long merchant/Amazon text, layout stability, and
responsiveness. Log a defect only if volume reveals a concrete problem. This does not
block v1.

*Noticed: 2026-09-06.*

## Ideas

### IDEA-001 — Optional AI fallback for unresolved Amazon matches

Consider an explicitly online, consented helper that ranks only unresolved candidates.
It would introduce sensitive-data handling, cost, nondeterminism, and a network boundary,
so it requires separate product and architecture approval. It may never confirm a match,
change money, choose a split, or enter settlement arithmetic.

*Added: 2026-09-04.*

### IDEA-002 — Search transactions during Review

Consider a local Review search that remains coherent with grouping, undecided filtering,
row focus, and J/K navigation and cannot mutate decisions or settlement. It was excluded
from v1 because it is a new capability, not necessary presentation work.

*Added: 2026-09-05.*

### IDEA-003 — Privacy-safe diagnostic v2 and bounded activity history

Design, do not yet implement, a support report that can explain autosave/autoload failures.
Potential allowlisted signals include source protocol class, current versus saved counts,
snapshot format/version/size/validity, coarse lifecycle states for autosave, autoload,
session load, Amazon processing, bank import, export, and archive, plus a fixed-size event
ring. Decide explicitly whether timestamps or separate persistence are worth their privacy
cost.

The report must continue excluding identities, card labels, periods, transaction IDs and
dates, merchants, descriptions, amounts, products, order IDs, raw paste, filenames, paths,
hosts, URLs, saved-file contents, exception messages, and stack traces. It stays manually
copied: no telemetry, background transmission, accounts, uploads, or network service.

*Added: 2026-09-05.*
