-- Batch 2 schema. Non-financial only: this database exists to prove that a household
-- boundary is enforced on the server, not to store shared finance data.
--
-- household_id is a Clerk organization id. Clerk owns membership; this database never
-- copies member profiles and never becomes a second source of truth for who belongs to
-- whom. It only records that a household exists and what belongs to it.

CREATE TABLE households (
  household_id TEXT PRIMARY KEY,
  created_at   TEXT NOT NULL
);

-- Fictional test records. Batch 3 replaces this with the first real shared entity.
CREATE TABLE household_notes (
  id           TEXT PRIMARY KEY,
  household_id TEXT NOT NULL REFERENCES households (household_id),
  label        TEXT NOT NULL,
  created_at   TEXT NOT NULL
);

-- Every read of this table is filtered by household_id, so the index matches the only
-- access pattern the application has.
CREATE INDEX household_notes_by_household ON household_notes (household_id, created_at);
