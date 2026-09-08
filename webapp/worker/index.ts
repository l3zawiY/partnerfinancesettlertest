import type { ApiErrorResponse, AuthenticatedIdentityResponse } from '../shared/api'
import {
  type ClerkEnvironment,
  type IdentityVerifier,
  verifyClerkIdentity,
} from './auth'

interface AssetBinding {
  fetch(request: Request): Promise<Response>
}

export interface WorkerEnvironment extends ClerkEnvironment {
  ASSETS: AssetBinding
}

function json(body: AuthenticatedIdentityResponse | ApiErrorResponse, status = 200) {
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

      if (url.pathname.startsWith('/api/')) {
        return json({ error: 'API route not found.' }, 404)
      }

      return environment.ASSETS.fetch(request)
    },
  }
}

export default createWorker(verifyClerkIdentity)
