import { describe, expect, it } from 'vitest'
import { toLedgerRow, type LedgerRow } from './refunds'
import type { EngineRow } from './engine'
import { applyRules, decideMerchantGroup, removeRule, type MerchantRule } from './rules'

describe('removeRule', function () {
  it('removes only the selected remembered rule', function () {
    const rules: MerchantRule[] = [{ type: 'family', pattern: 'fictional-a', label: 'Fictional A', share: .5 }, { type: 'key', pattern: 'FICTIONAL B', label: 'Fictional B', share: 1 }]
    expect(removeRule(rules, rules[0]!)).toEqual([rules[1]])
    expect(removeRule(rules, { type: 'key', pattern: 'MISSING' })).toEqual(rules)
  })
})

function row(id: string, key: string, amount: number, date = '2026-07-10'): LedgerRow {
  return toLedgerRow({ id, date, raw: key, merchant: key, key, family: null, processor: null, city: null, category: 'Shopping', amount, bank: 'generic', card: 'Fictional card', balance: null, pending: false, bnpl: false, subscription: false, refund: amount < 0, large: false, occurrences: 1, share: null, decided: false, auto: false, pairedWith: null } satisfies EngineRow)
}

describe('decideMerchantGroup', function () {
  it('decides every purchase of the merchant, leaves other merchants alone, and lets a refund inherit through pairing', function () {
    const ledger = [row('a1', 'SAMPLE STORE', 20), row('a2', 'SAMPLE STORE', 35, '2026-07-12'), row('b1', 'OTHER STORE', 10), row('a3', 'SAMPLE STORE', -20, '2026-07-15')]
    const next = decideMerchantGroup(ledger, 'SAMPLE STORE', 0.5)
    expect(next.filter(function (t) { return t.key === 'SAMPLE STORE' && t.amount > 0 }).map(function (t) { return [t.share, t.decided, t.auto] })).toEqual([[0.5, true, false], [0.5, true, false]])
    expect(next.find(function (t) { return t.id === 'b1' })).toMatchObject({ share: null, decided: false })
    expect(next.find(function (t) { return t.id === 'a3' })).toMatchObject({ amount: -20, pairedWith: 'a1', share: 0.5, auto: true })
  })

  it('stays manual when rules and the threshold are re-applied', function () {
    const rules: MerchantRule[] = [{ type: 'key', pattern: 'SAMPLE STORE', label: 'Sample Store', share: 1 }]
    const next = applyRules(decideMerchantGroup([row('a1', 'SAMPLE STORE', 20)], 'SAMPLE STORE', 0.3), rules, 50, 1)
    expect(next[0]).toMatchObject({ share: 0.3, decided: true, auto: false })
  })
})
