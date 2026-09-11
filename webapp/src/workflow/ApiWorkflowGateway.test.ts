import { afterEach, describe, expect, it, vi } from 'vitest'
import { emptyWorkflow } from '../../shared/workflow'
import { fictionalPartnerProjection } from '../testing/fictionalFixtures'
import { ApiWorkflowGateway } from './ApiWorkflowGateway'

afterEach(function () { vi.unstubAllGlobals() })

describe('ApiWorkflowGateway', function () {
  it('sends only the strict projection with authorization and no household id', async function () {
    const fetchMock = vi.fn(async (_path: string, init?: RequestInit) => Response.json({ workflow: { ...emptyWorkflow('2026-07'), status: 'submitted', version: 1, mine: { projection: fictionalPartnerProjection(), version: 1, submittedAt: '2026-08-01T00:00:00.000Z' } } }))
    vi.stubGlobal('fetch', fetchMock)
    const gateway = new ApiWorkflowGateway(async () => 'token_fixture', () => 'request_fixture')
    await gateway.submit({ projection: fictionalPartnerProjection(), expectedVersion: null })
    const [path, init] = fetchMock.mock.calls[0]!
    expect(path).toBe('/api/workflows/2026-07/submission')
    expect(new Headers(init?.headers).get('Authorization')).toBe('Bearer token_fixture')
    const sent = JSON.parse(String(init?.body))
    expect(sent.projection).toEqual(fictionalPartnerProjection())
    expect(JSON.stringify(sent)).not.toMatch(/householdId|privateRows|raw|card|amazon|rules/i)
    for (const forbidden of ['raw', 'card', 'rules', 'privateRows', 'originalAmount', 'products', 'orderId', 'amazonContext', 'amazonMatches', 'amazonDecisions', 'householdId', 'userId']) {
      expect(JSON.stringify(sent).toLowerCase()).not.toContain(forbidden.toLowerCase())
    }
  })

  it('reads role capabilities and sends an exact abandoned-period cancellation', async function () {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(Response.json({ canAdministerSharedHistory: true }))
      .mockResolvedValueOnce(Response.json({ cancelledPeriod: '2026-07' }))
    vi.stubGlobal('fetch', fetchMock)
    const gateway = new ApiWorkflowGateway(async () => 'token_fixture', () => 'request_fixture')
    expect(await gateway.getCapabilities()).toEqual({ canAdministerSharedHistory: true })
    expect(await gateway.cancelAbandonedPeriod('2026-07', 'CANCEL ABANDONED PERIOD')).toEqual({ cancelledPeriod: '2026-07' })
    expect(JSON.parse(String(fetchMock.mock.calls[1]?.[1]?.body))).toEqual({ period: '2026-07', confirmation: 'CANCEL ABANDONED PERIOD', requestId: 'request_fixture' })
  })

  it('returns a stale workflow and converts an interrupted close into a retryable state', async function () {
    const submitted = { ...emptyWorkflow('2026-07'), status: 'submitted' as const, version: 1, mine: { projection: fictionalPartnerProjection(), version: 1, submittedAt: '2026-08-01T00:00:00.000Z' } }
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(Response.json({ workflow: submitted }))
      .mockResolvedValueOnce(Response.json({ workflow: { ...submitted, status: 'stale', staleReason: 'Changed.' } }, { status: 409 }))
      .mockResolvedValueOnce(Response.json({ error: 'Temporary storage fault.' }, { status: 503 }))
    vi.stubGlobal('fetch', fetchMock)
    const gateway = new ApiWorkflowGateway(async () => 'token_fixture', () => 'request_fixture')
    await gateway.getPeriodStatus('2026-07')
    expect((await gateway.replace({ projection: fictionalPartnerProjection(), expectedVersion: 0 })).status).toBe('stale')
    const retryable = await gateway.close('2026-07', 1)
    expect(retryable.status).toBe('retryable-error')
    expect(retryable.errorMessage).toContain('Temporary storage fault')
  })
})
