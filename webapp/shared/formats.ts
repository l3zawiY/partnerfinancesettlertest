import { amountEdited } from './amountCorrection'
import { centsToDollars, claimCents, dollarsToCents } from './money'
import type { LedgerRow } from './refunds'

export interface SharedExportItem {
  date: string
  merchant: string
  category: string
  amount: number
  share: number
  edited?: true
}

export interface SharedExport {
  format: 'split-ledger/v1'
  toolVersion: string
  period: string
  owner: string
  generated: string
  items: SharedExportItem[]
  totals: { sharedPaidByOwner: number }
}

export interface ArchiveItem {
  date: string
  merchant: string
  category: string
  amount: number
  payer: 'a' | 'b'
  shareOfPayer: number
  owedToPayer: number
}

export interface MonthArchive {
  format: 'split-ledger-archive/v1'
  period: string
  closed: string
  toolVersion: string
  people: { a: string; b: string }
  settlement: {
    aPaidShared: number
    bPaidShared: number
    aClaim: number
    bClaim: number
    net: number
    direction: 'b_owes_a' | 'a_owes_b' | 'square'
  }
  items: ArchiveItem[]
}

/**
 * Portable recovery for shared, already-closed household records. Open work is excluded:
 * each person can safely resubmit an open privacy-filtered projection after recovery.
 */
export interface HouseholdArchiveBundle {
  format: 'split-ledger-household-archive/v1'
  generated: string
  archives: MonthArchive[]
}

type ExportableRow = Pick<
  LedgerRow,
  'date' | 'merchant' | 'category' | 'amount' | 'share' | 'decided' | 'pending' | 'originalAmount'
>

export function sharedItems(txns: ExportableRow[]): (ExportableRow & { share: number })[] {
  return txns.filter(function (t): t is ExportableRow & { share: number } {
    return t.decided && t.share !== null && t.share < 1 && !t.pending
  })
}

/** Public outputs are constructed from an allowlist, never by redacting a private row. */
export function sharedExportItem(t: ExportableRow & { share: number }): SharedExportItem {
  const out: SharedExportItem = {
    date: t.date,
    merchant: t.merchant,
    category: t.category,
    amount: centsToDollars(dollarsToCents(t.amount)),
    share: t.share,
  }
  if (amountEdited(t)) out.edited = true
  return out
}

export function buildSharedExport(input: {
  toolVersion: string
  period: string
  owner: string
  generated?: string
  txns: ExportableRow[]
}): SharedExport {
  const items = sharedItems(input.txns).map(sharedExportItem)
  return {
    format: 'split-ledger/v1',
    toolVersion: input.toolVersion,
    period: input.period,
    owner: input.owner,
    generated: input.generated || new Date().toISOString(),
    items,
    totals: {
      sharedPaidByOwner: centsToDollars(items.reduce(function (sum, item) {
        return sum + dollarsToCents(item.amount)
      }, 0)),
    },
  }
}

function archiveOutputItem(
  t: Pick<SharedExportItem, 'date' | 'merchant' | 'category' | 'amount'>,
  payer: 'a' | 'b',
  share: number,
): ArchiveItem {
  return {
    date: t.date,
    merchant: t.merchant,
    category: t.category,
    amount: centsToDollars(dollarsToCents(t.amount)),
    payer,
    shareOfPayer: share,
    owedToPayer: centsToDollars(claimCents(t.amount, share)),
  }
}

/**
 * Pure archive serializer for Batch 5's close workflow. Batch 4c proves the frozen
 * format now, but does not pretend a month can be closed before partner workflow exists.
 */
export function buildMonthArchive(input: {
  toolVersion: string
  period: string
  closed?: string
  people: { a: string; b: string }
  mine: SharedExportItem[]
  theirs: SharedExportItem[]
}): MonthArchive {
  const aClaimCents = input.mine.reduce(function (sum, item) {
    return sum + claimCents(item.amount, item.share)
  }, 0)
  const bClaimCents = input.theirs.reduce(function (sum, item) {
    return sum + claimCents(item.amount, item.share)
  }, 0)
  const netCents = aClaimCents - bClaimCents
  const items = input.mine
    .map(function (item) {
      return archiveOutputItem(item, 'a', item.share)
    })
    .concat(
      input.theirs.map(function (item) {
        return archiveOutputItem(
          { ...item, category: item.category || 'Uncategorised' },
          'b',
          item.share,
        )
      }),
    )
    .sort(function (a, b) {
      return a.date < b.date ? -1 : 1
    })

  return {
    format: 'split-ledger-archive/v1',
    period: input.period,
    closed: input.closed || new Date().toISOString(),
    toolVersion: input.toolVersion,
    people: input.people,
    settlement: {
      aPaidShared: centsToDollars(input.mine.reduce(function (sum, item) { return sum + dollarsToCents(item.amount) }, 0)),
      bPaidShared: centsToDollars(input.theirs.reduce(function (sum, item) { return sum + dollarsToCents(item.amount) }, 0)),
      aClaim: centsToDollars(aClaimCents),
      bClaim: centsToDollars(bClaimCents),
      net: centsToDollars(Math.abs(netCents)),
      direction: netCents === 0 ? 'square' : netCents > 0 ? 'b_owes_a' : 'a_owes_b',
    },
    items,
  }
}

