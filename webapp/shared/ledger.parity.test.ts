import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import vm from 'node:vm'
import { describe, expect, it } from 'vitest'
import { applyRules, ruleEligible, ruleFor, rememberRule, hasRule, type MerchantRule } from './rules'
import { pairRefunds, toLedgerRow, type LedgerRow } from './refunds'
import { parsePaste } from './engine'

/**
 * Loads index.html's actual rule/refund code and runs it against a hand-seeded `state`
 * object — the same shape `applyRules()`/`pairRefunds()` read from in the real app — then
 * compares the resulting rows to `rules.ts`/`refunds.ts`. Unlike the parsing engine, this
 * code isn't inside a frozen, self-contained marker block; it lives in the App section and
 * reads global `state` directly. Seeding that global here, rather than hand-typing expected
 * outputs, keeps this a true behavioral comparison instead of a guess about one.
 */
interface V1Rules {
  ruleEligible: typeof ruleEligible
  ruleFor: (t: unknown) => MerchantRule | null
  rememberRule: (t: unknown, share: number) => void
  hasRule: (t: unknown) => boolean
  applyRules: () => void
  pairRefunds: () => void
  countOccurrences: () => void
  state: { txns: LedgerRow[]; rules: MerchantRule[]; threshold: number; defaultUnknown: number }
}

function loadV1Ledger(): V1Rules {
  const indexPath = fileURLToPath(new URL('../../index.html', import.meta.url))
  const html = readFileSync(indexPath, 'utf8')

  const start = html.indexOf('function ruleEligible(t){')
  const end = html.indexOf('/* ---------------- import ---------------- */')
  if (start === -1 || end === -1 || end < start) {
    throw new Error('Could not locate the rules/refunds section in index.html.')
  }
  const source = html.slice(start, end)

  const sandbox: Record<string, unknown> = {
    state: { txns: [], rules: [], threshold: 0, defaultUnknown: 1 },
    // The extracted range includes `var excludePatterns = EXCLUDE_DEFAULT.slice();`, a
    // top-level statement that runs immediately; EXCLUDE_DEFAULT itself lives in the
    // engine block, outside this range, so it must be seeded for the range to evaluate.
    EXCLUDE_DEFAULT: [],
  }
  vm.createContext(sandbox)
  vm.runInContext(source, sandbox, { filename: 'index.html#rules' })

  return sandbox as unknown as V1Rules
}

const OPTS = { year: 2026, today: '2026-08-20', card: 'TD Visa', excludes: [] }

function fixtureLedger(): LedgerRow[] {
  const td = parsePaste(
    [
      'Posted Transactions2026-07-21 to Today',
      'Date\tTransaction Description\tDebit\tCredit\tBalance\t',
      'Jul 24, 2026\tFARM BOY #43\t84.26\t\t4137.41\t',
      'Jul 22, 2026\tFARM BOY #43\t17.36\t\t4053.15\t',
      'Jul 19, 2026\tANNUAL CASH BACK\t\t20.00\t4000.00\t',
      'Jul 10, 2026\tSAMPLE ALPHA STORE\t100.00\t\t4200.00\t',
      'Jul 14, 2026\tSAMPLE ALPHA STORE\t\t100.00\t4100.00\t',
    ].join('\n'),
    'td',
    OPTS,
  ).rows
  return td.map(toLedgerRow)
}

describe('rules and refund pairing parity against index.html', () => {
  it('applies a family rule and pairs an exact refund identically', () => {
    const v1 = loadV1Ledger()
    const rules: MerchantRule[] = [{ type: 'key', pattern: 'FARM BOY', share: 0.5, label: 'Farm Boy' }]

    const ported = applyRules(fixtureLedger(), rules, 0, 1)

    v1.state.txns = fixtureLedger()
    v1.state.rules = rules
    v1.state.threshold = 0
    v1.state.defaultUnknown = 1
    v1.applyRules()

    expect(ported).toEqual(v1.state.txns)
  })

  it('applies the below-threshold default identically', () => {
    const v1 = loadV1Ledger()
    const ported = applyRules(fixtureLedger(), [], 50, 1)

    v1.state.txns = fixtureLedger()
    v1.state.rules = []
    v1.state.threshold = 50
    v1.state.defaultUnknown = 1
    v1.applyRules()

    expect(ported).toEqual(v1.state.txns)
  })

  it('pairs refunds without any rule or threshold identically', () => {
    const v1 = loadV1Ledger()
    const ported = pairRefunds(fixtureLedger())

    v1.state.txns = fixtureLedger()
    v1.pairRefunds()

    expect(ported).toEqual(v1.state.txns)
  })

  it('matches ruleFor/rememberRule/hasRule for the same rule set', () => {
    const v1 = loadV1Ledger()
    const rows = fixtureLedger()
    const rules: MerchantRule[] = [{ type: 'key', pattern: 'FARM BOY', share: 0.5, label: 'Farm Boy' }]

    for (const row of rows) {
      expect(ruleFor(rules, row)).toEqual(v1RuleFor(v1, rules, row))
      expect(hasRule(rules, row)).toEqual(hasRuleV1(v1, rules, row))
    }

    const remembered = rememberRule(rules, rows[0] as (typeof rows)[number], 0.25)
    expect(remembered.some((r) => r.share === 0.25)).toBe(true)
  })
})

/** v1's ruleFor/hasRule read `state.rules` rather than taking it as a parameter. */
function v1RuleFor(v1: V1Rules, rules: MerchantRule[], t: unknown) {
  v1.state.rules = rules
  return v1.ruleFor(t)
}
function hasRuleV1(v1: V1Rules, rules: MerchantRule[], t: unknown) {
  v1.state.rules = rules
  return v1.hasRule(t)
}
