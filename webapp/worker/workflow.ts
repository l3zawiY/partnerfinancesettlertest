import { buildHouseholdArchiveBundle, buildMonthArchive, isMonthArchive, type HouseholdArchiveBundle, type SharedExport } from '../shared/formats'
import { isSafeAlias, sameLabel, type ParticipantRole } from '../shared/pairing'
import { emptyWorkflow, isStrictSharedProjection, type PeriodWorkflow, type WorkflowAction, type WorkflowEvent, type WorkflowSubmission } from '../shared/workflow'
import type { SqlDatabase, SqlRunResult } from './db'
import type { VerifiedParticipant } from './pairing'

export class WorkflowConflictError extends Error {
  constructor(message: string, readonly workflow?: PeriodWorkflow) { super(message); this.name = 'WorkflowConflictError' }
}
export class WorkflowForbiddenError extends Error {}
export class WorkflowValidationError extends Error {}

/**
 * Who is acting, as the server established it from the verified session plus the paired
 * participant table. Every workflow function takes this instead of a bare user id so no
 * code path can act for an unpaired account. `partner` is null while the pairing is
 * still coordinator-only.
 */
export interface WorkflowActor { me: VerifiedParticipant; partner: VerifiedParticipant | null }

interface PeriodRow { version: number; status: 'open' | 'closed'; closed_at: string | null; archive_json: string | null }
interface SubmissionRow { submitted_by: string; slot: 'a' | 'b'; projection_json: string; submission_version: number; submitted_at: string }
interface EventRow { version: number; action: WorkflowAction; actor_id: string; actor_role: ParticipantRole | null; created_at: string }

const RECOVERY_REASON = 'This month holds submissions or participant slots recorded before the household was paired, and they cannot be matched to the current coordinator and partner safely. Nothing was changed or deleted. If the month has no submissions, a household administrator can cancel the abandoned month from Rules & Files; otherwise contact support before continuing.'

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

function roleOf(actor: WorkflowActor, userId: string, recorded: ParticipantRole | null): ParticipantRole | null {
  if (recorded) return recorded
  if (userId === actor.me.userId) return actor.me.role
  if (actor.partner && userId === actor.partner.userId) return actor.partner.role
  return null
}

async function latestEvent(database: SqlDatabase, householdId: string, period: string, actor: WorkflowActor): Promise<WorkflowEvent | null> {
  const row = await database.prepare('SELECT version, action, actor_id, actor_role, created_at FROM workflow_events WHERE household_id = ? AND period = ? ORDER BY version DESC LIMIT 1').bind(householdId, period).first<EventRow>()
  return row ? { version: row.version, action: row.action, actorRole: roleOf(actor, row.actor_id, row.actor_role), at: row.created_at } : null
}

async function closeEvent(database: SqlDatabase, householdId: string, period: string, actor: WorkflowActor): Promise<ParticipantRole | null> {
  const row = await database.prepare('SELECT version, action, actor_id, actor_role, created_at FROM workflow_events WHERE household_id = ? AND period = ? AND action = \'close\' ORDER BY version DESC LIMIT 1').bind(householdId, period).first<EventRow>()
  return row ? roleOf(actor, row.actor_id, row.actor_role) : null
}

/**
 * True when an open month carries a participant slot that does not belong to a current
 * participant in that participant's own stable slot. Closed months are immutable history.
 */
async function needsRecovery(database: SqlDatabase, householdId: string, period: string, actor: WorkflowActor): Promise<boolean> {
  const { results } = await database.prepare('SELECT user_id, slot FROM workflow_participants WHERE household_id = ? AND period = ?').bind(householdId, period).all<{ user_id: string; slot: 'a' | 'b' }>()
  const expected = new Map<string, 'a' | 'b'>([[actor.me.userId, actor.me.slot]])
  if (actor.partner) expected.set(actor.partner.userId, actor.partner.slot)
  return results.some(function (row) { return expected.get(row.user_id) !== row.slot })
}

function submission(row: SubmissionRow): WorkflowSubmission {
  return { projection: parseProjection(row.projection_json), version: row.submission_version, submittedAt: row.submitted_at }
}

function participants(actor: WorkflowActor): PeriodWorkflow['participants'] {
  return { me: { role: actor.me.role, alias: actor.me.alias }, partner: actor.partner ? { role: actor.partner.role, alias: actor.partner.alias } : null }
}

