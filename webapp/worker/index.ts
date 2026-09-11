import type {
  ApiErrorResponse,
  AuthenticatedIdentityResponse,
  HouseholdResponse,
  WorkflowDeleteResponse,
  WorkflowCancelResponse,
  WorkflowCapabilitiesResponse,
  WorkflowExportResponse,
  WorkflowRestoreResponse,
  WorkflowResponse,
} from '../shared/api'
import { isWorkflowCancelRequest, isWorkflowDeleteRequest, isWorkflowMutationRequest, isWorkflowRestoreRequest, isWorkflowSubmissionRequest } from '../shared/api'
import {
  type ClerkEnvironment,
  type IdentityVerifier,
  verifyClerkIdentity,
} from './auth'
import {
  ensureHousehold,
  listHouseholdNotes,
  type SqlDatabase,
} from './db'
import {
  closeWorkflow,
  cancelAbandonedWorkflow,
  deleteWorkflowHistory,
  exportClosedWorkflows,
  readWorkflow,
  restoreWorkflowHistory,
  submitWorkflow,
  withdrawWorkflow,
  WorkflowConflictError,
  WorkflowForbiddenError,
} from './workflow'

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

type ApiBody =
  | AuthenticatedIdentityResponse
  | HouseholdResponse
  | WorkflowResponse
  | WorkflowExportResponse
  | WorkflowRestoreResponse
  | WorkflowDeleteResponse
  | WorkflowCancelResponse
  | WorkflowCapabilitiesResponse
  | ApiErrorResponse

function json(body: ApiBody, status = 200) {
  return Response.json(body, {
    status,
    headers: {
      'Cache-Control': 'no-store',
      'Content-Security-Policy': "default-src 'none'; frame-ancestors 'none'",
      'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
      'Referrer-Policy': 'no-referrer',
      'X-Content-Type-Options': 'nosniff',
    },
  })
}

async function readJson(request: Request): Promise<unknown> {
  const announced = Number(request.headers.get('Content-Length') || 0)
  if (announced > 2_000_000) throw new Error('Request body is too large.')
  const text = await request.text()
  if (text.length > 2_000_000) throw new Error('Request body is too large.')
  return JSON.parse(text)
}

