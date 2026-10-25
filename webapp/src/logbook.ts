import { APP_VERSION } from '../shared/appVersion'
import { codeLocation, errorType, MAX_EVENTS_PER_REQUEST, validBrowserEvent, type BrowserEventName, type BrowserLogbookEvent, type LogbookScreen } from '../shared/logbook'

/**
 * Browser half of the pilot logbook (WEB-048). Events pass the same allowlist the Worker
 * enforces before they are queued, are sent only while signed in to a hosted household, and
 * are dropped silently otherwise. Sending never shows an error and never retries in a loop.
 */

type GetToken = () => Promise<string | null>

let getToken: GetToken | null = null
let screen: LogbookScreen = 'signed-out'
let queue: BrowserLogbookEvent[] = []
let timer: ReturnType<typeof setTimeout> | null = null
let sentThisPage = 0
const reportedErrors = new Map<string, number>()
const MAX_PER_PAGE = 300

/** Turns sending on for a signed-in household session, or off with null. */
export function configureLogbook(next: GetToken | null): void {
  getToken = next
  if (!next) { queue = []; if (timer) { clearTimeout(timer); timer = null } }
}

export function setLogbookScreen(next: LogbookScreen): void { screen = next }

export function logActivity(event: Exclude<BrowserEventName, 'browser_error'>, fields: { month?: string; count?: number; durationSeconds?: number } = {}): void {
  enqueue({ event, ...fields, appVersion: APP_VERSION })
}

/** Records the error's type and code location only; its message is never read. */
export function logBrowserError(error: unknown): void {
  const stack = error instanceof Error ? error.stack : undefined
  const location = codeLocation(stack, window.location.origin)
  const type = errorType(error)
  const key = type + '@' + (location || '?')
  const seen = reportedErrors.get(key) || 0
  if (seen >= 5) return // one broken render can fire the same error many times
  reportedErrors.set(key, seen + 1)
  enqueue({ event: 'browser_error', screen, errorType: type, ...(location ? { codeLocation: location } : {}), appVersion: APP_VERSION })
}

/** Reports uncaught errors and rejected promises from this page. Returns the remover. */
export function installCrashReporting(): () => void {
  function onError(event: ErrorEvent): void { logBrowserError(event.error) }
  function onRejection(event: PromiseRejectionEvent): void { logBrowserError(event.reason) }
  window.addEventListener('error', onError)
  window.addEventListener('unhandledrejection', onRejection)
  return function () { window.removeEventListener('error', onError); window.removeEventListener('unhandledrejection', onRejection) }
}

function enqueue(candidate: BrowserLogbookEvent): void {
  if (!getToken || sentThisPage >= MAX_PER_PAGE) return
  const event = validBrowserEvent(candidate)
  if (!event) return
  queue.push(event); sentThisPage += 1
  if (queue.length >= MAX_EVENTS_PER_REQUEST) void flush()
  else if (!timer) timer = setTimeout(function () { void flush() }, 1500)
}

export async function flush(): Promise<void> {
  if (timer) { clearTimeout(timer); timer = null }
  const events = queue.splice(0, MAX_EVENTS_PER_REQUEST)
  if (!events.length || !getToken) return
  try {
    const token = await getToken()
    if (!token) return
    // keepalive lets the last events of a closing tab still arrive.
    await fetch('/api/logbook', { method: 'POST', keepalive: true, headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' }, body: JSON.stringify({ events }) })
  } catch { /* the logbook is best effort; the person's work is unaffected */ }
  if (queue.length) void flush()
}
