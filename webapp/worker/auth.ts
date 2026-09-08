import { createClerkClient } from '@clerk/backend'

export interface ClerkEnvironment {
  VITE_CLERK_PUBLISHABLE_KEY: string
  CLERK_SECRET_KEY: string
}

export interface VerifiedIdentity {
  userId: string
}

export type IdentityVerifier = (
  request: Request,
  environment: ClerkEnvironment,
) => Promise<VerifiedIdentity | null>

export const verifyClerkIdentity: IdentityVerifier = async (request, environment) => {
  if (!environment.VITE_CLERK_PUBLISHABLE_KEY || !environment.CLERK_SECRET_KEY) {
    throw new Error('Clerk environment variables are not configured.')
  }

  const clerk = createClerkClient({
    publishableKey: environment.VITE_CLERK_PUBLISHABLE_KEY,
    secretKey: environment.CLERK_SECRET_KEY,
  })
  const requestState = await clerk.authenticateRequest(request, {
    authorizedParties: [new URL(request.url).origin],
  })

  if (!requestState.isAuthenticated) return null

  const auth = requestState.toAuth()
  return auth.userId ? { userId: auth.userId } : null
}
