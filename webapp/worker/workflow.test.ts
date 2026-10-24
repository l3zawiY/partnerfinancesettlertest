import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { WorkflowExportResponse, WorkflowResponse } from '../shared/api'
import type { SharedExport } from '../shared/formats'
import { buildHouseholdArchiveBundle, buildMonthArchive } from '../shared/formats'
import { createWorker, type WorkerEnvironment } from './index'
import { createTestDatabase, type TestDatabase } from './testing/sqliteDatabase'

const HOUSEHOLD_A = 'org_fixture_household_a'
const HOUSEHOLD_B = 'org_fixture_household_b'
const NOW = '2026-09-01T00:00:00.000Z'
let database: TestDatabase
let sequence = 0

beforeEach(async function () { database = createTestDatabase(); sequence = 0; await pair() })
afterEach(function () { database.close() })

function environment(): WorkerEnvironment {
  return { VITE_CLERK_PUBLISHABLE_KEY: 'pk_test_fixture', CLERK_SECRET_KEY: 'sk_test_fixture', ASSETS: { fetch: async () => new Response('fixture asset') }, DB: database }
}

/**
 * Fixture identities. `user_a` is the organization administrator who becomes the stable
 * coordinator; `user_b` is the invited partner; `user_admin` is a third organization
 * member who also happens to be an administrator and must still be refused financially.
 */
function member(userId: string, householdId: string | null = HOUSEHOLD_A, organizationRole: string | null = userId === 'user_a' || userId === 'user_admin' ? 'org:admin' : 'org:member') {
  return createWorker(async () => ({ userId, householdId, organizationRole }), function () { return NOW }, function () { sequence += 1; return 'fixture_id_' + sequence })
}

function projection(owner: string, amount = 100, period = '2026-07'): SharedExport {
  return { format: 'split-ledger/v1', toolVersion: 'test', period, owner, generated: '2026-08-01T00:00:00.000Z', items: [{ date: period + '-10', merchant: 'Fictional Cafe', category: 'Dining', amount, share: .5 }], totals: { sharedPaidByOwner: amount } }
}

function request(path: string, method = 'GET', body?: unknown) {
  return new Request('https://split-ledger.example' + path, { method, headers: body === undefined ? undefined : { 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) })
}

async function fresh(): Promise<void> { database.close(); database = createTestDatabase(); sequence = 0; await pair() }

async function pair(): Promise<void> {
  const initialized = await member('user_a').fetch(request('/api/household/pairing/initialize', 'POST', { householdName: 'Fictional Household', alias: 'Fictional A', requestId: 'request_pair_init' }), environment())
  if (initialized.status !== 200) throw new Error('Fixture pairing failed to initialize: ' + initialized.status)
  const joined = await member('user_b').fetch(request('/api/household/pairing/join', 'POST', { alias: 'Fictional B', requestId: 'request_pair_join' }), environment())
  if (joined.status !== 200) throw new Error('Fixture pairing failed to join: ' + joined.status)
}

async function submit(userId: string, owner: string, requestId: string, expectedVersion: number | null = null, method = 'POST', amount = 100, period = '2026-07') {
  return member(userId).fetch(request('/api/workflows/' + period + '/submission', method, { projection: projection(owner, amount, period), expectedVersion, requestId }), environment())
}

async function status(userId: string, period = '2026-07'): Promise<WorkflowResponse['workflow']> {
  const response = await member(userId).fetch(request('/api/workflows/' + period), environment())
  if (response.status !== 200) throw new Error('Status read failed: ' + response.status)
  return ((await response.json()) as WorkflowResponse).workflow
}

