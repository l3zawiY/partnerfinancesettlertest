import { buildHouseholdArchiveBundle, buildMonthArchive, isMonthArchive, type HouseholdArchiveBundle, type SharedExport } from '../shared/formats'
import { emptyWorkflow, isStrictSharedProjection, type PeriodWorkflow, type WorkflowSubmission } from '../shared/workflow'
import type { SqlDatabase, SqlRunResult } from './db'

export class WorkflowConflictError extends Error {
  constructor(message: string, readonly workflow?: PeriodWorkflow) { super(message); this.name = 'WorkflowConflictError' }
}
export class WorkflowForbiddenError extends Error {}
export class WorkflowValidationError extends Error {}

interface PeriodRow { version: number; status: 'open' | 'closed'; closed_at: string | null; archive_json: string | null }
interface SubmissionRow { submitted_by: string; slot: 'a' | 'b'; projection_json: string; submission_version: number; submitted_at: string }

function changed(result: SqlRunResult): number { return result.changes ?? result.meta?.changes ?? 0 }
function parseProjection(text: string): SharedExport {
  const value: unknown = JSON.parse(text)
  if (!isStrictSharedProjection(value)) throw new Error('Stored shared projection is invalid.')
  return value
}

async function periodRow(database: SqlDatabase, householdId: string, period: string): Promise<PeriodRow | null> {
  return database.prepare('SELECT version, status, closed_at, archive_json FROM workflow_periods WHERE household_id = ? AND period = ?').bind(householdId, period).first<PeriodRow>()
}

async function submissionRows(database: SqlDatabase, householdId: string, period: string): Promise<SubmissionRow[]> {
  const result = await database.prepare(
    'SELECT s.submitted_by, p.slot, s.projection_json, s.submission_version, s.submitted_at ' +
    'FROM workflow_submissions s JOIN workflow_participants p ON p.household_id = s.household_id AND p.period = s.period AND p.user_id = s.submitted_by ' +
    'WHERE s.household_id = ? AND s.period = ? ORDER BY p.slot',
  ).bind(householdId, period).all<SubmissionRow>()
  return result.results
}

async function lastOwnAction(database: SqlDatabase, householdId: string, period: string, userId: string): Promise<string | null> {
  const row = await database.prepare('SELECT action FROM workflow_events WHERE household_id = ? AND period = ? AND actor_id = ? ORDER BY version DESC LIMIT 1').bind(householdId, period, userId).first<{ action: string }>()
  return row?.action ?? null
}

function submission(row: SubmissionRow): WorkflowSubmission {
  return { projection: parseProjection(row.projection_json), version: row.submission_version, submittedAt: row.submitted_at }
}

export async function readWorkflow(database: SqlDatabase, householdId: string, userId: string, period: string): Promise<PeriodWorkflow> {
  const row = await periodRow(database, householdId, period)
  if (!row) return emptyWorkflow(period)
  const rows = await submissionRows(database, householdId, period)
  const mineRow = rows.find(function (item) { return item.submitted_by === userId })
  const partnerRow = rows.find(function (item) { return item.submitted_by !== userId })
  let archive
  if (row.archive_json) {
    const candidate: unknown = JSON.parse(row.archive_json)
    if (!isMonthArchive(candidate)) throw new Error('Stored archive is invalid.')
    archive = candidate
  }
  const mine = mineRow ? submission(mineRow) : null
  const partner = partnerRow ? submission(partnerRow) : null
  if (row.status === 'closed') return { period, status: 'closed', version: row.version, mine, partner, archive }
  const action = await lastOwnAction(database, householdId, period, userId)
  const status = mine && partner ? 'partner-ready' : mine ? action === 'replace' ? 'replaced' : 'submitted' : action === 'withdraw' ? 'withdrawn' : 'draft'
  return { period, status, version: row.version, mine, partner }
}

async function ensurePeriod(database: SqlDatabase, householdId: string, period: string, now: string): Promise<void> {
  await database.prepare(
    'INSERT INTO workflow_periods (household_id, period, version, status, created_at, updated_at) VALUES (?, ?, 0, \'open\', ?, ?) ON CONFLICT (household_id, period) DO NOTHING',
  ).bind(householdId, period, now, now).run()
}

