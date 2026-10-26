import { describe, expect, it } from 'vitest'
import { assessHealth, type HealthInput } from '../src/health'
import { errorLabel, label, ACTIVITY_LABELS } from '../src/labels'

const quietWorkers = { 'split-ledger-production': { '24h': { requests: 300, errors: 0 }, '7d': { requests: 900, errors: 0 }, '30d': { requests: 2000, errors: 0 } } }
const smallDatabases = [{ name: 'split-ledger-telemetry', id: 'x', sizeBytes: 40_000, rowsRead: { '24h': 100, '7d': 500, '30d': 900 }, rowsWritten: { '24h': 10, '7d': 50, '30d': 90 } }]

function input(errors24h: number, errors7d: number, activity7d = 3, overrides: Partial<HealthInput> = {}): HealthInput {
  return {
    logbookName: 'production',
    logbook: { ok: true, value: { summary: { '24h': { errors: errors24h, activity: 1 }, '7d': { errors: errors7d, activity: activity7d }, '30d': { errors: errors7d, activity: activity7d } }, errors: [], activity: activity7d ? [{ event: 'submitted', role: 'partner', times: 1, lastAt: null }] : [] } },
    workers: { ok: true, value: quietWorkers },
    databases: { ok: true, value: smallDatabases },
    ...overrides,
  }
}

describe('at a glance', () => {
  it('says all good when nothing needs attention', () => {
    const health = assessHealth(input(0, 0))
    expect(health.level).toBe('good')
    expect(health.headline).toBe('All good')
    expect(health.items.map((item) => item.text)).toContain('No errors in the real pilot in the last 7 days.')
    expect(health.items.map((item) => item.text)).toContain('Well within the free plan limits.')
  })

  it('mentions earlier errors without raising the level', () => {
    const health = assessHealth(input(0, 2))
    expect(health.level).toBe('good')
    expect(health.items[0].text).toContain('(2 earlier this week)')
  })

  it('asks for a look at a recent error and for action at many', () => {
    expect(assessHealth(input(1, 1)).level).toBe('watch')
    expect(assessHealth(input(1, 1)).items[0].text).toMatch(/^1 error in the real pilot/)
    const many = assessHealth(input(6, 6))
    expect(many.level).toBe('act')
    expect(many.headline).toBe('Needs action')
  })

  it('notices a quiet week and Worker failures', () => {
    expect(assessHealth(input(0, 0, 0)).items.some((item) => item.text.startsWith('Nobody used the app'))).toBe(true)
    const failing = assessHealth(input(0, 0, 3, { workers: { ok: true, value: { 'split-ledger-production': { '24h': { requests: 10, errors: 2 }, '7d': { requests: 10, errors: 2 }, '30d': { requests: 10, errors: 2 } } } } }))
    expect(failing.level).toBe('watch')
  })

  it('warns before the free limits run out', () => {
    const busy = (written: number, sizeBytes = 40_000) => assessHealth(input(0, 0, 3, { databases: { ok: true, value: [{ ...smallDatabases[0], sizeBytes, rowsWritten: { '24h': written, '7d': written, '30d': written } }] } }))
    expect(busy(60_000).level).toBe('watch')
    expect(busy(85_000).level).toBe('act')
    expect(busy(85_000).items[0].text).toContain('85% of the free daily limit')
    expect(busy(10, 4_500_000_000).items[0].text).toContain('of the free storage limit')
    expect(busy(85_000).items.some((item) => item.text === 'Well within the free plan limits.')).toBe(false)
  })

  it('stays calm when numbers are missing', () => {
    const health = assessHealth(input(0, 0, 3, { workers: { ok: false, reason: 'x' }, databases: { ok: false, reason: 'x' } }))
    expect(health.headline).toBe('All good')
    expect(health.items.some((item) => item.level === 'info' && item.text.startsWith('Traffic and database numbers'))).toBe(true)
    expect(assessHealth(input(0, 0, 3, { logbook: { ok: false, reason: 'x' } })).level).toBe('watch')
  })
})

describe('plain-language labels', () => {
  it('names known things and passes unknown ones through', () => {
    expect(label(ACTIVITY_LABELS, 'month_closed')).toBe('Closed a month')
    expect(label(ACTIVITY_LABELS, 'brand_new_event')).toBe('brand_new_event')
    expect(label(ACTIVITY_LABELS, '__proto__')).toBe('__proto__')
    expect(errorLabel('worker', 'StorageDailyLimit')).toBe('Free daily database limit reached')
    expect(errorLabel('browser', 'TypeError')).toBe('The page hit a bug in the browser')
    expect(errorLabel('worker', null)).toBe('Unknown problem')
  })
})
