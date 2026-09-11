import { describe, expect, it } from 'vitest'
import { buildMonthArchive, type SharedExport } from './formats'
import { closeTransition, emptyWorkflow, isStrictSharedProjection, localDraftStatus, submitTransition, withdrawTransition } from './workflow'

function projection(): SharedExport { return { format: 'split-ledger/v1', toolVersion: 'test', period: '2026-07', owner: 'Fictional Person A', generated: '2026-08-01T00:00:00.000Z', items: [{ date: '2026-07-10', merchant: 'Fictional Cafe', category: 'Restaurants', amount: 20, share: .5 }], totals: { sharedPaidByOwner: 20 } } }

describe('workflow state transitions', function () {
  it('distinguishes a private draft from locally ready work', function () {
    expect(localDraftStatus(false, 0)).toBe('draft')
    expect(localDraftStatus(true, 1)).toBe('draft')
    expect(localDraftStatus(true, 0)).toBe('ready')
  })

  it('submits, replaces, withdraws, and reports a stale version without overwriting', function () {
    const submitted = submitTransition(emptyWorkflow('2026-07'), projection(), null, '2026-08-01T00:00:00.000Z', false)
    expect(submitted.status).toBe('submitted')
    const changed = projection()
    changed.items[0] = { ...changed.items[0]!, amount: 25 }
    changed.totals.sharedPaidByOwner = 25
    const replaced = submitTransition(submitted, changed, submitted.version, '2026-08-02T00:00:00.000Z', true)
    expect(replaced.status).toBe('replaced')
    expect(withdrawTransition(replaced, replaced.version).status).toBe('withdrawn')
    const stale = withdrawTransition(replaced, 0)
    expect(stale.status).toBe('stale')
    expect(stale.mine).toEqual(replaced.mine)
  })

  it('rejects extra private and Amazon-only fields at the gateway contract', function () {
    const unsafe = { ...projection(), privateRows: [], rules: [], amazonDecisions: {} }
    expect(isStrictSharedProjection(unsafe)).toBe(false)
    expect(isStrictSharedProjection({ ...projection(), items: [{ ...projection().items[0], raw: 'PRIVATE' }] })).toBe(false)
  })

  it('closes once and returns the same closed record on a retry', function () {
    const own = submitTransition(emptyWorkflow('2026-07'), projection(), null, '2026-08-01T00:00:00.000Z', false)
    const both = { ...own, status: 'partner-ready' as const, partner: { projection: { ...projection(), owner: 'Fictional Person B' }, version: 2, submittedAt: '2026-08-01T01:00:00.000Z' } }
    const archive = buildMonthArchive({ toolVersion: 'test', period: '2026-07', closed: '2026-08-02T00:00:00.000Z', people: { a: 'Fictional Person A', b: 'Fictional Person B' }, mine: projection().items, theirs: projection().items })
    const closed = closeTransition(both, both.version, archive.closed)
    expect(closed.status).toBe('closed')
    expect(closed.archive).toEqual(archive)
    expect(closeTransition(closed, 999, archive.closed)).toEqual(closed)
  })

  it('keeps an explicit replacement visible even when the projection is unchanged', function () {
    const submitted = submitTransition(emptyWorkflow('2026-07'), projection(), null, '2026-08-01T00:00:00.000Z', false)
    const replaced = submitTransition(submitted, projection(), submitted.version, '2026-08-02T00:00:00.000Z', true)
    expect(replaced.status).toBe('replaced')
    expect(replaced.version).toBe(submitted.version + 1)
  })
})
