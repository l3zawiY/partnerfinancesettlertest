// Cloudflare operational counts through its analytics (GraphQL) and D1 metadata (REST) APIs.
// The token is read-only (Account Analytics Read and D1 Read). Nothing here reads database
// rows: sizes come from D1's metadata and row counts from D1's analytics.

import { WINDOWS, type WindowName } from './logbook'
import { TRAFFIC_RANGES, agentMatch, type TrafficRange, type TrafficRow } from './traffic'

// The public page (tallywithus-landing) serves static files only, so no Worker code runs and
// Cloudflare's Worker counts never include it; its numbers come from the zone's traffic records.
export const WORKERS = ['split-ledger-production', 'split-ledger-staging', 'tallywithus-ops'] as const
export const PUBLIC_HOSTS = ['tallywithus.com', 'www.tallywithus.com'] as const

const GRAPHQL_URL = 'https://api.cloudflare.com/client/v4/graphql'
const API_URL = 'https://api.cloudflare.com/client/v4'
const TIMEOUT_MS = 8_000
const WINDOW_NAMES = Object.keys(WINDOWS) as WindowName[]

/** A section's data, or a short reason it could not be loaded. Never contains the token. */
export type Loaded<T> = { ok: true; value: T } | { ok: false; reason: string }

export type PerWindow<T> = Record<WindowName, T>

export interface WorkerCounts { requests: number; errors: number }
export interface DatabaseUsage { name: string; id: string; sizeBytes: number | null; rowsRead: PerWindow<number>; rowsWritten: PerWindow<number> }
export interface PublicTraffic {
  rows: TrafficRow[]
  /** Plain names of fields the free plan withheld, so the sorting is less sure. */
  missing: string[]
  /** True when Cloudflare estimated from a sample instead of counting every request. */
  sampled: boolean
  /** True when there were more groups than one request returns, so totals are partial. */
  truncated: boolean
}

function aliasFor(window: WindowName): string {
  return `w${window}`
}

/** One aliased dataset per window, so a single request covers 24 h, 7 days, and 30 days. */
function windowedQuery(variables: string, body: (window: WindowName) => string): string {
  const parts = WINDOW_NAMES.map((window) => `${aliasFor(window)}: ${body(window)}`).join('\n')
  return `query(${variables}) { viewer { accounts(filter: { accountTag: $account }) {\n${parts}\n} } }`
}

export const WORKERS_QUERY = windowedQuery(
  '$account: String!, $end: Time!, $s24h: Time!, $s7d: Time!, $s30d: Time!, $scripts: [String!]!',
  (window) => `workersInvocationsAdaptive(limit: 100, filter: { datetime_geq: $s${window}, datetime_leq: $end, scriptName_in: $scripts }) { sum { requests errors } dimensions { scriptName } }`,
)

export const D1_QUERY = windowedQuery(
  '$account: String!, $end: Time!, $s24h: Time!, $s7d: Time!, $s30d: Time!',
  (window) => `d1AnalyticsAdaptiveGroups(limit: 100, filter: { datetime_geq: $s${window}, datetime_leq: $end }) { sum { rowsRead rowsWritten } dimensions { databaseId } }`,
)

export const TRAFFIC_LIMIT = 10_000
/** Always needed. The optional ones below can be withheld by the free plan; they are dropped
 * and reported instead of failing the section (clientASNDescription was, on 2026-10-26). */
export const REQUIRED_DIMENSIONS = ['datetimeHour', 'clientRequestPath', 'edgeResponseStatus']
export const OPTIONAL_DIMENSIONS = ['userAgentBrowser', 'userAgent', 'clientASNDescription', 'verifiedBotCategory', 'clientDeviceType', 'clientCountryName']
export const DIMENSION_NAMES: Record<string, string> = {
  userAgentBrowser: 'browser', userAgent: 'program name', clientASNDescription: 'network',
  verifiedBotCategory: 'known-robot label', clientDeviceType: 'device', clientCountryName: 'country',
}

// Every hour of the range, split by what tells people from robots. userAgent is read only to
// recognise Claude's own checks (agentMatch) and is never kept or shown. "eyeball" leaves
// out Cloudflare's own traffic.
export function trafficQuery(dimensions: string[]): string {
  return 'query($zone: String!, $start: Time!, $end: Time!, $hosts: [String!]!) { viewer { zones(filter: { zoneTag: $zone }) { ' +
    'httpRequestsAdaptiveGroups(limit: ' + TRAFFIC_LIMIT + ', orderBy: [count_DESC], filter: { datetime_geq: $start, datetime_leq: $end, clientRequestHTTPHost_in: $hosts, requestSource: "eyeball" }) ' +
    `{ count sum { visits } avg { sampleInterval } dimensions { ${[...REQUIRED_DIMENSIONS, ...dimensions].join(' ')} } } } } }`
}
export const TRAFFIC_QUERY = trafficQuery(OPTIONAL_DIMENSIONS)

