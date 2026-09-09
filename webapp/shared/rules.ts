/**
 * A parameterized port of index.html's merchant-rule logic (`ruleFor`, `rememberRule`,
 * `hasRule`, `applyRules`) and the pure `ruleEligible` gate from its Policy section. Same
 * approach as `refunds.ts`: v1 mutates `state.rules`/`state.txns` directly; this module
 * takes and returns plain arrays so React state stays immutable.
 *
 * `webapp/shared/rules.parity.test.ts` proves this against the real index.html code.
 */

import { pairRefunds, type LedgerRow } from './refunds'

export interface MerchantRule {
  type: 'family' | 'key'
  pattern: string
  share: number
  label: string
}

/* An instalment charge never inherits a merchant rule. KLARNA*Walmart cleans down to the
   same key as a grocery run, so a "Walmart 50/50" rule would silently split whatever the
   plan financed — which may be nothing like a normal purchase there. The row is otherwise
   ordinary: counted, splittable, exportable. */
export function ruleEligible(t: { bnpl: boolean; amount: number }): boolean {
  return !t.bnpl && t.amount > 0
}

export function ruleFor(
  rules: MerchantRule[],
  t: { family: string | null; key: string },
): MerchantRule | null {
  let best: MerchantRule | null = null
  for (const r of rules) {
    if (r.type === 'family' && t.family === r.pattern) return r
    if (r.type === 'key' && t.key.indexOf(r.pattern) !== -1) {
      if (!best || r.pattern.length > best.pattern.length) best = r
    }
  }
  return best
}

/** Returns a new rules array; does not mutate the one passed in. */
export function rememberRule(
  rules: MerchantRule[],
  t: { family: string | null; key: string; merchant: string },
  share: number,
): MerchantRule[] {
  const type: MerchantRule['type'] = t.family ? 'family' : 'key'
  const pattern = t.family || t.key.slice(0, 24)
  const next = rules.map(function (r) {
    return { ...r }
  })
  const existing = next.find(function (r) {
    return r.type === type && r.pattern === pattern
  })
  if (existing) existing.share = share
  else next.push({ type: type, pattern: pattern, share: share, label: t.merchant })
  return next
}

export function hasRule(rules: MerchantRule[], t: { family: string | null; key: string }): boolean {
  return rules.some(function (r) {
    return (r.type === 'family' && t.family === r.pattern) || (r.type === 'key' && t.key.indexOf(r.pattern) !== -1)
  })
}

/**
 * Applies merchant rules and the below-threshold default, then re-runs refund pairing —
 * same order as v1's `applyRules()`, which always calls `pairRefunds()` last so a refund
 * inherits its charge's freshly-decided split. Returns a new array; does not mutate txns.
 */
export function applyRules(
  txns: LedgerRow[],
  rules: MerchantRule[],
  threshold: number,
  defaultUnknown: number,
): LedgerRow[] {
  const next = txns.map(function (t) {
    const row = { ...t }
    if (row.decided && !row.auto) return row
    const r = ruleEligible(row) ? ruleFor(rules, row) : null
    if (r) {
      row.share = r.share
      row.decided = true
      row.auto = true
      return row
    }
    if (threshold > 0 && Math.abs(row.amount) < threshold) {
      row.share = defaultUnknown
      row.decided = true
      row.auto = true
      return row
    }
    if (row.auto) {
      row.share = null
      row.decided = false
      row.auto = false
    }
    return row
  })
  return pairRefunds(next)
}

export function countOccurrences<T extends { key: string; occurrences: number }>(txns: T[]): T[] {
  const counts: Record<string, number> = {}
  for (const t of txns) counts[t.key] = (counts[t.key] || 0) + 1
  return txns.map(function (t) {
    return { ...t, occurrences: counts[t.key] as number }
  })
}
