import { amazonSessionContext, type AmazonContext } from './amazon'
import type { CoverageRange, TdBlock } from './engine'
import type { LedgerRow } from './refunds'
import type { MerchantRule } from './rules'

export const SESSION_FORMAT = 'split-ledger-session/v3' as const
export const WEBAPP_TOOL_VERSION = '0.0.0-experiment'

export interface PrivateSessionState {
  period: string
  names: [string, string]
  meIndex: number
  cards: string[]
  threshold: number
  defaultUnknown: number
  rules: MerchantRule[]
  excludePatterns: string[]
  txns: LedgerRow[]
  ranges: CoverageRange[]
  blocks: TdBlock[]
  amazonContext: AmazonContext
  view?: { groupBy: 'day' | 'merchant'; onlyUndecided: boolean; cursor: number }
  confirmedTotals?: boolean
}

export interface PrivateSessionFile extends Omit<PrivateSessionState, 'amazonContext'> {
  format: typeof SESSION_FORMAT
  version: string
  closedPeriods: Record<string, unknown>
  partner: null
  confirmedTotals: boolean
  view: { groupBy: 'day' | 'merchant'; onlyUndecided: boolean; cursor: number }
  amazonContext?: AmazonContext
}

export function emptyAmazonContext(): AmazonContext {
  return {
    orders: [],
    decisions: {},
    advertisedOrderCount: null,
    duplicateBlocks: 0,
    invalidBlocks: 0,
  }
}

export function draftStorageKey(userId: string, organizationId: string | null): string {
  return (
    'splitledger.webapp.v1.' +
    encodeURIComponent(userId) +
    '.' +
    encodeURIComponent(organizationId || 'no-organization')
  )
}

export function deleteScopedPrivateDraft(storage: { removeItem(key: string): void }, exactScopeKey: string): void {
  if (!exactScopeKey.startsWith('splitledger.webapp.v1.')) throw new Error('Refusing to delete an unrelated browser-storage key.')
  storage.removeItem(exactScopeKey)
}

export function createSessionSnapshot(state: PrivateSessionState): PrivateSessionFile {
  const out: PrivateSessionFile = {
    format: SESSION_FORMAT,
    version: WEBAPP_TOOL_VERSION,
    period: state.period,
    names: state.names,
    meIndex: state.meIndex,
    cards: state.cards,
    threshold: state.threshold,
    defaultUnknown: state.defaultUnknown,
    rules: state.rules,
    excludePatterns: state.excludePatterns,
    txns: state.txns,
    ranges: state.ranges,
    blocks: state.blocks,
    closedPeriods: {},
    partner: null,
    confirmedTotals: state.confirmedTotals === true,
    view: state.view || { groupBy: 'day', onlyUndecided: false, cursor: 0 },
  }
  if (state.amazonContext.orders.length) {
    const txnIds: Record<string, boolean> = {}
    state.txns.forEach(function (row) {
      txnIds[row.id] = true
    })
    out.amazonContext = amazonSessionContext(state.amazonContext, txnIds)
  }
  return out
}

function finiteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

function stringOrNull(value: unknown): string | null {
  return typeof value === 'string' ? value : null
}

function readLedgerRow(value: unknown): LedgerRow | null {
  if (!value || typeof value !== 'object') return null
  const row = value as Record<string, unknown>
  if (
    typeof row.id !== 'string' ||
    typeof row.date !== 'string' ||
    typeof row.raw !== 'string' ||
    typeof row.merchant !== 'string' ||
    typeof row.key !== 'string' ||
    typeof row.category !== 'string' ||
    !finiteNumber(row.amount) ||
    typeof row.bank !== 'string' ||
    typeof row.card !== 'string'
  )
    return null
  const share = row.share === null || finiteNumber(row.share) ? row.share : null
  if (share !== null && (share < 0 || share > 1)) return null
  return {
    id: row.id,
    date: row.date,
    raw: row.raw,
    merchant: row.merchant,
    key: row.key,
    family: stringOrNull(row.family),
    processor: stringOrNull(row.processor),
    city: stringOrNull(row.city),
    category: row.category,
    amount: row.amount,
    ...(finiteNumber(row.originalAmount) ? { originalAmount: row.originalAmount } : {}),
    bank: row.bank,
    card: row.card,
    balance: row.balance === null || finiteNumber(row.balance) ? row.balance : null,
    pending: row.pending === true,
    bnpl: row.bnpl === true,
    subscription: row.subscription === true,
    refund: row.refund === true,
    large: row.large === true,
    occurrences: finiteNumber(row.occurrences) ? Math.max(1, Math.floor(row.occurrences)) : 1,
    share,
    decided: row.decided === true,
    auto: row.auto === true,
    pairedWith: stringOrNull(row.pairedWith),
    creditKind: stringOrNull(row.creditKind),
    partialRefund: row.partialRefund === true,
    weakPair: typeof row.weakPair === 'boolean' ? row.weakPair : null,
    pairedLabel: stringOrNull(row.pairedLabel),
  }
}

