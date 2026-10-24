import { normalizeLabel, ROLE_SLOT, sameLabel, type HouseholdPairing, type PairedParticipant, type ParticipantRole } from '../shared/pairing'
import type { SqlDatabase } from './db'

/**
 * Stable two-person household pairing on the server.
 *
 * Every function takes the household id and user id from the verified Clerk token; a
 * value chosen by the browser must never reach this file. The organization is the tenant
 * boundary. A row in household_participants is the additional financial authorization
 * that every shared workflow route must check through `requireParticipant`.
 *
 * The database constraints, not pre-checks, are the race guards: two people initializing
 * or joining at the same moment both pass the read, and the second insert fails inside
 * its transaction, so exactly one pairing and at most one partner ever exist.
 */

/** The request is well formed but the household is in a state that refuses it (HTTP 409). */
export class PairingConflictError extends Error { constructor(message: string) { super(message); this.name = 'PairingConflictError' } }
/** The verified caller may not do this at all (HTTP 403). */
export class PairingForbiddenError extends Error { constructor(message: string) { super(message); this.name = 'PairingForbiddenError' } }
/** The request content is unacceptable (HTTP 400). */
export class PairingValidationError extends Error { constructor(message: string) { super(message); this.name = 'PairingValidationError' } }

export interface VerifiedParticipant {
  userId: string
  role: ParticipantRole
  alias: string
  /** Archive payer slot derived from the stable role, never from submission order. */
  slot: 'a' | 'b'
}

interface PairingRow { display_name: string; initialized_at: string }
interface ParticipantRow { user_id: string; role: ParticipantRole; alias: string; joined_at: string }

const ADMIN_ROLE = 'org:admin'

async function pairingRow(database: SqlDatabase, householdId: string): Promise<PairingRow | null> {
  return database.prepare('SELECT display_name, initialized_at FROM household_pairings WHERE household_id = ?').bind(householdId).first<PairingRow>()
}

async function participantRows(database: SqlDatabase, householdId: string): Promise<ParticipantRow[]> {
  const { results } = await database.prepare('SELECT user_id, role, alias, joined_at FROM household_participants WHERE household_id = ? ORDER BY role').bind(householdId).all<ParticipantRow>()
  return results
}

function summary(row: ParticipantRow | undefined): PairedParticipant | null {
  return row ? { role: row.role, alias: row.alias, joinedAt: row.joined_at } : null
}

/**
 * Open months whose pre-WEB-019 slot rows do not map onto the stable roles. Each slot row
 * must belong to a current participant in that participant's own slot; anything else is
 * ambiguous and fails closed until a separately approved recovery. Closed months are
 * immutable history and are never flagged.
 */
export async function legacyRecoveryPeriods(database: SqlDatabase, householdId: string, participants: ParticipantRow[]): Promise<string[]> {
  if (!participants.length) return []
  const { results } = await database.prepare(
    'SELECT wp.period, wp.user_id, wp.slot FROM workflow_participants wp ' +
    'JOIN workflow_periods p ON p.household_id = wp.household_id AND p.period = wp.period ' +
    'WHERE wp.household_id = ? AND p.status = \'open\' ORDER BY wp.period, wp.slot',
  ).bind(householdId).all<{ period: string; user_id: string; slot: 'a' | 'b' }>()
  const expectedSlot = new Map(participants.map(function (row) { return [row.user_id, ROLE_SLOT[row.role]] }))
  const flagged = new Set<string>()
  for (const row of results) {
    if (expectedSlot.get(row.user_id) !== row.slot) flagged.add(row.period)
  }
  return Array.from(flagged).sort()
}

