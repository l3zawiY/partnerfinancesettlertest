-- WEB-019: stable two-person household pairing.
--
-- Before this migration the server knew only that a Clerk organization existed. Which two
-- people were the financial pair was decided per month by whoever submitted first, and the
-- archive labelled them with a name typed in the browser. This migration gives the server
-- its own record of exactly two verified accounts bound to stable roles.
--
-- household_id remains the verified Clerk organization id (the tenant boundary). A row in
-- household_participants is the additional financial authorization: from now on, being an
-- organization member is necessary but not sufficient to read or change shared workflow
-- data. Emails and display names from Clerk are never copied here; the alias is a label the
-- person chooses for the household, and it is deliberately shared household data.
--
-- Nothing existing is edited or deleted. Existing per-period slot rows in
-- workflow_participants stay as immutable historical attribution; new periods derive their
-- slots from these roles (coordinator = a, partner = b).

CREATE TABLE household_pairings (
  household_id   TEXT PRIMARY KEY REFERENCES households (household_id),
  display_name   TEXT NOT NULL,
  initialized_at TEXT NOT NULL
);

CREATE TABLE household_participants (
  household_id TEXT NOT NULL REFERENCES household_pairings (household_id),
  user_id      TEXT NOT NULL,
  role         TEXT NOT NULL CHECK (role IN ('coordinator', 'partner')),
  alias        TEXT NOT NULL COLLATE NOCASE,
  joined_at    TEXT NOT NULL,
  -- One account holds at most one role in a household, so the coordinator can never also
  -- occupy the partner role.
  PRIMARY KEY (household_id, user_id),
  -- Each role exists once. Two accounts racing to join as partner cannot both succeed:
  -- the second insert fails and its whole batch rolls back.
  UNIQUE (household_id, role),
  -- Two participants with the same alias (ignoring case) could not be told apart in
  -- status, settlement, or an archive, so the database refuses it.
  UNIQUE (household_id, alias)
);

-- Events can now record the stable role of the person who acted, so status screens can
-- say "the partner withdrew" without exposing a Clerk id. Rows written before this
-- migration keep NULL here and are read as unattributed history.
ALTER TABLE workflow_events ADD COLUMN actor_role TEXT;
