import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { isHouseholdPairingResponse, type HouseholdPairing, type HouseholdPairingResponse } from '../shared/pairing'
import { ensureHousehold } from './db'
import { createWorker, type WorkerEnvironment } from './index'
import {
  initializeHousehold,
  joinAsPartner,
  legacyRecoveryPeriods,
  pairedCounterpart,
  PairingConflictError,
  PairingForbiddenError,
  PairingValidationError,
  readPairing,
  requireParticipant,
} from './pairing'
import { fixtureDirectory } from './testing/fixtureDirectory'
import { createTestDatabase, type TestDatabase } from './testing/sqliteDatabase'

const HOUSEHOLD_A = 'org_fixture_household_a'
const HOUSEHOLD_B = 'org_fixture_household_b'
const NOW = '2026-09-01T00:00:00.000Z'

let database: TestDatabase

beforeEach(async function () {
  database = createTestDatabase()
  await ensureHousehold(database, HOUSEHOLD_A, NOW)
  await ensureHousehold(database, HOUSEHOLD_B, NOW)
})
afterEach(function () { database.close() })

function initialize(userId: string, organizationRole: string | null, householdId = HOUSEHOLD_A, alias = 'Fictional A', householdName = 'Fictional Household') {
  return initializeHousehold({ database, householdId, userId, organizationRole, householdName, alias, now: NOW })
}

function join(userId: string, alias = 'Fictional B', householdId = HOUSEHOLD_A) {
  return joinAsPartner({ database, householdId, userId, organizationRole: 'org:member', alias, now: NOW })
}

async function count(table: string): Promise<number> {
  const row = await database.prepare('SELECT COUNT(*) AS total FROM ' + table).first<{ total: number }>()
  return Number(row?.total || 0)
}