export async function readPairing(database: SqlDatabase, householdId: string, userId: string, organizationRole: string | null | undefined): Promise<HouseholdPairing> {
  const pairing = await pairingRow(database, householdId)
  const rows = pairing ? await participantRows(database, householdId) : []
  const coordinatorRow = rows.find(function (row) { return row.role === 'coordinator' })
  const partnerRow = rows.find(function (row) { return row.role === 'partner' })
  const mine = rows.find(function (row) { return row.user_id === userId })
  const coordinator = summary(coordinatorRow)
  const partner = summary(partnerRow)
  const state: HouseholdPairing['state'] = !pairing || !coordinator ? 'uninitialized' : !partner ? 'coordinator-only' : 'paired'
  return {
    state,
    householdName: state === 'uninitialized' ? null : pairing!.display_name,
    coordinator: state === 'uninitialized' ? null : coordinator,
    partner: state === 'uninitialized' ? null : partner,
    viewer: mine
      ? { kind: 'participant', role: mine.role, alias: mine.alias }
      : { kind: 'member', canInitialize: state === 'uninitialized' && organizationRole === ADMIN_ROLE, canJoinAsPartner: state === 'coordinator-only' },
    connected: state === 'uninitialized' ? 0 : state === 'coordinator-only' ? 1 : 2,
    recoveryRequiredPeriods: await legacyRecoveryPeriods(database, householdId, rows),
  }
}

/**
 * A verified organization administrator becomes the stable coordinator. Repeating the
 * call as that same coordinator is harmless; any other caller after initialization is
 * refused, and the household is never re-initialized.
 */
export async function initializeHousehold(input: {
  database: SqlDatabase; householdId: string; userId: string; organizationRole: string | null | undefined; householdName: string; alias: string; now: string
}): Promise<HouseholdPairing> {
  if (input.organizationRole !== ADMIN_ROLE) throw new PairingForbiddenError('Only a household administrator can set up Split Ledger for this household.')
  const householdName = normalizeLabel(input.householdName)
  const alias = normalizeLabel(input.alias)
  try {
    await input.database.batch([
      input.database.prepare('INSERT INTO household_pairings (household_id, display_name, initialized_at) VALUES (?, ?, ?)').bind(input.householdId, householdName, input.now),
      input.database.prepare('INSERT INTO household_participants (household_id, user_id, role, alias, joined_at) VALUES (?, ?, \'coordinator\', ?, ?)').bind(input.householdId, input.userId, alias, input.now),
    ])
  } catch (error) {
    const existing = await readPairing(input.database, input.householdId, input.userId, input.organizationRole)
    if (existing.state === 'uninitialized') throw error
    if (existing.viewer.kind === 'participant' && existing.viewer.role === 'coordinator') return existing
    throw new PairingConflictError('This household is already set up in Split Ledger by another coordinator.')
  }
  return readPairing(input.database, input.householdId, input.userId, input.organizationRole)
}

/**
 * The invited account explicitly claims the vacant partner role. The invitation itself
 * carried only organization membership; this is the step that grants financial access.
 */
export async function joinAsPartner(input: { database: SqlDatabase; householdId: string; userId: string; organizationRole: string | null | undefined; alias: string; now: string }): Promise<HouseholdPairing> {
  const rows = await participantRows(input.database, input.householdId)
  const coordinator = rows.find(function (row) { return row.role === 'coordinator' })
  if (!coordinator) throw new PairingConflictError('This household is not set up in Split Ledger yet. The coordinator must set it up first.')
  const mine = rows.find(function (row) { return row.user_id === input.userId })
  if (mine?.role === 'partner') return readPairing(input.database, input.householdId, input.userId, input.organizationRole)
  if (mine) throw new PairingForbiddenError('The coordinator cannot also join as partner.')
  if (rows.some(function (row) { return row.role === 'partner' })) throw new PairingConflictError('This household already has two Split Ledger participants. The partner role is no longer available.')
  const alias = normalizeLabel(input.alias)
  if (sameLabel(alias, coordinator.alias)) throw new PairingValidationError('Choose an alias that is different from the coordinator\'s alias.')
  try {
    await input.database.batch([
      input.database.prepare('INSERT INTO household_participants (household_id, user_id, role, alias, joined_at) VALUES (?, ?, \'partner\', ?, ?)').bind(input.householdId, input.userId, alias, input.now),
    ])
  } catch (error) {
    const after = await participantRows(input.database, input.householdId)
    if (after.some(function (row) { return row.role === 'partner' && row.user_id !== input.userId })) throw new PairingConflictError('Another account claimed the partner role moments ago. The partner role is no longer available.')
    throw error
  }
  return readPairing(input.database, input.householdId, input.userId, input.organizationRole)
}

