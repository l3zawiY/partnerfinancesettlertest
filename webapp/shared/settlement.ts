/**
 * Deterministic settlement math, adapted from the aClaim/bClaim/net/direction logic in
 * index.html (search `buildArchive`). Two differences from that version:
 *
 * - Money is integer cents throughout, never a float. `index.html` stores dollars and
 *   rounds with `toFixed(2)` at the end; here every intermediate value is already an
 *   integer, so there is nothing to round away except the amount*(1-share) claim, which
 *   is rounded once per entry rather than once per total.
 * - Sides are grouped by `submittedBy` (a Clerk user id) instead of hardcoded "a"/"b",
 *   because this module does not know who a household's two members are — only the
 *   Worker's authorization layer does.
 *
 * This file has no DOM access and no database access, matching the house rule that
 * financial arithmetic stays deterministic and testable outside the UI and network layers.
 */

export interface SettlementEntry {
  submittedBy: string
  amountCents: number
  share: number
}

export interface SettlementTotal {
  submittedBy: string
  paidCents: number
  claimCents: number
}

export type SettlementDirection =
  | 'square'
  | 'second_owes_first'
  | 'first_owes_second'
  | 'undetermined'

export interface SettlementResult {
  totals: SettlementTotal[]
  /**
   * Only meaningful when exactly two people have submitted entries, which is the product's
   * two-person model. `undetermined` covers the fictional/test cases of zero, one, or more
   * than two submitters, where "who owes whom" has no single answer.
   */
  netCents: number | null
  direction: SettlementDirection
}

function claimCentsFor(entry: SettlementEntry): number {
  const value = entry.amountCents * (1 - entry.share)
  return value < 0 ? -Math.floor(Math.abs(value) + 0.5 + Number.EPSILON) : Math.floor(value + 0.5 + Number.EPSILON)
}

export function computeSettlement(entries: SettlementEntry[]): SettlementResult {
  const bySubmitter = new Map<string, SettlementTotal>()

  for (const entry of entries) {
    const existing = bySubmitter.get(entry.submittedBy) ?? {
      submittedBy: entry.submittedBy,
      paidCents: 0,
      claimCents: 0,
    }
    existing.paidCents += entry.amountCents
    existing.claimCents += claimCentsFor(entry)
    bySubmitter.set(entry.submittedBy, existing)
  }

  // Stable order: first-seen submitter first, so netCents' sign has a fixed meaning
  // across repeated calls with the same entries in the same order.
  const totals = [...bySubmitter.values()]

  if (totals.length !== 2) {
    return { totals, netCents: null, direction: 'undetermined' }
  }

  const first = totals[0]
  const second = totals[1]
  if (!first || !second) {
    // Unreachable given the length check above; satisfies noUncheckedIndexedAccess.
    return { totals, netCents: null, direction: 'undetermined' }
  }
  const net = first.claimCents - second.claimCents

  return {
    totals,
    netCents: Math.abs(net),
    direction: net === 0 ? 'square' : net > 0 ? 'second_owes_first' : 'first_owes_second',
  }
}
