import { describe, expect, it } from 'vitest'
import {
  isHouseholdPairing,
  isInitializeHouseholdRequest,
  isJoinHouseholdRequest,
  isSafeAlias,
  isSafeHouseholdName,
  normalizeLabel,
  ROLE_SLOT,
  sameLabel,
  type HouseholdPairing,
} from './pairing'

function paired(): HouseholdPairing {
  return {
    state: 'paired',
    householdName: 'Fictional Household',
    coordinator: { role: 'coordinator', alias: 'Fictional A', joinedAt: '2026-09-01T00:00:00.000Z' },
    partner: { role: 'partner', alias: 'Fictional B', joinedAt: '2026-09-02T00:00:00.000Z' },
    viewer: { kind: 'participant', role: 'coordinator', alias: 'Fictional A' },
    connected: 2,
    recoveryRequiredPeriods: [],
  }
}

describe('pairing vocabulary', function () {
  it('maps the coordinator to archive payer a and the partner to payer b', function () {
    expect(ROLE_SLOT).toEqual({ coordinator: 'a', partner: 'b' })
  })

  it('accepts short human labels and refuses addresses, ids, and control characters', function () {
    expect(isSafeAlias('Fictional A')).toBe(true)
    expect(isSafeAlias('  Fictional A  ')).toBe(true)
    expect(isSafeAlias('')).toBe(false)
    expect(isSafeAlias('   ')).toBe(false)
    expect(isSafeAlias('person@example.com')).toBe(false)
    expect(isSafeAlias('a'.repeat(41))).toBe(false)
    expect(isSafeAlias('Alias\u0007hidden')).toBe(false)
    expect(isSafeAlias(42)).toBe(false)
    expect(isSafeHouseholdName('Fictional Household')).toBe(true)
    expect(isSafeHouseholdName('h'.repeat(61))).toBe(false)
  })

  it('compares labels without case or surrounding whitespace', function () {
    expect(normalizeLabel('  Fictional   A ')).toBe('Fictional A')
    expect(sameLabel('fictional a', 'Fictional  A')).toBe(true)
    expect(sameLabel('Fictional A', 'Fictional B')).toBe(false)
  })

  it('validates initialize and join requests strictly', function () {
    expect(isInitializeHouseholdRequest({ householdName: 'Fictional Household', alias: 'Fictional A', requestId: 'request_init_1' })).toBe(true)
    expect(isInitializeHouseholdRequest({ householdName: 'Fictional Household', alias: 'Fictional A', requestId: 'request_init_1', role: 'coordinator' })).toBe(false)
    expect(isInitializeHouseholdRequest({ householdName: 'Fictional Household', alias: 'a@b.c', requestId: 'request_init_1' })).toBe(false)
    expect(isJoinHouseholdRequest({ alias: 'Fictional B', requestId: 'request_join_1' })).toBe(true)
    expect(isJoinHouseholdRequest({ alias: 'Fictional B', requestId: 'request_join_1', householdId: 'org_x' })).toBe(false)
    expect(isJoinHouseholdRequest({ alias: 'Fictional B', requestId: 'short' })).toBe(false)
  })

  it('accepts a consistent pairing and refuses inconsistent or leaky ones', function () {
    expect(isHouseholdPairing(paired())).toBe(true)
    expect(isHouseholdPairing({ ...paired(), connected: 1 })).toBe(false)
    expect(isHouseholdPairing({ ...paired(), state: 'coordinator-only' })).toBe(false)
    expect(isHouseholdPairing({ ...paired(), partner: { ...paired().partner, alias: 'fictional a' } })).toBe(false)
    expect(isHouseholdPairing({ ...paired(), partner: { ...paired().partner, role: 'coordinator' } })).toBe(false)
    expect(isHouseholdPairing({ ...paired(), coordinator: { ...paired().coordinator, userId: 'user_x' } })).toBe(false)
    expect(isHouseholdPairing({ ...paired(), householdId: 'org_x' })).toBe(false)
    expect(isHouseholdPairing({ ...paired(), viewer: { kind: 'member', canInitialize: false, canJoinAsPartner: false } })).toBe(true)
    expect(isHouseholdPairing({ ...paired(), viewer: { kind: 'participant', role: 'coordinator' } })).toBe(false)
    expect(isHouseholdPairing({ ...paired(), recoveryRequiredPeriods: ['2026-7'] })).toBe(false)
    expect(isHouseholdPairing({ state: 'uninitialized', householdName: null, coordinator: null, partner: null, viewer: { kind: 'member', canInitialize: true, canJoinAsPartner: false }, connected: 0, recoveryRequiredPeriods: [] })).toBe(true)
    expect(isHouseholdPairing({ state: 'uninitialized', householdName: 'Named', coordinator: null, partner: null, viewer: { kind: 'member', canInitialize: true, canJoinAsPartner: false }, connected: 0, recoveryRequiredPeriods: [] })).toBe(false)
  })
})
