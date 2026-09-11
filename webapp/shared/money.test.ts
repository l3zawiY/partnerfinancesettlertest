import { describe, expect, it } from 'vitest'
import { centsToDollars, claimCents, dollarsToCents, roundHalfAwayFromZero } from './money'

describe('monetary policy', function () {
  it('rounds exact positive and negative half cents away from zero', function () {
    expect(roundHalfAwayFromZero(1.5)).toBe(2)
    expect(roundHalfAwayFromZero(-1.5)).toBe(-2)
    expect(dollarsToCents(1.005)).toBe(101)
    expect(dollarsToCents(-1.005)).toBe(-101)
  })

  it('rounds each partner claim once in cents', function () {
    expect(claimCents(179.07, 0.5)).toBe(8954)
    expect(claimCents(-1.01, 0.5)).toBe(-51)
    expect(centsToDollars(claimCents(179.07, 0.5))).toBe(89.54)
  })

  it('rejects invalid money and shares', function () {
    expect(function () { dollarsToCents(Number.NaN) }).toThrow()
    expect(function () { claimCents(10, 1.1) }).toThrow()
  })
})
