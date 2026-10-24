-- WEB-022: only the invited account may claim the partner role.
--
-- When the coordinator invites a partner from Split Ledger, the browser creates the Clerk
-- organization invitation and then tells the Worker only the invitation's id. The Worker
-- confirms with Clerk that the invitation belongs to this household and records the id
-- here. "Join as partner" is then accepted only from an account whose verified email
-- matches that invitation, read from Clerk at join time. Email addresses are never stored
-- in Split Ledger; only the opaque invitation id is.
--
-- One row per household: a newer partner invitation replaces the older one while the
-- partner role is vacant. Nothing existing is edited or deleted.

CREATE TABLE household_partner_invitations (
  household_id  TEXT PRIMARY KEY REFERENCES household_pairings (household_id),
  invitation_id TEXT NOT NULL,
  recorded_by   TEXT NOT NULL,
  recorded_at   TEXT NOT NULL
);
