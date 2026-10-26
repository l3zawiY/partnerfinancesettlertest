import { describe, expect, it } from 'vitest'
import { QUESTIONS, assessHealth, daysAgo, type HealthInput } from '../src/health'
import { errorLabel, label, ACTIVITY_LABELS } from '../src/labels'

// FICTIONAL numbers throughout.
const NOW = new Date('2026-10-27T15:00:00.000Z')
const ago = (hours: number) => new Date(NOW.getTime() - hours * 3_600_000).toISOString()
const quietWorkers = { 'split-ledger-production': { '24h': { requests: 300, errors: 0 }, '7d': { requests: 900, errors: 0 }, '30d': { requests: 2000, errors: 0 } } }
const smallDatabases = [{ name: 'split-ledger-telemetry', id: 'x', sizeBytes: 40_000, rowsRead: { '24h': 100, '7d': 500, '30d': 900 }, rowsWritten: { '24h': 2_000, '7d': 5_000, '30d': 9_000 } }]
function report(peopleVisits: number, robots: number, automated: number) {
  return { ok: true as const, value: { sampled: false, truncated: false, missing: [], report: { range: '24h' as const, people: { visits: peopleVisits, pageViews: peopleVisits }, requests: { people: peopleVisits * 4, robots, automated, agent: 0 }, totalRequests: peopleVisits * 4 + robots + automated, agentLikely: 0, serverErrors: 0, buckets: [], peopleGroups: [], automatedGroups: [] } } }
}
const someVisitors = report(3, 20, 700)

function input(errors24h: number, errors7d: number, partnerHoursAgo: number | null = 5, overrides: Partial<HealthInput> = {}): HealthInput {
  const activity = [{ event: 'statement_imported', role: 'coordinator', times: 9, lastAt: ago(1) }]
  if (partnerHoursAgo !== null) activity.push({ event: 'submitted', role: 'partner', times: 2, lastAt: ago(partnerHoursAgo) }, { event: 'statement_imported', role: 'partner', times: 3, lastAt: ago(partnerHoursAgo + 1) })
  return {
    now: NOW,
    logbookName: 'production',
    logbook: { ok: true, value: { summary: { '24h': { errors: errors24h, activity: 1 }, '7d': { errors: errors7d, activity: 5 }, '30d': { errors: errors7d, activity: 14 } }, errors: [], activity } },
    workers: { ok: true, value: quietWorkers },
    databases: { ok: true, value: smallDatabases },
    visitors: someVisitors,
    ...overrides,
  }
}

function answer(health: ReturnType<typeof assessHealth>, question: string) {
  return health.answers.find((item) => item.question === question)!
}

