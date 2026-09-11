import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createWorker, type WorkerEnvironment } from './index'
import { createTestDatabase, type TestDatabase } from './testing/sqliteDatabase'

let database: TestDatabase
beforeEach(function () { database = createTestDatabase() })
afterEach(function () { database.close() })

function environment(): WorkerEnvironment {
  return { VITE_CLERK_PUBLISHABLE_KEY: 'pk_test_fixture', CLERK_SECRET_KEY: 'sk_test_fixture', ASSETS: { fetch: async () => new Response('fixture asset') }, DB: database }
}

describe('retired Batch 3 shared-entry route', function () {
  it('returns Gone and cannot write around the period workflow', async function () {
    const worker = createWorker(async () => ({ userId: 'user_fixture', householdId: 'org_fixture' }))
    for (const method of ['GET', 'POST']) {
      const response = await worker.fetch(new Request('https://split-ledger.example/api/shared-entries', { method, body: method === 'POST' ? '{}' : undefined }), environment())
      expect(response.status).toBe(410)
    }
    const count = await database.prepare('SELECT COUNT(*) AS total FROM shared_entries').bind().first<{ total: number }>()
    expect(count?.total).toBe(0)
  })
})
