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

export function isAuthenticatedIdentityResponse(
  value: unknown,
): value is AuthenticatedIdentityResponse {
  if (!value || typeof value !== 'object') return false

  const candidate = value as Record<string, unknown>
  return candidate.authenticated === true && typeof candidate.userId === 'string'
}
