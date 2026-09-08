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
})
