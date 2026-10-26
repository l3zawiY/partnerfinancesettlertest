import { describe, expect, it } from 'vitest'
import { D1_QUERY, VISITORS_QUERY, WORKERS_QUERY, failureReason, loadDatabases, loadVisitors, loadWorkers, parseDatabaseList, parseD1Usage, parseVisitors, parseWorkers, windowVariables } from '../src/cloudflare'

const NOW = new Date('2026-10-26T12:00:00.000Z')
const TOKEN = 'fictional-token-value'

function account(data: Record<string, unknown>) {
  return { data: { viewer: { accounts: [data] } }, errors: null }
}

describe('Cloudflare analytics', () => {
  it('asks for each window with its own start time', () => {
    expect(windowVariables(NOW)).toEqual({ end: '2026-10-26T12:00:00.000Z', s24h: '2026-10-25T12:00:00.000Z', s7d: '2026-10-19T12:00:00.000Z', s30d: '2026-09-26T12:00:00.000Z' })
    expect(WORKERS_QUERY).toContain('w24h: workersInvocationsAdaptive')
    expect(WORKERS_QUERY).toContain('datetime_geq: $s30d')
    expect(D1_QUERY).toContain('rowsRead rowsWritten')
  })

  it('adds up Worker requests and errors per window and ignores other scripts', () => {
    const result = parseWorkers(account({
      w24h: [{ sum: { requests: 10, errors: 1 }, dimensions: { scriptName: 'split-ledger-production' } }, { sum: { requests: 5, errors: 0 }, dimensions: { scriptName: 'split-ledger-production' } }],
      w7d: [{ sum: { requests: 99, errors: 2 }, dimensions: { scriptName: 'split-ledger-staging' } }, { sum: { requests: 7, errors: 7 }, dimensions: { scriptName: 'someone-else' } }],
    }))
    expect(result['split-ledger-production']['24h']).toEqual({ requests: 15, errors: 1 })
    expect(result['split-ledger-staging']['7d']).toEqual({ requests: 99, errors: 2 })
    expect(result['tallywithus-ops']['30d']).toEqual({ requests: 0, errors: 0 })
    expect(result).not.toHaveProperty('tallywithus-landing')
    expect(result).not.toHaveProperty('someone-else')
  })

  it('joins D1 metadata with D1 row counts by database id', () => {
    const list = parseDatabaseList({ result: [{ name: 'split-ledger-telemetry', uuid: 'id-b', file_size: 36864 }, { name: 'split-ledger-production', uuid: 'id-a', file_size: 167936 }, { name: 42 }] })
    expect(list.map((database) => database.name)).toEqual(['split-ledger-production', 'split-ledger-telemetry'])
    const usage = parseD1Usage(account({ w24h: [{ sum: { rowsRead: 12, rowsWritten: 3 }, dimensions: { databaseId: 'id-b' } }], w30d: [{ sum: { rowsRead: 100, rowsWritten: 70 }, dimensions: { databaseId: 'id-a' } }] }), list)
    expect(usage[0]).toMatchObject({ name: 'split-ledger-production', sizeBytes: 167936, rowsRead: { '24h': 0, '7d': 0, '30d': 100 }, rowsWritten: { '30d': 70 } })
    expect(usage[1]).toMatchObject({ name: 'split-ledger-telemetry', rowsRead: { '24h': 12 } })
  })

  it('adds up public page requests, visits, and server errors from the zone records', () => {
    const zone = (groups: unknown[]) => ({ data: { viewer: { zones: [{ httpRequestsAdaptiveGroups: groups }] } }, errors: null })
    expect(parseVisitors(zone([
      { count: 30, sum: { visits: 12 }, dimensions: { edgeResponseStatus: 200 } },
      { count: 5, sum: { visits: 0 }, dimensions: { edgeResponseStatus: 404 } },
      { count: 2, sum: { visits: 1 }, dimensions: { edgeResponseStatus: 503 } },
    ]))).toEqual({ requests: 37, visits: 13, serverErrors: 2 })
    expect(parseVisitors(zone([]))).toEqual({ requests: 0, visits: 0, serverErrors: 0 })
    expect(VISITORS_QUERY).toContain('clientRequestHTTPHost_in: $hosts')
    expect(VISITORS_QUERY).toContain('requestSource: "eyeball"')
  })

  it('shows a window the free plan does not keep as not kept, and needs the last 24 hours', async () => {
    const asked: Array<{ start: string; hosts: string[]; zone: string }> = []
    const fetcher = (async (_url: string, init: RequestInit) => {
      const variables = JSON.parse(String(init.body)).variables
      asked.push(variables)
      if (variables.start === '2026-09-26T12:00:00.000Z') return Response.json({ data: null, errors: [{ message: 'cannot request data older than 7 days' }] })
      return Response.json({ data: { viewer: { zones: [{ httpRequestsAdaptiveGroups: [{ count: 9, sum: { visits: 3 }, dimensions: { edgeResponseStatus: 200 } }] }] } } })
    }) as unknown as typeof fetch
    const result = await loadVisitors({ accountId: 'acc', token: TOKEN, zoneId: 'fictional-zone', fetcher }, NOW)
    expect(result).toEqual({ ok: true, value: { '24h': { requests: 9, visits: 3, serverErrors: 0 }, '7d': { requests: 9, visits: 3, serverErrors: 0 }, '30d': null } })
    expect(asked.map((variables) => variables.start)).toEqual(['2026-10-25T12:00:00.000Z', '2026-10-19T12:00:00.000Z', '2026-09-26T12:00:00.000Z'])
    expect(asked[0]).toMatchObject({ zone: 'fictional-zone', hosts: ['tallywithus.com', 'www.tallywithus.com'] })

    const refused = (async () => Response.json({ data: null, errors: [{ message: 'not authorized' }] })) as unknown as typeof fetch
    expect(await loadVisitors({ accountId: 'acc', token: TOKEN, zoneId: 'z', fetcher: refused }, NOW)).toEqual({ ok: false, reason: 'Cloudflare answered with an error: not authorized' })
    expect(await loadVisitors({ accountId: 'acc', token: TOKEN, fetcher: refused }, NOW)).toEqual({ ok: false, reason: 'The zone id is not set.' })
  })

  it('sends the token only as a bearer header, and never repeats it in a failure', async () => {
    const seen: Array<{ url: string; init: RequestInit }> = []
    const fetcher = (async (url: string, init: RequestInit) => {
      seen.push({ url, init })
      return new Response(JSON.stringify({ data: null, errors: [{ message: `Authentication failed for ${TOKEN}`.replace(TOKEN, 'x') }] }), { status: 400 })
    }) as unknown as typeof fetch
    const result = await loadWorkers({ accountId: 'fictional-account', token: TOKEN, fetcher }, NOW)
    expect(result).toEqual({ ok: false, reason: 'Cloudflare answered 400: Authentication failed for x' })
    expect((seen[0].init.headers as Record<string, string>).authorization).toBe(`Bearer ${TOKEN}`)
    const body = JSON.parse(String(seen[0].init.body))
    expect(body.variables).toMatchObject({ account: 'fictional-account', scripts: ['split-ledger-production', 'split-ledger-staging', 'tallywithus-ops'] })
    expect(String(seen[0].init.body)).not.toContain(TOKEN)
  })

  it('reports a GraphQL error even with a 200 answer, and network failures plainly', () => {
    expect(failureReason(200, { errors: [{ message: 'unknown field' }] })).toBe('Cloudflare answered with an error: unknown field')
    expect(failureReason(503, null)).toBe('Cloudflare answered 503')
  })

  it('loads databases from metadata and analytics only', async () => {
    const urls: string[] = []
    const fetcher = (async (url: string) => {
      urls.push(url)
      if (url.includes('/d1/database')) return Response.json({ result: [{ name: 'split-ledger-telemetry', uuid: 'id-b', file_size: 1000 }], errors: [] })
      return Response.json(account({ w24h: [{ sum: { rowsRead: 1, rowsWritten: 2 }, dimensions: { databaseId: 'id-b' } }] }))
    }) as unknown as typeof fetch
    const result = await loadDatabases({ accountId: 'acc', token: TOKEN, fetcher }, NOW)
    expect(result.ok && result.value[0].rowsWritten['24h']).toBe(2)
    expect(urls.sort()).toEqual(['https://api.cloudflare.com/client/v4/accounts/acc/d1/database?per_page=100', 'https://api.cloudflare.com/client/v4/graphql'])
    expect(urls.some((url) => /query|raw|export/.test(url))).toBe(false)
  })

  it('turns an unreachable API into a short reason', async () => {
    const fetcher = (async () => { throw new TypeError('network down') }) as unknown as typeof fetch
    expect(await loadWorkers({ accountId: 'acc', token: TOKEN, fetcher }, NOW)).toEqual({ ok: false, reason: 'Could not reach Cloudflare' })
  })
})