export function createWorker(
  verifyIdentity: IdentityVerifier,
  now = function () { return new Date().toISOString() },
  randomId: () => string = function () { return crypto.randomUUID() },
) {
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

      if (url.pathname === '/api/shared-entries') {
        return json({ error: 'The Batch 3 shared-entry diagnostic has been retired. Use the period workflow API.' }, 410)
      }

      const workflowPeriod = url.pathname.match(/^\/api\/workflows\/(\d{4}-\d{2})$/)
      const workflowAction = url.pathname.match(/^\/api\/workflows\/(\d{4}-\d{2})\/(submission|close)$/)
      const workflowAdministration = ['/api/workflows/capabilities', '/api/workflows/export', '/api/workflows/restore', '/api/workflows/cancel-abandoned', '/api/workflows'].includes(url.pathname)
      if (workflowPeriod || workflowAction || workflowAdministration) {
        let identity
        try { identity = await verifyIdentity(request, environment) }
        catch { return json({ error: 'Authentication service unavailable.' }, 503) }
        if (!identity) return json({ error: 'Authentication required.' }, 401)
        if (!identity.householdId) return json({ error: 'No active household for this session.' }, 403)

        try {
          await ensureHousehold(environment.DB, identity.householdId, now())
          if (workflowPeriod) {
            if (request.method !== 'GET') return json({ error: 'Method not allowed.' }, 405)
            return json({ workflow: await readWorkflow(environment.DB, identity.householdId, identity.userId, workflowPeriod[1]!) })
          }

          if (workflowAction) {
            const period = workflowAction[1]!
            const action = workflowAction[2]!
            let body: unknown
            try { body = await readJson(request) }
            catch (error) { return json({ error: error instanceof Error ? error.message : 'Request body must be JSON.' }, 400) }
            if (action === 'submission' && request.method === 'POST') {
              if (!isWorkflowSubmissionRequest(body) || body.projection.period !== period || body.expectedVersion !== null) return json({ error: 'Workflow submission is invalid.' }, 400)
              return json({ workflow: await submitWorkflow({ database: environment.DB, householdId: identity.householdId, userId: identity.userId, projection: body.projection, expectedVersion: body.expectedVersion, requestId: body.requestId, replace: false, now: now(), eventId: randomId() }) })
            }
            if (action === 'submission' && request.method === 'PUT') {
              if (!isWorkflowSubmissionRequest(body) || body.projection.period !== period || body.expectedVersion === null) return json({ error: 'Workflow replacement is invalid.' }, 400)
              return json({ workflow: await submitWorkflow({ database: environment.DB, householdId: identity.householdId, userId: identity.userId, projection: body.projection, expectedVersion: body.expectedVersion, requestId: body.requestId, replace: true, now: now(), eventId: randomId() }) })
            }
            if (action === 'submission' && request.method === 'DELETE') {
              if (!isWorkflowMutationRequest(body)) return json({ error: 'Workflow withdrawal is invalid.' }, 400)
              return json({ workflow: await withdrawWorkflow({ database: environment.DB, householdId: identity.householdId, userId: identity.userId, period, expectedVersion: body.expectedVersion, requestId: body.requestId, now: now(), eventId: randomId() }) })
            }
            if (action === 'close' && request.method === 'POST') {
              if (!isWorkflowMutationRequest(body)) return json({ error: 'Workflow close is invalid.' }, 400)
              return json({ workflow: await closeWorkflow({ database: environment.DB, householdId: identity.householdId, userId: identity.userId, period, expectedVersion: body.expectedVersion, requestId: body.requestId, now: now(), eventId: randomId() }) })
            }
            return json({ error: 'Method not allowed.' }, 405)
          }

          if (url.pathname === '/api/workflows/export') {
            if (request.method !== 'POST') return json({ error: 'Method not allowed.' }, 405)
            return json(await exportClosedWorkflows(environment.DB, identity.householdId, now(), 'delete_' + randomId()))
          }
          if (url.pathname === '/api/workflows/capabilities') {
            if (request.method !== 'GET') return json({ error: 'Method not allowed.' }, 405)
            return json({ canAdministerSharedHistory: identity.organizationRole === 'org:admin' })
          }
          if (url.pathname === '/api/workflows/restore') {
            if (request.method !== 'POST') return json({ error: 'Method not allowed.' }, 405)
            if (identity.organizationRole !== 'org:admin') return json({ error: 'Household administrator access required.' }, 403)
            let body: unknown
            try { body = await readJson(request) } catch { return json({ error: 'Request body must be valid JSON.' }, 400) }
            if (!isWorkflowRestoreRequest(body)) return json({ error: 'Shared archive bundle is invalid.' }, 400)
            const restoredPeriods = await restoreWorkflowHistory(environment.DB, identity.householdId, identity.userId, body.bundle, now(), randomId)
            return json({ restoredPeriods })
          }
          if (url.pathname === '/api/workflows') {
            if (request.method !== 'DELETE') return json({ error: 'Method not allowed.' }, 405)
            if (identity.organizationRole !== 'org:admin') return json({ error: 'Household administrator access required.' }, 403)
            let body: unknown
            try { body = await readJson(request) } catch { return json({ error: 'Request body must be valid JSON.' }, 400) }
            if (!isWorkflowDeleteRequest(body)) return json({ error: 'Shared-history deletion confirmation is invalid.' }, 400)
            return json({ deletedPeriods: await deleteWorkflowHistory(environment.DB, identity.householdId, body.deletionToken, now()) })
          }
          if (url.pathname === '/api/workflows/cancel-abandoned') {
            if (request.method !== 'POST') return json({ error: 'Method not allowed.' }, 405)
            if (identity.organizationRole !== 'org:admin') return json({ error: 'Household administrator access required.' }, 403)
            let body: unknown
            try { body = await readJson(request) } catch { return json({ error: 'Request body must be valid JSON.' }, 400) }
            if (!isWorkflowCancelRequest(body)) return json({ error: 'Abandoned-period cancellation confirmation is invalid.' }, 400)
            await cancelAbandonedWorkflow(environment.DB, identity.householdId, body.period)
            return json({ cancelledPeriod: body.period })
          }
        } catch (error) {
          if (error instanceof WorkflowConflictError) {
            if (error.workflow) return json({ workflow: { ...error.workflow, status: 'stale', staleReason: error.message } }, 409)
            return json({ error: error.message }, 409)
          }
          if (error instanceof WorkflowForbiddenError) return json({ error: error.message }, 403)
          return json({ error: 'Workflow storage unavailable.' }, 503)
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
