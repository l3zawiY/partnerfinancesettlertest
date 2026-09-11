export interface AuthenticatedIdentityResponse {
  authenticated: true
  userId: string
}

export interface WorkflowCapabilitiesResponse {
  canAdministerSharedHistory: boolean
}

export function isWorkflowCapabilitiesResponse(value: unknown): value is WorkflowCapabilitiesResponse {
  return !!value && typeof value === 'object' &&
    Object.keys(value as Record<string, unknown>).every(function (key) { return key === 'canAdministerSharedHistory' }) &&
    typeof (value as Record<string, unknown>).canAdministerSharedHistory === 'boolean'
}

export interface ApiErrorResponse {
  error: string
}

export interface HouseholdNote {
  id: string
  label: string
  createdAt: string
}

/**
 * Deliberately non-financial. The household id is a Clerk organization id, which the
 * server derives from the session; the browser never chooses which household it reads.
 */
export interface HouseholdResponse {
  householdId: string
  createdAt: string
  notes: HouseholdNote[]
}

export function isHouseholdResponse(value: unknown): value is HouseholdResponse {
  if (!value || typeof value !== 'object') return false

  const candidate = value as Record<string, unknown>
  if (typeof candidate.householdId !== 'string') return false
  if (typeof candidate.createdAt !== 'string') return false
  if (!Array.isArray(candidate.notes)) return false

  return candidate.notes.every(function (note: unknown) {
    if (!note || typeof note !== 'object') return false
    const entry = note as Record<string, unknown>
    return (
      typeof entry.id === 'string' &&
      typeof entry.label === 'string' &&
      typeof entry.createdAt === 'string'
    )
  })
}

/**
 * What the browser sends to create or edit one fictional shared entry. `id` is
 * client-generated and doubles as the idempotency key: submitting the same id again is a
 * safe retry, and submitting it again with different fields is an edit. `amountCents` is
 * always an integer; the Worker rejects a non-integer value rather than rounding it, so a
 * silent precision loss can never reach the database.
 */
export interface SharedEntrySubmission {
  id: string
  date: string
  merchant: string
  category: string
  amountCents: number
  share: number
}

export interface SharedEntryResponse {
  id: string
  householdId: string
  submittedBy: string
  date: string
  merchant: string
  category: string
  amountCents: number
  share: number
  version: number
  createdAt: string
  updatedAt: string
}

export interface SettlementTotalResponse {
  submittedBy: string
  paidCents: number
  claimCents: number
}

export interface SettlementResponse {
  totals: SettlementTotalResponse[]
  netCents: number | null
  direction: 'square' | 'second_owes_first' | 'first_owes_second' | 'undetermined'
}

export interface SharedEntriesListResponse {
  entries: SharedEntryResponse[]
  settlement: SettlementResponse
}

function isSharedEntryResponse(value: unknown): value is SharedEntryResponse {
  if (!value || typeof value !== 'object') return false
  const candidate = value as Record<string, unknown>

  return (
    typeof candidate.id === 'string' &&
    typeof candidate.householdId === 'string' &&
    typeof candidate.submittedBy === 'string' &&
    typeof candidate.date === 'string' &&
    typeof candidate.merchant === 'string' &&
    typeof candidate.category === 'string' &&
    typeof candidate.amountCents === 'number' &&
    typeof candidate.share === 'number' &&
    typeof candidate.version === 'number' &&
    typeof candidate.createdAt === 'string' &&
    typeof candidate.updatedAt === 'string'
  )
}

const SETTLEMENT_DIRECTIONS = new Set([
  'square',
  'second_owes_first',
  'first_owes_second',
  'undetermined',
])

function isSettlementResponse(value: unknown): value is SettlementResponse {
  if (!value || typeof value !== 'object') return false
  const candidate = value as Record<string, unknown>

  if (!Array.isArray(candidate.totals)) return false
  if (candidate.netCents !== null && typeof candidate.netCents !== 'number') return false
  if (typeof candidate.direction !== 'string') return false
  if (!SETTLEMENT_DIRECTIONS.has(candidate.direction)) return false

  return candidate.totals.every(function (total: unknown) {
    if (!total || typeof total !== 'object') return false
    const entry = total as Record<string, unknown>
    return (
      typeof entry.submittedBy === 'string' &&
      typeof entry.paidCents === 'number' &&
      typeof entry.claimCents === 'number'
    )
  })
}

export function isSharedEntriesListResponse(
  value: unknown,
): value is SharedEntriesListResponse {
  if (!value || typeof value !== 'object') return false
  const candidate = value as Record<string, unknown>

  if (!Array.isArray(candidate.entries)) return false
  if (!candidate.entries.every(isSharedEntryResponse)) return false
  return isSettlementResponse(candidate.settlement)
}

/**
 * Validates a submission the browser is about to send, mirroring the checks the Worker
 * repeats server-side. The client check exists for a fast, friendly error; the server
 * check is the one that actually matters, because a browser can always be modified.
 */
export function isValidSharedEntrySubmission(
  value: unknown,
): value is SharedEntrySubmission {
  if (!value || typeof value !== 'object') return false
  const candidate = value as Record<string, unknown>

  return (
    typeof candidate.id === 'string' &&
    candidate.id.length > 0 &&
    typeof candidate.date === 'string' &&
    typeof candidate.merchant === 'string' &&
    candidate.merchant.length > 0 &&
    typeof candidate.category === 'string' &&
    candidate.category.length > 0 &&
    typeof candidate.amountCents === 'number' &&
    Number.isInteger(candidate.amountCents) &&
    typeof candidate.share === 'number' &&
    candidate.share >= 0 &&
    candidate.share <= 1
  )
}