function readRules(value: unknown): MerchantRule[] {
  if (!Array.isArray(value)) return []
  return value
    .map(function (entry): MerchantRule | null {
      if (!entry || typeof entry !== 'object') return null
      const rule = entry as Record<string, unknown>
      if (
        (rule.type !== 'family' && rule.type !== 'key') ||
        typeof rule.pattern !== 'string' ||
        typeof rule.label !== 'string' ||
        !finiteNumber(rule.share) ||
        rule.share < 0 ||
        rule.share > 1
      )
        return null
      return { type: rule.type, pattern: rule.pattern, label: rule.label, share: rule.share }
    })
    .filter(function (rule): rule is MerchantRule {
      return !!rule
    })
}

function readRanges(value: unknown): CoverageRange[] {
  if (!Array.isArray(value)) return []
  return value
    .map(function (entry): CoverageRange | null {
      if (!entry || typeof entry !== 'object') return null
      const range = entry as Record<string, unknown>
      if (typeof range.from !== 'string' || typeof range.to !== 'string') return null
      return { from: range.from, to: range.to, ...(range.inferred === true ? { inferred: true } : {}) }
    })
    .filter(function (range): range is CoverageRange {
      return !!range
    })
}

function readBlocks(value: unknown): TdBlock[] {
  if (!Array.isArray(value)) return []
  return value
    .map(function (entry): TdBlock | null {
      if (!entry || typeof entry !== 'object') return null
      const block = entry as Record<string, unknown>
      if (
        typeof block.from !== 'string' ||
        typeof block.to !== 'string' ||
        !finiteNumber(block.debit) ||
        !finiteNumber(block.credit) ||
        !finiteNumber(block.count)
      )
        return null
      return {
        from: block.from,
        to: block.to,
        debit: block.debit,
        credit: block.credit,
        statedDebit: finiteNumber(block.statedDebit) ? block.statedDebit : null,
        statedCredit: finiteNumber(block.statedCredit) ? block.statedCredit : null,
        count: Math.max(0, Math.floor(block.count)),
      }
    })
    .filter(function (block): block is TdBlock {
      return !!block
    })
}

/** Validate and migrate the subset of v1-v3 session state the web app currently owns. */
export function readSession(value: unknown): PrivateSessionState | null {
  if (!value || typeof value !== 'object') return null
  const source = value as Record<string, unknown>
  if (!/^split-ledger-session\/v[123]$/.test(typeof source.format === 'string' ? source.format : ''))
    return null
  const legacyNames = [
    typeof source.meName === 'string' ? source.meName : 'Me',
    typeof source.youName === 'string' ? source.youName : 'Partner',
  ]
  const sourceNames = Array.isArray(source.names) ? source.names : legacyNames
  const names: [string, string] = [
    typeof sourceNames[0] === 'string' && sourceNames[0].trim() ? sourceNames[0] : 'Me',
    typeof sourceNames[1] === 'string' && sourceNames[1].trim() ? sourceNames[1] : 'Partner',
  ]
  const txns = (Array.isArray(source.txns) ? source.txns : [])
    .map(readLedgerRow)
    .filter(function (row): row is LedgerRow {
      return !!row
    })
  const txnIds: Record<string, boolean> = {}
  txns.forEach(function (row) {
    txnIds[row.id] = true
  })
  return {
    period:
      typeof source.period === 'string' && /^\d{4}-\d{2}$/.test(source.period)
        ? source.period
        : new Date().toISOString().slice(0, 7),
    names,
    meIndex: source.meIndex === 1 ? 1 : 0,
    cards: Array.isArray(source.cards)
      ? source.cards.filter(function (card): card is string {
          return typeof card === 'string' && !!card.trim()
        })
      : [],
    threshold: finiteNumber(source.threshold) && source.threshold >= 0 ? source.threshold : 0,
    defaultUnknown:
      finiteNumber(source.defaultUnknown) && source.defaultUnknown >= 0 && source.defaultUnknown <= 1
        ? source.defaultUnknown
        : 1,
    rules: readRules(source.rules),
    excludePatterns: Array.isArray(source.excludePatterns)
      ? source.excludePatterns.filter(function (pattern): pattern is string {
          return typeof pattern === 'string'
        })
      : [],
    txns,
    ranges: readRanges(source.ranges),
    blocks: readBlocks(source.blocks),
    amazonContext: amazonSessionContext(source.amazonContext, txnIds),
    confirmedTotals: source.confirmedTotals === true,
    view: source.view && typeof source.view === 'object'
      ? {
          groupBy: (source.view as Record<string, unknown>).groupBy === 'merchant' ? 'merchant' : 'day',
          onlyUndecided: (source.view as Record<string, unknown>).onlyUndecided === true,
          cursor: finiteNumber((source.view as Record<string, unknown>).cursor)
            ? Math.max(0, Math.floor(Number((source.view as Record<string, unknown>).cursor))) : 0,
        }
      : { groupBy: 'day', onlyUndecided: false, cursor: 0 },
  }
}
