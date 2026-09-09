import { describe, expect, it } from 'vitest'
import { computeSettlement } from './settlement'

describe('computeSettlement', () => {
  it('nets two submitters using integer cents, with no floating-point drift', () => {
    const result = computeSettlement([
      { submittedBy: 'a', amountCents: 333, share: 1 / 3 },
      { submittedBy: 'b', amountCents: 100, share: 0.5 },
    ])

    // 333 * (1 - 1/3) = 222.00000000000003 as a raw float; rounding once per entry keeps
    // the total an exact integer instead of carrying that error into the net.
    expect(result.totals).toEqual([
      { submittedBy: 'a', paidCents: 333, claimCents: 222 },
      { submittedBy: 'b', paidCents: 100, claimCents: 50 },
    ])
    expect(result.netCents).toBe(172)
    // a's claim (222) exceeds b's claim (50), so on net b owes a — the second submitter
    // owes the first, mirroring index.html's "net > 0 means b owes a" convention.
    expect(result.direction).toBe('second_owes_first')
  })

  it('reports square when both claims match exactly', () => {
    const result = computeSettlement([
      { submittedBy: 'a', amountCents: 1000, share: 0.5 },
      { submittedBy: 'b', amountCents: 1000, share: 0.5 },
    ])

    expect(result.netCents).toBe(0)
    expect(result.direction).toBe('square')
  })

  it('is undetermined with zero submitters', () => {
    const result = computeSettlement([])
    expect(result.totals).toEqual([])
    expect(result.netCents).toBeNull()
    expect(result.direction).toBe('undetermined')
  })

  it('is undetermined with more than two submitters', () => {
    const result = computeSettlement([
      { submittedBy: 'a', amountCents: 100, share: 0.5 },
      { submittedBy: 'b', amountCents: 100, share: 0.5 },
      { submittedBy: 'c', amountCents: 100, share: 0.5 },
    ])

    expect(result.direction).toBe('undetermined')
    expect(result.netCents).toBeNull()
    expect(result.totals).toHaveLength(3)
  })

  it('sums multiple entries from the same submitter before computing the claim', () => {
    const result = computeSettlement([
      { submittedBy: 'a', amountCents: 100, share: 1 },
      { submittedBy: 'a', amountCents: 200, share: 0 },
      { submittedBy: 'b', amountCents: 0, share: 0.5 },
    ])

    expect(result.totals).toEqual([
      { submittedBy: 'a', paidCents: 300, claimCents: 200 },
      { submittedBy: 'b', paidCents: 0, claimCents: 0 },
    ])
    expect(result.netCents).toBe(200)
    expect(result.direction).toBe('second_owes_first')
  })
})
