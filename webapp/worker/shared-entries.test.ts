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

function listRequest(url = 'https://split-ledger.example/api/shared-entries') {
  return new Request(url)
}

function submitRequest(body: unknown) {
  return new Request('https://split-ledger.example/api/shared-entries', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

const FICTIONAL_ENTRY = {
  id: 'entry_fixture_1',
  date: '2026-07-16',
  merchant: 'Fictional Restaurant',
  category: 'Restaurants',
  amountCents: 14667,
  share: 0.5,
}

describe('Shared entry authorization', () => {
  it('refuses a list request with no session', async () => {
    const response = await signedOut().fetch(listRequest(), environment())
    expect(response.status).toBe(401)
  })

  it('refuses a submit request with no session', async () => {
    const response = await signedOut().fetch(submitRequest(FICTIONAL_ENTRY), environment())
    expect(response.status).toBe(401)
  })

  it('refuses a signed-in user with no active household', async () => {
    const response = await memberOf(null).fetch(listRequest(), environment())
    expect(response.status).toBe(403)
  })

  it('rejects a method other than GET or POST', async () => {
    const response = await memberOf(HOUSEHOLD_A).fetch(
      new Request('https://split-ledger.example/api/shared-entries', { method: 'DELETE' }),
      environment(),
    )
    expect(response.status).toBe(405)
  })

  it('denies a cross-household list even when the browser names the other household', async () => {
    database.seedSharedEntry({
      ...FICTIONAL_ENTRY,
      householdId: HOUSEHOLD_B,
      submittedBy: 'user_b',
      createdAt: '2026-07-16T00:00:00.000Z',
    })

    const response = await memberOf(HOUSEHOLD_A).fetch(
      listRequest(
        'https://split-ledger.example/api/shared-entries?householdId=' + HOUSEHOLD_B,
      ),
      environment(),
    )
    const body = (await response.json()) as { entries: unknown[] }

    expect(response.status).toBe(200)
    expect(body.entries).toEqual([])
  })
})

describe('Shared entry validation', () => {
  it('rejects a body that is not valid JSON', async () => {
    const response = await memberOf(HOUSEHOLD_A).fetch(
      new Request('https://split-ledger.example/api/shared-entries', {
        method: 'POST',
        body: 'not json',
      }),
      environment(),
    )
    expect(response.status).toBe(400)
  })

  it('rejects a non-integer amount rather than rounding it', async () => {
    const response = await memberOf(HOUSEHOLD_A).fetch(
      submitRequest({ ...FICTIONAL_ENTRY, amountCents: 146.5 }),
      environment(),
    )
    expect(response.status).toBe(400)

    const count = await database
      .prepare('SELECT COUNT(*) AS total FROM shared_entries')
      .bind()
      .first<{ total: number }>()
    expect(count?.total).toBe(0)
  })

  it('rejects a share outside 0..1', async () => {
    const response = await memberOf(HOUSEHOLD_A).fetch(
      submitRequest({ ...FICTIONAL_ENTRY, share: 1.5 }),
      environment(),
    )
    expect(response.status).toBe(400)
  })
})

describe('Shared entry creation, retry, and edit', () => {
  it('creates an entry and returns it scoped to the caller household', async () => {
    const response = await memberOf(HOUSEHOLD_A, 'user_a').fetch(
      submitRequest(FICTIONAL_ENTRY),
      environment(),
    )
    const body = (await response.json()) as { householdId: string; version: number }

    expect(response.status).toBe(200)
    expect(body.householdId).toBe(HOUSEHOLD_A)
    expect(body.version).toBe(1)
  })

  it('is a safe retry: resubmitting the same id and body does not duplicate the row', async () => {
    const worker = memberOf(HOUSEHOLD_A, 'user_a')

    await worker.fetch(submitRequest(FICTIONAL_ENTRY), environment())
    const second = await worker.fetch(submitRequest(FICTIONAL_ENTRY), environment())
    const secondBody = (await second.json()) as { version: number }

    const count = await database
      .prepare('SELECT COUNT(*) AS total FROM shared_entries')
      .bind()
      .first<{ total: number }>()

    expect(count?.total).toBe(1)
    // A retry with identical fields still counts as a write in this fictional slice: only
    // full version history (Batch 5) would distinguish "identical retry" from "real edit".
    expect(secondBody.version).toBe(2)
  })

  it('treats resubmitting the same id with changed fields as an edit', async () => {
    const worker = memberOf(HOUSEHOLD_A, 'user_a')

    await worker.fetch(submitRequest(FICTIONAL_ENTRY), environment())
    const edited = await worker.fetch(
      submitRequest({ ...FICTIONAL_ENTRY, amountCents: 20000 }),
      environment(),
    )
    const editedBody = (await edited.json()) as { amountCents: number; version: number }

    expect(editedBody.amountCents).toBe(20000)
    expect(editedBody.version).toBe(2)
  })

  it('refuses to let one household overwrite another household entry with the same id', async () => {
    await memberOf(HOUSEHOLD_A, 'user_a').fetch(submitRequest(FICTIONAL_ENTRY), environment())

    const response = await memberOf(HOUSEHOLD_B, 'user_b').fetch(
      submitRequest(FICTIONAL_ENTRY),
      environment(),
    )

    expect(response.status).toBe(403)

    const row = await database
      .prepare('SELECT household_id FROM shared_entries WHERE id = ?')
      .bind(FICTIONAL_ENTRY.id)
      .first<{ household_id: string }>()
    expect(row?.household_id).toBe(HOUSEHOLD_A)
  })

  it('answers with no-store', async () => {
    const response = await memberOf(HOUSEHOLD_A, 'user_a').fetch(
      submitRequest(FICTIONAL_ENTRY),
      environment(),
    )
    expect(response.headers.get('Cache-Control')).toBe('no-store')
  })
})

describe('Settlement totals returned with the list', () => {
  it('computes claim totals in integer cents for two submitters', async () => {
    database.seedSharedEntry({
      id: 'entry_a',
      householdId: HOUSEHOLD_A,
      submittedBy: 'user_a',
      date: '2026-07-01',
      merchant: 'Fixture A',
      category: 'Groceries',
      amountCents: 10000,
      share: 0.5,
      createdAt: '2026-07-01T00:00:00.000Z',
    })
    database.seedSharedEntry({
      id: 'entry_b',
      householdId: HOUSEHOLD_A,
      submittedBy: 'user_b',
      date: '2026-07-02',
      merchant: 'Fixture B',
      category: 'Utilities',
      amountCents: 4000,
      share: 0.5,
      createdAt: '2026-07-02T00:00:00.000Z',
    })

    const response = await memberOf(HOUSEHOLD_A, 'user_a').fetch(listRequest(), environment())
    const body = (await response.json()) as {
      settlement: {
        totals: { submittedBy: string; paidCents: number; claimCents: number }[]
        netCents: number
        direction: string
      }
    }

    // user_a paid 10000, claims 5000 (half back from user_b); user_b paid 4000, claims
    // 2000. Net: user_a is owed 5000, user_b is owed 2000, so user_b owes user_a 3000.
    expect(body.settlement.totals).toEqual([
      { submittedBy: 'user_a', paidCents: 10000, claimCents: 5000 },
      { submittedBy: 'user_b', paidCents: 4000, claimCents: 2000 },
    ])
    expect(body.settlement.netCents).toBe(3000)
    expect(body.settlement.direction).toBe('second_owes_first')
  })

  it('reports undetermined direction with a single submitter', async () => {
    database.seedSharedEntry({
      id: 'entry_solo',
      householdId: HOUSEHOLD_A,
      submittedBy: 'user_a',
      date: '2026-07-01',
      merchant: 'Fixture A',
      category: 'Groceries',
      amountCents: 10000,
      share: 0.5,
      createdAt: '2026-07-01T00:00:00.000Z',
    })

    const response = await memberOf(HOUSEHOLD_A, 'user_a').fetch(listRequest(), environment())
    const body = (await response.json()) as { settlement: { direction: string; netCents: null } }

    expect(body.settlement.direction).toBe('undetermined')
    expect(body.settlement.netCents).toBeNull()
  })
})
