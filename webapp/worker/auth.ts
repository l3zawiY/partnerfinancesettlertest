import { createClerkClient } from '@clerk/backend'
import { WORKER_CLERK_TELEMETRY } from '../shared/telemetry'

export interface ClerkEnvironment {
  VITE_CLERK_PUBLISHABLE_KEY: string
  CLERK_SECRET_KEY: string
}

export interface VerifiedIdentity {
  userId: string
  /**
   * The Clerk organization acting as the household, or null when the user has no active
   * organization. Read from the verified token, never from a request body or query.
   */
  householdId: string | null
  /** Verified Clerk organization role; destructive shared-history actions require admin. */
  organizationRole?: string | null
}

export type IdentityVerifier = (
  request: Request,
  environment: ClerkEnvironment,
) => Promise<VerifiedIdentity | null>

/**
 * The exact options used to construct the Worker's Clerk client. Exported so the
 * telemetry boundary can be asserted without contacting Clerk.
 */
export function clerkClientOptions(environment: ClerkEnvironment) {
  return {
    publishableKey: environment.VITE_CLERK_PUBLISHABLE_KEY,
    secretKey: environment.CLERK_SECRET_KEY,
    telemetry: WORKER_CLERK_TELEMETRY,
  }
}

export const verifyClerkIdentity: IdentityVerifier = async (request, environment) => {
  if (!environment.VITE_CLERK_PUBLISHABLE_KEY || !environment.CLERK_SECRET_KEY) {
    throw new Error('Clerk environment variables are not configured.')
  }

  const clerk = createClerkClient(clerkClientOptions(environment))
  const requestState = await clerk.authenticateRequest(request, {
    authorizedParties: [new URL(request.url).origin],
  })

  if (!requestState.isAuthenticated) return null

  const auth = requestState.toAuth()
  if (!auth.userId) return null

  return { userId: auth.userId, householdId: auth.orgId ?? null, organizationRole: auth.orgRole ?? null }
}