/**
 * The financial authorization check for every shared workflow route. Organization
 * membership got the caller this far; only one of the two paired accounts gets further.
 * Administrator status alone never passes.
 */
export async function requireParticipant(database: SqlDatabase, householdId: string, userId: string): Promise<VerifiedParticipant> {
  const rows = await participantRows(database, householdId)
  const mine = rows.find(function (row) { return row.user_id === userId })
  if (mine) return { userId, role: mine.role, alias: mine.alias, slot: ROLE_SLOT[mine.role] }
  if (!rows.length) throw new PairingForbiddenError('Split Ledger is not set up for this household yet. A household administrator must set it up first.')
  if (rows.length === 1) throw new PairingForbiddenError('Join this household as partner before using the shared workflow.')
  throw new PairingForbiddenError('This household already has two Split Ledger participants. Shared financial workflow is limited to them.')
}

/** The other paired participant, or null while the pairing is incomplete. */
export async function pairedCounterpart(database: SqlDatabase, householdId: string, participant: VerifiedParticipant): Promise<VerifiedParticipant | null> {
  const rows = await participantRows(database, householdId)
  const other = rows.find(function (row) { return row.user_id !== participant.userId })
  return other ? { userId: other.user_id, role: other.role, alias: other.alias, slot: ROLE_SLOT[other.role] } : null
}

/**
 * WEB-022: the coordinator records which Clerk invitation is the partner invitation. The
 * caller has already confirmed with Clerk that the invitation belongs to this household.
 */
export async function recordPartnerInvitation(input: { database: SqlDatabase; householdId: string; userId: string; organizationRole: string | null | undefined; invitationId: string; now: string }): Promise<HouseholdPairing> {
  const rows = await participantRows(input.database, input.householdId)
  const mine = rows.find(function (row) { return row.user_id === input.userId })
  if (mine?.role !== 'coordinator') throw new PairingForbiddenError('Only the coordinator can invite the partner.')
  if (rows.some(function (row) { return row.role === 'partner' })) throw new PairingConflictError('This household already has two Split Ledger participants.')
  await input.database.batch([
    input.database.prepare('INSERT INTO household_partner_invitations (household_id, invitation_id, recorded_by, recorded_at) VALUES (?, ?, ?, ?) ON CONFLICT (household_id) DO UPDATE SET invitation_id = excluded.invitation_id, recorded_by = excluded.recorded_by, recorded_at = excluded.recorded_at').bind(input.householdId, input.invitationId, input.userId, input.now),
  ])
  return readPairing(input.database, input.householdId, input.userId, input.organizationRole)
}

export async function partnerInvitationId(database: SqlDatabase, householdId: string): Promise<string | null> {
  const row = await database.prepare('SELECT invitation_id FROM household_partner_invitations WHERE household_id = ?').bind(householdId).first<{ invitation_id: string }>()
  return row ? row.invitation_id : null
}

/**
 * WEB-022: refuses "Join as partner" unless the caller's verified email matches the
 * recorded partner invitation. Emails are compared in memory and never stored.
 */
export async function assertInvitedPartner(input: {
  database: SqlDatabase; householdId: string; userId: string
  invitation: (invitationId: string) => Promise<{ emailAddress: string; status: string } | null>
  verifiedEmails: () => Promise<string[]>
}): Promise<void> {
  const rows = await participantRows(input.database, input.householdId)
  // Already the partner (an idempotent retry) or the role is taken: joinAsPartner answers.
  if (rows.some(function (row) { return row.role === 'partner' })) return
  if (rows.some(function (row) { return row.user_id === input.userId })) return
  const invitationId = await partnerInvitationId(input.database, input.householdId)
  if (!invitationId) throw new PairingForbiddenError('No partner invitation is recorded for this household yet. Ask the coordinator to invite you from Split Ledger\'s Invite partner panel.')
  const invitation = await input.invitation(invitationId)
  if (!invitation || invitation.status === 'revoked') throw new PairingForbiddenError('The partner invitation for this household is no longer valid. Ask the coordinator to invite you again from Split Ledger.')
  const emails = await input.verifiedEmails()
  if (!emails.includes(invitation.emailAddress.toLowerCase())) throw new PairingForbiddenError('The partner invitation for this household was sent to a different email address. Only the invited person can join as partner.')
}
