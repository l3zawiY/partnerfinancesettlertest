import type {
  ApiErrorResponse,
  AuthenticatedIdentityResponse,
  HouseholdResponse,
  SharedEntriesListResponse,
  SharedEntryResponse,
} from '../shared/api'
import { isValidSharedEntrySubmission } from '../shared/api'
import { computeSettlement } from '../shared/settlement'
import {
  type ClerkEnvironment,
  type IdentityVerifier,
  verifyClerkIdentity,
} from './auth'
import {
  ensureHousehold,
  listHouseholdNotes,
  listSharedEntries,
  upsertSharedEntry,
  type SharedEntryRecord,
  type SqlDatabase,
} from './db'

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
  | SharedEntryResponse
  | SharedEntriesListResponse
  | ApiErrorResponse

function json(body: ApiBody, status = 200) {
  return Response.json(body, {
    status,
    headers: { 'Cache-Control': 'no-store' },
  })
}

function toSharedEntryResponse(
  record: SharedEntryRecord,
): SharedEntryResponse {
  return {
    id: record.id,
    householdId: record.householdId,
    submittedBy: record.submittedBy,
    date: record.date,
    merchant: record.merchant,
    category: record.category,
    amountCents: record.amountCents,
    share: record.share,
    version: record.version,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  }
}

async function buildEntriesListResponse(
  database: SqlDatabase,
  householdId: string,
): Promise<SharedEntriesListResponse> {
  const records = await listSharedEntries(database, householdId)
  const settlement = computeSettlement(
    records.map(function (record) {
      return {
        submittedBy: record.submittedBy,
        amountCents: record.amountCents,
        share: record.share,
      }
    }),
  )

  return {
    entries: records.map(toSharedEntryResponse),
    settlement,
  }
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

      if (url.pathname === '/api/shared-entries') {
        if (request.method !== 'GET' && request.method !== 'POST') {
          return json({ error: 'Method not allowed.' }, 405)
        }

        let identity
        try {
          identity = await verifyIdentity(request, environment)
        } catch {
          return json({ error: 'Authentication service unavailable.' }, 503)
        }

        if (!identity) return json({ error: 'Authentication required.' }, 401)
        if (!identity.householdId) {
          return json({ error: 'No active household for this session.' }, 403)
        }

        if (request.method === 'GET') {
          try {
            return json(await buildEntriesListResponse(environment.DB, identity.householdId))
          } catch {
            return json({ error: 'Shared entry storage unavailable.' }, 503)
          }
        }

        let submission: unknown
        try {
          submission = await request.json()
        } catch {
          return json({ error: 'Request body must be JSON.' }, 400)
        }

        // Re-validated here even though the browser is expected to check first: a browser
        // can always be modified, so this is the check that actually protects the database
        // from a non-integer amount or an out-of-range share.
        if (!isValidSharedEntrySubmission(submission)) {
          return json({ error: 'Shared entry submission is invalid.' }, 400)
        }

        try {
          const now = new Date().toISOString()
          // shared_entries.household_id is a foreign key into households, and a session's
          // first write can arrive before its first /api/household read ever created that
          // row. ensureHousehold is the same safe-to-repeat call that route uses.
          await ensureHousehold(environment.DB, identity.householdId, now)
          const record = await upsertSharedEntry(
            environment.DB,
            identity.householdId,
            identity.userId,
            submission,
            now,
          )
          return json(toSharedEntryResponse(record))
        } catch (error) {
          // upsertSharedEntry refuses to hand back a row scoped to a different household,
          // which surfaces here as this specific error rather than a generic storage fault.
          if (error instanceof Error && error.message.includes('different household')) {
            return json({ error: 'Shared entry id belongs to a different household.' }, 403)
          }
          return json({ error: 'Shared entry storage unavailable.' }, 503)
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