describe('at a glance: the four questions', () => {
  it('always answers the same four questions in order', () => {
    expect(assessHealth(input(0, 0)).answers.map((item) => item.question)).toEqual([QUESTIONS.broken, QUESTIONS.partner, QUESTIONS.plan, QUESTIONS.visitors])
  })

  it('says all good on a quiet day', () => {
    const health = assessHealth(input(0, 0))
    expect(health.headline).toBe('All good')
    expect(answer(health, QUESTIONS.broken).answer).toBe('No. No errors in the real pilot in the last 7 days.')
    expect(answer(health, QUESTIONS.partner).answer).toBe('Yes: last active today (Oct 27, 2026, 06:00 EDT), 5 actions in 30 days.')
    expect(answer(health, QUESTIONS.plan).answer).toBe('Yes. The most-used limit today is database writing, at 2%.')
    expect(answer(health, QUESTIONS.visitors).answer).toBe('Yes: about 3 visits by people in the last 24 hours. Robots and scanners sent 720 requests.')
  })

  it('is something broken: earlier errors, one error, many errors, crashes', () => {
    expect(answer(assessHealth(input(0, 2)), QUESTIONS.broken)).toMatchObject({ level: 'good', answer: expect.stringContaining('(2 earlier this week') })
    expect(answer(assessHealth(input(1, 1)), QUESTIONS.broken)).toMatchObject({ level: 'watch', answer: expect.stringMatching(/^Maybe: 1 error in the real pilot/) })
    const many = assessHealth(input(6, 6))
    expect(many.headline).toBe('Needs action')
    expect(answer(many, QUESTIONS.broken).answer).toMatch(/^Probably: 6 errors/)
    const crashing = assessHealth(input(0, 0, 5, { workers: { ok: true, value: { 'split-ledger-production': { '24h': { requests: 10, errors: 2 }, '7d': { requests: 10, errors: 2 }, '30d': { requests: 10, errors: 2 } } } } }))
    expect(answer(crashing, QUESTIONS.broken)).toMatchObject({ level: 'watch', answer: expect.stringContaining('crashed 2 times') })
  })

  it('is my partner using the app: recent, not lately, never', () => {
    expect(answer(assessHealth(input(0, 0, 30)), QUESTIONS.partner).answer).toMatch(/^Yes: last active yesterday/)
    const quiet = answer(assessHealth(input(0, 0, 24 * 12)), QUESTIONS.partner)
    expect(quiet).toMatchObject({ level: 'info', answer: expect.stringMatching(/^Not lately: last active 12 days ago/) })
    expect(answer(assessHealth(input(0, 0, null)), QUESTIONS.partner).answer).toMatch(/^Not in the last 30 days/)
    expect(assessHealth(input(0, 0, null)).headline).toBe('All good')
  })

  it('is the free plan enough: warns before limits run out', () => {
    const busy = (written: number, sizeBytes = 40_000) => assessHealth(input(0, 0, 5, { databases: { ok: true, value: [{ ...smallDatabases[0], sizeBytes, rowsWritten: { '24h': written, '7d': written, '30d': written } }] } }))
    expect(answer(busy(60_000), QUESTIONS.plan)).toMatchObject({ level: 'watch', answer: expect.stringMatching(/^Yes, for now: database writing is at 60%/) })
    expect(answer(busy(85_000), QUESTIONS.plan)).toMatchObject({ level: 'act', answer: expect.stringMatching(/^Not for long: database writing is at 85% of its free daily limit/) })
    expect(answer(busy(10, 4_500_000_000), QUESTIONS.plan).answer).toContain('database storage is at 90% of its free limit.')
    const tiny = assessHealth(input(0, 0, 5, { databases: { ok: true, value: [{ ...smallDatabases[0], rowsWritten: { '24h': 5, '7d': 5, '30d': 5 } }] }, workers: { ok: true, value: {} } }))
    expect(answer(tiny, QUESTIONS.plan).answer).toContain('under 1%')
  })

  it('is anyone visiting: none yet, or counts', () => {
    expect(answer(assessHealth(input(0, 0, 5, { visitors: report(0, 5, 100) })), QUESTIONS.visitors)).toEqual({ question: QUESTIONS.visitors, level: 'info', answer: 'No people in the last 24 hours. Robots and scanners sent 105 requests.' })
    expect(answer(assessHealth(input(0, 0, 5, { visitors: report(0, 0, 0) })), QUESTIONS.visitors).answer).toBe('No people in the last 24 hours.')
  })

  it('says it cannot tell when numbers are missing, without alarming', () => {
    const missing = assessHealth(input(0, 0, 5, { workers: { ok: false, reason: 'x' }, databases: { ok: false, reason: 'x' }, visitors: { ok: false, reason: 'x' } }))
    expect(missing.headline).toBe('All good')
    expect(answer(missing, QUESTIONS.plan).answer).toMatch(/^Can’t tell yet/)
    expect(answer(missing, QUESTIONS.visitors).answer).toMatch(/^Can’t tell yet/)
    const noLogbook = assessHealth(input(0, 0, 5, { logbook: { ok: false, reason: 'x' } }))
    expect(noLogbook.headline).toBe('Worth a look')
    expect(answer(noLogbook, QUESTIONS.partner).answer).toMatch(/^Can’t tell right now/)
  })

  it('counts days in Toronto, not UTC', () => {
    // 01:00 UTC on Oct 27 is still Oct 26 in Toronto.
    expect(daysAgo(new Date('2026-10-27T15:00:00Z'), '2026-10-27T01:00:00Z')).toBe('yesterday')
    expect(daysAgo(new Date('2026-10-27T15:00:00Z'), '2026-10-27T05:00:00Z')).toBe('today')
    expect(daysAgo(new Date('2026-11-05T15:00:00Z'), '2026-10-27T15:00:00Z')).toBe('9 days ago')
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
