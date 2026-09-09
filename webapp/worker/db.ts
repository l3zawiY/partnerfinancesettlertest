/**
 * Data access for household records.
 *
 * The Worker's D1 binding satisfies this small interface, and so does a plain SQLite
 * database in tests. Depending on the narrow shape rather than on Cloudflare's D1 type
 * is the same idea as injecting the identity verifier in `auth.ts`: our logic stays
 * testable without the real service.
 */
export interface SqlStatement {
  bind(...values: unknown[]): SqlStatement
  first<T = Record<string, unknown>>(): Promise<T | null>
  all<T = Record<string, unknown>>(): Promise<{ results: T[] }>
  run(): Promise<unknown>
}

export interface SqlDatabase {
  prepare(query: string): SqlStatement
}

export interface HouseholdRecord {
  householdId: string
  createdAt: string
}

export interface HouseholdNoteRecord {
  id: string
  label: string
  createdAt: string
}

/**
 * Every function here takes the household id as an explicit argument, and the only
 * caller derives it from the verified session. A household id supplied by the browser
 * must never reach this file: that is the whole authorization boundary.
 */

export async function ensureHousehold(
  database: SqlDatabase,
  householdId: string,
  now: string,
): Promise<HouseholdRecord> {
  // Creating the row on first read keeps the request safe to repeat. Doing nothing on
  // conflict means a second sign-in never overwrites the original creation date.
  await database
    .prepare(
      'INSERT INTO households (household_id, created_at) VALUES (?, ?) ' +
        'ON CONFLICT (household_id) DO NOTHING',
    )
    .bind(householdId, now)
    .run()

  const row = await database
    .prepare('SELECT household_id, created_at FROM households WHERE household_id = ?')
    .bind(householdId)
    .first<{ household_id: string; created_at: string }>()

  if (!row) throw new Error('Household row missing immediately after insert.')

  return { householdId: row.household_id, createdAt: row.created_at }
}

export async function listHouseholdNotes(
  database: SqlDatabase,
  householdId: string,
): Promise<HouseholdNoteRecord[]> {
  const { results } = await database
    .prepare(
      'SELECT id, label, created_at FROM household_notes ' +
        'WHERE household_id = ? ORDER BY created_at, id',
    )
    .bind(householdId)
    .all<{ id: string; label: string; created_at: string }>()

  return results.map(function (row) {
    return { id: row.id, label: row.label, createdAt: row.created_at }
  })
}

export interface SharedEntryInput {
  id: string
  date: string
  merchant: string
  category: string
  amountCents: number
  share: number
}

export interface SharedEntryRecord extends SharedEntryInput {
  householdId: string
  submittedBy: string
  version: number
  createdAt: string
  updatedAt: string
}

function toSharedEntryRecord(row: {
  id: string
  household_id: string
  submitted_by: string
  date: string
  merchant: string
  category: string
  amount_cents: number
  share: number
  version: number
  created_at: string
  updated_at: string
}): SharedEntryRecord {
  return {
    id: row.id,
    householdId: row.household_id,
    submittedBy: row.submitted_by,
    date: row.date,
    merchant: row.merchant,
    category: row.category,
    amountCents: row.amount_cents,
    share: row.share,
    version: row.version,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

/**
 * Creates a shared entry, or safely retries/edits one already submitted by the same id.
 *
 * The `WHERE household_id = ?` on the UPDATE branch is the important part: without it, a
 * caller who already knows another household's entry id could edit that household's row
 * by resubmitting it under their own session, because SQLite's ON CONFLICT target is only
 * the primary key. Scoping the update keeps the household boundary intact even on a write
 * that collides on `id`.
 */
export async function upsertSharedEntry(
  database: SqlDatabase,
  householdId: string,
  submittedBy: string,
  input: SharedEntryInput,
  now: string,
): Promise<SharedEntryRecord> {
  await database
    .prepare(
      'INSERT INTO shared_entries ' +
        '(id, household_id, submitted_by, date, merchant, category, amount_cents, share, ' +
        'version, created_at, updated_at) ' +
        'VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?) ' +
        'ON CONFLICT (id) DO UPDATE SET ' +
        'date = excluded.date, merchant = excluded.merchant, category = excluded.category, ' +
        'amount_cents = excluded.amount_cents, share = excluded.share, ' +
        'version = shared_entries.version + 1, updated_at = excluded.updated_at ' +
        'WHERE shared_entries.household_id = ?',
    )
    .bind(
      input.id,
      householdId,
      submittedBy,
      input.date,
      input.merchant,
      input.category,
      input.amountCents,
      input.share,
      now,
      now,
      householdId,
    )
    .run()

  const row = await database
    .prepare(
      'SELECT id, household_id, submitted_by, date, merchant, category, amount_cents, ' +
        'share, version, created_at, updated_at FROM shared_entries ' +
        'WHERE id = ? AND household_id = ?',
    )
    .bind(input.id, householdId)
    .first<{
      id: string
      household_id: string
      submitted_by: string
      date: string
      merchant: string
      category: string
      amount_cents: number
      share: number
      version: number
      created_at: string
      updated_at: string
    }>()

  if (!row) {
    // Either the insert conflicted with another household's row (WHERE excluded it from
    // the update) or something inserted and was then deleted concurrently. Either way this
    // household never gets to see or claim someone else's entry id.
    throw new Error('Shared entry id belongs to a different household.')
  }

  return toSharedEntryRecord(row)
}

export async function listSharedEntries(
  database: SqlDatabase,
  householdId: string,
): Promise<SharedEntryRecord[]> {
  const { results } = await database
    .prepare(
      'SELECT id, household_id, submitted_by, date, merchant, category, amount_cents, ' +
        'share, version, created_at, updated_at FROM shared_entries ' +
        'WHERE household_id = ? ORDER BY date, id',
    )
    .bind(householdId)
    .all<{
      id: string
      household_id: string
      submitted_by: string
      date: string
      merchant: string
      category: string
      amount_cents: number
      share: number
      version: number
      created_at: string
      updated_at: string
    }>()

  return results.map(toSharedEntryRecord)
}
