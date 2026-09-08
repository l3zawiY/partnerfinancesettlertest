import type {
  ApiErrorResponse,
  AuthenticatedIdentityResponse,
  HouseholdResponse,
} from '../shared/api'
import {
  type ClerkEnvironment,
  type IdentityVerifier,
  verifyClerkIdentity,
} from './auth'
import { ensureHousehold, listHouseholdNotes, type SqlDatabase } from './db'

interface AssetBinding {
  fetch(request: Request): Promise<Response>
}

export interface WorkerEnvironment extends ClerkEnvironment {
  ASSETS: AssetBinding
  /**
   * The D1 binding. Typed as the narrow `SqlDatabase` shape rather than Cloudflare's
   * `D1Database`, so tests can supply a plain SQLite database that behaves the same.
   */
  DB: SqlDatabase
}

type ApiBody = AuthenticatedIdentityResponse | HouseholdResponse | ApiErrorResponse

function json(body: ApiBody, status = 200) {
  return Response.json(body, {
    status,
    headers: { 'Cache-Control': 'no-store' },
  })
}

export function createWorker(verifyIdentity: IdentityVerifier) {
  return {
    async fetch(request: Request, environment: WorkerEnvironment): Promise<Response> {
      const url = new URL(request.url)

      if (url.pathname === '/api/me') {
        if (request.method !== 'GET') return json({ error: 'Method not allowed.' }, 405)

        try {
          const identity = await verifyIdentity(request, environment)
          if (!identity) return json({ error: 'Authentication required.' }, 401)

          return json({ authenticated: true, userId: identity.userId })
        } catch {
          return json({ error: 'Authentication service unavailable.' }, 503)
        }
      }

      if (url.pathname === '/api/household') {
        if (request.method !== 'GET') return json({ error: 'Method not allowed.' }, 405)

        let identity
        try {
          identity = await verifyIdentity(request, environment)
        } catch {
          return json({ error: 'Authentication service unavailable.' }, 503)
        }

        // Authentication: do we know who this is at all?
        if (!identity) return json({ error: 'Authentication required.' }, 401)

        // Authorization: knowing the person is not the same as knowing which household
        // they may read. Only the verified token can answer that, so a user with no
        // active organization is refused rather than defaulted into one.
        if (!identity.householdId) {
          return json({ error: 'No active household for this session.' }, 403)
        }

        try {
          const household = await ensureHousehold(
            environment.DB,
            identity.householdId,
            new Date().toISOString(),
          )
          const notes = await listHouseholdNotes(environment.DB, identity.householdId)

          return json({
            householdId: household.householdId,
            createdAt: household.createdAt,
            notes,
          })
        } catch {
          return json({ error: 'Household storage unavailable.' }, 503)
        }
      }

      if (url.pathname.startsWith('/api/')) {
        return json({ error: 'API route not found.' }, 404)
      }

      return environment.ASSETS.fetch(request)
    },
  }
}

export default createWorker(verifyClerkIdentity)
