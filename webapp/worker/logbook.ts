import {
  MAX_BROWSER_EVENTS_PER_DAY,
  MAX_EVENTS_PER_REQUEST,
  RETENTION_DAYS,
  validBrowserEvent,
  type BrowserLogbookEvent,
  type LogbookRow,
  type ServerEventName,
} from '../shared/logbook'
import type { SqlDatabase } from './db'

/**
 * Pilot logbook storage (WEB-048). Writing here must never change what the person sees: every
 * function that touches the logbook swallows its own failures, and the Worker schedules the
 * writes after the response.
 */

/** A one-way digest of the household, so rows group by household without naming it. */
export async function householdRef(householdId: string | null): Promise<string | null> {
  if (!householdId) return null
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode('split-ledger-logbook:' + householdId))
  return Array.from(new Uint8Array(digest).slice(0, 8)).map(function (byte) { return byte.toString(16).padStart(2, '0') }).join('')
}

/** The paired role of this account in this household, read from the financial database. */
export async function participantRole(database: SqlDatabase, householdId: string | null, userId: string): Promise<'coordinator' | 'partner' | null> {
  if (!householdId) return null
  try {
    const row = await database.prepare('SELECT role FROM household_participants WHERE household_id = ? AND user_id = ?').bind(householdId, userId).first<{ role: string }>()
    return row?.role === 'coordinator' || row?.role === 'partner' ? row.role : null
  } catch { return null }
}

/** Which successful API call counts as which activity; everything else records nothing. */
export function serverActivity(method: string, route: string): ServerEventName | null {
  const key = method + ' ' + route
  const events: Record<string, ServerEventName> = {
    'POST /api/household/pairing/initialize': 'household_initialized',
    'POST /api/household/pairing/partner-invitation': 'partner_invited',
    'POST /api/household/pairing/join': 'partner_joined',
    'POST /api/workflows/:month/submission': 'submitted',
    'PUT /api/workflows/:month/submission': 'replaced',
    'DELETE /api/workflows/:month/submission': 'withdrew',
    'POST /api/workflows/:month/close': 'month_closed',
    'POST /api/workflows/export': 'archives_exported',
    'POST /api/workflows/restore': 'archives_restored',
    'DELETE /api/workflows': 'history_deleted',
    'POST /api/workflows/cancel-abandoned': 'period_cancelled',
  }
  return events[key] ?? null
}

/** A plain error type for a 5xx answer that was returned rather than thrown. */
export function returnedErrorType(status: number, message: unknown): string {
  const text = typeof message === 'string' ? message : ''
  if (text === 'Authentication service unavailable.') return 'AuthenticationUnavailable'
  if (text.startsWith('The shared service reached its free daily limit')) return 'StorageDailyLimit'
  if (text.startsWith('Shared storage is temporarily unavailable')) return 'StorageUnavailable'
  return status === 500 ? 'InternalError' : 'ServiceUnavailable'
}

export async function insertRows(database: SqlDatabase, rows: LogbookRow[]): Promise<void> {
  if (!rows.length) return
  const statements = rows.map(function (row) {
    return database.prepare(
      'INSERT INTO logbook (at, environment, source, kind, event, household_ref, role, month, screen, route, status, error_type, code_location, reference, app_version, count, duration_seconds) ' +
        'VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    ).bind(row.at, row.environment, row.source, row.kind, row.event, row.householdRef, row.role, row.month, row.screen, row.route, row.status, row.errorType, row.codeLocation, row.reference, row.appVersion, row.count, row.durationSeconds)
  })
  await database.batch(statements)
}

/** Browser events exactly as allowed, or null when the request must be refused whole. */
export function readBrowserEvents(body: unknown): BrowserLogbookEvent[] | null {
  if (!body || typeof body !== 'object' || !Array.isArray((body as { events?: unknown }).events)) return null
  const events = (body as { events: unknown[] }).events
  if (events.length < 1 || events.length > MAX_EVENTS_PER_REQUEST) return null
  const valid = events.map(validBrowserEvent)
  return valid.every(Boolean) ? valid as BrowserLogbookEvent[] : null
}

/** How many more browser events this household and role may add today. */
export async function browserAllowanceLeft(database: SqlDatabase, ref: string | null, role: string | null, now: string): Promise<number> {
  const row = await database.prepare("SELECT COUNT(*) AS total FROM logbook WHERE source = 'browser' AND household_ref IS ? AND role IS ? AND at >= ?").bind(ref, role, now.slice(0, 10)).first<{ total: number }>()
  return Math.max(0, MAX_BROWSER_EVENTS_PER_DAY - (row?.total ?? 0))
}

/** Deletes rows older than the retention period; run daily by the Worker's schedule. */
export async function deleteExpired(database: SqlDatabase, now: string): Promise<void> {
  const cutoff = new Date(Date.parse(now) - RETENTION_DAYS * 86_400_000).toISOString()
  await database.prepare('DELETE FROM logbook WHERE at < ?').bind(cutoff).run()
}
