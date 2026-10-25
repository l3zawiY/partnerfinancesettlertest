import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { SharedExport } from '../shared/formats'
import { createWorker, type WorkerEnvironment } from './index'
import { householdRef } from './logbook'
import { FIXTURE_PARTNER_INVITATION, fixtureDirectory } from './testing/fixtureDirectory'
import { createTestDatabase, LOGBOOK_MIGRATIONS, type TestDatabase } from './testing/sqliteDatabase'

// WEB-048: the pilot logbook stores only allowlisted fields, in its own database, and never
// changes what the person sees.

const HOUSEHOLD = 'org_fixture_household_a'
let now = '2026-10-01T12:00:00.000Z'
let database: TestDatabase
let logbook: TestDatabase
let sequence = 0

const DIRECTORY = fixtureDirectory({
  invitations: { [FIXTURE_PARTNER_INVITATION]: { organizationId: HOUSEHOLD, emailAddress: 'fictional-b@example.test', status: 'pending' } },
  emails: { user_b: ['fictional-b@example.test'] },
})

function environment(overrides: Partial<WorkerEnvironment> = {}): WorkerEnvironment {
  return { VITE_CLERK_PUBLISHABLE_KEY: 'pk_test_fixture', CLERK_SECRET_KEY: 'sk_test_fixture', ASSETS: { fetch: async () => new Response('fixture asset') }, DB: database, LOGBOOK: logbook, DEPLOYMENT: 'staging', ...overrides }
}
function member(userId: string | null) {
  return createWorker(async () => userId ? { userId, householdId: HOUSEHOLD, organizationRole: userId === 'user_a' ? 'org:admin' : 'org:member' } : null, function () { return now }, function () { sequence += 1; return 'fixture-id-' + sequence }, DIRECTORY)
}
function request(path: string, method = 'GET', body?: unknown) {
  return new Request('https://split-ledger.example' + path, { method, headers: body === undefined ? undefined : { 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) })
}
function projection(owner: string): SharedExport {
  return { format: 'split-ledger/v1', toolVersion: 'test', period: '2026-07', owner, generated: '2026-08-01T00:00:00.000Z', items: [{ date: '2026-07-10', merchant: 'Fictional Cafe', category: 'Dining', amount: 100, share: .5 }], totals: { sharedPaidByOwner: 100 } }
}
async function rows(): Promise<Record<string, unknown>[]> { return (await logbook.prepare('SELECT * FROM logbook ORDER BY id').all()).results }

beforeEach(async function () {
  database = createTestDatabase(); logbook = createTestDatabase({ migrations: LOGBOOK_MIGRATIONS }); sequence = 0; now = '2026-10-01T12:00:00.000Z'
  await member('user_a').fetch(request('/api/household/pairing/initialize', 'POST', { householdName: 'Fictional Household', alias: 'Fictional A', requestId: 'request_init' }), environment())
  await member('user_a').fetch(request('/api/household/pairing/partner-invitation', 'POST', { invitationId: FIXTURE_PARTNER_INVITATION, requestId: 'request_invite' }), environment())
  await member('user_b').fetch(request('/api/household/pairing/join', 'POST', { alias: 'Fictional B', requestId: 'request_join' }), environment())
})
afterEach(function () { database.close(); logbook.close() })

