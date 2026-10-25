/**
 * Pilot logbook (WEB-048): the only shape of error and activity record the service keeps.
 *
 * Every field is either chosen by the Worker (time, role, household reference, environment)
 * or must match a fixed name or a short token pattern below. Free text never fits: there is
 * no field for a message, merchant, amount, name, email, card label, or Clerk id, and an event
 * carrying any other key is refused whole. Both the browser and the Worker use this file, so
 * a browser cannot send what the Worker would not accept.
 */

/** Events the browser may report, with the numeric fields each may carry. */
export const BROWSER_EVENTS = {
  statement_imported: ['count'],
  review_submitted: ['count', 'durationSeconds'],
  groups_applied: ['count'],
  self_test_run: ['count'],
  diagnostic_copied: [],
  session_downloaded: [],
  session_loaded: [],
  private_draft_deleted: [],
  browser_error: [],
} as const satisfies Record<string, readonly NumericField[]>

/** Events only the Worker records, from the route that succeeded or failed. */
export const SERVER_EVENTS = [
  'household_initialized', 'partner_invited', 'partner_joined',
  'submitted', 'replaced', 'withdrew', 'month_closed',
  'archives_exported', 'archives_restored', 'history_deleted', 'period_cancelled',
  'server_error',
] as const

export type BrowserEventName = keyof typeof BROWSER_EVENTS
export type ServerEventName = typeof SERVER_EVENTS[number]
export type NumericField = 'count' | 'durationSeconds'

/** Screens a browser error can name; anything else is recorded as "other". */
export const SCREENS = ['signed-out', 'pairing', 'setup', 'import', 'review', 'share', 'settle', 'files', 'other'] as const
export type LogbookScreen = typeof SCREENS[number]

/** What a browser sends: one event, no identity, no free text. */
export interface BrowserLogbookEvent {
  event: BrowserEventName
  month?: string
  screen?: LogbookScreen
  errorType?: string
  codeLocation?: string
  appVersion?: string
  count?: number
  durationSeconds?: number
}

/** A stored row, after the Worker added what only it may decide. */
export interface LogbookRow {
  at: string
  environment: string
  source: 'browser' | 'worker'
  kind: 'error' | 'activity'
  event: BrowserEventName | ServerEventName
  householdRef: string | null
  role: 'coordinator' | 'partner' | null
  month: string | null
  screen: LogbookScreen | null
  route: string | null
  status: number | null
  errorType: string | null
  codeLocation: string | null
  reference: string | null
  appVersion: string | null
  count: number | null
  durationSeconds: number | null
}

export const MAX_EVENTS_PER_REQUEST = 20
/** Per household and role per UTC day; beyond this the Worker drops further browser events. */
export const MAX_BROWSER_EVENTS_PER_DAY = 500
export const RETENTION_DAYS = 180

const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/
const ERROR_TYPE = /^[A-Za-z][A-Za-z0-9]{0,39}$/
const CODE_LOCATION = /^[A-Za-z0-9._-]{1,80}:\d{1,7}:\d{1,7}$/
const APP_VERSION = /^[A-Za-z0-9.+-]{1,40}$/
const KEYS = ['event', 'month', 'screen', 'errorType', 'codeLocation', 'appVersion', 'count', 'durationSeconds']

function wholeNumber(value: unknown, max: number): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= max
}

/** The event exactly as allowed, or null when anything about it is outside the allowlist. */
export function validBrowserEvent(value: unknown): BrowserLogbookEvent | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const input = value as Record<string, unknown>
  if (!Object.keys(input).every(function (key) { return KEYS.includes(key) })) return null
  if (typeof input.event !== 'string' || !Object.prototype.hasOwnProperty.call(BROWSER_EVENTS, input.event)) return null
  const event = input.event as BrowserEventName
  const numeric: readonly string[] = BROWSER_EVENTS[event]
  if (input.month !== undefined && (typeof input.month !== 'string' || !MONTH.test(input.month))) return null
  if (input.screen !== undefined && !SCREENS.includes(input.screen as LogbookScreen)) return null
  if (input.appVersion !== undefined && (typeof input.appVersion !== 'string' || !APP_VERSION.test(input.appVersion))) return null
  const errorFields = input.errorType !== undefined || input.codeLocation !== undefined
  if (errorFields && event !== 'browser_error') return null
  if (input.errorType !== undefined && (typeof input.errorType !== 'string' || !ERROR_TYPE.test(input.errorType))) return null
  if (input.codeLocation !== undefined && (typeof input.codeLocation !== 'string' || !CODE_LOCATION.test(input.codeLocation))) return null
  if (input.count !== undefined && (!numeric.includes('count') || !wholeNumber(input.count, 100_000))) return null
  if (input.durationSeconds !== undefined && (!numeric.includes('durationSeconds') || !wholeNumber(input.durationSeconds, 7 * 86_400))) return null
  const result: BrowserLogbookEvent = { event }
  for (const key of ['month', 'screen', 'errorType', 'codeLocation', 'appVersion', 'count', 'durationSeconds'] as const) {
    if (input[key] !== undefined) (result as unknown as Record<string, unknown>)[key] = input[key]
  }
  return result
}

/**
 * "file:line:column" of the first frame from this application's own code, or null. In the
 * browser only frames served from `origin` count; in the Worker (`origin` null) any script
 * frame does. Only the file's last path segment is kept; the error message is never read.
 */
export function codeLocation(stack: string | undefined, origin: string | null): string | null {
  if (!stack) return null
  for (const line of stack.split('\n')) {
    if (!/^\s*at\s|@/.test(line)) continue // frames only; the first line is the message
    const match = line.match(/([^\s(@]+?):(\d+):(\d+)\)?\s*$/)
    if (!match) continue
    if (origin !== null ? !match[1]!.startsWith(origin + '/') : !/\.(m?js|ts)$/.test(match[1]!)) continue
    const file = match[1]!.split('/').pop()!.split('?')[0]!
    const location = file + ':' + match[2] + ':' + match[3]
    return CODE_LOCATION.test(location) ? location : null
  }
  return null
}

/** A safe error type: the constructor name when it is a plain identifier, else "Error". */
export function errorType(error: unknown): string {
  const name = error && typeof error === 'object' && 'name' in error ? String((error as { name: unknown }).name) : ''
  return ERROR_TYPE.test(name) ? name : 'Error'
}

/** API path with the month replaced by ":month", so routes group without carrying data. */
export function routePattern(pathname: string): { route: string; month: string | null } {
  const match = pathname.match(/^(\/api\/workflows\/)(\d{4}-\d{2})(\/.*)?$/)
  if (match) return { route: match[1] + ':month' + (match[3] || ''), month: match[2]! }
  return { route: /^\/api\/[a-z/-]{0,80}$/.test(pathname) ? pathname : '/api/(other)', month: null }
}
