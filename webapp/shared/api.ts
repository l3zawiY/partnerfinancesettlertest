export interface AuthenticatedIdentityResponse {
  authenticated: true
  userId: string
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