/** The field Cloudflare refused, from "does not have access to the field 'x'". */
export function deniedField(reason: string): string | null {
  const match = reason.match(/does not have access to the field '([A-Za-z]+)'/)
  if (!match) return null
  return OPTIONAL_DIMENSIONS.find((name) => name.toLowerCase() === match[1].toLowerCase()) ?? null
}

export function windowVariables(now: Date): Record<string, string> {
  const variables: Record<string, string> = { end: now.toISOString() }
  for (const window of WINDOW_NAMES) variables[`s${window}`] = new Date(now.getTime() - WINDOWS[window] * 86_400_000).toISOString()
  return variables
}

function number(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0
}

type Groups = Array<{ sum?: Record<string, unknown>; count?: unknown; dimensions?: Record<string, unknown> }>

function accountData(json: unknown): Record<string, Groups> {
  const accounts = (json as { data?: { viewer?: { accounts?: unknown[] } } })?.data?.viewer?.accounts
  return (Array.isArray(accounts) && accounts[0] ? accounts[0] : {}) as Record<string, Groups>
}

export function parseWorkers(json: unknown): Record<string, PerWindow<WorkerCounts>> {
  const data = accountData(json)
  const result: Record<string, PerWindow<WorkerCounts>> = {}
  for (const script of WORKERS) {
    result[script] = { '24h': { requests: 0, errors: 0 }, '7d': { requests: 0, errors: 0 }, '30d': { requests: 0, errors: 0 } }
  }
  for (const window of WINDOW_NAMES) {
    for (const group of data[aliasFor(window)] ?? []) {
      const script = group.dimensions?.scriptName
      if (typeof script !== 'string' || !(script in result)) continue
      result[script][window].requests += number(group.sum?.requests)
      result[script][window].errors += number(group.sum?.errors)
    }
  }
  return result
}

export function parseD1Usage(json: unknown, databases: Array<{ name: string; id: string; sizeBytes: number | null }>): DatabaseUsage[] {
  const data = accountData(json)
  return databases.map((database) => {
    const rowsRead = { '24h': 0, '7d': 0, '30d': 0 }
    const rowsWritten = { '24h': 0, '7d': 0, '30d': 0 }
    for (const window of WINDOW_NAMES) {
      for (const group of data[aliasFor(window)] ?? []) {
        if (group.dimensions?.databaseId !== database.id) continue
        rowsRead[window] += number(group.sum?.rowsRead)
        rowsWritten[window] += number(group.sum?.rowsWritten)
      }
    }
    return { ...database, rowsRead, rowsWritten }
  })
}

function zoneGroups(json: unknown): Groups {
  const zones = (json as { data?: { viewer?: { zones?: unknown[] } } })?.data?.viewer?.zones
  return ((Array.isArray(zones) && zones[0] ? (zones[0] as Record<string, unknown>).httpRequestsAdaptiveGroups : []) ?? []) as Groups
}

function short(value: unknown, fallback: string): string {
  return typeof value === 'string' && value.trim() ? value.trim().slice(0, 80) : fallback
}

export function parseTraffic(json: unknown): PublicTraffic {
  const groups = zoneGroups(json)
  const rows: TrafficRow[] = groups.map((group) => {
    const dimensions = group.dimensions ?? {}
    return {
      hour: short(dimensions.datetimeHour, ''),
      path: short(dimensions.clientRequestPath, '/'),
      status: typeof dimensions.edgeResponseStatus === 'number' ? dimensions.edgeResponseStatus : null,
      browser: short(dimensions.userAgentBrowser, 'unknown'),
      network: short(dimensions.clientASNDescription, 'unknown'),
      bot: short(dimensions.verifiedBotCategory, ''),
      device: short(dimensions.clientDeviceType, 'unknown'),
      country: short(dimensions.clientCountryName, 'unknown'),
      agent: agentMatch(typeof dimensions.userAgent === 'string' ? dimensions.userAgent : ''),
      requests: number(group.count),
      visits: number(group.sum?.visits),
    }
  })
  const sampled = groups.some((group) => number((group as { avg?: Record<string, unknown> }).avg?.sampleInterval) > 1)
  return { rows, missing: [], sampled, truncated: groups.length >= TRAFFIC_LIMIT }
}

