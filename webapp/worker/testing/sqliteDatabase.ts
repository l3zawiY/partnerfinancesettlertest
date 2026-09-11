import { DatabaseSync } from 'node:sqlite'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import type { SqlDatabase, SqlStatement } from '../db'

/**
 * A test database that runs the real migration and the real SQL.
 *
 * D1 is SQLite, and Node ships a SQLite engine, so tests can execute the same statements
 * the Worker sends to D1. This matters for the household tests: a hand-written fake would
 * implement whatever filtering we told it to, which would make a cross-household test
 * prove nothing. Here the WHERE clause is genuinely evaluated by a database.
 *
 * The limits are worth knowing. This checks our schema and our queries, not D1's own
 * behaviour under load, replication, or its API edge cases. The local dev server, which
 * runs a real D1, remains the second check.
 *
 * This file is test-only support and never ships in the Worker bundle.
 */

const MIGRATIONS = [
  fileURLToPath(new URL('../../migrations/0001_households.sql', import.meta.url)),
  fileURLToPath(new URL('../../migrations/0002_shared_entries.sql', import.meta.url)),
  fileURLToPath(new URL('../../migrations/0003_period_workflows.sql', import.meta.url)),
  fileURLToPath(new URL('../../migrations/0004_workflow_hardening.sql', import.meta.url)),
]

class SqliteStatement implements SqlStatement {
  constructor(
    private readonly database: DatabaseSync,
    private readonly sql: string,
    private readonly values: unknown[] = [],
  ) {}

  bind(...values: unknown[]): SqlStatement {
    return new SqliteStatement(this.database, this.sql, values)
  }

  async first<T = Record<string, unknown>>(): Promise<T | null> {
    const row = this.database.prepare(this.sql).get(...(this.values as never[]))
    return (row ?? null) as T | null
  }

  async all<T = Record<string, unknown>>(): Promise<{ results: T[] }> {
    const results = this.database.prepare(this.sql).all(...(this.values as never[]))
    return { results: results as T[] }
  }

  async run(): Promise<{ changes: number }> {
    const result = this.database.prepare(this.sql).run(...(this.values as never[]))
    return { changes: Number(result.changes) }
  }

  execute(): { changes: number } {
    const result = this.database.prepare(this.sql).run(...(this.values as never[]))
    return { changes: Number(result.changes) }
  }
}

export interface TestDatabase extends SqlDatabase {
  /** Insert a fictional note directly, bypassing the API, to set up a scenario. */
  seedNote(householdId: string, id: string, label: string, createdAt: string): void
  /** Insert a fictional shared entry directly, bypassing the API, to set up a scenario. */
  seedSharedEntry(entry: {
    id: string
    householdId: string
    submittedBy: string
    date: string
    merchant: string
    category: string
    amountCents: number
    share: number
    version?: number
    createdAt: string
    updatedAt?: string
  }): void
  close(): void
  failBatchAt(index: number | null): void
}

export function createTestDatabase(): TestDatabase {
  const database = new DatabaseSync(':memory:')
  let failureIndex: number | null = null

  // D1 enforces foreign keys; plain SQLite does not unless asked. Matching D1 here keeps
  // the test honest about the constraint in the migrations.
  database.exec('PRAGMA foreign_keys = ON')
  for (const migration of MIGRATIONS) {
    database.exec(readFileSync(migration, 'utf8'))
  }

  return {
    prepare(query: string) {
      return new SqliteStatement(database, query)
    },
    async batch(statements) {
      database.exec('BEGIN IMMEDIATE')
      try {
        const results = statements.map(function (statement, index) {
          if (failureIndex === index) throw new Error('Injected batch failure at statement ' + index + '.')
          if (!(statement instanceof SqliteStatement)) throw new Error('Unexpected SQLite statement implementation.')
          return statement.execute()
        })
        database.exec('COMMIT')
        return results
      } catch (error) {
        database.exec('ROLLBACK')
        throw error
      }
    },
    seedNote(householdId, id, label, createdAt) {
      database
        .prepare('INSERT OR IGNORE INTO households (household_id, created_at) VALUES (?, ?)')
        .run(householdId, createdAt)
      database
        .prepare(
          'INSERT INTO household_notes (id, household_id, label, created_at) ' +
            'VALUES (?, ?, ?, ?)',
        )
        .run(id, householdId, label, createdAt)
    },
    seedSharedEntry(entry) {
      database
        .prepare('INSERT OR IGNORE INTO households (household_id, created_at) VALUES (?, ?)')
        .run(entry.householdId, entry.createdAt)
      database
        .prepare(
          'INSERT INTO shared_entries ' +
            '(id, household_id, submitted_by, date, merchant, category, amount_cents, ' +
            'share, version, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        )
        .run(
          entry.id,
          entry.householdId,
          entry.submittedBy,
          entry.date,
          entry.merchant,
          entry.category,
          entry.amountCents,
          entry.share,
          entry.version ?? 1,
          entry.createdAt,
          entry.updatedAt ?? entry.createdAt,
        )
    },
    close() {
      database.close()
    },
    failBatchAt(index) {
      failureIndex = index
    },
  }
}
