import { describe, expect, it } from 'vitest'
import { parsePaste, type EngineRow } from './engine'
import { mergeImport } from './importMerge'

const OPTS = { year: 2026, today: '2026-08-20', card: 'TD Visa', excludes: [] }

function row(overrides: Partial<EngineRow> = {}): EngineRow {
  return {
    id: 'row-1',
    date: '2026-07-15',
    raw: 'SAMPLE MERCHANT',
    merchant: 'Sample Merchant',
    key: 'SAMPLE MERCHANT',
    family: null,
    processor: null,
    city: null,
    category: 'Uncategorised',
    amount: 10,
    bank: 'generic',
    card: 'TD Visa',
    balance: null,
    pending: false,
    bnpl: false,
    subscription: false,
    refund: false,
    large: false,
    occurrences: 1,
    share: null,
    decided: false,
    auto: false,
    pairedWith: null,
    ...overrides,
  }
}

describe('mergeImport', () => {
  it('adds a fresh row not already on the ledger', () => {
    const result = mergeImport([], [row()], '2026-07')
    expect(result.added).toBe(1)
    expect(result.addedNet).toBe(10)
    expect(result.txns).toHaveLength(1)
    expect(result.existingDupes).toBe(0)
  })

  it('skips a row already on the ledger with the same id', () => {
    const existing = row()
    const result = mergeImport([existing], [row()], '2026-07')
    expect(result.added).toBe(0)
    expect(result.existingDupes).toBe(1)
    expect(result.txns).toHaveLength(1)
  })

  it('ignores a second occurrence of the same id within one paste', () => {
    const result = mergeImport([], [row(), row()], '2026-07')
    expect(result.added).toBe(1)
    expect(result.pasteDupes).toBe(1)
    expect(result.txns).toHaveLength(1)
  })

  it('upgrades a pending row to posted when the new copy is posted', () => {
    const existing = row({ pending: true, merchant: 'Sample Merchant (pending)' })
    const posted = row({ pending: false })
    const result = mergeImport([existing], [posted], '2026-07')

    expect(result.postedUpgrades).toBe(1)
    expect(result.existingDupes).toBe(0)
    expect(result.txns).toHaveLength(1)
    expect(result.txns[0]?.pending).toBe(false)
    expect(result.txns[0]?.merchant).toBe('Sample Merchant')
  })

  it('does not upgrade — and counts as a duplicate — when the existing row is already posted', () => {
    const existing = row({ pending: false })
    const result = mergeImport([existing], [row({ pending: false })], '2026-07')
    expect(result.postedUpgrades).toBe(0)
    expect(result.existingDupes).toBe(1)
  })

  it('sets rows outside the period aside instead of merging them', () => {
    const outside = row({ id: 'row-2', date: '2026-08-01' })
    const result = mergeImport([], [row(), outside], '2026-07')
    expect(result.added).toBe(1)
    expect(result.outOfPeriod).toEqual([outside])
    expect(result.txns).toHaveLength(1)
  })

  it('merges real parsed rows the same way, not just hand-built fixtures', () => {
    const parsed = parsePaste(
      [
        'Posted Transactions2026-07-21 to Today',
        'Date\tTransaction Description\tDebit\tCredit\tBalance\t',
        'Jul 24, 2026\tFARM BOY #43\t84.26\t\t4137.41\t',
      ].join('\n'),
      'td',
      OPTS,
    ).rows

    const result = mergeImport([], parsed, '2026-07')
    expect(result.added).toBe(1)
    expect(result.txns[0]?.merchant).toBe('Farm Boy')
  })
})
