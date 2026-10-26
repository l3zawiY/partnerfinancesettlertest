import { beforeEach, describe, expect, it } from 'vitest'
import { clearKeyCache } from '../src/auth'
import { handle, type Env } from '../src/index'
import { AUD, NOW, OWNER, TEAM, makeAccess } from './helpers'

const access = await makeAccess()
const TOKEN = 'fictional-analytics-token'

/** Fake logbook databases holding FICTIONAL rows; records every query asked of it. */
function fakeLogbook(label: string) {
  const asked: string[] = []
  const database = {
    prepare(sql: string) { return { bind: (...values: unknown[]) => ({ sql, values }) } },
    async batch(statements: Array<{ sql: string }>) {
      statements.forEach((statement) => asked.push(statement.sql))
      return [
        { results: [{ errors_24h: 1, activity_24h: 2, errors_7d: 2, activity_7d: 3, errors_30d: 3, activity_30d: 4 }] },
        { results: [{ at: '2026-10-26T10:00:00.000Z', source: 'worker', event: 'server_error', route: '<script>alert(1)</script>', status: 503, error_type: 'StorageUnavailable', code_location: 'worker/routes.ts', reference: `REF-${label}`, app_version: '0.0.0-fictional', household_ref: 'fictional-household-digest' }] },
        { results: [{ event: 'submitted', role: 'partner', times: 2, last_at: '2026-10-26T09:00:00.000Z' }] },
      ]
    },
  }
  return { database: database as unknown as D1Database, asked }
}

function cloudflareFetcher(seen: string[]) {
  return (async (url: string, init?: RequestInit) => {
    seen.push(url)
    const certs = await access.certsFetcher(url)
    if (certs.ok) return certs
    if (url.endsWith('/d1/database?per_page=100')) return Response.json({ result: [{ name: 'split-ledger-telemetry', uuid: 'tele', file_size: 36864 }], errors: [] })
    const query = JSON.parse(String(init?.body)).query as string
    if (query.includes('workersInvocationsAdaptive')) return Response.json({ data: { viewer: { accounts: [{ w24h: [{ sum: { requests: 1234, errors: 0 }, dimensions: { scriptName: 'split-ledger-production' } }] }] } } })
    if (query.includes('d1AnalyticsAdaptiveGroups')) return Response.json({ data: { viewer: { accounts: [{ w24h: [{ sum: { rowsRead: 77, rowsWritten: 5 }, dimensions: { databaseId: 'tele' } }] }] } } })
    return Response.json({ data: { viewer: { zones: [{ httpRequestsAdaptiveGroups: [{ count: 50, sum: { visits: 7 }, dimensions: { edgeResponseStatus: 200 } }] }] } } })
  }) as unknown as typeof fetch
}

function setup(overrides: Partial<Env> = {}) {
  const production = fakeLogbook('PROD')
  const staging = fakeLogbook('STAGING')
  const env: Env = { AUTH_MODE: 'access', ACCESS_TEAM_DOMAIN: TEAM, ACCESS_AUD: AUD, OWNER_EMAIL: OWNER, TELEMETRY: production.database, TELEMETRY_STAGING: staging.database, CF_ACCOUNT_ID: 'fictional-account', CF_ANALYTICS_TOKEN: TOKEN, ZONE_ID: 'fictional-zone', ...overrides }
  const seen: string[] = []
  return { env, production, staging, seen, fetcher: cloudflareFetcher(seen) }
}

async function ownerRequest(path = '/', init: RequestInit = {}) {
  return new Request(`https://ops.tallywithus.com${path}`, { ...init, headers: { 'Cf-Access-Jwt-Assertion': await access.sign(access.claims()) } })
}

beforeEach(() => clearKeyCache())

