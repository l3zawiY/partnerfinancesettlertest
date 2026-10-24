import { describe, expect, it } from 'vitest'
import { createWorker, type WorkerEnvironment } from './index'

function environment(): WorkerEnvironment {
  return {
    VITE_CLERK_PUBLISHABLE_KEY: 'pk_test_fixture',
    CLERK_SECRET_KEY: 'sk_test_fixture',
    ASSETS: {
      fetch: async () => new Response('fixture asset'),
    },
    // /api/me never touches storage; this binding is present only to satisfy the shape.
    DB: {
      prepare: () => {
        throw new Error('The identity route must not use the database.')
      },
      batch: async () => {
        throw new Error('The identity route must not use the database.')
      },
    },
  }
}

describe('Worker API boundary', () => {
  it('rejects an unauthenticated identity request', async () => {
    const worker = createWorker(async () => null)
    const response = await worker.fetch(
      new Request('https://split-ledger.example/api/me'),
      environment(),
    )

    expect(response.status).toBe(401)
    expect(await response.json()).toEqual({ error: 'Authentication required.' })
    expect(response.headers.get('Cache-Control')).toBe('no-store')
    expect(response.headers.get('X-Content-Type-Options')).toBe('nosniff')
    expect(response.headers.get('Referrer-Policy')).toBe('no-referrer')
  })

  it('returns only a safe identifier for a verified identity', async () => {
    const worker = createWorker(async () => ({
      userId: 'user_fixture',
      householdId: null,
    }))
    const response = await worker.fetch(
      new Request('https://split-ledger.example/api/me'),
      environment(),
    )

    expect(response.status).toBe(200)
    expect(response.headers.get('Cache-Control')).toBe('no-store')
    expect(await response.json()).toEqual({
      authenticated: true,
      userId: 'user_fixture',
    })
  })

  it('does not turn an unknown API route into the React application', async () => {
    const worker = createWorker(async () => ({
      userId: 'user_fixture',
      householdId: null,
    }))
    const response = await worker.fetch(
      new Request('https://split-ledger.example/api/missing'),
      environment(),
    )

    expect(response.status).toBe(404)
    expect(await response.json()).toEqual({ error: 'API route not found.' })
  })

  it('explains storage failures in plain language and recognises the free daily limit', async () => {
    const failing = function (message: string): WorkerEnvironment {
      const fail = function (): never { throw new Error(message) }
      return { ...environment(), DB: { prepare: fail, batch: async () => fail() } as unknown as WorkerEnvironment['DB'] }
    }
    const worker = createWorker(async () => ({ userId: 'user_fixture', householdId: 'org_fixture', organizationRole: 'org:admin' }))
    const limited = await worker.fetch(new Request('https://split-ledger.example/api/household/pairing'), failing('D1_ERROR: Exceeded daily rows read limit'))
    expect(limited.status).toBe(503)
    expect(((await limited.json()) as { error: string }).error).toMatch(/free daily limit.*private draft in this browser is safe.*midnight UTC/)
    const generic = await worker.fetch(new Request('https://split-ledger.example/api/workflows/2026-07'), failing('network glitch'))
    expect(generic.status).toBe(503)
    const body = ((await generic.json()) as { error: string }).error
    expect(body).toMatch(/temporarily unavailable.*private draft in this browser is safe/)
    expect(body).not.toMatch(/glitch|D1_ERROR/)
  })
})
