import { describe, expect, it } from 'vitest'
import { ACTIVITY_SQL, ERRORS_SQL, SUMMARY_SQL, isLogbookName, isWindowName, readLogbook, windowStart, type ReadOnlyDatabase } from '../src/logbook'

/** A fake D1 that records each statement and answers with prepared rows. */
function fakeDatabase(answers: unknown[][]) {
  const calls: Array<{ sql: string; values: unknown[] }> = []
  const database: ReadOnlyDatabase = {
    prepare(sql: string) {
      return { bind(...values: unknown[]) { const call = { sql, values }; calls.push(call); return call } }
    },
    async batch(statements: unknown[]) {
      return statements.map((_, index) => ({ results: answers[index] }))
    },
  }
  return { database, calls }
}

const NOW = new Date('2026-10-26T12:00:00.000Z')

describe('logbook queries', () => {
  it('are fixed read-only SELECTs that name their columns and never the household', () => {
    for (const sql of [SUMMARY_SQL, ERRORS_SQL, ACTIVITY_SQL]) {
      expect(sql.startsWith('SELECT ')).toBe(true)
      expect(sql).not.toMatch(/\*(?!\))/)
      expect(sql).not.toMatch(/household_ref|INSERT|UPDATE|DELETE|DROP|ALTER|ATTACH|PRAGMA|;/i)
      expect(sql).toMatch(/FROM logbook /)
    }
  })

  it('accepts only the known window and logbook names', () => {
    expect(isWindowName('24h')).toBe(true)
    expect(isWindowName('30d')).toBe(true)
    for (const value of ['1y', '', null, '__proto__', 'toString', "7d' OR 1=1"]) expect(isWindowName(value)).toBe(false)
    expect(isLogbookName('staging')).toBe(true)
    for (const value of ['split-ledger-production', 'constructor', null]) expect(isLogbookName(value)).toBe(false)
  })

  it('starts windows in the same ISO format the app writes', () => {
    expect(windowStart(NOW, '24h')).toBe('2026-10-25T12:00:00.000Z')
    expect(windowStart(NOW, '7d')).toBe('2026-10-19T12:00:00.000Z')
    expect(windowStart(NOW, '30d')).toBe('2026-09-26T12:00:00.000Z')
  })

  it('binds the window starts and copies only allowlisted fields', async () => {
    const { database, calls } = fakeDatabase([
      [{ errors_24h: 1, activity_24h: 2, errors_7d: 3, activity_7d: 4, errors_30d: 5, activity_30d: 6 }],
      [{ at: '2026-10-26T10:00:00.000Z', environment: 'production', source: 'worker', event: 'server_error', route: '/api/me', status: 503, error_type: 'AuthenticationUnavailable', code_location: 'worker/auth.ts', reference: 'REF-FICT01', app_version: '1.0', household_ref: 'fictional-secret-ref', month: '2026-10' }],
      [{ event: 'submitted', role: 'partner', times: 3, last_at: '2026-10-26T09:00:00.000Z', household_ref: 'fictional-secret-ref' }],
    ])
    const view = await readLogbook(database, NOW, '24h')

    expect(calls.map((call) => call.sql)).toEqual([SUMMARY_SQL, ERRORS_SQL, ACTIVITY_SQL])
    expect(calls[0].values).toEqual(['2026-10-25T12:00:00.000Z', '2026-10-19T12:00:00.000Z', '2026-09-26T12:00:00.000Z'])
    expect(calls[1].values).toEqual(['2026-10-25T12:00:00.000Z'])
    expect(calls[2].values).toEqual(['2026-09-26T12:00:00.000Z'])

    expect(view.summary).toEqual({ '24h': { errors: 1, activity: 2 }, '7d': { errors: 3, activity: 4 }, '30d': { errors: 5, activity: 6 } })
    expect(view.errors[0]).toMatchObject({ reference: 'REF-FICT01', status: 503, errorType: 'AuthenticationUnavailable' })
    expect(view.activity[0]).toEqual({ event: 'submitted', role: 'partner', times: 3, lastAt: '2026-10-26T09:00:00.000Z' })
    expect(JSON.stringify(view)).not.toContain('fictional-secret-ref')
    expect(JSON.stringify(view)).not.toContain('2026-10"')
  })

  it('treats an empty logbook as zero', async () => {
    const { database } = fakeDatabase([[{ errors_24h: null }], [], []])
    const view = await readLogbook(database, NOW, '7d')
    expect(view.summary['30d']).toEqual({ errors: 0, activity: 0 })
    expect(view.errors).toEqual([])
  })
})