async function cachedCommand(database: SqlDatabase, householdId: string, userId: string, requestId: string, type: string, body: string): Promise<PeriodWorkflow | null> {
  const row = await database.prepare('SELECT actor_id, command_type, request_json, response_json FROM workflow_commands WHERE household_id = ? AND request_id = ?').bind(householdId, requestId).first<{ actor_id: string; command_type: string; request_json: string; response_json: string }>()
  if (!row) return null
  if (row.actor_id !== userId || row.command_type !== type || row.request_json !== body) throw new WorkflowConflictError('A request id was reused for a different command.')
  return JSON.parse(row.response_json) as PeriodWorkflow
}

async function participantSlot(database: SqlDatabase, householdId: string, period: string, userId: string): Promise<'a' | 'b' | null> {
  const existing = await database.prepare('SELECT slot FROM workflow_participants WHERE household_id = ? AND period = ? AND user_id = ?').bind(householdId, period, userId).first<{ slot: string }>()
  if (existing) return existing.slot as 'a' | 'b'
  const { results } = await database.prepare('SELECT slot FROM workflow_participants WHERE household_id = ? AND period = ? ORDER BY slot').bind(householdId, period).all<{ slot: string }>()
  if (results.length >= 2) throw new WorkflowForbiddenError('This period already has two participants.')
  return results.some(function (item) { return item.slot === 'a' }) ? 'b' : 'a'
}

async function advanceVersion(database: SqlDatabase, householdId: string, period: string, expected: number, now: string, closeArchive?: string): Promise<number> {
  const sql = closeArchive === undefined
    ? 'UPDATE workflow_periods SET version = version + 1, updated_at = ? WHERE household_id = ? AND period = ? AND version = ? AND status = \'open\''
    : 'UPDATE workflow_periods SET version = version + 1, status = \'closed\', closed_at = ?, archive_json = ?, updated_at = ? WHERE household_id = ? AND period = ? AND version = ? AND status = \'open\''
  const statement = closeArchive === undefined
    ? database.prepare(sql).bind(now, householdId, period, expected)
    : database.prepare(sql).bind(now, closeArchive, now, householdId, period, expected)
  const result = await statement.run()
  if (!changed(result)) throw new WorkflowConflictError('The workflow changed after this screen loaded.')
  return expected + 1
}

async function addEvent(database: SqlDatabase, householdId: string, period: string, version: number, userId: string, action: string, now: string, id: string): Promise<void> {
  await database.prepare('INSERT INTO workflow_events (id, household_id, period, version, actor_id, action, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)').bind(id, householdId, period, version, userId, action, now).run()
}

export async function submitWorkflow(input: {
  database: SqlDatabase; householdId: string; userId: string; projection: SharedExport; expectedVersion: number | null; requestId: string; replace: boolean; now: string; eventId: string
}): Promise<PeriodWorkflow> {
  const body = JSON.stringify({ period: input.projection.period, expectedVersion: input.expectedVersion, projection: input.projection })
  const type = input.replace ? 'replace' : 'submit'
  const cached = await cachedCommand(input.database, input.householdId, input.userId, input.requestId, type, body)
  if (cached) return cached
  await ensurePeriod(input.database, input.householdId, input.projection.period, input.now)
  const current = await readWorkflow(input.database, input.householdId, input.userId, input.projection.period)
  if (current.status === 'closed') throw new WorkflowConflictError('A closed month is locked.', current)
  if (input.replace && !current.mine) throw new WorkflowConflictError('There is no current submission to replace.', current)
  if (!input.replace && current.mine) {
    if (JSON.stringify(current.mine.projection) === JSON.stringify(input.projection)) return current
    throw new WorkflowConflictError('A submission already exists. Replace it instead.', current)
  }
  if (input.expectedVersion !== null && input.expectedVersion !== current.version) throw new WorkflowConflictError('The workflow changed after this screen loaded.', current)
  if (current.mine && JSON.stringify(current.mine.projection) === JSON.stringify(input.projection)) return current
  const slot = await participantSlot(input.database, input.householdId, input.projection.period, input.userId)
  const version = current.version + 1
  const workflow: PeriodWorkflow = {
    period: current.period,
    status: current.partner ? 'partner-ready' : input.replace ? 'replaced' : 'submitted',
    version,
    mine: { projection: input.projection, version, submittedAt: input.now },
    partner: current.partner,
  }
  const statements = []
  if (!current.mine) statements.push(input.database.prepare('INSERT INTO workflow_participants (household_id, period, user_id, slot, joined_at) VALUES (?, ?, ?, ?, ?)').bind(input.householdId, input.projection.period, input.userId, slot, input.now))
  statements.push(input.database.prepare('UPDATE workflow_periods SET version = version + 1, updated_at = ? WHERE household_id = ? AND period = ? AND version = ? AND status = \'open\'').bind(input.now, input.householdId, input.projection.period, current.version))
  statements.push(input.database.prepare(
    'INSERT INTO workflow_submissions (household_id, period, submitted_by, projection_json, submission_version, submitted_at) VALUES (?, ?, ?, ?, ?, ?) ' +
    'ON CONFLICT (household_id, period, submitted_by) DO UPDATE SET projection_json = excluded.projection_json, submission_version = excluded.submission_version, submitted_at = excluded.submitted_at',
  ).bind(input.householdId, input.projection.period, input.userId, JSON.stringify(input.projection), version, input.now))
  statements.push(input.database.prepare('INSERT INTO workflow_events (id, household_id, period, version, actor_id, action, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)').bind(input.eventId, input.householdId, input.projection.period, version, input.userId, type, input.now))
  statements.push(input.database.prepare('INSERT INTO workflow_commands (household_id, request_id, actor_id, command_type, request_json, response_json, created_at, period) VALUES (?, ?, ?, ?, ?, ?, ?, ?)').bind(input.householdId, input.requestId, input.userId, type, body, JSON.stringify(workflow), input.now, input.projection.period))
  try { await input.database.batch(statements) }
  catch { throw new WorkflowConflictError('The workflow changed or storage interrupted the operation. Refresh and retry safely.', await readWorkflow(input.database, input.householdId, input.userId, input.projection.period)) }
  return workflow
}

