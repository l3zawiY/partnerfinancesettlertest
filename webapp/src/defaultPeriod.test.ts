import { describe, expect, it } from 'vitest'
import { defaultPeriod } from './usePrivateWorkspace'

describe('default month (WEB-033)', function () {
  it('opens the month that just ended during the first half of a month, in local time', function () {
    expect(defaultPeriod(new Date(2026, 10, 2, 9, 0))).toBe('2026-10')
    expect(defaultPeriod(new Date(2026, 10, 15, 23, 59))).toBe('2026-10')
    expect(defaultPeriod(new Date(2026, 10, 16, 0, 1))).toBe('2026-11')
    expect(defaultPeriod(new Date(2026, 9, 31, 20, 0))).toBe('2026-10')
  })

  it('crosses the year boundary', function () {
    expect(defaultPeriod(new Date(2027, 0, 3, 12, 0))).toBe('2026-12')
  })
})
