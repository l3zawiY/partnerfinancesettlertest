export interface AuthenticatedIdentityResponse {
  authenticated: true
  userId: string
}

export interface ApiErrorResponse {
  error: string
}

export function isAuthenticatedIdentityResponse(
  value: unknown,
): value is AuthenticatedIdentityResponse {
  if (!value || typeof value !== 'object') return false

  const candidate = value as Record<string, unknown>
  return candidate.authenticated === true && typeof candidate.userId === 'string'
}
