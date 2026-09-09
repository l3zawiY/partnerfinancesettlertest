/**
 * A parameterized port of the refund-pairing logic in index.html's "---- rules ----"
 * section (`pairFor`, `pairRefunds`, `creditDaysAfter`, `isNonSpendingCredit`,
 * `REFUND_WINDOW_DAYS`). v1's versions read and write a global `state.txns` directly;
 * these take and return plain arrays instead, matching how React expects state to be
 * treated as immutable. The matching logic itself — the pool of candidates, the exact vs.
 * cross-key vs. partial tiers, the ambiguity rule — is unchanged.
 *
 * `webapp/shared/refunds.parity.test.ts` proves this against the real index.html code,
 * the same technique `engine.parity.test.ts` uses: it seeds a `state` object in a sandbox
 * and runs v1's actual `pairRefunds()` against it, then compares to this module's output
 * on the same fixture rows.
 */

import type { EngineRow } from './engine'

/** Fields index.html's refund pairing adds to a row; absent until pairRefunds() runs. */
export interface LedgerRow extends EngineRow {
  creditKind: string | null
  partialRefund: boolean
  weakPair: boolean | null
  pairedLabel: string | null
}

export function toLedgerRow(row: EngineRow): LedgerRow {
  return {
    ...row,
    creditKind: null,
    partialRefund: false,
    weakPair: null,
    pairedLabel: null,
  }
}

export const REFUND_WINDOW_DAYS = 120

export function creditDaysAfter(charge: { date: string }, credit: { date: string }): number {
  return (Date.parse(credit.date) - Date.parse(charge.date)) / 86400000
}

/* A credit whose description is a cashback/rewards/points payout is not a refund of any
   purchase, so it must never be offered as a pairing candidate or inherit a charge's
   split. */
export function isNonSpendingCredit(t: { amount: number; raw: string; merchant: string }): boolean {
  return (
    t.amount < 0 &&
    /\b(CASH\s*BACK|CASHBACK|REWARDS?|LOYALTY|POINTS?\s+REDEMPTION|STATEMENT\s+CREDIT|ANNUAL\s+REBATE)\b/i.test(
      (t.raw || '') + ' ' + (t.merchant || ''),
    )
  )
}

export interface PairResult {
  charge: LedgerRow | null
  weak: boolean
  kind: 'non-spending' | 'exact' | 'partial' | 'ambiguous' | 'likely' | 'unmatched'
  candidates: LedgerRow[]
}

/* Credits are not purchases. A matched refund follows the purchase's split; an
   unmatched, ambiguous, rewards, or cashback credit is visible but excluded. Partial
   matching uses combined evidence, not an arbitrary percentage. */
export function pairFor(
  rf: LedgerRow,
  charges: LedgerRow[],
  refundedCents: Record<string, number> = {},
): PairResult {
  if (isNonSpendingCredit(rf)) return { charge: null, weak: false, kind: 'non-spending', candidates: [] }
  const refundCents = Math.round(Math.abs(rf.amount) * 100)
  const eligible = charges.filter(function (c) {
    const remaining = Math.round(c.amount * 100) - (refundedCents[c.id] || 0)
    const days = creditDaysAfter(c, rf)
    return c.amount > 0 && !c.pending && days >= 0 && days <= REFUND_WINDOW_DAYS && remaining >= refundCents
  })
  const same = eligible.filter(function (c) {
    return c.key === rf.key
  })
  const exact = same.filter(function (c) {
    return Math.round(c.amount * 100) - (refundedCents[c.id] || 0) === refundCents
  })
  if (exact.length === 1) {
    const chosen = exact[0] as LedgerRow
    return {
      charge: chosen,
      weak: false,
      kind: refundedCents[chosen.id] ? 'partial' : 'exact',
      candidates: exact,
    }
  }
  if (exact.length > 1) return { charge: null, weak: true, kind: 'ambiguous', candidates: exact }
  const cross = eligible.filter(function (c) {
    return (
      c.key !== rf.key &&
      creditDaysAfter(c, rf) <= 3 &&
      Math.round(c.amount * 100) - (refundedCents[c.id] || 0) === refundCents
    )
  })
  if (cross.length === 1) return { charge: cross[0] as LedgerRow, weak: true, kind: 'likely', candidates: cross }
  if (cross.length > 1) return { charge: null, weak: true, kind: 'ambiguous', candidates: cross }
  const partial = same.filter(function (c) {
    return Math.round(c.amount * 100) - (refundedCents[c.id] || 0) > refundCents
  })
  if (partial.length === 1) return { charge: partial[0] as LedgerRow, weak: false, kind: 'partial', candidates: partial }
  if (partial.length > 1) return { charge: null, weak: true, kind: 'ambiguous', candidates: partial }
  return { charge: null, weak: false, kind: 'unmatched', candidates: [] }
}

/**
 * Pairs every credit row against eligible charge rows. Returns a new array (input rows
 * are not mutated) with refund/pairing fields set on the credit rows; charge rows are
 * returned unchanged aside from being copied, matching v1's behavior of never touching a
 * charge from this function.
 */
export function pairRefunds(txns: LedgerRow[]): LedgerRow[] {
  const rows = txns.map(function (t) {
    return { ...t }
  })
  const charges = rows.filter(function (t) {
    return t.amount > 0 && !t.pending
  })
  const refundedCents: Record<string, number> = {}
  const refunds = rows
    .filter(function (t) {
      return t.amount < 0
    })
    .sort(function (a, b) {
      return a.date < b.date ? -1 : 1
    })

  for (const rf of refunds) {
    const p = pairFor(rf, charges, refundedCents)
    rf.creditKind = p.kind
    rf.refund = p.kind !== 'non-spending'
    rf.partialRefund = p.kind === 'partial'
    rf.weakPair = p.weak
    rf.pairedWith = p.charge ? p.charge.id : null
    rf.pairedLabel = p.charge ? p.charge.date + ' ' + p.charge.merchant : null
    rf.share = p.charge && p.charge.decided ? p.charge.share : null
    rf.decided = true
    rf.auto = true
    if (p.charge) {
      refundedCents[p.charge.id] = (refundedCents[p.charge.id] || 0) + Math.round(Math.abs(rf.amount) * 100)
    }
  }

  return rows
}