export async function withdrawWorkflow(input: { database: SqlDatabase; householdId: string; userId: string; period: string; expectedVersion: number; requestId: string; now: string; eventId: string }): Promise<PeriodWorkflow> {
  const body = JSON.stringify({ period: input.period, expectedVersion: input.expectedVersion })
  const cached = await cachedCommand(input.database, input.householdId, input.userId, input.requestId, 'withdraw', body)
  if (cached) return cached
  const current = await readWorkflow(input.database, input.householdId, input.userId, input.period)
  if (current.status === 'closed') throw new WorkflowConflictError('A closed month is locked.', current)
  if (!current.mine) return current
  if (current.version !== input.expectedVersion) throw new WorkflowConflictError('Refresh before withdrawing this submission.', current)
  const version = current.version + 1
  const workflow: PeriodWorkflow = { period: current.period, status: 'withdrawn', version, mine: null, partner: current.partner }
  try { await input.database.batch([
    input.database.prepare('UPDATE workflow_periods SET version = version + 1, updated_at = ? WHERE household_id = ? AND period = ? AND version = ? AND status = \'open\'').bind(input.now, input.householdId, input.period, current.version),
    input.database.prepare('DELETE FROM workflow_submissions WHERE household_id = ? AND period = ? AND submitted_by = ?').bind(input.householdId, input.period, input.userId),
    input.database.prepare('INSERT INTO workflow_events (id, household_id, period, version, actor_id, action, created_at) VALUES (?, ?, ?, ?, ?, \'withdraw\', ?)').bind(input.eventId, input.householdId, input.period, version, input.userId, input.now),
    input.database.prepare('INSERT INTO workflow_commands (household_id, request_id, actor_id, command_type, request_json, response_json, created_at, period) VALUES (?, ?, ?, \'withdraw\', ?, ?, ?, ?)').bind(input.householdId, input.requestId, input.userId, body, JSON.stringify(workflow), input.now, input.period),
  ]) } catch { throw new WorkflowConflictError('The workflow changed or storage interrupted the withdrawal. Refresh and retry safely.', await readWorkflow(input.database, input.householdId, input.userId, input.period)) }
  return workflow
}