describe('stable household pairing', function () {
  it('reports an uninitialized household and lets only an administrator initialize it', async function () {
    const asMember = await readPairing(database, HOUSEHOLD_A, 'user_member', 'org:member')
    expect(asMember).toEqual({ state: 'uninitialized', householdName: null, coordinator: null, partner: null, viewer: { kind: 'member', canInitialize: false, canJoinAsPartner: false }, connected: 0, recoveryRequiredPeriods: [] })
    const asAdmin = await readPairing(database, HOUSEHOLD_A, 'user_admin', 'org:admin')
    expect(asAdmin.viewer).toEqual({ kind: 'member', canInitialize: true, canJoinAsPartner: false })

    await expect(initialize('user_member', 'org:member')).rejects.toBeInstanceOf(PairingForbiddenError)
    await expect(initialize('user_member', null)).rejects.toBeInstanceOf(PairingForbiddenError)
    expect(await count('household_pairings')).toBe(0)

    const pairing = await initialize('user_admin', 'org:admin', HOUSEHOLD_A, '  Fictional   A ', ' Fictional  Household ')
    expect(pairing.state).toBe('coordinator-only')
    expect(pairing.connected).toBe(1)
    expect(pairing.householdName).toBe('Fictional Household')
    expect(pairing.coordinator).toEqual({ role: 'coordinator', alias: 'Fictional A', joinedAt: NOW })
    expect(pairing.partner).toBeNull()
    expect(pairing.viewer).toEqual({ kind: 'participant', role: 'coordinator', alias: 'Fictional A' })
    expect(JSON.stringify(pairing)).not.toMatch(/user_|org_|@/)
  })

  it('keeps initialization atomic under a race and idempotent for the same coordinator', async function () {
    // Both administrators read "uninitialized" before either writes: the classic race.
    expect((await readPairing(database, HOUSEHOLD_A, 'user_admin_1', 'org:admin')).state).toBe('uninitialized')
    expect((await readPairing(database, HOUSEHOLD_A, 'user_admin_2', 'org:admin')).state).toBe('uninitialized')
    await initialize('user_admin_1', 'org:admin')
    await expect(initialize('user_admin_2', 'org:admin', HOUSEHOLD_A, 'Fictional Other')).rejects.toBeInstanceOf(PairingConflictError)
    expect(await count('household_pairings')).toBe(1)
    expect(await count('household_participants')).toBe(1)

    // The first coordinator repeating the request (a reload, a double click) changes nothing.
    const repeated = await initialize('user_admin_1', 'org:admin', HOUSEHOLD_A, 'Renamed Attempt', 'Renamed Household')
    expect(repeated.coordinator?.alias).toBe('Fictional A')
    expect(repeated.householdName).toBe('Fictional Household')
    expect(await count('household_participants')).toBe(1)
  })

  it('rolls the pairing and coordinator rows back together when storage fails mid-batch', async function () {
    for (const boundary of [0, 1]) {
      database.failBatchAt(boundary)
      await expect(initialize('user_admin', 'org:admin')).rejects.toThrow(/Injected batch failure/)
      database.failBatchAt(null)
      expect(await count('household_pairings')).toBe(0)
      expect(await count('household_participants')).toBe(0)
    }
    await initialize('user_admin', 'org:admin')
    database.failBatchAt(0)
    await expect(join('user_partner')).rejects.toThrow(/Injected batch failure/)
    database.failBatchAt(null)
    expect((await readPairing(database, HOUSEHOLD_A, 'user_partner', 'org:member')).state).toBe('coordinator-only')
  })

  it('binds exactly one partner, refuses the coordinator, and reports a full pairing safely', async function () {
    await expect(join('user_partner')).rejects.toBeInstanceOf(PairingConflictError)
    await initialize('user_admin', 'org:admin')
    expect((await readPairing(database, HOUSEHOLD_A, 'user_partner', 'org:member')).viewer).toEqual({ kind: 'member', canInitialize: false, canJoinAsPartner: true })

    await expect(join('user_admin', 'Fictional Admin Again')).rejects.toBeInstanceOf(PairingForbiddenError)
    await expect(join('user_partner', 'fictional a')).rejects.toBeInstanceOf(PairingValidationError)

    const paired = await join('user_partner', ' Fictional  B ')
    expect(paired.state).toBe('paired')
    expect(paired.connected).toBe(2)
    expect(paired.partner).toEqual({ role: 'partner', alias: 'Fictional B', joinedAt: NOW })
    expect(paired.viewer).toEqual({ kind: 'participant', role: 'partner', alias: 'Fictional B' })

    const repeated = await join('user_partner', 'Different Alias Attempt')
    expect(repeated.partner?.alias).toBe('Fictional B')

    await expect(join('user_third', 'Fictional C')).rejects.toThrow(/already has two/)
    const third = await readPairing(database, HOUSEHOLD_A, 'user_third', 'org:admin')
    expect(third.viewer).toEqual({ kind: 'member', canInitialize: false, canJoinAsPartner: false })
    expect(third.coordinator?.alias).toBe('Fictional A')
    expect(third.partner?.alias).toBe('Fictional B')

    // The database itself refuses a second partner and a duplicate alias, so the
    // pre-checks above are a courtesy rather than the guarantee.
    await expect(database.prepare('INSERT INTO household_participants (household_id, user_id, role, alias, joined_at) VALUES (?, ?, \'partner\', ?, ?)').bind(HOUSEHOLD_A, 'user_third', 'Fictional C', NOW).run()).rejects.toThrow(/UNIQUE/)
    await expect(database.prepare('UPDATE household_participants SET alias = ? WHERE household_id = ? AND user_id = ?').bind('FICTIONAL A', HOUSEHOLD_A, 'user_partner').run()).rejects.toThrow(/UNIQUE/)
    await expect(database.prepare('UPDATE household_participants SET role = \'partner\' WHERE household_id = ? AND user_id = ?').bind(HOUSEHOLD_A, 'user_admin').run()).rejects.toThrow(/UNIQUE/)
    expect(await count('household_participants')).toBe(2)
  })

  it('authorizes only the two paired accounts and derives stable slots from roles', async function () {
    await expect(requireParticipant(database, HOUSEHOLD_A, 'user_admin')).rejects.toThrow(/not set up/)
    await initialize('user_admin', 'org:admin')
    await expect(requireParticipant(database, HOUSEHOLD_A, 'user_partner')).rejects.toThrow(/Join this household as partner/)
    await join('user_partner')

    expect(await requireParticipant(database, HOUSEHOLD_A, 'user_admin')).toEqual({ userId: 'user_admin', role: 'coordinator', alias: 'Fictional A', slot: 'a' })
    expect(await requireParticipant(database, HOUSEHOLD_A, 'user_partner')).toEqual({ userId: 'user_partner', role: 'partner', alias: 'Fictional B', slot: 'b' })
    expect(await pairedCounterpart(database, HOUSEHOLD_A, await requireParticipant(database, HOUSEHOLD_A, 'user_partner'))).toEqual({ userId: 'user_admin', role: 'coordinator', alias: 'Fictional A', slot: 'a' })

    // A third organization member, even an administrator, is not a financial participant.
    await expect(requireParticipant(database, HOUSEHOLD_A, 'user_third')).rejects.toThrow(/already has two/)
    // Membership in a different household grants nothing here.
    await expect(requireParticipant(database, HOUSEHOLD_B, 'user_admin')).rejects.toBeInstanceOf(PairingForbiddenError)
  })

  it('isolates two households that chose the same display name and aliases', async function () {
    await initialize('user_admin_a', 'org:admin', HOUSEHOLD_A, 'Alex', 'Our Home')
    await initialize('user_admin_b', 'org:admin', HOUSEHOLD_B, 'Alex', 'Our Home')
    await join('user_partner_a', 'Sam', HOUSEHOLD_A)
    const b = await readPairing(database, HOUSEHOLD_B, 'user_partner_a', 'org:member')
    expect(b.state).toBe('coordinator-only')
    expect(b.viewer).toEqual({ kind: 'member', canInitialize: false, canJoinAsPartner: true })
    expect((await readPairing(database, HOUSEHOLD_A, 'user_admin_a', 'org:admin')).connected).toBe(2)
    await expect(requireParticipant(database, HOUSEHOLD_B, 'user_partner_a')).rejects.toBeInstanceOf(PairingForbiddenError)
  })
})

