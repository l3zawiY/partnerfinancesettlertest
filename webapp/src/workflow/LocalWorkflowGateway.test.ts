import { describe, expect, it } from 'vitest'
import { fictionalPartnerProjection } from '../testing/fictionalFixtures'
import { LocalWorkflowGateway, workflowStorageKey } from './LocalWorkflowGateway'

describe('LocalWorkflowGateway', function () {
  it('persists fictional workflow state within account and organization scope', async function () {
    const keyA = workflowStorageKey('user-a', 'org-a')
    const keyB = workflowStorageKey('user-a', 'org-b')
    const gateway = new LocalWorkflowGateway(keyA, function () { return '2026-08-01T00:00:00.000Z' })
    const projection = { ...fictionalPartnerProjection(), owner: 'Fictional Me' }
    await gateway.submit({ projection, expectedVersion: null })
    expect((await new LocalWorkflowGateway(keyA).getPeriodStatus('2026-07')).status).toBe('submitted')
    expect((await new LocalWorkflowGateway(keyB).getPeriodStatus('2026-07')).status).toBe('draft')
  })

  it('models partner-ready, stale, refresh, and a retryable close error', async function () {
    const gateway = new LocalWorkflowGateway('fictional-flow')
    const projection = { ...fictionalPartnerProjection(), owner: 'Fictional Me' }
    await gateway.submit({ projection, expectedVersion: null })
    expect((await gateway.makePartnerReady('2026-07', fictionalPartnerProjection())).status).toBe('partner-ready')
    expect((await gateway.makeStale('2026-07')).status).toBe('stale')
    expect((await gateway.recoverFromStale('2026-07')).status).toBe('partner-ready')
  })
})