export async function closeWorkflow(input: { database: SqlDatabase; householdId: string; userId: string; period: string; expectedVersion: number; requestId: string; now: string; eventId: string }): Promise<PeriodWorkflow> {
  const body = JSON.stringify({ period: input.period, expectedVersion: input.expectedVersion })
  const cached = await cachedCommand(input.database, input.householdId, input.userId, input.requestId, 'close', body)
  if (cached) return cached
  const current = await readWorkflow(input.database, input.householdId, input.userId, input.period)
  if (current.status === 'closed') return current
  if (current.version !== input.expectedVersion) throw new WorkflowConflictError('A submission changed before close.', current)
  const participants = await input.database.prepare('SELECT user_id, slot FROM workflow_participants WHERE household_id = ? AND period = ? ORDER BY slot').bind(input.householdId, input.period).all<{ user_id: string; slot: 'a' | 'b' }>()
  if (!participants.results.some(function (item) { return item.user_id === input.userId })) throw new WorkflowForbiddenError('Only a participating household member may close this period.')
  const rows = await submissionRows(input.database, input.householdId, input.period)
  if (rows.length !== 2) throw new WorkflowConflictError('Both household submissions are required before close.', current)
  const a = rows.find(function (item) { return item.slot === 'a' })
  const b = rows.find(function (item) { return item.slot === 'b' })
  if (!a || !b) throw new Error('Two participant slots are required before close.')
  const aProjection = parseProjection(a.projection_json)
  const bProjection = parseProjection(b.projection_json)
  const archive = buildMonthArchive({ toolVersion: aProjection.toolVersion, period: input.period, closed: input.now, people: { a: aProjection.owner, b: bProjection.owner }, mine: aProjection.items, theirs: bProjection.items })
  const version = current.version + 1
  const workflow: PeriodWorkflow = { ...current, status: 'closed', version, archive }
  try { await input.database.batch([
    input.database.prepare('UPDATE workflow_periods SET version = version + 1, status = \'closed\', closed_at = ?, archive_json = ?, updated_at = ? WHERE household_id = ? AND period = ? AND version = ? AND status = \'open\'').bind(input.now, JSON.stringify(archive), input.now, input.householdId, input.period, current.version),
    input.database.prepare('INSERT INTO workflow_events (id, household_id, period, version, actor_id, action, created_at) VALUES (?, ?, ?, ?, ?, \'close\', ?)').bind(input.eventId, input.householdId, input.period, version, input.userId, input.now),
    input.database.prepare('INSERT INTO workflow_commands (household_id, request_id, actor_id, command_type, request_json, response_json, created_at, period) VALUES (?, ?, ?, \'close\', ?, ?, ?, ?)').bind(input.householdId, input.requestId, input.userId, body, JSON.stringify(workflow), input.now, input.period),
  ]) } catch { throw new WorkflowConflictError('The workflow changed or storage interrupted close. Refresh before retrying.', await readWorkflow(input.database, input.householdId, input.userId, input.period)) }
  return workflow
}

export async function exportClosedWorkflows(database: SqlDatabase, householdId: string, now: string, token: string): Promise<{ bundle: HouseholdArchiveBundle; deletionToken: string; openPeriods: string[] }> {
  const { results } = await database.prepare('SELECT period, status, archive_json FROM workflow_periods WHERE household_id = ? ORDER BY period').bind(householdId).all<{ period: string; status: string; archive_json: string | null }>()
  const archives = results.filter(function (row) { return row.status === 'closed' && row.archive_json }).map(function (row) {
    const archive: unknown = JSON.parse(row.archive_json || 'null')
    if (!isMonthArchive(archive)) throw new Error('Stored archive is invalid.')
    return archive
  })
  const expires = new Date(Date.parse(now) + 15 * 60 * 1000).toISOString()
  await database.batch([
    database.prepare('DELETE FROM workflow_deletion_tokens WHERE household_id = ?').bind(householdId),
    database.prepare('INSERT INTO workflow_deletion_tokens (token, household_id, expires_at, created_at) VALUES (?, ?, ?, ?)').bind(token, householdId, expires, now),
  ])
  return { bundle: buildHouseholdArchiveBundle(archives, now), deletionToken: token, openPeriods: results.filter(function (row) { return row.status !== 'closed' }).map(function (row) { return row.period }) }
}

