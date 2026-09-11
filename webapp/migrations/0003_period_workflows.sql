-- Batch 6: authoritative two-person period workflow. The browser still owns every private
-- row. These tables contain only verified identities, privacy-filtered projections,
-- immutable closed archives, and non-financial workflow metadata.

CREATE TABLE workflow_periods (
  household_id TEXT NOT NULL REFERENCES households (household_id),
  period       TEXT NOT NULL,
  version      INTEGER NOT NULL DEFAULT 0,
  status       TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed')),
  closed_at    TEXT,
  archive_json TEXT,
  created_at   TEXT NOT NULL,
  updated_at   TEXT NOT NULL,
  PRIMARY KEY (household_id, period)
);

CREATE TABLE workflow_participants (
  household_id TEXT NOT NULL,
  period       TEXT NOT NULL,
  user_id      TEXT NOT NULL,
  slot         TEXT NOT NULL CHECK (slot IN ('a', 'b')),
  joined_at    TEXT NOT NULL,
  PRIMARY KEY (household_id, period, user_id),
  UNIQUE (household_id, period, slot),
  FOREIGN KEY (household_id, period) REFERENCES workflow_periods (household_id, period) ON DELETE CASCADE
);

CREATE TABLE workflow_submissions (
  household_id      TEXT NOT NULL,
  period            TEXT NOT NULL,
  submitted_by      TEXT NOT NULL,
  projection_json   TEXT NOT NULL,
  submission_version INTEGER NOT NULL,
  submitted_at      TEXT NOT NULL,
  PRIMARY KEY (household_id, period, submitted_by),
  FOREIGN KEY (household_id, period, submitted_by) REFERENCES workflow_participants (household_id, period, user_id) ON DELETE CASCADE
);

CREATE TABLE workflow_events (
  id           TEXT PRIMARY KEY,
  household_id TEXT NOT NULL,
  period       TEXT NOT NULL,
  version      INTEGER NOT NULL,
  actor_id     TEXT NOT NULL,
  action       TEXT NOT NULL CHECK (action IN ('submit', 'replace', 'withdraw', 'close', 'restore')),
  created_at   TEXT NOT NULL,
  FOREIGN KEY (household_id, period) REFERENCES workflow_periods (household_id, period) ON DELETE CASCADE
);

CREATE INDEX workflow_events_by_period ON workflow_events (household_id, period, version);

CREATE TABLE workflow_commands (
  household_id TEXT NOT NULL REFERENCES households (household_id),
  request_id   TEXT NOT NULL,
  actor_id     TEXT NOT NULL,
  command_type TEXT NOT NULL,
  request_json TEXT NOT NULL,
  response_json TEXT NOT NULL,
  created_at   TEXT NOT NULL,
  PRIMARY KEY (household_id, request_id)
);

CREATE TABLE workflow_deletion_tokens (
  token        TEXT PRIMARY KEY,
  household_id TEXT NOT NULL REFERENCES households (household_id),
  expires_at   TEXT NOT NULL,
  created_at   TEXT NOT NULL
);

CREATE INDEX workflow_deletion_tokens_by_household ON workflow_deletion_tokens (household_id, expires_at);