export async function readWorkflow(database: SqlDatabase, householdId: string, actor: WorkflowActor, period: string): Promise<PeriodWorkflow> {
  const row = await periodRow(database, householdId, period)
  if (!row) return { ...emptyWorkflow(period), participants: participants(actor), lastEvent: null }
  if (row.status === 'open' && await needsRecovery(database, householdId, period, actor)) {
    return { period, status: 'recovery-required', version: row.version, mine: null, partner: null, participants: participants(actor), lastEvent: null, recoveryReason: RECOVERY_REASON }
  }
  const rows = await submissionRows(database, householdId, period)
  const mineRow = rows.find(function (item) { return item.submitted_by === actor.me.userId })
  const partnerRow = rows.find(function (item) { return item.submitted_by !== actor.me.userId })
  let archive
  if (row.archive_json) {
    const candidate: unknown = JSON.parse(row.archive_json)
    if (!isMonthArchive(candidate)) throw new Error('Stored archive is invalid.')
    archive = candidate
  }
  const mine = mineRow ? submission(mineRow) : null
  const partner = partnerRow ? submission(partnerRow) : null
  const lastEvent = await latestEvent(database, householdId, period, actor)
  if (row.status === 'closed') {
    return { period, status: 'closed', version: row.version, mine, partner, archive, participants: participants(actor), lastEvent, closedBy: await closeEvent(database, householdId, period, actor), closedAt: row.closed_at ?? undefined }
  }
  const action = await lastOwnAction(database, householdId, period, actor.me.userId)
  const status = mine && partner ? 'partner-ready' : mine ? action === 'replace' ? 'replaced' : 'submitted' : action === 'withdraw' ? 'withdrawn' : 'draft'
  return { period, status, version: row.version, mine, partner, participants: participants(actor), lastEvent }
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

function eventStatement(database: SqlDatabase, id: string, householdId: string, period: string, version: number, actor: VerifiedParticipant, action: WorkflowAction, now: string) {
  return database.prepare('INSERT INTO workflow_events (id, household_id, period, version, actor_id, actor_role, action, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)').bind(id, householdId, period, version, actor.userId, actor.role, action, now)
}

function commandStatement(database: SqlDatabase, householdId: string, requestId: string, actor: VerifiedParticipant, type: string, body: string, workflow: PeriodWorkflow, now: string, period: string) {
  return database.prepare('INSERT INTO workflow_commands (household_id, request_id, actor_id, command_type, request_json, response_json, created_at, period) VALUES (?, ?, ?, ?, ?, ?, ?, ?)').bind(householdId, requestId, actor.userId, type, body, JSON.stringify(workflow), now, period)
}

function advance(database: SqlDatabase, householdId: string, period: string, expected: number, now: string) {
  return database.prepare('UPDATE workflow_periods SET version = version + 1, updated_at = ? WHERE household_id = ? AND period = ? AND version = ? AND status = \'open\'').bind(now, householdId, period, expected)
}

export async function submitWorkflow(input: {
  database: SqlDatabase; householdId: string; actor: WorkflowActor; projection: SharedExport; expectedVersion: number | null; requestId: string; replace: boolean; now: string; eventId: string
}): Promise<PeriodWorkflow> {
  const { database, householdId, actor } = input
  const period = input.projection.period
  // The browser's `owner` text is not identity. The server rebinds attribution to the
  // verified participant's alias at this trust boundary, and everything stored or
  // archived from here on carries that alias.
  const projection: SharedExport = { ...input.projection, owner: actor.me.alias }
  const body = JSON.stringify({ period, expectedVersion: input.expectedVersion, projection: input.projection })
  const type: WorkflowAction = input.replace ? 'replace' : 'submit'
  const cached = await cachedCommand(database, householdId, actor.me.userId, input.requestId, type, body)
  if (cached) return cached
  await ensurePeriod(database, householdId, period, input.now)
  const current = await readWorkflow(database, householdId, actor, period)
  if (current.status === 'closed') throw new WorkflowConflictError('A closed month is locked.', current)
  if (current.status === 'recovery-required') throw new WorkflowConflictError('This month needs recovery before a submission can be accepted.', current)
  if (input.replace && !current.mine) throw new WorkflowConflictError('There is no current submission to replace.', current)
  if (!input.replace && current.mine) {
    if (JSON.stringify(current.mine.projection) === JSON.stringify(projection)) return current
    throw new WorkflowConflictError('A submission already exists. Replace it instead.', current)
  }
  if (input.expectedVersion !== null && input.expectedVersion !== current.version) throw new WorkflowConflictError('The workflow changed after this screen loaded.', current)
  if (current.mine && JSON.stringify(current.mine.projection) === JSON.stringify(projection)) return current
  const version = current.version + 1
  const workflow: PeriodWorkflow = {
    period,
    status: current.partner ? 'partner-ready' : input.replace ? 'replaced' : 'submitted',
    version,
    mine: { projection, version, submittedAt: input.now },
    partner: current.partner,
    participants: participants(actor),
    lastEvent: { version, action: type, actorRole: actor.me.role, at: input.now },
  }
  // The slot comes from the stable role, never from arrival order. A row left behind by an
  // earlier withdrawal is simply kept, which is what makes withdraw-then-resubmit in one
  // tab an ordinary sequence rather than a false conflict.
  const statements = [
    database.prepare('INSERT INTO workflow_participants (household_id, period, user_id, slot, joined_at) VALUES (?, ?, ?, ?, ?) ON CONFLICT (household_id, period, user_id) DO NOTHING').bind(householdId, period, actor.me.userId, actor.me.slot, input.now),
    advance(database, householdId, period, current.version, input.now),
    database.prepare(
      'INSERT INTO workflow_submissions (household_id, period, submitted_by, projection_json, submission_version, submitted_at) VALUES (?, ?, ?, ?, ?, ?) ' +
      'ON CONFLICT (household_id, period, submitted_by) DO UPDATE SET projection_json = excluded.projection_json, submission_version = excluded.submission_version, submitted_at = excluded.submitted_at',
    ).bind(householdId, period, actor.me.userId, JSON.stringify(projection), version, input.now),
    eventStatement(database, input.eventId, householdId, period, version, actor.me, type, input.now),
    commandStatement(database, householdId, input.requestId, actor.me, type, body, workflow, input.now, period),
  ]
  try { await database.batch(statements) }
  catch { throw new WorkflowConflictError('The workflow changed or storage interrupted the operation. Refresh and retry safely.', await readWorkflow(database, householdId, actor, period)) }
  return workflow
}

export async function withdrawWorkflow(input: { database: SqlDatabase; householdId: string; actor: WorkflowActor; period: string; expectedVersion: number; requestId: string; now: string; eventId: string }): Promise<PeriodWorkflow> {
  const { database, householdId, actor, period } = input
  const body = JSON.stringify({ period, expectedVersion: input.expectedVersion })
  const cached = await cachedCommand(database, householdId, actor.me.userId, input.requestId, 'withdraw', body)
  if (cached) return cached
  const current = await readWorkflow(database, householdId, actor, period)
  if (current.status === 'closed') throw new WorkflowConflictError('A closed month is locked.', current)
  if (current.status === 'recovery-required') throw new WorkflowConflictError('This month needs recovery before it can change.', current)
  if (!current.mine) return current
  if (current.version !== input.expectedVersion) throw new WorkflowConflictError('Refresh before withdrawing this submission.', current)
  const version = current.version + 1
  const workflow: PeriodWorkflow = { period, status: 'withdrawn', version, mine: null, partner: current.partner, participants: participants(actor), lastEvent: { version, action: 'withdraw', actorRole: actor.me.role, at: input.now } }
  try { await database.batch([
    advance(database, householdId, period, current.version, input.now),
    database.prepare('DELETE FROM workflow_submissions WHERE household_id = ? AND period = ? AND submitted_by = ?').bind(householdId, period, actor.me.userId),
    eventStatement(database, input.eventId, householdId, period, version, actor.me, 'withdraw', input.now),
    commandStatement(database, householdId, input.requestId, actor.me, 'withdraw', body, workflow, input.now, period),
  ]) } catch { throw new WorkflowConflictError('The workflow changed or storage interrupted the withdrawal. Refresh and retry safely.', await readWorkflow(database, householdId, actor, period)) }
  return workflow
}

export async function closeWorkflow(input: { database: SqlDatabase; householdId: string; actor: WorkflowActor; period: string; expectedVersion: number; requestId: string; now: string; eventId: string }): Promise<PeriodWorkflow> {
  const { database, householdId, actor, period } = input
  const body = JSON.stringify({ period, expectedVersion: input.expectedVersion })
  const cached = await cachedCommand(database, householdId, actor.me.userId, input.requestId, 'close', body)
  if (cached) return cached
  const current = await readWorkflow(database, householdId, actor, period)
  if (current.status === 'closed') return current
  if (current.status === 'recovery-required') throw new WorkflowConflictError('This month needs recovery before it can close.', current)
  // The coordinator owns the operational close, as in v1's settler model. The check uses
  // the stable server-bound role, never anything the browser sent.
  if (actor.me.role !== 'coordinator') throw new WorkflowForbiddenError('Only the coordinator' + (actor.partner ? ', ' + actor.partner.alias + ',' : '') + ' can close this month.')
  if (!actor.partner) throw new WorkflowConflictError('A partner must join the household before a month can close.', current)
  if (current.version !== input.expectedVersion) throw new WorkflowConflictError('A submission changed before close.', current)
  const rows = await submissionRows(database, householdId, period)
  if (rows.length !== 2) throw new WorkflowConflictError('Both household submissions are required before close.', current)
  const a = rows.find(function (item) { return item.slot === 'a' })
  const b = rows.find(function (item) { return item.slot === 'b' })
  if (!a || !b) throw new Error('Two participant slots are required before close.')
  const aProjection = parseProjection(a.projection_json)
  const bProjection = parseProjection(b.projection_json)
  const coordinator = actor.me
  const partner = actor.partner
  // people come from the paired participant records, never from projection text.
  const archive = buildMonthArchive({ toolVersion: aProjection.toolVersion, period, closed: input.now, people: { a: coordinator.alias, b: partner.alias }, mine: aProjection.items, theirs: bProjection.items })
  const version = current.version + 1
  const workflow: PeriodWorkflow = { ...current, status: 'closed', version, archive, closedBy: 'coordinator', closedAt: input.now, lastEvent: { version, action: 'close', actorRole: 'coordinator', at: input.now } }
  try { await database.batch([
    database.prepare('UPDATE workflow_periods SET version = version + 1, status = \'closed\', closed_at = ?, archive_json = ?, updated_at = ? WHERE household_id = ? AND period = ? AND version = ? AND status = \'open\'').bind(input.now, JSON.stringify(archive), input.now, householdId, period, current.version),
    eventStatement(database, input.eventId, householdId, period, version, actor.me, 'close', input.now),
    commandStatement(database, householdId, input.requestId, actor.me, 'close', body, workflow, input.now, period),
  ]) } catch { throw new WorkflowConflictError('The workflow changed or storage interrupted close. Refresh before retrying.', await readWorkflow(database, householdId, actor, period)) }
  return workflow
}

export async function exportClosedWorkflows(database: SqlDatabase, householdId: string, now: string, token: string | null): Promise<{ bundle: HouseholdArchiveBundle; deletionToken: string | null; openPeriods: string[] }> {
  const { results } = await database.prepare('SELECT period, status, archive_json FROM workflow_periods WHERE household_id = ? ORDER BY period').bind(householdId).all<{ period: string; status: string; archive_json: string | null }>()
  const archives = results.filter(function (row) { return row.status === 'closed' && row.archive_json }).map(function (row) {
    const archive: unknown = JSON.parse(row.archive_json || 'null')
    if (!isMonthArchive(archive)) throw new Error('Stored archive is invalid.')
    return archive
  })
  if (token !== null) {
    const expires = new Date(Date.parse(now) + 15 * 60 * 1000).toISOString()
    await database.batch([
      database.prepare('DELETE FROM workflow_deletion_tokens WHERE household_id = ?').bind(householdId),
      database.prepare('INSERT INTO workflow_deletion_tokens (token, household_id, expires_at, created_at) VALUES (?, ?, ?, ?)').bind(token, householdId, expires, now),
    ])
  }
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

export async function restoreWorkflowHistory(database: SqlDatabase, householdId: string, workflowActor: WorkflowActor, bundle: HouseholdArchiveBundle, now: string, id: () => string): Promise<number> {
  const actor = workflowActor.me
  // WEB-024: only archives of this household's two participants can be restored. Archive
  // payer a is always the coordinator and b the partner; aliases must also be safe labels.
  const coordinator = actor.role === 'coordinator' ? actor : workflowActor.partner
  const partner = actor.role === 'partner' ? actor : workflowActor.partner
  if (!coordinator || !partner || coordinator.role !== 'coordinator' || partner.role !== 'partner') throw new WorkflowConflictError('Both participants must be paired before archives can be restored.')
  for (const archive of bundle.archives) {
    if (!isSafeAlias(archive.people.a) || !isSafeAlias(archive.people.b)) throw new WorkflowConflictError('The archive for ' + archive.period + ' has participant names that are not valid aliases, so nothing was restored.')
    if (!sameLabel(archive.people.a, coordinator.alias) || !sameLabel(archive.people.b, partner.alias)) throw new WorkflowConflictError('The archive for ' + archive.period + ' belongs to different participants than this household\'s ' + coordinator.alias + ' and ' + partner.alias + ', so nothing was restored.')
  }
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
    statements.push(eventStatement(database, id(), householdId, archive.period, 1, actor, 'restore', now))
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
