/**
 * A pure port of the deduplication and period-filtering core of index.html's `doImport()`.
 * That function is entangled with the DOM (`$("#pasteBox")`, building result HTML,
 * `renderAll()`), so unlike `engine.ts` and `rules.ts` there is no way to load the real
 * function into a sandbox and run it standalone — the computation and the rendering are
 * one function in v1. This module is the computation half, lifted out by hand rather than
 * by an automatic parity check, so it is covered by direct unit tests
 * (`importMerge.test.ts`) reasoning about each case explicitly instead.
 *
 * The logic itself — same id twice within one paste is a paste duplicate, same id already
 * on the ledger is a duplicate unless the existing row was pending and the new one isn't
 * (a posted upgrade), everything else outside the period is set aside rather than
 * dropped — is unchanged from `doImport`.
 */

import { periodBounds, type EngineRow } from './engine'

const POSTED_UPGRADE_FIELDS = [
  'raw',
  'merchant',
  'key',
  'family',
  'category',
  'processor',
  'city',
  'bank',
  'bnpl',
  'subscription',
  'refund',
  'large',
] as const

export interface ImportMergeResult {
  /** Existing rows plus newly added and posted-upgraded rows; unmatched existing rows pass through untouched. */
  txns: EngineRow[]
  outOfPeriod: EngineRow[]
  added: number
  addedNet: number
  existingDupes: number
  pasteDupes: number
  postedUpgrades: number
}

export function mergeImport(
  existingTxns: EngineRow[],
  parsedRows: EngineRow[],
  period: string,
): ImportMergeResult {
  const bounds = periodBounds(period)
  const inPeriod: EngineRow[] = []
  const outOfPeriod: EngineRow[] = []
  for (const r of parsedRows) {
    if (r.date >= bounds.start && r.date <= bounds.end) inPeriod.push(r)
    else outOfPeriod.push(r)
  }

  const byId = new Map<string, EngineRow>(
    existingTxns.map(function (t) {
      return [t.id, { ...t }]
    }),
  )
  const seenPaste = new Set<string>()
  let added = 0
  let addedNet = 0
  let existingDupes = 0
  let pasteDupes = 0
  let postedUpgrades = 0

  for (const t of inPeriod) {
    if (seenPaste.has(t.id)) {
      pasteDupes++
      continue
    }
    seenPaste.add(t.id)

    const existing = byId.get(t.id)
    if (existing) {
      if (existing.pending && !t.pending) {
        const keep: EngineRow = { ...existing }
        for (const field of POSTED_UPGRADE_FIELDS) {
          ;(keep as unknown as Record<string, unknown>)[field] = (t as unknown as Record<string, unknown>)[field]
        }
        keep.pending = false
        byId.set(t.id, keep)
        postedUpgrades++
      } else {
        existingDupes++
      }
      continue
    }

    byId.set(t.id, { ...t })
    added++
    addedNet += t.amount
  }

  return {
    txns: [...byId.values()],
    outOfPeriod,
    added,
    addedNet,
    existingDupes,
    pasteDupes,
    postedUpgrades,
  }
}