describe('authoritative period workflow', function () {
  it('rolls back every statement boundary of a first submission batch', async function () {
    for (let boundary = 0; boundary < 5; boundary += 1) {
      if (boundary) await fresh()
      database.failBatchAt(boundary)
      const response = await submit('user_a', 'Fictional A', 'request_atomic_' + boundary)
      expect(response.status).toBe(409)
      database.failBatchAt(null)
      const period = await database.prepare('SELECT version FROM workflow_periods WHERE household_id = ? AND period = ?').bind(HOUSEHOLD_A, '2026-07').first<{ version: number }>()
      const participants = await database.prepare('SELECT COUNT(*) AS total FROM workflow_participants').first<{ total: number }>()
      const submissions = await database.prepare('SELECT COUNT(*) AS total FROM workflow_submissions').first<{ total: number }>()
      const events = await database.prepare('SELECT COUNT(*) AS total FROM workflow_events').first<{ total: number }>()
      const commands = await database.prepare('SELECT COUNT(*) AS total FROM workflow_commands').first<{ total: number }>()
      expect(period?.version).toBe(0)
      expect([participants?.total, submissions?.total, events?.total, commands?.total]).toEqual([0, 0, 0, 0])
    }
  })

  it('rolls back every statement boundary of withdrawal and close batches', async function () {
    for (let boundary = 0; boundary < 4; boundary += 1) {
      if (boundary) await fresh()
      await submit('user_a', 'Fictional A', 'request_withdraw_setup')
      database.failBatchAt(boundary)
      expect((await member('user_a').fetch(request('/api/workflows/2026-07/submission', 'DELETE', { expectedVersion: 1, requestId: 'request_withdraw_fail_' + boundary }), environment())).status).toBe(409)
      database.failBatchAt(null)
      const current = await status('user_a')
      expect(current.version).toBe(1)
      expect(current.mine).not.toBeNull()
    }
    for (let boundary = 0; boundary < 3; boundary += 1) {
      await fresh()
      await submit('user_a', 'Fictional A', 'request_close_a')
      await submit('user_b', 'Fictional B', 'request_close_b')
      database.failBatchAt(boundary)
      expect((await member('user_a').fetch(request('/api/workflows/2026-07/close', 'POST', { expectedVersion: 2, requestId: 'request_close_fail_' + boundary }), environment())).status).toBe(409)
      database.failBatchAt(null)
      const current = await status('user_a')
      expect(current.version).toBe(2)
      expect(current.status).toBe('partner-ready')
      expect(current.archive).toBeUndefined()
    }
  })

  it('requires authentication, an active household, and a paired participant', async function () {
    const signedOut = createWorker(async () => null)
    expect((await signedOut.fetch(request('/api/workflows/2026-07'), environment())).status).toBe(401)
    expect((await member('user_a', null).fetch(request('/api/workflows/2026-07'), environment())).status).toBe(403)
    await submit('user_a', 'Fictional A', 'request_a1')
    // A member of a different, unpaired household is refused, not shown an empty month.
    const other = await member('user_x', HOUSEHOLD_B).fetch(request('/api/workflows/2026-07'), environment())
    expect(other.status).toBe(403)
    expect(((await other.json()) as { error: string }).error).toMatch(/not set up/)
    // A third member of the paired household, even an administrator, sees nothing financial.
    for (const [path, method, body] of [
      ['/api/workflows/2026-07', 'GET', undefined],
      ['/api/workflows/2026-07/submission', 'POST', { projection: projection('Fictional Admin'), expectedVersion: null, requestId: 'request_third_submit' }],
      ['/api/workflows/2026-07/close', 'POST', { expectedVersion: 1, requestId: 'request_third_close' }],
      ['/api/workflows/export', 'POST', undefined],
      ['/api/workflows/capabilities', 'GET', undefined],
      ['/api/workflows/restore', 'POST', { bundle: buildHouseholdArchiveBundle([], NOW), requestId: 'request_third_restore' }],
      ['/api/workflows', 'DELETE', { deletionToken: 'delete_fixture_token', confirmation: 'DELETE SHARED HISTORY', requestId: 'request_third_delete' }],
      ['/api/workflows/cancel-abandoned', 'POST', { period: '2026-07', confirmation: 'CANCEL ABANDONED PERIOD', requestId: 'request_third_cancel' }],
    ] as const) {
      const response = await member('user_admin').fetch(request(path, method, body), environment())
      expect(response.status, path).toBe(403)
      expect(JSON.stringify(await response.json())).not.toMatch(/Fictional Cafe|projection|archive/)
    }
  })

  it('orients submissions to each paired viewer and binds attribution to server aliases', async function () {
    expect((await submit('user_a', 'Forged Coordinator Name', 'request_a1')).status).toBe(200)
    expect((await submit('user_b', 'Forged Partner Name', 'request_b1')).status).toBe(200)
    const a = await status('user_a')
    const b = await status('user_b')
    expect(a.mine?.projection.owner).toBe('Fictional A')
    expect(a.partner?.projection.owner).toBe('Fictional B')
    expect(b.mine?.projection.owner).toBe('Fictional B')
    expect(b.partner?.projection.owner).toBe('Fictional A')
    expect(a.participants).toEqual({ me: { role: 'coordinator', alias: 'Fictional A' }, partner: { role: 'partner', alias: 'Fictional B' } })
    expect(b.participants).toEqual({ me: { role: 'partner', alias: 'Fictional B' }, partner: { role: 'coordinator', alias: 'Fictional A' } })
    expect(JSON.stringify([a, b])).not.toMatch(/Forged|user_|org_/)
  })

  it('keeps roles and archive orientation stable across months regardless of submission order', async function () {
    // July: coordinator first. August: partner first.
    await submit('user_a', 'Fictional A', 'request_jul_a', null, 'POST', 100, '2026-07')
    await submit('user_b', 'Fictional B', 'request_jul_b', null, 'POST', 300, '2026-07')
    await submit('user_b', 'Fictional B', 'request_aug_b', null, 'POST', 300, '2026-08')
    await submit('user_a', 'Fictional A', 'request_aug_a', null, 'POST', 100, '2026-08')
    for (const period of ['2026-07', '2026-08']) {
      const slots = (await database.prepare('SELECT user_id, slot FROM workflow_participants WHERE household_id = ? AND period = ? ORDER BY slot').bind(HOUSEHOLD_A, period).all<{ user_id: string; slot: string }>()).results
      expect(slots).toEqual([{ user_id: 'user_a', slot: 'a' }, { user_id: 'user_b', slot: 'b' }])
      const close = await member('user_a').fetch(request('/api/workflows/' + period + '/close', 'POST', { expectedVersion: 2, requestId: 'request_close_' + period }), environment())
      expect(close.status).toBe(200)
      const closed = ((await close.json()) as WorkflowResponse).workflow
      expect(closed.archive?.people).toEqual({ a: 'Fictional A', b: 'Fictional B' })
      expect(closed.archive?.settlement).toMatchObject({ aPaidShared: 100, bPaidShared: 300, direction: 'a_owes_b', net: 100 })
      // Both participants read the identical immutable archive.
      const fromPartner = await status('user_b', period)
      expect(fromPartner.archive).toEqual(closed.archive)
      expect(fromPartner.closedBy).toBe('coordinator')
      expect(fromPartner.closedAt).toBe(NOW)
    }
  })

  it('treats withdraw then resubmit in one current tab as an ordinary sequence, not a conflict', async function () {
    const first = ((await (await submit('user_a', 'Fictional A', 'request_seq_1')).json()) as WorkflowResponse).workflow
    expect(first.version).toBe(1)
    const withdrawn = ((await (await member('user_a').fetch(request('/api/workflows/2026-07/submission', 'DELETE', { expectedVersion: first.version, requestId: 'request_seq_2' }), environment())).json()) as WorkflowResponse).workflow
    expect(withdrawn.status).toBe('withdrawn')
    expect(withdrawn.version).toBe(2)
    const again = await submit('user_a', 'Fictional A', 'request_seq_3', null)
    expect(again.status).toBe(200)
    const resubmitted = ((await again.json()) as WorkflowResponse).workflow
    expect(resubmitted.status).toBe('submitted')
    expect(resubmitted.version).toBe(3)
    expect(resubmitted.mine?.version).toBe(3)
  })

  it('explains the latest handover event by stable role, never by account', async function () {
    await submit('user_a', 'Fictional A', 'request_a1')
    expect((await status('user_b')).lastEvent).toEqual({ version: 1, action: 'submit', actorRole: 'coordinator', at: NOW })
    await submit('user_b', 'Fictional B', 'request_b1')
    expect((await status('user_a')).lastEvent).toEqual({ version: 2, action: 'submit', actorRole: 'partner', at: NOW })
    await member('user_b').fetch(request('/api/workflows/2026-07/submission', 'PUT', { projection: projection('Fictional B', 150), expectedVersion: 2, requestId: 'request_b2' }), environment())
    expect((await status('user_a')).lastEvent).toMatchObject({ version: 3, action: 'replace', actorRole: 'partner' })
    await member('user_b').fetch(request('/api/workflows/2026-07/submission', 'DELETE', { expectedVersion: 3, requestId: 'request_b3' }), environment())
    const a = await status('user_a')
    expect(a.lastEvent).toMatchObject({ version: 4, action: 'withdraw', actorRole: 'partner' })
    expect(a.status).toBe('submitted')
    expect(a.partner).toBeNull()
    const events = (await database.prepare('SELECT actor_role FROM workflow_events WHERE household_id = ? ORDER BY version').bind(HOUSEHOLD_A).all<{ actor_role: string }>()).results.map(function (row) { return row.actor_role })
    expect(events).toEqual(['coordinator', 'partner', 'partner', 'partner'])
  })

  it('makes identical retries safe and reports stale replacement without overwriting', async function () {
    const first = await submit('user_a', 'Fictional A', 'request_a1')
    const firstWorkflow = ((await first.json()) as WorkflowResponse).workflow
    const replay = await submit('user_a', 'Fictional A', 'request_a1')
    expect(((await replay.json()) as WorkflowResponse).workflow.version).toBe(firstWorkflow.version)
    const stale = await submit('user_a', 'Fictional A', 'request_replace', 0, 'PUT')
    expect(stale.status).toBe(409)
    const staleWorkflow = ((await stale.json()) as WorkflowResponse).workflow
    expect(staleWorkflow.status).toBe('stale')
    expect(staleWorkflow.version).toBe(1)
    expect(staleWorkflow.participants?.me.role).toBe('coordinator')
  })

  it('rejects private fields and refuses a browser-authored close archive', async function () {
    const unsafe = { ...projection('Fictional A'), privateRows: [], amazonDecisions: {} }
    const submission = await member('user_a').fetch(request('/api/workflows/2026-07/submission', 'POST', { projection: unsafe, expectedVersion: null, requestId: 'request_unsafe' }), environment())
    expect(submission.status).toBe(400)
    const close = await member('user_a').fetch(request('/api/workflows/2026-07/close', 'POST', { expectedVersion: 0, requestId: 'request_close', archive: { privateRows: [] } }), environment())
    expect(close.status).toBe(400)
  })

  it('replaces and withdraws only the caller submission under the current version', async function () {
    await submit('user_a', 'Fictional A', 'request_a1')
    await submit('user_b', 'Fictional B', 'request_b1')
    const changed = projection('Fictional A', 120)
    const replacedResponse = await member('user_a').fetch(request('/api/workflows/2026-07/submission', 'PUT', { projection: changed, expectedVersion: 2, requestId: 'request_replace' }), environment())
    const replaced = ((await replacedResponse.json()) as WorkflowResponse).workflow
    expect(replaced.status).toBe('partner-ready')
    expect(replaced.mine?.projection.totals.sharedPaidByOwner).toBe(120)
    const staleWithdraw = await member('user_b').fetch(request('/api/workflows/2026-07/submission', 'DELETE', { expectedVersion: 2, requestId: 'request_stale_withdraw' }), environment())
    expect(staleWithdraw.status).toBe(409)
    const withdrawnResponse = await member('user_b').fetch(request('/api/workflows/2026-07/submission', 'DELETE', { expectedVersion: 3, requestId: 'request_withdraw' }), environment())
    const withdrawn = ((await withdrawnResponse.json()) as WorkflowResponse).workflow
    expect(withdrawn.status).toBe('withdrawn')
    expect(withdrawn.mine).toBeNull()
    const aView = await status('user_a')
    expect(aView.mine?.projection.owner).toBe('Fictional A')
    expect(aView.partner).toBeNull()
  })

  it('lets only the coordinator close and locks a server-created archive', async function () {
    await submit('user_a', 'Fictional A', 'request_a1')
    await submit('user_b', 'Fictional B', 'request_b1')
    const current = await status('user_b')
    const partnerClose = await member('user_b').fetch(request('/api/workflows/2026-07/close', 'POST', { expectedVersion: current.version, requestId: 'request_partner_close' }), environment())
    expect(partnerClose.status).toBe(403)
    expect(((await partnerClose.json()) as { error: string }).error).toMatch(/Only the coordinator/)
    expect((await status('user_b')).status).toBe('partner-ready')

    const close = await member('user_a').fetch(request('/api/workflows/2026-07/close', 'POST', { expectedVersion: current.version, requestId: 'request_close' }), environment())
    const closed = ((await close.json()) as WorkflowResponse).workflow
    expect(closed.status).toBe('closed')
    expect(closed.closedBy).toBe('coordinator')
    expect(closed.archive?.people).toEqual({ a: 'Fictional A', b: 'Fictional B' })
    expect(closed.archive?.settlement.net).toBe(0)
    expect((await submit('user_a', 'Fictional A', 'request_after_close', closed.version, 'PUT')).status).toBe(409)
    expect((await member('user_b').fetch(request('/api/workflows/2026-07/submission', 'DELETE', { expectedVersion: closed.version, requestId: 'request_after_close_withdraw' }), environment())).status).toBe(409)
    const retry = await member('user_a').fetch(request('/api/workflows/2026-07/close', 'POST', { expectedVersion: current.version, requestId: 'request_close_retry' }), environment())
    expect(((await retry.json()) as WorkflowResponse).workflow.version).toBe(closed.version)
  })

  it('refuses to close while the pairing is still coordinator-only', async function () {
    database.close(); database = createTestDatabase(); sequence = 0
    await member('user_a').fetch(request('/api/household/pairing/initialize', 'POST', { householdName: 'Fictional Household', alias: 'Fictional A', requestId: 'request_pair_init' }), environment())
    await submit('user_a', 'Fictional A', 'request_a1')
    const close = await member('user_a').fetch(request('/api/workflows/2026-07/close', 'POST', { expectedVersion: 1, requestId: 'request_close' }), environment())
    expect(close.status).toBe(409)
    expect((await status('user_a')).participants).toEqual({ me: { role: 'coordinator', alias: 'Fictional A' }, partner: null })
  })

  it('fails closed on a legacy month whose slot belongs to an unpaired account, and allows guarded cancellation', async function () {
    await database.prepare('INSERT INTO workflow_periods (household_id, period, version, status, created_at, updated_at) VALUES (?, ?, 4, \'open\', ?, ?)').bind(HOUSEHOLD_A, '2026-06', NOW, NOW).run()
    await database.prepare('INSERT INTO workflow_participants (household_id, period, user_id, slot, joined_at) VALUES (?, ?, ?, \'a\', ?)').bind(HOUSEHOLD_A, '2026-06', 'user_stranger', NOW).run()
    const legacy = await status('user_a', '2026-06')
    expect(legacy.status).toBe('recovery-required')
    expect(legacy.version).toBe(4)
    expect(legacy.mine).toBeNull()
    expect(legacy.recoveryReason).toMatch(/Nothing was changed or deleted/)
    const refused = await submit('user_a', 'Fictional A', 'request_legacy', null, 'POST', 100, '2026-06')
    expect(refused.status).toBe(409)
    expect(((await refused.json()) as WorkflowResponse).workflow.status).toBe('recovery-required')
    expect((await member('user_a').fetch(request('/api/workflows/2026-06/submission', 'DELETE', { expectedVersion: 4, requestId: 'request_legacy_withdraw' }), environment())).status).toBe(409)
    expect((await member('user_a').fetch(request('/api/workflows/2026-06/close', 'POST', { expectedVersion: 4, requestId: 'request_legacy_close' }), environment())).status).toBe(409)
    // The existing guarded administrator control is the recovery path for an empty month.
    expect((await member('user_a').fetch(request('/api/workflows/cancel-abandoned', 'POST', { period: '2026-06', confirmation: 'CANCEL ABANDONED PERIOD', requestId: 'request_legacy_cancel' }), environment())).status).toBe(200)
    expect((await status('user_a', '2026-06')).status).toBe('draft')
  })

  it('exports closed archives, requires an administrator participant for deletion, and restores without private state', async function () {
    await submit('user_a', 'Fictional A', 'request_a1')
    await submit('user_b', 'Fictional B', 'request_b1')
    const current = await status('user_a')
    await member('user_a').fetch(request('/api/workflows/2026-07/close', 'POST', { expectedVersion: current.version, requestId: 'request_close' }), environment())
    const exportedResponse = await member('user_b').fetch(request('/api/workflows/export', 'POST'), environment())
    const exported = (await exportedResponse.json()) as WorkflowExportResponse
    expect(exported.bundle.archives).toHaveLength(1)
    expect(JSON.stringify(exported.bundle)).not.toMatch(/user_|org_|card|amazon|raw|@/i)
    const deletion = { deletionToken: exported.deletionToken, confirmation: 'DELETE SHARED HISTORY', requestId: 'request_delete' }
    expect((await member('user_b').fetch(request('/api/workflows', 'DELETE', deletion), environment())).status).toBe(403)
    const admin = member('user_a')
    expect((await admin.fetch(request('/api/workflows', 'DELETE', deletion), environment())).status).toBe(200)
    const restoreBundle = JSON.parse(JSON.stringify(exported.bundle)) as WorkflowExportResponse['bundle'] & { privateRows?: unknown[] }
    restoreBundle.privateRows = [{ raw: 'PRIVATE' }]
    const unsafeRestore = await admin.fetch(request('/api/workflows/restore', 'POST', { bundle: restoreBundle, requestId: 'request_restore_unsafe' }), environment())
    expect(unsafeRestore.status).toBe(400)
    const restore = await admin.fetch(request('/api/workflows/restore', 'POST', { bundle: exported.bundle, requestId: 'request_restore' }), environment())
    expect(restore.status).toBe(200)
    const restored = await status('user_a')
    expect(restored.status).toBe('closed')
    expect(restored.archive).toEqual(exported.bundle.archives[0])
    expect(restored.mine).toBeNull()
    expect(restored.lastEvent).toMatchObject({ action: 'restore', actorRole: 'coordinator' })
    const reexported = (await (await admin.fetch(request('/api/workflows/export', 'POST'), environment())).json()) as WorkflowExportResponse
    expect(JSON.stringify(reexported.bundle)).not.toMatch(/privateRows|PRIVATE/)
    const repeated = await admin.fetch(request('/api/workflows/restore', 'POST', { bundle: exported.bundle, requestId: 'request_restore_retry' }), environment())
    expect(repeated.status).toBe(200)
  })

  it('will not delete while an open period exists', async function () {
    await submit('user_a', 'Fictional A', 'request_a1')
    const admin = member('user_a')
    const exported = (await (await admin.fetch(request('/api/workflows/export', 'POST'), environment())).json()) as WorkflowExportResponse
    const deletion = await admin.fetch(request('/api/workflows', 'DELETE', { deletionToken: exported.deletionToken, confirmation: 'DELETE SHARED HISTORY', requestId: 'request_delete' }), environment())
    expect(deletion.status).toBe(409)
    expect(exported.openPeriods).toEqual(['2026-07'])
  })

  it('returns role capabilities and lets only an administrator participant cancel an empty abandoned period', async function () {
    await submit('user_b', 'Fictional B', 'request_b1')
    await member('user_b').fetch(request('/api/workflows/2026-07/submission', 'DELETE', { expectedVersion: 1, requestId: 'request_withdraw' }), environment())
    const partnerCapabilities = await member('user_b').fetch(request('/api/workflows/capabilities'), environment())
    expect(await partnerCapabilities.json()).toEqual({ canAdministerSharedHistory: false })
    const cancellation = { period: '2026-07', confirmation: 'CANCEL ABANDONED PERIOD', requestId: 'request_cancel' }
    expect((await member('user_b').fetch(request('/api/workflows/cancel-abandoned', 'POST', cancellation), environment())).status).toBe(403)
    const admin = member('user_a')
    expect(await (await admin.fetch(request('/api/workflows/capabilities'), environment())).json()).toEqual({ canAdministerSharedHistory: true })
    expect((await admin.fetch(request('/api/workflows/cancel-abandoned', 'POST', cancellation), environment())).status).toBe(200)
    expect((await status('user_a')).version).toBe(0)
  })

  it('rolls back export-token rotation, restore, and deletion batches on storage failure', async function () {
    for (let boundary = 0; boundary < 2; boundary += 1) {
      if (boundary) await fresh()
      await submit('user_a', 'Fictional A', 'request_export_a')
      await submit('user_b', 'Fictional B', 'request_export_b')
      await member('user_a').fetch(request('/api/workflows/2026-07/close', 'POST', { expectedVersion: 2, requestId: 'request_export_close' }), environment())
      database.failBatchAt(boundary)
      expect((await member('user_a').fetch(request('/api/workflows/export', 'POST'), environment())).status).toBe(503)
      database.failBatchAt(null)
      const tokens = await database.prepare('SELECT COUNT(*) AS total FROM workflow_deletion_tokens').first<{ total: number }>()
      expect(tokens?.total).toBe(0)
    }

    const archive = buildMonthArchive({ toolVersion: 'test', period: '2026-08', closed: NOW, people: { a: 'Fictional A', b: 'Fictional B' }, mine: [], theirs: [] })
    const bundle = buildHouseholdArchiveBundle([archive], NOW)
    for (let boundary = 0; boundary < 2; boundary += 1) {
      await fresh()
      const admin = member('user_a')
      await admin.fetch(request('/api/workflows/2026-08'), environment())
      database.failBatchAt(boundary)
      expect((await admin.fetch(request('/api/workflows/restore', 'POST', { bundle, requestId: 'request_restore_fail_' + boundary }), environment())).status).toBe(503)
      database.failBatchAt(null)
      expect((await status('user_a', '2026-08')).version).toBe(0)
    }

    for (let boundary = 0; boundary < 4; boundary += 1) {
      await fresh()
      await submit('user_a', 'Fictional A', 'request_delete_a')
      await submit('user_b', 'Fictional B', 'request_delete_b')
      const admin = member('user_a')
      await admin.fetch(request('/api/workflows/2026-07/close', 'POST', { expectedVersion: 2, requestId: 'request_delete_close' }), environment())
      const exported = (await (await admin.fetch(request('/api/workflows/export', 'POST'), environment())).json()) as WorkflowExportResponse
      database.failBatchAt(boundary)
      expect((await admin.fetch(request('/api/workflows', 'DELETE', { deletionToken: exported.deletionToken, confirmation: 'DELETE SHARED HISTORY', requestId: 'request_delete_fail_' + boundary }), environment())).status).toBe(503)
      database.failBatchAt(null)
      expect((await status('user_a')).status).toBe('closed')
    }
  })
})
