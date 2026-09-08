import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createWorker, type WorkerEnvironment } from './index'
import { createTestDatabase, type TestDatabase } from './testing/sqliteDatabase'

const HOUSEHOLD_A = 'org_fixture_household_a'
const HOUSEHOLD_B = 'org_fixture_household_b'

let database: TestDatabase

beforeEach(function () {
  database = createTestDatabase()
})

afterEach(function () {
  database.close()
})

function environment(): WorkerEnvironment {
  return {
    VITE_CLERK_PUBLISHABLE_KEY: 'pk_test_fixture',
    CLERK_SECRET_KEY: 'sk_test_fixture',
    ASSETS: { fetch: async () => new Response('fixture asset') },
    DB: database,
  }
}

/** A signed-in member of the given household, as the verified token would report them. */
function memberOf(householdId: string | null, userId = 'user_fixture') {
  return createWorker(async () => ({ userId, householdId }))
}

const signedOut = () => createWorker(async () => null)

function householdRequest(url = 'https://split-ledger.example/api/household') {
  return new Request(url)
}

describe('Household authorization', () => {
  it('refuses a request with no session', async () => {
    const response = await signedOut().fetch(householdRequest(), environment())

    expect(response.status).toBe(401)
    expect(await response.json()).toEqual({ error: 'Authentication required.' })
  })

  it('refuses a signed-in user who has no active household', async () => {
    const response = await memberOf(null).fetch(householdRequest(), environment())

    expect(response.status).toBe(403)
    expect(await response.json()).toEqual({
      error: 'No active household for this session.',
    })
  })

  it('creates the household on first read and repeats safely', async () => {
    const worker = memberOf(HOUSEHOLD_A)

    const first = await worker.fetch(householdRequest(), environment())
    const firstBody = (await first.json()) as { householdId: string; createdAt: string }
    const second = await worker.fetch(householdRequest(), environment())
    const secondBody = (await second.json()) as { householdId: string; createdAt: string }

    expect(first.status).toBe(200)
    expect(second.status).toBe(200)
    expect(firstBody.householdId).toBe(HOUSEHOLD_A)
    // A repeated request must not re-create the row or move its creation date.
    expect(secondBody.createdAt).toBe(firstBody.createdAt)

    const count = await database
      .prepare('SELECT COUNT(*) AS total FROM households')
      .bind()
      .first<{ total: number }>()
    expect(count?.total).toBe(1)
  })

  it('returns only the caller household records', async () => {
    database.seedNote(HOUSEHOLD_A, 'note_a1', 'Household A note', '2026-01-01T00:00:00.000Z')
    database.seedNote(HOUSEHOLD_B, 'note_b1', 'Household B note', '2026-01-02T00:00:00.000Z')

    const response = await memberOf(HOUSEHOLD_A).fetch(householdRequest(), environment())
    const body = (await response.json()) as {
      notes: { id: string; label: string }[]
    }

    expect(response.status).toBe(200)
    expect(body.notes.map((note) => note.id)).toEqual(['note_a1'])
  })

  /**
   * The failure this whole batch exists to prevent. A member of one household must never
   * read another household's records, and must not be able to ask for them.
   */
  it('denies a cross-household read even when the browser names the other household', async () => {
    database.seedNote(HOUSEHOLD_B, 'note_b1', 'Household B note', '2026-01-02T00:00:00.000Z')

    const response = await memberOf(HOUSEHOLD_A).fetch(
      householdRequest(
        'https://split-ledger.example/api/household?householdId=' + HOUSEHOLD_B,
      ),
      environment(),
    )
    const body = (await response.json()) as {
      householdId: string
      notes: { id: string }[]
    }

    expect(response.status).toBe(200)
    // The query string is ignored entirely: the server used the verified session.
    expect(body.householdId).toBe(HOUSEHOLD_A)
    expect(body.notes).toEqual([])
  })

  it('does not allow writes through the household route', async () => {
    const response = await memberOf(HOUSEHOLD_A).fetch(
      new Request('https://split-ledger.example/api/household', { method: 'POST' }),
      environment(),
    )

    expect(response.status).toBe(405)
  })

  it('answers with no-store so a household reply is never cached', async () => {
    const response = await memberOf(HOUSEHOLD_A).fetch(householdRequest(), environment())

    expect(response.headers.get('Cache-Control')).toBe('no-store')
  })
})