export function buildHouseholdArchiveBundle(
  archives: MonthArchive[],
  generated = new Date().toISOString(),
): HouseholdArchiveBundle {
  return {
    format: 'split-ledger-household-archive/v1',
    generated,
    archives: archives.slice().sort(function (a, b) {
      return a.period.localeCompare(b.period)
    }),
  }
}

function finiteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

export function isMonthArchive(value: unknown): value is MonthArchive {
  if (!value || typeof value !== 'object') return false
  const archive = value as Record<string, unknown>
  if (!Object.keys(archive).every(function (key) { return ['format', 'period', 'closed', 'toolVersion', 'people', 'settlement', 'items'].includes(key) })) return false
  if (
    archive.format !== 'split-ledger-archive/v1' ||
    typeof archive.period !== 'string' || !/^\d{4}-\d{2}$/.test(archive.period) ||
    typeof archive.closed !== 'string' || Number.isNaN(Date.parse(archive.closed)) ||
    typeof archive.toolVersion !== 'string' || archive.toolVersion.length > 40 ||
    !archive.people || typeof archive.people !== 'object' ||
    !archive.settlement || typeof archive.settlement !== 'object' ||
    !Array.isArray(archive.items) || archive.items.length > 10_000
  ) return false
  const people = archive.people as Record<string, unknown>
  if (!Object.keys(people).every(function (key) { return key === 'a' || key === 'b' }) || typeof people.a !== 'string' || !people.a.trim() || people.a.length > 100 || typeof people.b !== 'string' || !people.b.trim() || people.b.length > 100) return false
  const settlement = archive.settlement as Record<string, unknown>
  if (!Object.keys(settlement).every(function (key) { return ['aPaidShared', 'bPaidShared', 'aClaim', 'bClaim', 'net', 'direction'].includes(key) })) return false
  if (!['b_owes_a', 'a_owes_b', 'square'].includes(String(settlement.direction))) return false
  if (!['aPaidShared', 'bPaidShared', 'aClaim', 'bClaim', 'net'].every(function (key) {
    return finiteNumber(settlement[key])
  })) return false
  return archive.items.every(function (value) {
    if (!value || typeof value !== 'object') return false
    const item = value as Record<string, unknown>
    return Object.keys(item).every(function (key) { return ['date', 'merchant', 'category', 'amount', 'payer', 'shareOfPayer', 'owedToPayer'].includes(key) }) &&
      typeof item.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(item.date) && item.date.startsWith(String(archive.period) + '-') &&
      typeof item.merchant === 'string' && !!item.merchant.trim() && item.merchant.length <= 200 &&
      typeof item.category === 'string' && item.category.length <= 100 && (item.payer === 'a' || item.payer === 'b') &&
      finiteNumber(item.amount) && Math.abs(item.amount) <= 10_000_000 && centsToDollars(dollarsToCents(item.amount)) === item.amount && finiteNumber(item.shareOfPayer) &&
      item.shareOfPayer >= 0 && item.shareOfPayer < 1 && finiteNumber(item.owedToPayer)
  })
}

export function isHouseholdArchiveBundle(value: unknown): value is HouseholdArchiveBundle {
  if (!value || typeof value !== 'object') return false
  const bundle = value as Record<string, unknown>
  if (!Object.keys(bundle).every(function (key) { return ['format', 'generated', 'archives'].includes(key) }) || bundle.format !== 'split-ledger-household-archive/v1' || typeof bundle.generated !== 'string' || Number.isNaN(Date.parse(bundle.generated)) || !Array.isArray(bundle.archives) || bundle.archives.length > 1200) return false
  if (!bundle.archives.every(isMonthArchive)) return false
  return new Set(bundle.archives.map(function (archive) { return archive.period })).size === bundle.archives.length
}