describe('dashboard page', () => {
  it('refuses a visitor without an Access token before reading anything', async () => {
    const { env, production, seen, fetcher } = setup()
    const response = await handle(new Request('https://ops.tallywithus.com/'), env, new Date(NOW), fetcher)
    expect(response.status).toBe(403)
    expect(production.asked).toEqual([])
    expect(seen.filter((url) => url.includes('api.cloudflare.com'))).toEqual([])
    const body = await response.text()
    expect(body).not.toContain('REF-PROD')
    expect(response.headers.get('Cache-Control')).toBe('no-store')
  })

  it('refuses someone Access let in by mistake', async () => {
    const { env, production, fetcher } = setup()
    const request = new Request('https://ops.tallywithus.com/', { headers: { 'Cf-Access-Jwt-Assertion': await access.sign(access.claims({ email: 'someone@example.com' })) } })
    expect((await handle(request, env, new Date(NOW), fetcher)).status).toBe(403)
    expect(production.asked).toEqual([])
  })

  it('shows the owner every section, escaped, with only allowlisted fields', async () => {
    const { env, fetcher, seen } = setup()
    const response = await handle(await ownerRequest(), env, new Date(NOW), fetcher)
    const body = await response.text()
    expect(response.status).toBe(200)
    expect(response.headers.get('Content-Security-Policy')).toContain("default-src 'none'")
    expect(response.headers.get('X-Robots-Tag')).toBe('noindex, nofollow')
    expect(body).toContain('REF-PROD')
    expect(body).toMatch(/Oct\.? 26, 2026, 06:00 EDT/)
    expect(body).toContain('StorageUnavailable')
    expect(body).toContain('Database was briefly unavailable')
    expect(body).toContain('Worth a look')
    expect(body).toContain('Is my partner using the app?')
    expect(body).toContain('The app (real pilot)')
    expect(body).toContain('&lt;script&gt;alert(1)&lt;/script&gt;')
    expect(body).not.toContain('<script>')
    expect(body).not.toContain('fictional-household-digest')
    expect(body).not.toContain(TOKEN)
    expect(body).not.toContain(OWNER)
    expect(body).toContain('1,234')
    expect(body).toContain('split-ledger-telemetry')
    expect(body).toContain('37 KB')
    expect(body).toContain('7 visits in the last 24 hours')
    expect(seen.filter((url) => url.includes('api.cloudflare.com'))).toHaveLength(6)
  })

  it('switches between the two logbooks and windows only through fixed names', async () => {
    const { env, production, staging, fetcher } = setup()
    const body = await (await handle(await ownerRequest('/?logbook=staging&window=30d'), env, new Date(NOW), fetcher)).text()
    expect(body).toContain('REF-STAGING')
    expect(staging.asked).toHaveLength(3)
    expect(production.asked).toHaveLength(0)

    const odd = await (await handle(await ownerRequest("/?logbook=split-ledger-production&window=1%3BDROP"), env, new Date(NOW), fetcher)).text()
    expect(odd).toContain('REF-PROD')
    expect(odd).toContain('<strong>Real pilot</strong>')
  })

  it('falls back to production when staging is not connected', async () => {
    const { env, fetcher } = setup({ TELEMETRY_STAGING: undefined })
    const body = await (await handle(await ownerRequest('/?logbook=staging'), env, new Date(NOW), fetcher)).text()
    expect(body).toContain('REF-PROD')
    expect(body).not.toContain('Test copy (fictional)')
  })

  it('still shows the logbook when the Cloudflare token is not set up', async () => {
    const { env, fetcher, seen } = setup({ CF_ANALYTICS_TOKEN: undefined })
    const body = await (await handle(await ownerRequest(), env, new Date(NOW), fetcher)).text()
    expect(body).toContain('REF-PROD')
    expect(body).toContain('The read-only Cloudflare token is not set up yet')
    expect(seen.filter((url) => url.includes('api.cloudflare.com'))).toEqual([])
  })

  it('shows a plain message when the logbook cannot be read', async () => {
    const broken = { prepare: () => ({ bind: () => ({}) }), batch: async () => { throw new Error('D1_ERROR: fictional detail') } } as unknown as D1Database
    const { env, fetcher } = setup({ TELEMETRY: broken })
    const body = await (await handle(await ownerRequest(), env, new Date(NOW), fetcher)).text()
    expect(body).toContain('The logbook could not be read.')
    expect(body).not.toContain('fictional detail')
  })

  it('has one read-only page', async () => {
    const { env, fetcher } = setup()
    expect((await handle(await ownerRequest('/other'), env, new Date(NOW), fetcher)).status).toBe(404)
    expect((await handle(await ownerRequest('/', { method: 'POST' }), env, new Date(NOW), fetcher)).status).toBe(405)
  })

  it('password fallback asks the browser for a password', async () => {
    const { env, fetcher } = setup({ AUTH_MODE: 'password', OPS_PASSWORD: 'a-very-long-fictional-password' })
    const response = await handle(new Request('https://ops.tallywithus.com/'), env, new Date(NOW), fetcher)
    expect(response.status).toBe(401)
    expect(response.headers.get('WWW-Authenticate')).toContain('Basic')
  })
})
