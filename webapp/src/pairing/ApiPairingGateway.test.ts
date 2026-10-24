import { afterEach, describe, expect, it, vi } from 'vitest'
import type { HouseholdPairing } from '../../shared/pairing'
import { ApiPairingGateway } from './ApiPairingGateway'

afterEach(function () { vi.unstubAllGlobals() })

const coordinatorOnly: HouseholdPairing = {
  state: 'coordinator-only',
  householdName: 'Fictional Household',
  coordinator: { role: 'coordinator', alias: 'Fictional A', joinedAt: '2026-09-01T00:00:00.000Z' },
  partner: null,
  viewer: { kind: 'participant', role: 'coordinator', alias: 'Fictional A' },
  connected: 1,
  recoveryRequiredPeriods: [],
}

describe('ApiPairingGateway', function () {
  it('sends only labels and a request id with the bearer token', async function () {
    const fetchMock = vi.fn(async () => Response.json({ pairing: coordinatorOnly }))
    vi.stubGlobal('fetch', fetchMock)
    const gateway = new ApiPairingGateway(async () => 'token_fixture', () => 'request_fixture')
    expect(await gateway.initialize('Fictional Household', 'Fictional A')).toEqual(coordinatorOnly)
    const [path, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(path).toBe('/api/household/pairing/initialize')
    expect(new Headers(init.headers).get('Authorization')).toBe('Bearer token_fixture')
    expect(JSON.parse(String(init.body))).toEqual({ householdName: 'Fictional Household', alias: 'Fictional A', requestId: 'request_fixture' })

    await gateway.joinAsPartner('Fictional B')
    const [joinPath, joinInit] = fetchMock.mock.calls[1] as unknown as [string, RequestInit]
    expect(joinPath).toBe('/api/household/pairing/join')
    expect(JSON.parse(String(joinInit.body))).toEqual({ alias: 'Fictional B', requestId: 'request_fixture' })

    await gateway.recordPartnerInvitation('orginv_fixturepartner01')
    const [invitePath, inviteInit] = fetchMock.mock.calls[2] as unknown as [string, RequestInit]
    expect(invitePath).toBe('/api/household/pairing/partner-invitation')
    expect(JSON.parse(String(inviteInit.body))).toEqual({ invitationId: 'orginv_fixturepartner01', requestId: 'request_fixture' })
    for (const call of fetchMock.mock.calls as unknown as [string, RequestInit][]) {
      expect(String(call[1]?.body ?? '')).not.toMatch(/@|householdId|orgId|role|userId|email/i)
    }
  })

  it('reads the pairing and refuses a response that would leak identifiers', async function () {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(Response.json({ pairing: coordinatorOnly }))
      .mockResolvedValueOnce(Response.json({ pairing: { ...coordinatorOnly, coordinator: { ...coordinatorOnly.coordinator, userId: 'user_leak' } } }))
      .mockResolvedValueOnce(Response.json({ error: 'This household already has two Split Ledger participants.' }, { status: 409 }))
    vi.stubGlobal('fetch', fetchMock)
    const gateway = new ApiPairingGateway(async () => 'token_fixture', () => 'request_fixture')
    expect(await gateway.getPairing()).toEqual(coordinatorOnly)
    expect(fetchMock.mock.calls[0]?.[0]).toBe('/api/household/pairing')
    await expect(gateway.getPairing()).rejects.toThrow(/not understood/)
    await expect(gateway.joinAsPartner('Fictional C')).rejects.toThrow(/already has two/)
  })
})