describe('pilot logbook', function () {
  it('records successful actions with the verified role and a one-way household reference', async function () {
    const response = await member('user_b').fetch(request('/api/workflows/2026-07/submission', 'POST', { projection: projection('Fictional B'), expectedVersion: null, requestId: 'request_submit' }), environment())
    expect(response.status).toBe(200)
    const stored = await rows()
    expect(stored.map(function (row) { return row.event })).toEqual(['household_initialized', 'partner_invited', 'partner_joined', 'submitted'])
    const submitted = stored[3]!
    expect(submitted).toMatchObject({ source: 'worker', kind: 'activity', role: 'partner', month: '2026-07', route: '/api/workflows/:month/submission', status: 200, environment: 'staging', household_ref: await householdRef(HOUSEHOLD) })
    const text = JSON.stringify(stored)
    for (const secret of [HOUSEHOLD, 'user_a', 'user_b', 'Fictional Cafe', 'Fictional A', 'Fictional B', 'Fictional Household', '100']) expect(text).not.toContain(secret)
  })

  it('accepts allowlisted browser events from a signed-in person and stores nothing else', async function () {
    const response = await member('user_a').fetch(request('/api/logbook', 'POST', { events: [{ event: 'statement_imported', month: '2026-07', count: 212 }, { event: 'browser_error', screen: 'review', errorType: 'TypeError', codeLocation: 'index-A.js:1:2' }] }), environment())
    expect(response.status).toBe(204)
    const stored = (await rows()).filter(function (row) { return row.source === 'browser' })
    expect(stored).toHaveLength(2)
    expect(stored[0]).toMatchObject({ kind: 'activity', event: 'statement_imported', role: 'coordinator', month: '2026-07', count: 212 })
    expect(stored[1]).toMatchObject({ kind: 'error', event: 'browser_error', role: 'coordinator', screen: 'review', error_type: 'TypeError', code_location: 'index-A.js:1:2' })
  })

  it('refuses unauthenticated, oversized, or off-list browser events whole', async function () {
    const before = (await rows()).length
    expect((await member(null).fetch(request('/api/logbook', 'POST', { events: [{ event: 'diagnostic_copied' }] }), environment())).status).toBe(401)
    expect((await member('user_a').fetch(request('/api/logbook', 'POST', { events: [{ event: 'diagnostic_copied' }, { event: 'diagnostic_copied', merchant: 'Fictional Cafe' }] }), environment())).status).toBe(400)
    expect((await member('user_a').fetch(request('/api/logbook', 'POST', { events: Array.from({ length: 21 }, function () { return { event: 'diagnostic_copied' } }) }), environment())).status).toBe(400)
    expect((await member('user_a').fetch(request('/api/logbook', 'GET'), environment())).status).toBe(405)
    expect((await rows()).length).toBe(before)
  })

  it('caps browser events per household role and day', async function () {
    const batch = { events: Array.from({ length: 20 }, function () { return { event: 'diagnostic_copied' } }) }
    for (let n = 0; n < 26; n++) await member('user_a').fetch(request('/api/logbook', 'POST', batch), environment())
    const count = await logbook.prepare("SELECT COUNT(*) AS total FROM logbook WHERE source = 'browser'").first<{ total: number }>()
    expect(count?.total).toBe(500)
  })

  it('gives a failing request a reference the person sees and the logbook stores, without the error text', async function () {
    const failing = { prepare() { throw new Error('Fictional Cafe disk failure') }, async batch() { throw new Error('Fictional Cafe disk failure') } }
    const response = await member('user_a').fetch(request('/api/workflows/2026-07'), environment({ DB: failing }))
    expect(response.status).toBe(503)
    const body = await response.json() as { error: string; reference: string }
    expect(body.error).toMatch(/^Shared storage is temporarily unavailable/)
    expect(body.reference).toMatch(/^[A-Z0-9]{8}$/)
    const error = (await rows()).find(function (row) { return row.event === 'server_error' })!
    expect(error).toMatchObject({ kind: 'error', route: '/api/workflows/:month', month: '2026-07', status: 503, error_type: 'StorageUnavailable', reference: body.reference })
    expect(JSON.stringify(error)).not.toContain('Fictional')
  })

  it('records an unavailable sign-in service by type only', async function () {
    const failing = createWorker(async function () { throw new Error('Fictional Cafe') }, function () { return now }, function () { return 'fixture-id-x' }, DIRECTORY)
    const response = await failing.fetch(request('/api/workflows/2026-07'), environment())
    expect(response.status).toBe(503)
    const error = (await rows()).find(function (row) { return row.event === 'server_error' })!
    expect(error).toMatchObject({ error_type: 'AuthenticationUnavailable', role: null, household_ref: null })
    expect(JSON.stringify(error)).not.toContain('Fictional')
  })

  it('turns an unexpected exception into a plain 500 and records only its type and location', async function () {
    const identity = { userId: 'user_a', organizationRole: 'org:admin', get householdId(): string { throw new RangeError('Fictional Cafe') } }
    const crashing = createWorker(async () => identity, function () { return now }, function () { return 'fixture-id-y' }, DIRECTORY)
    const response = await crashing.fetch(request('/api/workflows/2026-07'), environment())
    expect(response.status).toBe(500)
    const body = await response.json() as { error: string; reference: string }
    expect(body.error).toMatch(/^Something went wrong in the Split Ledger service/)
    const error = (await rows()).find(function (row) { return row.event === 'server_error' })!
    expect(error).toMatchObject({ status: 500, error_type: 'RangeError', reference: body.reference })
    expect(String(error.code_location)).toMatch(/^[\w.-]+:\d+:\d+$/)
    expect(JSON.stringify(error)).not.toContain('Fictional')
  })

  it('never changes the answer when the logbook itself fails', async function () {
    const broken = { prepare() { throw new Error('logbook down') }, async batch() { throw new Error('logbook down') } }
    const response = await member('user_a').fetch(request('/api/workflows/2026-07/submission', 'POST', { projection: projection('Fictional A'), expectedVersion: null, requestId: 'request_submit_a' }), environment({ LOGBOOK: broken }))
    expect(response.status).toBe(200)
    expect((await member('user_a').fetch(request('/api/logbook', 'POST', { events: [{ event: 'diagnostic_copied' }] }), environment({ LOGBOOK: broken }))).status).toBe(204)
  })

  it('deletes rows older than 180 days on the daily schedule', async function () {
    now = '2026-01-01T00:00:00.000Z'
    await member('user_a').fetch(request('/api/logbook', 'POST', { events: [{ event: 'diagnostic_copied' }] }), environment())
    now = '2026-10-01T00:00:00.000Z'
    await member('user_a').fetch(request('/api/logbook', 'POST', { events: [{ event: 'session_loaded' }] }), environment())
    const pending: Promise<unknown>[] = []
    await member('user_a').scheduled({}, environment(), { waitUntil(promise) { pending.push(promise) } })
    await Promise.all(pending)
    const events = (await rows()).map(function (row) { return row.event })
    expect(events).toContain('session_loaded')
    expect(events).not.toContain('diagnostic_copied')
  })
})
