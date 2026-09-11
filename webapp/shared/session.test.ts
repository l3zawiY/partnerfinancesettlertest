import { describe, expect, it } from 'vitest'
import { EXCLUDE_DEFAULT, parsePaste } from './engine'
import { toLedgerRow } from './refunds'
import {
  createSessionSnapshot,
  deleteScopedPrivateDraft,
  draftStorageKey,
  emptyAmazonContext,
  readSession,
  type PrivateSessionState,
} from './session'

function fixtureState(): PrivateSessionState {
  const txn = toLedgerRow(
    parsePaste('2026-07-16\tSAMPLE RESTAURANT\t$146.67', 'generic', {
      year: 2026,
      today: '2026-08-01',
      card: 'Sample card',
      excludes: [],
    }).rows[0]!,
  )
  return {
    period: '2026-07',
    names: ['Person A', 'Person B'],
    meIndex: 0,
    cards: ['Sample card'],
    threshold: 0,
    defaultUnknown: 1,
    rules: [],
    excludePatterns: EXCLUDE_DEFAULT,
    txns: [txn],
    ranges: [],
    blocks: [],
    amazonContext: emptyAmazonContext(),
    view: { groupBy: 'day', onlyUndecided: false, cursor: 0 },
    confirmedTotals: false,
  }
}

describe('private session persistence', () => {
  it('deletes only the exact product scope key', function () {
    const removed: string[] = []
    deleteScopedPrivateDraft({ removeItem: function (key) { removed.push(key) } }, draftStorageKey('user_a', 'org_a'))
    expect(removed).toEqual(['splitledger.webapp.v1.user_a.org_a'])
    expect(function () { deleteScopedPrivateDraft({ removeItem: function () {} }, 'unrelated') }).toThrow()
  })
  it('round-trips current state in split-ledger-session/v3', () => {
    const state = fixtureState()
    const loaded = readSession(createSessionSnapshot(state))
    expect(loaded).toEqual(state)
  })

  it('accepts older names and safely defaults fields absent from v1', () => {
    const current = createSessionSnapshot(fixtureState())
    const legacy = {
      ...current,
      format: 'split-ledger-session/v1',
      names: undefined,
      meName: 'Older Me',
      youName: 'Older Partner',
      amazonContext: undefined,
    }
    const loaded = readSession(legacy)
    expect(loaded?.names).toEqual(['Older Me', 'Older Partner'])
    expect(loaded?.amazonContext).toEqual(emptyAmazonContext())
    expect(loaded?.view).toEqual({ groupBy: 'day', onlyUndecided: false, cursor: 0 })
  })

  it('allowlists transaction fields and drops malformed rows and Amazon extras', () => {
    const snapshot = createSessionSnapshot(fixtureState()) as unknown as Record<string, unknown>
    const txns = snapshot.txns as Array<Record<string, unknown>>
    txns[0]!.privateAmazonProduct = 'must not survive'
    txns.push({ id: 'malformed' })
    const loaded = readSession(snapshot)
    expect(loaded?.txns).toHaveLength(1)
    expect(JSON.stringify(loaded?.txns)).not.toContain('privateAmazonProduct')
  })

  it('isolates autosave keys by signed-in user and active household', () => {
    expect(draftStorageKey('user_a', 'org_a')).not.toBe(draftStorageKey('user_b', 'org_a'))
    expect(draftStorageKey('user_a', 'org_a')).not.toBe(draftStorageKey('user_a', 'org_b'))
  })

  it('rejects unrelated JSON instead of treating it as a session', () => {
    expect(readSession({ format: 'split-ledger/v1' })).toBeNull()
    expect(readSession(null)).toBeNull()
  })
})