export async function deleteWorkflowHistory(database: SqlDatabase, householdId: string, token: string, now: string): Promise<number> {
  const valid = await database.prepare('SELECT token FROM workflow_deletion_tokens WHERE token = ? AND household_id = ? AND expires_at >= ?').bind(token, householdId, now).first<{ token: string }>()
  if (!valid) {
    const remaining = await database.prepare('SELECT COUNT(*) AS total FROM workflow_periods WHERE household_id = ?').bind(householdId).first<{ total: number }>()
    if (!Number(remaining?.total || 0)) return 0
    throw new WorkflowForbiddenError('Export again before deleting shared history.')
  }
  const open = await database.prepare('SELECT COUNT(*) AS total FROM workflow_periods WHERE household_id = ? AND status <> \'closed\'').bind(householdId).first<{ total: number }>()
  if (Number(open?.total || 0)) throw new WorkflowConflictError('Close or withdraw every open period before deleting shared history.')
  const count = await database.prepare('SELECT COUNT(*) AS total FROM workflow_periods WHERE household_id = ?').bind(householdId).first<{ total: number }>()
  const statements = [
    database.prepare('DELETE FROM workflow_commands WHERE household_id = ? AND period IN (SELECT period FROM workflow_periods WHERE household_id = ? AND status = \'closed\')').bind(householdId, householdId),
    database.prepare('DELETE FROM workflow_periods WHERE household_id = ? AND status = \'closed\'').bind(householdId),
    database.prepare('DELETE FROM workflow_deletion_tokens WHERE household_id = ?').bind(householdId),
    database.prepare('DELETE FROM shared_entries WHERE household_id = ?').bind(householdId),
  ]
  await database.batch(statements)
  return Number(count?.total || 0)
}

export async function restoreWorkflowHistory(database: SqlDatabase, householdId: string, userId: string, bundle: HouseholdArchiveBundle, now: string, id: () => string): Promise<number> {
  const archives = bundle.archives.map(function (archive) {
    const asItem = function (item: (typeof archive.items)[number]) { return { date: item.date, merchant: item.merchant, category: item.category, amount: item.amount, share: item.shareOfPayer } }
    return buildMonthArchive({ toolVersion: archive.toolVersion, period: archive.period, closed: archive.closed, people: archive.people, mine: archive.items.filter(function (item) { return item.payer === 'a' }).map(asItem), theirs: archive.items.filter(function (item) { return item.payer === 'b' }).map(asItem) })
  })
  let allAlreadyRestored = archives.length > 0
  for (const archive of archives) {
    const existing = await periodRow(database, householdId, archive.period)
    if (!existing) { allAlreadyRestored = false; continue }
    if (existing.status !== 'closed' || existing.archive_json !== JSON.stringify(archive)) throw new WorkflowConflictError('A workflow already exists for ' + archive.period + '.')
  }
  if (allAlreadyRestored) return bundle.archives.length
  const statements = []
  for (const archive of archives) {
    if (await periodRow(database, householdId, archive.period)) continue
    statements.push(database.prepare('INSERT INTO workflow_periods (household_id, period, version, status, closed_at, archive_json, created_at, updated_at) VALUES (?, ?, 1, \'closed\', ?, ?, ?, ?)').bind(householdId, archive.period, archive.closed, JSON.stringify(archive), now, now))
    statements.push(database.prepare('INSERT INTO workflow_events (id, household_id, period, version, actor_id, action, created_at) VALUES (?, ?, ?, 1, ?, \'restore\', ?)').bind(id(), householdId, archive.period, userId, now))
  }
  if (statements.length) await database.batch(statements)
  return archives.length
}

/** Administrator escape hatch for an abandoned open period. Active submissions must be withdrawn first. */
export async function cancelAbandonedWorkflow(database: SqlDatabase, householdId: string, period: string): Promise<void> {
  const row = await periodRow(database, householdId, period)
  if (!row) return
  if (row.status === 'closed') throw new WorkflowConflictError('A closed period is an immutable archive and cannot be cancelled.')
  const submissions = await database.prepare('SELECT COUNT(*) AS total FROM workflow_submissions WHERE household_id = ? AND period = ?').bind(householdId, period).first<{ total: number }>()
  if (Number(submissions?.total || 0)) throw new WorkflowConflictError('Withdraw all participant submissions before cancelling this abandoned period.')
  await database.batch([
    database.prepare('DELETE FROM workflow_periods WHERE household_id = ? AND period = ? AND status = \'open\' AND NOT EXISTS (SELECT 1 FROM workflow_submissions WHERE household_id = ? AND period = ?)').bind(householdId, period, householdId, period),
    database.prepare('DELETE FROM workflow_commands WHERE household_id = ? AND period = ? AND NOT EXISTS (SELECT 1 FROM workflow_periods WHERE household_id = ? AND period = ?)').bind(householdId, period, householdId, period),
  ])
  if (await periodRow(database, householdId, period)) throw new WorkflowConflictError('The period changed while cancellation was attempted. Refresh and review it.')
}
