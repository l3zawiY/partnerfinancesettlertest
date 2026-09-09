import {
  isAuthenticatedIdentityResponse,
  isHouseholdResponse,
  isSharedEntriesListResponse,
  type AuthenticatedIdentityResponse,
  type HouseholdResponse,
  type SharedEntriesListResponse,
  type SharedEntrySubmission,
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

export async function listSharedEntries(
  getToken: GetToken,
): Promise<SharedEntriesListResponse> {
  const token = await getToken()
  if (!token) throw new Error('Clerk did not provide a session token.')

  const response = await fetch('/api/shared-entries', {
    headers: { Authorization: `Bearer ${token}` },
  })

  if (response.status === 403) throw new NoActiveHouseholdError()

  const body: unknown = await response.json()
  if (!response.ok) throw new Error('The backend did not accept this session.')
  if (!isSharedEntriesListResponse(body)) {
    throw new Error('The backend returned an unexpected response.')
  }

  return body
}

export async function submitSharedEntry(
  getToken: GetToken,
  submission: SharedEntrySubmission,
): Promise<SharedEntriesListResponse> {
  const token = await getToken()
  if (!token) throw new Error('Clerk did not provide a session token.')

  const response = await fetch('/api/shared-entries', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(submission),
  })

  if (response.status === 403) throw new NoActiveHouseholdError()
  if (!response.ok) {
    const errorBody: unknown = await response.json().catch(() => null)
    const message =
      errorBody && typeof errorBody === 'object' && 'error' in errorBody
        ? String((errorBody as { error: unknown }).error)
        : 'The backend rejected this submission.'
    throw new Error(message)
  }

  // Re-fetches the list rather than reconstructing the settlement client-side: the server
  // is the only place that computation needs to happen, and this keeps the UI honest about
  // what is actually stored.
  return listSharedEntries(getToken)
}