/** Name, id, and stored size of each D1 database, from D1's metadata (never its rows). */
export function parseDatabaseList(json: unknown): Array<{ name: string; id: string; sizeBytes: number | null }> {
  const list = (json as { result?: unknown[] })?.result
  if (!Array.isArray(list)) return []
  return list
    .map((item) => item as { name?: unknown; uuid?: unknown; file_size?: unknown })
    .filter((item) => typeof item.name === 'string' && typeof item.uuid === 'string')
    .map((item) => ({ name: item.name as string, id: item.uuid as string, sizeBytes: typeof item.file_size === 'number' ? item.file_size : null }))
    .sort((a, b) => a.name.localeCompare(b.name))
}

/** A short, token-free reason from a failed API answer. */
export function failureReason(status: number, json: unknown): string {
  const errors = (json as { errors?: Array<{ message?: unknown }> | null })?.errors
  const message = Array.isArray(errors) && typeof errors[0]?.message === 'string' ? errors[0].message : ''
  const prefix = status >= 200 && status < 300 ? 'Cloudflare answered with an error' : `Cloudflare answered ${status}`
  return message ? `${prefix}: ${message.slice(0, 160)}` : prefix
}

export interface AnalyticsSettings { accountId: string; token: string; zoneId?: string; fetcher?: typeof fetch }

async function call(settings: AnalyticsSettings, url: string, init: RequestInit): Promise<Loaded<unknown>> {
  const fetcher = settings.fetcher ?? fetch
  try {
    const response = await fetcher(url, {
      ...init,
      headers: { ...(init.headers as Record<string, string>), authorization: `Bearer ${settings.token}` },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })
    const json = await response.json().catch(() => null)
    const errors = (json as { errors?: unknown[] | null })?.errors
    if (!response.ok || (Array.isArray(errors) && errors.length > 0)) return { ok: false, reason: failureReason(response.status, json) }
    return { ok: true, value: json }
  } catch (error) {
    const timedOut = error instanceof Error && (error.name === 'TimeoutError' || error.name === 'AbortError')
    return { ok: false, reason: timedOut ? 'Cloudflare did not answer in time' : 'Could not reach Cloudflare' }
  }
}

function graphql(settings: AnalyticsSettings, query: string, variables: Record<string, unknown>): Promise<Loaded<unknown>> {
  return call(settings, GRAPHQL_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ query, variables: { account: settings.accountId, zone: settings.zoneId, ...variables } }),
  })
}

export async function loadWorkers(settings: AnalyticsSettings, now: Date): Promise<Loaded<Record<string, PerWindow<WorkerCounts>>>> {
  const answer = await graphql(settings, WORKERS_QUERY, { ...windowVariables(now), scripts: [...WORKERS] })
  return answer.ok ? { ok: true, value: parseWorkers(answer.value) } : answer
}

export async function loadDatabases(settings: AnalyticsSettings, now: Date): Promise<Loaded<DatabaseUsage[]>> {
  const [list, usage] = await Promise.all([
    call(settings, `${API_URL}/accounts/${encodeURIComponent(settings.accountId)}/d1/database?per_page=100`, { method: 'GET' }),
    graphql(settings, D1_QUERY, windowVariables(now)),
  ])
  if (!list.ok) return list
  if (!usage.ok) return usage
  return { ok: true, value: parseD1Usage(usage.value, parseDatabaseList(list.value)) }
}

/** Public page traffic for the chosen range, in one request so every number agrees. A field
 * the plan withholds is dropped and the request retried. */
export async function loadTraffic(settings: AnalyticsSettings, now: Date, range: TrafficRange): Promise<Loaded<PublicTraffic>> {
  if (!settings.zoneId) return { ok: false, reason: 'The zone id is not set.' }
  let dimensions = [...OPTIONAL_DIMENSIONS]
  const missing: string[] = []
  for (let attempt = 0; attempt <= OPTIONAL_DIMENSIONS.length; attempt += 1) {
    const answer = await graphql(settings, trafficQuery(dimensions), {
      start: new Date(now.getTime() - TRAFFIC_RANGES[range] * 86_400_000).toISOString(),
      end: now.toISOString(),
      hosts: [...PUBLIC_HOSTS],
    })
    if (answer.ok) return { ok: true, value: { ...parseTraffic(answer.value), missing } }
    const denied = deniedField(answer.reason)
    if (!denied || !dimensions.includes(denied)) return answer
    dimensions = dimensions.filter((name) => name !== denied)
    missing.push(DIMENSION_NAMES[denied])
  }
  return { ok: false, reason: 'Cloudflare refused too many fields.' }
}
