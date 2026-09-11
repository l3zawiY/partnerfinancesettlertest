import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { WorkflowExportResponse, WorkflowResponse } from '../shared/api'
import type { SharedExport } from '../shared/formats'
import { buildHouseholdArchiveBundle, buildMonthArchive } from '../shared/formats'
import { createWorker, type WorkerEnvironment } from './index'
import { createTestDatabase, type TestDatabase } from './testing/sqliteDatabase'

const HOUSEHOLD_A = 'org_fixture_household_a'
const HOUSEHOLD_B = 'org_fixture_household_b'
let database: TestDatabase
let sequence = 0

beforeEach(function () { database = createTestDatabase(); sequence = 0 })
afterEach(function () { database.close() })

function environment(): WorkerEnvironment {
  return { VITE_CLERK_PUBLISHABLE_KEY: 'pk_test_fixture', CLERK_SECRET_KEY: 'sk_test_fixture', ASSETS: { fetch: async () => new Response('fixture asset') }, DB: database }
}

function member(userId: string, householdId: string | null = HOUSEHOLD_A, organizationRole: string | null = 'org:member') {
  return createWorker(async () => ({ userId, householdId, organizationRole }), function () { return '2026-09-01T00:00:00.000Z' }, function () { sequence += 1; return 'fixture_id_' + sequence })
}

function projection(owner: string, amount = 100): SharedExport {
  return { format: 'split-ledger/v1', toolVersion: 'test', period: '2026-07', owner, generated: '2026-08-01T00:00:00.000Z', items: [{ date: '2026-07-10', merchant: 'Fictional Cafe', category: 'Dining', amount, share: .5 }], totals: { sharedPaidByOwner: amount } }
}

function request(path: string, method = 'GET', body?: unknown) {
  return new Request('https://split-ledger.example' + path, { method, headers: body === undefined ? undefined : { 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) })
}

async function submit(userId: string, owner: string, requestId: string, expectedVersion: number | null = null, method = 'POST') {
  return member(userId).fetch(request('/api/workflows/2026-07/submission', method, { projection: projection(owner), expectedVersion, requestId }), environment())
}

