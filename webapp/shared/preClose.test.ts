import { describe, expect, it } from 'vitest'
import { toLedgerRow } from './refunds'
import type { EngineRow } from './engine'
import { canClose, preCloseChecks } from './preClose'
import { emptyWorkflow } from './workflow'

function row(decided: boolean) {
  return toLedgerRow({ id: 'fictional', date: '2026-07-01', raw: 'FICTIONAL', merchant: 'Fictional Cafe', key: 'FICTIONAL', family: null, processor: null, city: null, category: 'Restaurants', amount: 10, bank: 'generic', card: 'Fictional card', balance: null, pending: false, bnpl: false, subscription: false, refund: false, large: false, occurrences: 1, share: decided ? .5 : null, decided, auto: false, pairedWith: null } satisfies EngineRow)
}

describe('pre-close checks', function () {
  it('blocks incomplete decisions and missing submissions', function () {
    const workflow = emptyWorkflow('2026-07')
    const checks = preCloseChecks({ ledger: [row(false)], workflow, totalsConfirmed: false })
    expect(canClose(checks, workflow)).toBe(false)
    expect(checks.filter(function (check) { return !check.passed }).map(function (check) { return check.id })).toEqual(['decisions', 'mine', 'current', 'partner', 'totals'])
  })
})