export function isAuthenticatedIdentityResponse(
  value: unknown,
): value is AuthenticatedIdentityResponse {
  if (!value || typeof value !== 'object') return false

  const candidate = value as Record<string, unknown>
  return candidate.authenticated === true && typeof candidate.userId === 'string'
}

export interface WorkflowSubmissionRequest {
  projection: import('./formats').SharedExport
  expectedVersion: number | null
  requestId: string
}

export interface WorkflowMutationRequest {
  expectedVersion: number
  requestId: string
}

export interface WorkflowResponse { workflow: PeriodWorkflow }

export interface WorkflowExportResponse {
  bundle: HouseholdArchiveBundle
  deletionToken: string
  openPeriods: string[]
}

export interface WorkflowRestoreRequest { bundle: HouseholdArchiveBundle; requestId: string }
export interface WorkflowRestoreResponse { restoredPeriods: number }
export interface WorkflowDeleteRequest { deletionToken: string; confirmation: string; requestId: string }
export interface WorkflowDeleteResponse { deletedPeriods: number }
export interface WorkflowCancelRequest { period: string; confirmation: string; requestId: string }
export interface WorkflowCancelResponse { cancelledPeriod: string }

function onlyKeys(value: Record<string, unknown>, keys: string[]): boolean {
  return Object.keys(value).every(function (key) { return keys.includes(key) })
}

export function isRequestId(value: unknown): value is string {
  return typeof value === 'string' && /^[A-Za-z0-9_-]{8,100}$/.test(value)
}

export function isWorkflowSubmissionRequest(value: unknown): value is WorkflowSubmissionRequest {
  if (!value || typeof value !== 'object') return false
  const request = value as Record<string, unknown>
  return onlyKeys(request, ['projection', 'expectedVersion', 'requestId']) && isRequestId(request.requestId) &&
    (request.expectedVersion === null || Number.isInteger(request.expectedVersion)) &&
    isStrictSharedProjection(request.projection)
}

export function isWorkflowMutationRequest(value: unknown): value is WorkflowMutationRequest {
  if (!value || typeof value !== 'object') return false
  const request = value as Record<string, unknown>
  return onlyKeys(request, ['expectedVersion', 'requestId']) && isRequestId(request.requestId) && Number.isInteger(request.expectedVersion) && Number(request.expectedVersion) >= 0
}

export function isWorkflowResponse(value: unknown): value is WorkflowResponse {
  return !!value && typeof value === 'object' && isPeriodWorkflow((value as Record<string, unknown>).workflow)
}

export function isWorkflowExportResponse(value: unknown): value is WorkflowExportResponse {
  if (!value || typeof value !== 'object') return false
  const response = value as Record<string, unknown>
  return isHouseholdArchiveBundle(response.bundle) && isRequestId(response.deletionToken) &&
    Array.isArray(response.openPeriods) && response.openPeriods.every(function (period) { return typeof period === 'string' && /^\d{4}-\d{2}$/.test(period) })
}

export function isWorkflowRestoreRequest(value: unknown): value is WorkflowRestoreRequest {
  if (!value || typeof value !== 'object') return false
  const request = value as Record<string, unknown>
  return onlyKeys(request, ['bundle', 'requestId']) && isRequestId(request.requestId) && isHouseholdArchiveBundle(request.bundle)
}

export function isWorkflowRestoreResponse(value: unknown): value is WorkflowRestoreResponse {
  return !!value && typeof value === 'object' && Number.isInteger((value as Record<string, unknown>).restoredPeriods)
}

export function isWorkflowDeleteRequest(value: unknown): value is WorkflowDeleteRequest {
  if (!value || typeof value !== 'object') return false
  const request = value as Record<string, unknown>
  return onlyKeys(request, ['deletionToken', 'confirmation', 'requestId']) && isRequestId(request.requestId) && isRequestId(request.deletionToken) && request.confirmation === 'DELETE SHARED HISTORY'
}

export function isWorkflowDeleteResponse(value: unknown): value is WorkflowDeleteResponse {
  return !!value && typeof value === 'object' && Number.isInteger((value as Record<string, unknown>).deletedPeriods)
}

export function isWorkflowCancelRequest(value: unknown): value is WorkflowCancelRequest {
  if (!value || typeof value !== 'object') return false
  const request = value as Record<string, unknown>
  return onlyKeys(request, ['period', 'confirmation', 'requestId']) &&
    typeof request.period === 'string' && /^\d{4}-\d{2}$/.test(request.period) &&
    request.confirmation === 'CANCEL ABANDONED PERIOD' && isRequestId(request.requestId)
}

export function isWorkflowCancelResponse(value: unknown): value is WorkflowCancelResponse {
  return !!value && typeof value === 'object' && /^\d{4}-\d{2}$/.test(String((value as Record<string, unknown>).cancelledPeriod))
}
import { isHouseholdArchiveBundle, type HouseholdArchiveBundle } from './formats'
import { isPeriodWorkflow, isStrictSharedProjection, type PeriodWorkflow } from './workflow'
