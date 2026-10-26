// tallywithus-ops: the owner's private operations page (WEB-052) at ops.tallywithus.com.
// One read-only page. Every request is checked by authorize() before anything else runs.

import { authorize, type AuthSettings } from './auth'
import { loadDatabases, loadTraffic, loadWorkers, type AnalyticsSettings, type Loaded } from './cloudflare'
import { buildReport, isRangeName, type TrafficRange } from './traffic'
import { isLogbookName, isWindowName, readLogbook, type LogbookName, type LogbookView, type ReadOnlyDatabase, type WindowName } from './logbook'
import { FONT_PATH, renderMessage, renderPage, type PublicPage } from './render'

export interface Env extends AuthSettings {
  /** split-ledger-telemetry: the production logbook, the only production data this Worker may read. */
  TELEMETRY: D1Database
  /** split-ledger-telemetry-staging (fictional). Optional. */
  TELEMETRY_STAGING?: D1Database
  CF_ACCOUNT_ID?: string
  /** The tallywithus.com zone, for the public page's traffic records. Not secret. */
  ZONE_ID?: string
  /** Read-only Cloudflare token (Account Analytics Read, D1 Read), stored as a Worker secret. */
  CF_ANALYTICS_TOKEN?: string
}

export const SECURITY_HEADERS: Record<string, string> = {
  'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; font-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
  'Cache-Control': 'no-store',
  'Referrer-Policy': 'no-referrer',
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'X-Robots-Tag': 'noindex, nofollow',
  'Strict-Transport-Security': 'max-age=31536000',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
}

function html(body: string, status: number, extra: Record<string, string> = {}): Response {
  return new Response(body, { status, headers: { 'Content-Type': 'text/html; charset=utf-8', ...SECURITY_HEADERS, ...extra } })
}

const notConfigured: Loaded<never> = { ok: false, reason: 'The read-only Cloudflare token is not set up yet (see the README).' }

async function safeLogbook(database: ReadOnlyDatabase | undefined, now: Date, window: WindowName): Promise<Loaded<LogbookView>> {
  if (!database) return { ok: false, reason: 'This logbook is not connected.' }
  try {
    return { ok: true, value: await readLogbook(database, now, window) }
  } catch {
    return { ok: false, reason: 'The logbook could not be read.' }
  }
}

/** Files served besides the page; passed in by the Worker entry (src/worker.ts). */
export interface Files { font?: ArrayBuffer }

export async function handle(request: Request, env: Env, now: Date = new Date(), fetcher: typeof fetch = fetch, files: Files = {}): Promise<Response> {
  const auth = await authorize(request, env, now.getTime(), fetcher)
  if (!auth.ok) {
    const challenge: Record<string, string> = auth.challenge ? { 'WWW-Authenticate': 'Basic realm="Tally with us operations", charset="UTF-8"' } : {}
    return html(renderMessage('Not available', auth.reason), auth.status, challenge)
  }

  const url = new URL(request.url)
  if (request.method !== 'GET' && request.method !== 'HEAD') return html(renderMessage('Not allowed', 'This page is read-only.'), 405, { Allow: 'GET, HEAD' })
  if (url.pathname === FONT_PATH && files.font) {
    return new Response(request.method === 'HEAD' ? null : files.font, { headers: { 'Content-Type': 'font/woff2', 'Cache-Control': 'private, max-age=604800', 'X-Content-Type-Options': 'nosniff' } })
  }
  if (url.pathname !== '/') return html(renderMessage('Not found', 'There is only one page here.'), 404)

  const windowParam = url.searchParams.get('window')
  const logbookParam = url.searchParams.get('logbook')
  const errorWindow: WindowName = isWindowName(windowParam) ? windowParam : '7d'
  const trafficParam = url.searchParams.get('traffic')
  const trafficRange: TrafficRange = isRangeName(trafficParam) ? trafficParam : '24h'
  const stagingAvailable = Boolean(env.TELEMETRY_STAGING)
  const logbookName: LogbookName = isLogbookName(logbookParam) && (logbookParam === 'production' || stagingAvailable) ? logbookParam : 'production'
  const database = logbookName === 'staging' ? env.TELEMETRY_STAGING : env.TELEMETRY

  const settings: AnalyticsSettings | null = env.CF_ANALYTICS_TOKEN && env.CF_ACCOUNT_ID ? { accountId: env.CF_ACCOUNT_ID, token: env.CF_ANALYTICS_TOKEN, zoneId: env.ZONE_ID, fetcher } : null
  const [logbook, workers, databases, visitors] = await Promise.all([
    safeLogbook(database, now, errorWindow),
    settings ? loadWorkers(settings, now) : notConfigured,
    settings ? loadDatabases(settings, now) : notConfigured,
    settings ? loadTraffic(settings, now, trafficRange) : notConfigured,
  ])

  const publicPage: Loaded<PublicPage> = visitors.ok
    ? { ok: true, value: { report: buildReport(visitors.value.rows, trafficRange, now), sampled: visitors.value.sampled, truncated: visitors.value.truncated, missing: visitors.value.missing } }
    : visitors
  const body = renderPage({ now, logbookName, errorWindow, trafficRange, stagingAvailable, logbook, workers, databases, visitors: publicPage })
  return html(request.method === 'HEAD' ? '' : body, 200)
}
