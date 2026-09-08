import {
  isAuthenticatedIdentityResponse,
  type AuthenticatedIdentityResponse,
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