describe('authoritative period workflow', function () {
  it('rolls back every statement boundary of a first submission batch', async function () {
    for (let boundary = 0; boundary < 5; boundary += 1) {
      if (boundary) { database.close(); database = createTestDatabase(); sequence = 0 }
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
      if (boundary) { database.close(); database = createTestDatabase(); sequence = 0 }
      await submit('user_a', 'Fictional A', 'request_withdraw_setup')
      database.failBatchAt(boundary)
      expect((await member('user_a').fetch(request('/api/workflows/2026-07/submission', 'DELETE', { expectedVersion: 1, requestId: 'request_withdraw_fail_' + boundary }), environment())).status).toBe(409)
      database.failBatchAt(null)
      const current = (await (await member('user_a').fetch(request('/api/workflows/2026-07'), environment())).json()) as WorkflowResponse
      expect(current.workflow.version).toBe(1)
      expect(current.workflow.mine).not.toBeNull()
    }
    for (let boundary = 0; boundary < 3; boundary += 1) {
      database.close(); database = createTestDatabase(); sequence = 0
      await submit('user_a', 'Fictional A', 'request_close_a')
      await submit('user_b', 'Fictional B', 'request_close_b')
      database.failBatchAt(boundary)
      expect((await member('user_a').fetch(request('/api/workflows/2026-07/close', 'POST', { expectedVersion: 2, requestId: 'request_close_fail_' + boundary }), environment())).status).toBe(409)
      database.failBatchAt(null)
      const current = (await (await member('user_a').fetch(request('/api/workflows/2026-07'), environment())).json()) as WorkflowResponse
      expect(current.workflow.version).toBe(2)
      expect(current.workflow.status).toBe('partner-ready')
      expect(current.workflow.archive).toBeUndefined()
    }
  })

  it('requires authentication and derives the household from the verified identity', async function () {
    const signedOut = createWorker(async () => null)
    expect((await signedOut.fetch(request('/api/workflows/2026-07'), environment())).status).toBe(401)
    expect((await member('user_a', null).fetch(request('/api/workflows/2026-07'), environment())).status).toBe(403)
    await submit('user_a', 'Fictional A', 'request_a1')
    const other = await member('user_x', HOUSEHOLD_B).fetch(request('/api/workflows/2026-07'), environment())
    expect(((await other.json()) as WorkflowResponse).workflow.mine).toBeNull()
  })

  it('orients two submissions to each viewer and refuses a third participant', async function () {
    expect((await submit('user_a', 'Fictional A', 'request_a1')).status).toBe(200)
    expect((await submit('user_b', 'Fictional B', 'request_b1')).status).toBe(200)
    const a = (await (await member('user_a').fetch(request('/api/workflows/2026-07'), environment())).json()) as WorkflowResponse
    const b = (await (await member('user_b').fetch(request('/api/workflows/2026-07'), environment())).json()) as WorkflowResponse
    expect(a.workflow.mine?.projection.owner).toBe('Fictional A')
    expect(a.workflow.partner?.projection.owner).toBe('Fictional B')
    expect(b.workflow.mine?.projection.owner).toBe('Fictional B')
    expect(b.workflow.partner?.projection.owner).toBe('Fictional A')
    expect((await submit('user_c', 'Fictional C', 'request_c1')).status).toBe(403)
  })

  it('makes identical retries safe and reports stale replacement without overwriting', async function () {
    const first = await submit('user_a', 'Fictional A', 'request_a1')
    const firstWorkflow = ((await first.json()) as WorkflowResponse).workflow
    const replay = await submit('user_a', 'Fictional A', 'request_a1')
    expect(((await replay.json()) as WorkflowResponse).workflow.version).toBe(firstWorkflow.version)
    const stale = await submit('user_a', 'Fictional A', 'request_replace', 0, 'PUT')
    expect(stale.status).toBe(409)
    expect(((await stale.json()) as WorkflowResponse).workflow.status).toBe('stale')
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
    const aView = (await (await member('user_a').fetch(request('/api/workflows/2026-07'), environment())).json()) as WorkflowResponse
    expect(aView.workflow.mine?.projection.owner).toBe('Fictional A')
    expect(aView.workflow.partner).toBeNull()
  })

  it('allows only own replacement and withdrawal and locks a server-created archive at close', async function () {
    await submit('user_a', 'Fictional A', 'request_a1')
    await submit('user_b', 'Fictional B', 'request_b1')
    const current = (await (await member('user_a').fetch(request('/api/workflows/2026-07'), environment())).json()) as WorkflowResponse
    const close = await member('user_a').fetch(request('/api/workflows/2026-07/close', 'POST', { expectedVersion: current.workflow.version, requestId: 'request_close' }), environment())
    const closed = ((await close.json()) as WorkflowResponse).workflow
    expect(closed.status).toBe('closed')
    expect(closed.archive?.people).toEqual({ a: 'Fictional A', b: 'Fictional B' })
    expect(closed.archive?.settlement.net).toBe(0)
    expect((await submit('user_a', 'Fictional A', 'request_after_close', closed.version, 'PUT')).status).toBe(409)
    const retry = await member('user_a').fetch(request('/api/workflows/2026-07/close', 'POST', { expectedVersion: current.workflow.version, requestId: 'request_close_retry' }), environment())
    expect(((await retry.json()) as WorkflowResponse).workflow.version).toBe(closed.version)
  })

  it('exports closed archives, requires admin deletion, and restores without private state', async function () {
    await submit('user_a', 'Fictional A', 'request_a1')
    await submit('user_b', 'Fictional B', 'request_b1')
    const current = (await (await member('user_a').fetch(request('/api/workflows/2026-07'), environment())).json()) as WorkflowResponse
    await member('user_a').fetch(request('/api/workflows/2026-07/close', 'POST', { expectedVersion: current.workflow.version, requestId: 'request_close' }), environment())
    const exportedResponse = await member('user_a').fetch(request('/api/workflows/export', 'POST'), environment())
    const exported = (await exportedResponse.json()) as WorkflowExportResponse
    expect(exported.bundle.archives).toHaveLength(1)
    expect(JSON.stringify(exported.bundle)).not.toMatch(/user_|org_|card|amazon|raw/i)
    const deletion = { deletionToken: exported.deletionToken, confirmation: 'DELETE SHARED HISTORY', requestId: 'request_delete' }
    expect((await member('user_a').fetch(request('/api/workflows', 'DELETE', deletion), environment())).status).toBe(403)
    const admin = member('user_admin', HOUSEHOLD_A, 'org:admin')
    expect((await admin.fetch(request('/api/workflows', 'DELETE', deletion), environment())).status).toBe(200)
    const restoreBundle = JSON.parse(JSON.stringify(exported.bundle)) as WorkflowExportResponse['bundle'] & { privateRows?: unknown[] }
    restoreBundle.privateRows = [{ raw: 'PRIVATE' }]
    const unsafeRestore = await admin.fetch(request('/api/workflows/restore', 'POST', { bundle: restoreBundle, requestId: 'request_restore_unsafe' }), environment())
    expect(unsafeRestore.status).toBe(400)
    const restore = await admin.fetch(request('/api/workflows/restore', 'POST', { bundle: exported.bundle, requestId: 'request_restore' }), environment())
    expect(restore.status).toBe(200)
    const restored = (await (await admin.fetch(request('/api/workflows/2026-07'), environment())).json()) as WorkflowResponse
    expect(restored.workflow.status).toBe('closed')
    expect(restored.workflow.archive).toEqual(exported.bundle.archives[0])
    expect(restored.workflow.mine).toBeNull()
    const reexported = (await (await admin.fetch(request('/api/workflows/export', 'POST'), environment())).json()) as WorkflowExportResponse
    expect(JSON.stringify(reexported.bundle)).not.toMatch(/privateRows|PRIVATE/)
    const repeated = await admin.fetch(request('/api/workflows/restore', 'POST', { bundle: exported.bundle, requestId: 'request_restore_retry' }), environment())
    expect(repeated.status).toBe(200)
  })

  it('will not delete while an open period exists', async function () {
    await submit('user_a', 'Fictional A', 'request_a1')
    const admin = member('user_admin', HOUSEHOLD_A, 'org:admin')
    const exported = (await (await admin.fetch(request('/api/workflows/export', 'POST'), environment())).json()) as WorkflowExportResponse
    const deletion = await admin.fetch(request('/api/workflows', 'DELETE', { deletionToken: exported.deletionToken, confirmation: 'DELETE SHARED HISTORY', requestId: 'request_delete' }), environment())
    expect(deletion.status).toBe(409)
    expect(exported.openPeriods).toEqual(['2026-07'])
  })

  it('returns role capabilities and lets only an administrator cancel an empty abandoned period', async function () {
    await submit('user_a', 'Fictional A', 'request_a1')
    await member('user_a').fetch(request('/api/workflows/2026-07/submission', 'DELETE', { expectedVersion: 1, requestId: 'request_withdraw' }), environment())
    const memberCapabilities = await member('user_a').fetch(request('/api/workflows/capabilities'), environment())
    expect(await memberCapabilities.json()).toEqual({ canAdministerSharedHistory: false })
    const cancellation = { period: '2026-07', confirmation: 'CANCEL ABANDONED PERIOD', requestId: 'request_cancel' }
    expect((await member('user_a').fetch(request('/api/workflows/cancel-abandoned', 'POST', cancellation), environment())).status).toBe(403)
    const admin = member('user_admin', HOUSEHOLD_A, 'org:admin')
    expect(await (await admin.fetch(request('/api/workflows/capabilities'), environment())).json()).toEqual({ canAdministerSharedHistory: true })
    expect((await admin.fetch(request('/api/workflows/cancel-abandoned', 'POST', cancellation), environment())).status).toBe(200)
    const status = (await (await admin.fetch(request('/api/workflows/2026-07'), environment())).json()) as WorkflowResponse
    expect(status.workflow.version).toBe(0)
  })

  it('rolls back export-token rotation, restore, and deletion batches on storage failure', async function () {
    for (let boundary = 0; boundary < 2; boundary += 1) {
      if (boundary) { database.close(); database = createTestDatabase(); sequence = 0 }
      await submit('user_a', 'Fictional A', 'request_export_a')
      await submit('user_b', 'Fictional B', 'request_export_b')
      await member('user_a').fetch(request('/api/workflows/2026-07/close', 'POST', { expectedVersion: 2, requestId: 'request_export_close' }), environment())
      database.failBatchAt(boundary)
      expect((await member('user_admin', HOUSEHOLD_A, 'org:admin').fetch(request('/api/workflows/export', 'POST'), environment())).status).toBe(503)
      database.failBatchAt(null)
      const tokens = await database.prepare('SELECT COUNT(*) AS total FROM workflow_deletion_tokens').first<{ total: number }>()
      expect(tokens?.total).toBe(0)
    }

    const archive = buildMonthArchive({ toolVersion: 'test', period: '2026-08', closed: '2026-09-01T00:00:00.000Z', people: { a: 'Fictional A', b: 'Fictional B' }, mine: [], theirs: [] })
    const bundle = buildHouseholdArchiveBundle([archive], '2026-09-01T00:00:00.000Z')
    for (let boundary = 0; boundary < 2; boundary += 1) {
      database.close(); database = createTestDatabase(); sequence = 0
      const admin = member('user_admin', HOUSEHOLD_A, 'org:admin')
      await admin.fetch(request('/api/workflows/2026-08'), environment())
      database.failBatchAt(boundary)
      expect((await admin.fetch(request('/api/workflows/restore', 'POST', { bundle, requestId: 'request_restore_fail_' + boundary }), environment())).status).toBe(503)
      database.failBatchAt(null)
      const restored = (await (await admin.fetch(request('/api/workflows/2026-08'), environment())).json()) as WorkflowResponse
      expect(restored.workflow.version).toBe(0)
    }

    for (let boundary = 0; boundary < 4; boundary += 1) {
      database.close(); database = createTestDatabase(); sequence = 0
      await submit('user_a', 'Fictional A', 'request_delete_a')
      await submit('user_b', 'Fictional B', 'request_delete_b')
      const admin = member('user_admin', HOUSEHOLD_A, 'org:admin')
      await member('user_a').fetch(request('/api/workflows/2026-07/close', 'POST', { expectedVersion: 2, requestId: 'request_delete_close' }), environment())
      const exported = (await (await admin.fetch(request('/api/workflows/export', 'POST'), environment())).json()) as WorkflowExportResponse
      database.failBatchAt(boundary)
      expect((await admin.fetch(request('/api/workflows', 'DELETE', { deletionToken: exported.deletionToken, confirmation: 'DELETE SHARED HISTORY', requestId: 'request_delete_fail_' + boundary }), environment())).status).toBe(503)
      database.failBatchAt(null)
      const current = (await (await admin.fetch(request('/api/workflows/2026-07'), environment())).json()) as WorkflowResponse
      expect(current.workflow.status).toBe('closed')
    }
  })
})
