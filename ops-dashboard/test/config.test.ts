import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
// @ts-expect-error plain JavaScript shared with the deploy guard
import { allowedDatabases, readConfig } from '../scripts/config.mjs'

const config = readConfig(readFileSync(join(import.meta.dirname, '..', 'wrangler.jsonc'), 'utf8'))

describe('Worker configuration', () => {
  it('binds only the two logbook databases', () => {
    expect(config.d1_databases).toEqual(allowedDatabases)
    expect(JSON.stringify(config)).not.toMatch(/"split-ledger-(production|staging)"/)
    for (const entry of allowedDatabases) expect(entry.database_name).toMatch(/^split-ledger-telemetry(-staging)?$/)
  })

  it('is reachable only at ops.tallywithus.com', () => {
    expect(config.name).toBe('tallywithus-ops')
    expect(config.workers_dev).toBe(false)
    expect(config.preview_urls).toBe(false)
    expect(config.routes).toEqual([{ pattern: 'ops.tallywithus.com', custom_domain: true }])
    expect(config.env).toBeUndefined()
  })

  it('keeps secrets and personal details out of the configuration', () => {
    expect(['access', 'password']).toContain(config.vars.AUTH_MODE)
    for (const name of ['CF_ANALYTICS_TOKEN', 'OPS_PASSWORD', 'OWNER_EMAIL', 'CF_ACCOUNT_ID']) expect(config.vars).not.toHaveProperty(name)
  })

  it('never writes to a database from the Worker code', () => {
    for (const file of readdirSync(join(import.meta.dirname, '..', 'src'))) {
      const source = readFileSync(join(import.meta.dirname, '..', 'src', file), 'utf8')
      expect(source, file).not.toMatch(/\b(INSERT|UPDATE|DELETE FROM|DROP|ALTER|CREATE)\b/)
      expect(source, file).not.toMatch(/\.exec\(/)
    }
  })
})
