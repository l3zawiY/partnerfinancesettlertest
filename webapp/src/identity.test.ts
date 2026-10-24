import { describe, expect, it } from 'vitest'
import type { HouseholdPairing } from '../shared/pairing'
import { viewerAliases } from './identity'

const paired: HouseholdPairing = {
  state: 'paired',
  householdName: 'Fictional Household',
  coordinator: { role: 'coordinator', alias: 'Fictional A', joinedAt: '2026-09-01T00:00:00.000Z' },
  partner: { role: 'partner', alias: 'Fictional B', joinedAt: '2026-09-02T00:00:00.000Z' },
  viewer: { kind: 'participant', role: 'partner', alias: 'Fictional B' },
  connected: 2,
  recoveryRequiredPeriods: [],
}

describe('viewerAliases', function () {
  it('uses the server-bound aliases once paired, regardless of typed Setup names', function () {
    expect(viewerAliases(paired, ['Renamed Locally', 'Also Renamed'], 0)).toEqual({ me: 'Fictional B', partner: 'Fictional A' })
    expect(viewerAliases({ ...paired, viewer: { kind: 'participant', role: 'coordinator', alias: 'Fictional A' } }, ['x', 'y'], 1)).toEqual({ me: 'Fictional A', partner: 'Fictional B' })
  })

  it('falls back to the typed names before pairing exists or for the local fixture', function () {
    expect(viewerAliases(undefined, ['Me', 'Partner'], 0)).toEqual({ me: 'Me', partner: 'Partner' })
    expect(viewerAliases(undefined, ['Alex', 'Sam'], 1)).toEqual({ me: 'Sam', partner: 'Alex' })
    const memberViewing: HouseholdPairing = { ...paired, viewer: { kind: 'member', canInitialize: false, canJoinAsPartner: false } }
    expect(viewerAliases(memberViewing, ['Alex', 'Sam'], 0)).toEqual({ me: 'Alex', partner: 'Sam' })
  })
})
