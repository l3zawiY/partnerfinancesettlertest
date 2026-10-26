// Fixed, read-only queries against the pilot logbook (WEB-048). Only the logbook databases
// are ever bound to this Worker; nothing here can reach the financial databases.
// The browser never supplies SQL: it may only pick one of the window and source names below.

export const WINDOWS = { '24h': 1, '7d': 7, '30d': 30 } as const
export type WindowName = keyof typeof WINDOWS

export const LOGBOOKS = { production: 'Production', staging: 'Staging (fictional)' } as const
export type LogbookName = keyof typeof LOGBOOKS

export const ERROR_LIMIT = 100
export const ACTIVITY_LIMIT = 50

export const SUMMARY_SQL =
  "SELECT SUM(kind = 'error' AND at >= ?1) AS errors_24h, SUM(kind = 'activity' AND at >= ?1) AS activity_24h, " +
  "SUM(kind = 'error' AND at >= ?2) AS errors_7d, SUM(kind = 'activity' AND at >= ?2) AS activity_7d, " +
  "SUM(kind = 'error') AS errors_30d, SUM(kind = 'activity') AS activity_30d " +
  'FROM logbook WHERE at >= ?3'

export const ERRORS_SQL =
  'SELECT at, environment, source, event, screen, route, status, error_type, code_location, reference, app_version ' +
  "FROM logbook WHERE kind = 'error' AND at >= ?1 ORDER BY at DESC LIMIT " + ERROR_LIMIT

export const ACTIVITY_SQL =
  'SELECT event, role, COUNT(*) AS times, MAX(at) AS last_at ' +
  "FROM logbook WHERE kind = 'activity' AND at >= ?1 GROUP BY event, role ORDER BY times DESC, event LIMIT " + ACTIVITY_LIMIT

export type WindowCounts = Record<WindowName, { errors: number; activity: number }>

export interface ErrorRow {
  at: string
  environment: string | null
  source: string | null
  event: string | null
  screen: string | null
  route: string | null
  status: number | null
  errorType: string | null
  codeLocation: string | null
  reference: string | null
  appVersion: string | null
}

export interface ActivityRow {
  event: string
  role: string | null
  times: number
  lastAt: string | null
}

export interface LogbookView {
  summary: WindowCounts
  errors: ErrorRow[]
  activity: ActivityRow[]
}

/** The minimal part of D1 this module uses, so tests can pass a fake. */
export interface ReadOnlyDatabase {
  prepare(sql: string): { bind(...values: unknown[]): unknown }
  batch(statements: unknown[]): Promise<Array<{ results?: unknown[] }>>
}

export function isWindowName(value: string | null): value is WindowName {
  return value !== null && Object.prototype.hasOwnProperty.call(WINDOWS, value)
}

export function isLogbookName(value: string | null): value is LogbookName {
  return value !== null && Object.prototype.hasOwnProperty.call(LOGBOOKS, value)
}

/** The ISO time a window starts at, in the same format the app writes (`toISOString`). */
export function windowStart(now: Date, window: WindowName): string {
  return new Date(now.getTime() - WINDOWS[window] * 86_400_000).toISOString()
}

function text(value: unknown): string | null {
  return typeof value === 'string' ? value : null
}

function integer(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

/** Copies only the allowlisted columns, whatever else a row might carry. */
export function toErrorRow(row: Record<string, unknown>): ErrorRow {
  return {
    at: text(row.at) ?? '',
    environment: text(row.environment),
    source: text(row.source),
    event: text(row.event),
    screen: text(row.screen),
    route: text(row.route),
    status: integer(row.status),
    errorType: text(row.error_type),
    codeLocation: text(row.code_location),
    reference: text(row.reference),
    appVersion: text(row.app_version),
  }
}

export function toActivityRow(row: Record<string, unknown>): ActivityRow {
  return {
    event: text(row.event) ?? '',
    role: text(row.role),
    times: integer(row.times) ?? 0,
    lastAt: text(row.last_at),
  }
}

export function toSummary(row: Record<string, unknown> | undefined): WindowCounts {
  const value = (key: string) => integer(row?.[key]) ?? 0
  return {
    '24h': { errors: value('errors_24h'), activity: value('activity_24h') },
    '7d': { errors: value('errors_7d'), activity: value('activity_7d') },
    '30d': { errors: value('errors_30d'), activity: value('activity_30d') },
  }
}

/** Runs the three fixed queries in one round trip. */
export async function readLogbook(database: ReadOnlyDatabase, now: Date, errorWindow: WindowName): Promise<LogbookView> {
  const [summary, errors, activity] = await database.batch([
    database.prepare(SUMMARY_SQL).bind(windowStart(now, '24h'), windowStart(now, '7d'), windowStart(now, '30d')),
    database.prepare(ERRORS_SQL).bind(windowStart(now, errorWindow)),
    database.prepare(ACTIVITY_SQL).bind(windowStart(now, '30d')),
  ])
  return {
    summary: toSummary(summary.results?.[0] as Record<string, unknown> | undefined),
    errors: (errors.results ?? []).map((row) => toErrorRow(row as Record<string, unknown>)),
    activity: (activity.results ?? []).map((row) => toActivityRow(row as Record<string, unknown>)),
  }
}
