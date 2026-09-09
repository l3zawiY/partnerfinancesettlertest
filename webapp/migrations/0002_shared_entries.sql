-- Batch 3 schema. The first fictional shared-finance entity, proving the vertical slice
-- (browser -> API -> Worker -> D1) before Batch 4 moves real private data over.
--
-- amount_cents is an integer. Money is never stored as a float here: the roadmap calls
-- this out explicitly, and floating-point cents is a classic source of settlement drift.
--
-- id is client-generated and doubles as the idempotency key. Re-submitting the same id
-- with the same household is a safe retry (INSERT ... ON CONFLICT DO UPDATE in db.ts);
-- resubmitting it with different fields is treated as an edit, and version increments so
-- a reader can tell the row changed under it. This is a rehearsal entity: no version
-- history is retained. Full edit/withdraw/lock workflow state belongs to Batch 5.

CREATE TABLE shared_entries (
  id            TEXT PRIMARY KEY,
  household_id  TEXT NOT NULL REFERENCES households (household_id),
  submitted_by  TEXT NOT NULL,
  date          TEXT NOT NULL,
  merchant      TEXT NOT NULL,
  category      TEXT NOT NULL,
  amount_cents  INTEGER NOT NULL,
  share         REAL NOT NULL,
  version       INTEGER NOT NULL,
  created_at    TEXT NOT NULL,
  updated_at    TEXT NOT NULL
);

-- Every read of this table is filtered by household_id and ordered by date, matching the
-- only access pattern the application has (same convention as household_notes_by_household).
CREATE INDEX shared_entries_by_household ON shared_entries (household_id, date);
