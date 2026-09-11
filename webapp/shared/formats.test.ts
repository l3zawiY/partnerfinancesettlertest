import { describe, expect, it } from 'vitest'
import type { LedgerRow } from './refunds'
import { buildHouseholdArchiveBundle, buildMonthArchive, buildSharedExport, isHouseholdArchiveBundle } from './formats'

function row(overrides: Partial<LedgerRow>): LedgerRow {
  return {
    id: 'sample-id',
    date: '2026-07-16',
    raw: 'PRIVATE RAW DESCRIPTION',
    merchant: 'Sample Restaurant',
    key: 'SAMPLE RESTAURANT',
    family: null,
    processor: null,
    city: null,
    category: 'Restaurants',
    amount: 146.67,
    bank: 'generic',
    card: 'PRIVATE CARD LABEL',
    balance: null,
    pending: false,
    bnpl: false,
    subscription: false,
    refund: false,
    large: false,
    occurrences: 1,
    share: 0.5,
    decided: true,
    auto: false,
    pairedWith: null,
    creditKind: null,
    partialRefund: false,
    weakPair: null,
    pairedLabel: null,
    ...overrides,
  }
}

describe('portable output formats', () => {
  it('exports only posted shared rows through the frozen allowlist', () => {
    const shared = row({ originalAmount: 3500 }) as LedgerRow & {
      amazonContext?: { products: string[] }
    }
    shared.amazonContext = { products: ['PRIVATE PRODUCT'] }
    const output = buildSharedExport({
      toolVersion: '0.0.0-experiment',
      period: '2026-07',
      owner: 'Person A',
      generated: '2026-08-01T18:22:00.000Z',
      txns: [shared, row({ id: 'private', share: 1 }), row({ id: 'pending', pending: true })],
    })
    expect(output.format).toBe('split-ledger/v1')
    expect(output.items).toEqual([
      {
        date: '2026-07-16',
        merchant: 'Sample Restaurant',
        category: 'Restaurants',
        amount: 146.67,
        share: 0.5,
        edited: true,
      },
    ])
    expect(output.totals.sharedPaidByOwner).toBe(146.67)
    expect(JSON.stringify(output)).not.toMatch(/PRIVATE|raw|card|amazon|product/i)
  })

  it('builds deterministic archive arithmetic in the frozen v1 shape', () => {
    const archive = buildMonthArchive({
      toolVersion: '0.0.0-experiment',
      period: '2026-07',
      closed: '2026-08-02T14:12:00.000Z',
      people: { a: 'Person A', b: 'Person B' },
      mine: [
        { date: '2026-07-16', merchant: 'Sample A', category: 'Restaurants', amount: 100, share: 0.5 },
      ],
      theirs: [
        { date: '2026-07-17', merchant: 'Sample B', category: 'Shopping', amount: 80, share: 0.25 },
      ],
    })
    expect(archive.format).toBe('split-ledger-archive/v1')
    expect(archive.settlement).toEqual({
      aPaidShared: 100,
      bPaidShared: 80,
      aClaim: 50,
      bClaim: 60,
      net: 10,
      direction: 'a_owes_b',
    })
    expect(archive.items.map((item) => item.owedToPayer)).toEqual([50, 60])
  })

  it('uses half-away-from-zero cents for each archive claim', function () {
    const archive = buildMonthArchive({
      toolVersion: 'test', period: '2026-07', closed: '2026-08-01T00:00:00.000Z',
      people: { a: 'Fictional A', b: 'Fictional B' },
      mine: [{ date: '2026-07-01', merchant: 'Fictional Half Cent', category: 'Test', amount: 179.07, share: 0.5 }],
      theirs: [],
    })
    expect(archive.settlement.aClaim).toBe(89.54)
    expect(archive.settlement.net).toBe(89.54)
    expect(archive.items[0]?.owedToPayer).toBe(89.54)
  })

  it('builds and validates a period-sorted closed-household recovery bundle', () => {
    const archive = buildMonthArchive({ toolVersion: 'test', period: '2026-07', closed: '2026-08-02T14:12:00.000Z', people: { a: 'Fictional A', b: 'Fictional B' }, mine: [], theirs: [] })
    const later = { ...archive, period: '2026-08' }
    const bundle = buildHouseholdArchiveBundle([later, archive], '2026-09-01T00:00:00.000Z')
    expect(bundle.archives.map((item) => item.period)).toEqual(['2026-07', '2026-08'])
    expect(isHouseholdArchiveBundle(bundle)).toBe(true)
    expect(isHouseholdArchiveBundle({ ...bundle, archives: [archive, archive] })).toBe(false)
    expect(isHouseholdArchiveBundle({ ...bundle, privateRows: [{ raw: 'PRIVATE' }] })).toBe(false)
    expect(isHouseholdArchiveBundle({ ...bundle, archives: [{ ...archive, amazonContext: {} }] })).toBe(false)
    expect(JSON.stringify(bundle)).not.toMatch(/user_|org_|card|amazon|raw/i)
  })
})
