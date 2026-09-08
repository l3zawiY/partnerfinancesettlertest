import {
  isAuthenticatedIdentityResponse,
  isHouseholdResponse,
  type AuthenticatedIdentityResponse,
  type HouseholdResponse,
} from '../shared/api'

type GetToken = () => Promise<string | null>

export async function getAuthenticatedIdentity(
  getToken: GetToken,
): Promise<AuthenticatedIdentityResponse> {
  const token = await getToken()
  if (!token) throw new Error('Clerk did not provide a session token.')

  const response = await fetch('/api/me', {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  })

  const body: unknown = await response.json()
  if (!response.ok) throw new Error('The backend did not accept this session.')
  if (!isAuthenticatedIdentityResponse(body)) {
    throw new Error('The backend returned an unexpected response.')
  }

  return body
}

/** Raised when the session is valid but no household is selected. */
export class NoActiveHouseholdError extends Error {
  constructor() {
    super('Choose a household to continue.')
    this.name = 'NoActiveHouseholdError'
  }
}

export async function getHousehold(getToken: GetToken): Promise<HouseholdResponse> {
  const token = await getToken()
  if (!token) throw new Error('Clerk did not provide a session token.')

  const response = await fetch('/api/household', {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  })

  // The browser never sends a household id. The server decides which household this
  // session may read, and says so with 403 when there is no answer.
  if (response.status === 403) throw new NoActiveHouseholdError()

  const body: unknown = await response.json()
  if (!response.ok) throw new Error('The backend did not accept this session.')
  if (!isHouseholdResponse(body)) {
    throw new Error('The backend returned an unexpected response.')
  }

  return body
}