describe('migration 0005 over an existing local database', function () {
  const OPEN_MAPPABLE = '2026-07'
  const OPEN_STRANGER = '2026-06'
  const CLOSED_LEGACY = '2026-05'

  function seedLegacy(): void {
    const period = database.prepare('INSERT INTO workflow_periods (household_id, period, version, status, closed_at, archive_json, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
    const slot = database.prepare('INSERT INTO workflow_participants (household_id, period, user_id, slot, joined_at) VALUES (?, ?, ?, ?, ?)')
    const event = database.prepare('INSERT INTO workflow_events (id, household_id, period, version, actor_id, action, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
    void period.bind(HOUSEHOLD_A, OPEN_MAPPABLE, 5, 'open', null, null, NOW, NOW).run()
    void slot.bind(HOUSEHOLD_A, OPEN_MAPPABLE, 'user_admin', 'a', NOW).run()
    void event.bind('event_legacy_1', HOUSEHOLD_A, OPEN_MAPPABLE, 1, 'user_admin', 'submit', NOW).run()
    void period.bind(HOUSEHOLD_A, OPEN_STRANGER, 1, 'open', null, null, NOW, NOW).run()
    void slot.bind(HOUSEHOLD_A, OPEN_STRANGER, 'user_stranger', 'a', NOW).run()
    void period.bind(HOUSEHOLD_A, CLOSED_LEGACY, 3, 'closed', NOW, '{"legacy":"archive"}', NOW, NOW).run()
    void slot.bind(HOUSEHOLD_A, CLOSED_LEGACY, 'user_stranger', 'a', NOW).run()
    void slot.bind(HOUSEHOLD_A, CLOSED_LEGACY, 'user_partner', 'b', NOW).run()
  }

  it('adds pairing tables without touching legacy rows, then maps or flags open months', async function () {
    database.close()
    database = createTestDatabase({ stopAfterMigration: 4 })
    await ensureHousehold(database, HOUSEHOLD_A, NOW)
    await ensureHousehold(database, HOUSEHOLD_B, NOW)
    seedLegacy()
    expect(await count('workflow_periods')).toBe(3)
    await expect(count('household_pairings')).rejects.toThrow(/no such table/)

    database.applyPendingMigrations()

    expect(await count('household_pairings')).toBe(0)
    expect(await count('workflow_periods')).toBe(3)
    expect(await count('workflow_participants')).toBe(4)
    expect(await count('workflow_events')).toBe(1)
    const legacyEvent = await database.prepare('SELECT actor_role FROM workflow_events WHERE id = ?').bind('event_legacy_1').first<{ actor_role: string | null }>()
    expect(legacyEvent?.actor_role).toBeNull()

    // Empty household: nothing to map, nothing flagged.
    expect((await readPairing(database, HOUSEHOLD_B, 'user_admin', 'org:admin')).recoveryRequiredPeriods).toEqual([])
    // Uninitialized household with legacy months: no roles exist yet, so nothing is judged.
    expect((await readPairing(database, HOUSEHOLD_A, 'user_admin', 'org:admin')).recoveryRequiredPeriods).toEqual([])

    // Coordinator-only: the month whose slot a is the coordinator maps; the stranger's open
    // month fails closed; the closed month is immutable history and is never flagged.
    const coordinatorOnly = await initialize('user_admin', 'org:admin')
    expect(coordinatorOnly.recoveryRequiredPeriods).toEqual([OPEN_STRANGER])

    // Paired: still only the stranger's month, from either participant's view.
    const paired = await join('user_partner')
    expect(paired.recoveryRequiredPeriods).toEqual([OPEN_STRANGER])
    expect((await readPairing(database, HOUSEHOLD_A, 'user_admin', 'org:admin')).recoveryRequiredPeriods).toEqual([OPEN_STRANGER])

    // A partner sitting in slot a from the old first-submit rule is ambiguous too.
    void database.prepare('INSERT INTO workflow_periods (household_id, period, version, status, created_at, updated_at) VALUES (?, ?, 1, \'open\', ?, ?)').bind(HOUSEHOLD_A, '2026-08', NOW, NOW).run()
    void database.prepare('INSERT INTO workflow_participants (household_id, period, user_id, slot, joined_at) VALUES (?, ?, ?, \'a\', ?)').bind(HOUSEHOLD_A, '2026-08', 'user_partner', NOW).run()
    const rows = (await database.prepare('SELECT user_id, role, alias, joined_at FROM household_participants WHERE household_id = ?').bind(HOUSEHOLD_A).all<{ user_id: string; role: 'coordinator' | 'partner'; alias: string; joined_at: string }>()).results
    expect(await legacyRecoveryPeriods(database, HOUSEHOLD_A, rows)).toEqual([OPEN_STRANGER, '2026-08'])

    // Legacy rows are untouched throughout.
    expect(await count('workflow_participants')).toBe(5)
    const closed = await database.prepare('SELECT status, archive_json FROM workflow_periods WHERE household_id = ? AND period = ?').bind(HOUSEHOLD_A, CLOSED_LEGACY).first<{ status: string; archive_json: string }>()
    expect(closed).toEqual({ status: 'closed', archive_json: '{"legacy":"archive"}' })
  })
})

describe('pairing routes', function () {
  function environment(): WorkerEnvironment {
    return { VITE_CLERK_PUBLISHABLE_KEY: 'pk_test_fixture', CLERK_SECRET_KEY: 'sk_test_fixture', ASSETS: { fetch: async () => new Response('fixture asset') }, DB: database }
  }
  const directory = fixtureDirectory({
    invitations: {
      orginv_fixturepartner01: { organizationId: HOUSEHOLD_A, emailAddress: 'Fictional-Partner@example.test', status: 'pending' },
      orginv_fixtureother0001: { organizationId: HOUSEHOLD_B, emailAddress: 'fictional-partner@example.test', status: 'pending' },
      orginv_fixturerevoked01: { organizationId: HOUSEHOLD_A, emailAddress: 'fictional-partner@example.test', status: 'revoked' },
    },
    emails: { user_partner: ['fictional-partner@example.test'], user_member: ['fictional-member@example.test'], user_third: ['fictional-third@example.test'] },
  })
  function as(userId: string, organizationRole: string | null = 'org:member', householdId: string | null = HOUSEHOLD_A) {
    return createWorker(async () => ({ userId, householdId, organizationRole }), function () { return NOW }, undefined, directory)
  }
  function invite(invitationId: string, userId = 'user_admin', organizationRole: string | null = 'org:admin') {
    return as(userId, organizationRole).fetch(request('/api/household/pairing/partner-invitation', 'POST', { invitationId, requestId: 'request_invite_' + invitationId }), environment())
  }
  function request(path: string, method = 'GET', body?: unknown) {
    return new Request('https://split-ledger.example' + path, { method, headers: body === undefined ? undefined : { 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) })
  }
  async function pairingOf(response: Response): Promise<HouseholdPairing> {
    const body = (await response.json()) as HouseholdPairingResponse
    expect(isHouseholdPairingResponse(body)).toBe(true)
    return body.pairing
  }

  it('authenticates, scopes to the active household, and refuses wrong methods', async function () {
    expect((await createWorker(async () => null).fetch(request('/api/household/pairing'), environment())).status).toBe(401)
    expect((await as('user_admin', 'org:admin', null).fetch(request('/api/household/pairing'), environment())).status).toBe(403)
    expect((await as('user_admin', 'org:admin').fetch(request('/api/household/pairing', 'POST', {}), environment())).status).toBe(405)
    expect((await as('user_admin', 'org:admin').fetch(request('/api/household/pairing/initialize'), environment())).status).toBe(405)
    const pairing = await pairingOf(await as('user_admin', 'org:admin').fetch(request('/api/household/pairing'), environment()))
    expect(pairing.state).toBe('uninitialized')
    expect(pairing.viewer).toEqual({ kind: 'member', canInitialize: true, canJoinAsPartner: false })
  })

  it('runs the coordinator, partner, and third-member journey over HTTP without leaking identifiers', async function () {
    const initialize = { householdName: 'Fictional Household', alias: 'Fictional A', requestId: 'request_init_1' }
    expect((await as('user_member').fetch(request('/api/household/pairing/initialize', 'POST', initialize), environment())).status).toBe(403)
    expect((await as('user_admin', 'org:admin').fetch(request('/api/household/pairing/initialize', 'POST', { ...initialize, householdId: HOUSEHOLD_B }), environment())).status).toBe(400)
    expect((await as('user_admin', 'org:admin').fetch(request('/api/household/pairing/initialize', 'POST', { ...initialize, alias: 'admin@example.com' }), environment())).status).toBe(400)
    const initialized = await as('user_admin', 'org:admin').fetch(request('/api/household/pairing/initialize', 'POST', initialize), environment())
    expect(initialized.status).toBe(200)
    expect((await pairingOf(initialized)).state).toBe('coordinator-only')
    expect((await as('user_admin', 'org:admin').fetch(request('/api/household/pairing/initialize', 'POST', initialize), environment())).status).toBe(200)
    expect((await as('user_other_admin', 'org:admin').fetch(request('/api/household/pairing/initialize', 'POST', { ...initialize, requestId: 'request_init_2' }), environment())).status).toBe(409)

    const invited = await pairingOf(await as('user_partner').fetch(request('/api/household/pairing'), environment()))
    expect(invited.viewer).toEqual({ kind: 'member', canInitialize: false, canJoinAsPartner: true })
    expect(invited.coordinator?.alias).toBe('Fictional A')
    expect((await as('user_partner').fetch(request('/api/household/pairing/join', 'POST', { alias: 'Fictional B', requestId: 'request_join_0' }), environment())).status).toBe(403)
    expect((await invite('orginv_fixturepartner01')).status).toBe(200)
    expect((await as('user_partner').fetch(request('/api/household/pairing/join', 'POST', { alias: 'fictional a', requestId: 'request_join_1' }), environment())).status).toBe(400)
    expect((await as('user_admin', 'org:admin').fetch(request('/api/household/pairing/join', 'POST', { alias: 'Fictional A2', requestId: 'request_join_1' }), environment())).status).toBe(403)
    const joined = await as('user_partner').fetch(request('/api/household/pairing/join', 'POST', { alias: 'Fictional B', requestId: 'request_join_1' }), environment())
    expect(joined.status).toBe(200)
    const partnerView = await pairingOf(joined)
    expect(partnerView.state).toBe('paired')
    expect(partnerView.connected).toBe(2)
    expect(partnerView.viewer).toEqual({ kind: 'participant', role: 'partner', alias: 'Fictional B' })

    const coordinatorView = await pairingOf(await as('user_admin', 'org:admin').fetch(request('/api/household/pairing'), environment()))
    expect({ ...coordinatorView, viewer: null }).toEqual({ ...partnerView, viewer: null })

    const third = await as('user_third', 'org:admin').fetch(request('/api/household/pairing/join', 'POST', { alias: 'Fictional C', requestId: 'request_join_2' }), environment())
    expect(third.status).toBe(409)
    expect(((await third.json()) as { error: string }).error).toMatch(/already has two/)
    const thirdView = await pairingOf(await as('user_third', 'org:admin').fetch(request('/api/household/pairing'), environment()))
    expect(thirdView.viewer).toEqual({ kind: 'member', canInitialize: false, canJoinAsPartner: false })

    const otherHousehold = await pairingOf(await as('user_partner', 'org:member', HOUSEHOLD_B).fetch(request('/api/household/pairing'), environment()))
    expect(otherHousehold.state).toBe('uninitialized')

    for (const view of [partnerView, coordinatorView, thirdView]) {
      expect(JSON.stringify(view)).not.toMatch(/user_|org_|@|householdId|userId/)
    }
  })

  it('lets only the invited account claim the partner role (WEB-022)', async function () {
    const initialize = { householdName: 'Fictional Household', alias: 'Fictional A', requestId: 'request_init_1' }
    expect((await as('user_admin', 'org:admin').fetch(request('/api/household/pairing/initialize', 'POST', initialize), environment())).status).toBe(200)
    const join = function (userId: string, alias: string) { return as(userId).fetch(request('/api/household/pairing/join', 'POST', { alias, requestId: 'request_join_' + userId }), environment()) }
    const errorOf = async function (response: Response) { return ((await response.json()) as { error: string }).error }

    const noInvitation = await join('user_partner', 'Fictional B')
    expect(noInvitation.status).toBe(403)
    expect(await errorOf(noInvitation)).toMatch(/No partner invitation is recorded/)

    expect((await invite('orginv_fixturepartner01', 'user_member', 'org:member')).status).toBe(403)
    expect((await invite('orginv_fixtureother0001')).status).toBe(400)
    expect((await invite('orginv_fixturerevoked01')).status).toBe(400)
    expect((await as('user_admin', 'org:admin').fetch(request('/api/household/pairing/partner-invitation', 'POST', { invitationId: 'person@example.com', requestId: 'request_bad' }), environment())).status).toBe(400)
    expect((await invite('orginv_fixturepartner01')).status).toBe(200)
    expect(JSON.stringify(await database.prepare('SELECT * FROM household_partner_invitations').all())).not.toMatch(/@/)

    const wrongPerson = await join('user_member', 'Fictional M')
    expect(wrongPerson.status).toBe(403)
    expect(await errorOf(wrongPerson)).toMatch(/different email address/)
    const noEmails = await join('user_unknown', 'Fictional U')
    expect(noEmails.status).toBe(403)

    const invited = await join('user_partner', 'Fictional B')
    expect(invited.status).toBe(200)
    expect((await pairingOf(invited)).state).toBe('paired')
    expect((await join('user_partner', 'Fictional B')).status).toBe(200)
    expect((await join('user_third', 'Fictional C')).status).toBe(409)
    expect((await invite('orginv_fixturepartner01')).status).toBe(409)
  })
})
