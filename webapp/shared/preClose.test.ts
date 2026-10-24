import { describe, expect, it } from 'vitest'
import { toLedgerRow } from './refunds'
import type { EngineRow } from './engine'
import { canClose, preCloseChecks } from './preClose'
import { buildSharedExport } from './formats'
import { emptyWorkflow, sameProjectionContent, type PeriodWorkflow } from './workflow'

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

  it('treats a submission relabeled with the server alias as matching the local draft', function () {
    const local = buildSharedExport({ toolVersion: 'test', period: '2026-07', owner: 'Me', txns: [row(true)] })
    const stored = { ...local, owner: 'Fictional A', generated: '2026-07-31T12:00:00.000Z' }
    const workflow = { ...emptyWorkflow('2026-07'), mine: { projection: stored, version: 1, submittedAt: '2026-07-31T12:00:00.000Z' } } as PeriodWorkflow
    const current = preCloseChecks({ ledger: [row(true)], workflow, totalsConfirmed: true, currentProjection: local }).find(function (check) { return check.id === 'current' })
    expect(current?.passed).toBe(true)
    const changed = { ...local, items: local.items.map(function (item) { return { ...item, share: 1 } }) }
    expect(sameProjectionContent(stored, changed)).toBe(false)
  })
})
