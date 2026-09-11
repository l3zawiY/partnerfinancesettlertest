import { describe, expect, it } from 'vitest'
import { isWorkflowDeleteRequest, isWorkflowExportResponse, isWorkflowSubmissionRequest } from './api'
import { buildHouseholdArchiveBundle } from './formats'

const projection = {
  format: 'split-ledger/v1' as const,
  toolVersion: 'test',
  period: '2026-07',
  owner: 'Fictional A',
  generated: '2026-08-01T00:00:00.000Z',
  items: [{ date: '2026-07-10', merchant: 'Fictional Cafe', category: 'Dining', amount: 20, share: .5 }],
  totals: { sharedPaidByOwner: 20 },
}

describe('workflow API boundary', function () {
  it('accepts only the allowlisted shared projection', function () {
    expect(isWorkflowSubmissionRequest({ projection, expectedVersion: null, requestId: 'request_1234' })).toBe(true)
    expect(isWorkflowSubmissionRequest({ projection: { ...projection, privateRows: [] }, expectedVersion: null, requestId: 'request_1234' })).toBe(false)
    expect(isWorkflowSubmissionRequest({ projection: { ...projection, items: [{ ...projection.items[0], amazonOrderId: 'PRIVATE' }] }, expectedVersion: null, requestId: 'request_1234' })).toBe(false)
  })

  it('validates export and destructive confirmation shapes', function () {
    expect(isWorkflowExportResponse({ bundle: buildHouseholdArchiveBundle([], '2026-09-01T00:00:00.000Z'), deletionToken: 'delete_token_123', openPeriods: [] })).toBe(true)
    expect(isWorkflowDeleteRequest({ deletionToken: 'delete_token_123', confirmation: 'DELETE SHARED HISTORY', requestId: 'request_1234' })).toBe(true)
    expect(isWorkflowDeleteRequest({ deletionToken: 'delete_token_123', confirmation: 'delete', requestId: 'request_1234' })).toBe(false)
    expect(isWorkflowDeleteRequest({ deletionToken: 'delete_token_123', confirmation: 'DELETE SHARED HISTORY', requestId: 'request_1234', householdId: 'org_private' })).toBe(false)
  })
})
