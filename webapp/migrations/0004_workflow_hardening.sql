-- Production hardening. One event owns each committed workflow version, which turns a
-- concurrent stale batch into a constraint failure and rolls the whole D1 batch back.
CREATE UNIQUE INDEX workflow_events_one_per_version
  ON workflow_events (household_id, period, version);

-- Commands need an explicit period so cancelling one abandoned period can remove only
-- its replay receipts. Existing local fictional receipts remain valid with NULL here.
ALTER TABLE workflow_commands ADD COLUMN period TEXT;
CREATE INDEX workflow_commands_by_period
  ON workflow_commands (household_id, period, created_at);
