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
