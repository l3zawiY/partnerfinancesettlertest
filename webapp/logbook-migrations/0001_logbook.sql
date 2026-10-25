-- Pilot logbook (WEB-048). This database is separate from the financial database: it never
-- holds shared projections, archives, merchants, amounts, names, emails, card labels, or
-- Clerk ids. household_ref is a one-way digest of the household, so rows group by household
-- without naming it. Rows older than 180 days are deleted by the Worker's daily schedule.
CREATE TABLE logbook (
  id               INTEGER PRIMARY KEY,
  at               TEXT NOT NULL,
  environment      TEXT NOT NULL,
  source           TEXT NOT NULL CHECK (source IN ('browser', 'worker')),
  kind             TEXT NOT NULL CHECK (kind IN ('error', 'activity')),
  event            TEXT NOT NULL,
  household_ref    TEXT,
  role             TEXT CHECK (role IN ('coordinator', 'partner')),
  month            TEXT,
  screen           TEXT,
  route            TEXT,
  status           INTEGER,
  error_type       TEXT,
  code_location    TEXT,
  reference        TEXT,
  app_version      TEXT,
  count            INTEGER,
  duration_seconds INTEGER
);

CREATE INDEX logbook_at ON logbook (at);
CREATE INDEX logbook_household_at ON logbook (household_ref, at);
