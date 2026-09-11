import { useEffect, useMemo, useState } from 'react'
import {
  amazonConfirmationConflict,
  matchAmazonOrders,
  parseAmazonOrders,
  type AmazonContext,
  type AmazonDecision,
} from '../shared/amazon'
import { correctLedgerAmount } from '../shared/amountCorrection'
import { balanceViolations, EXCLUDE_DEFAULT, parsePaste, type CoverageRange, type EngineRow, type TdBlock } from '../shared/engine'
import { buildSharedExport } from '../shared/formats'
import { mergeImport } from '../shared/importMerge'
import { toLedgerRow, type LedgerRow } from '../shared/refunds'
import { applyRules, countOccurrences, rememberRule, removeRule, type MerchantRule } from '../shared/rules'
import { createSessionSnapshot, deleteScopedPrivateDraft, emptyAmazonContext, readSession, WEBAPP_TOOL_VERSION, type PrivateSessionState } from '../shared/session'

export interface MergeSummary {
  added: number
  existingDupes: number
  pasteDupes: number
  postedUpgrades: number
  outOfPeriod: number
}

function promote(row: EngineRow | LedgerRow): LedgerRow {
  return 'creditKind' in row ? row as LedgerRow : toLedgerRow(row)
}

export function defaultPeriod(): string { return new Date().toISOString().slice(0, 7) }

export function downloadJson(name: string, value: unknown): void {
  const blob = new Blob([JSON.stringify(value, null, 2)], { type: 'application/json' })
  const anchor = document.createElement('a')
  anchor.href = URL.createObjectURL(blob)
  anchor.download = name
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  window.setTimeout(function () { URL.revokeObjectURL(anchor.href) }, 1000)
}

function safeFilePart(value: string): string { return value.toLowerCase().replace(/\W+/g, '') || 'owner' }

export function usePrivateWorkspace(scopeKey: string) {
  const [bank, setBank] = useState<'td' | 'bmo' | 'generic'>('td')
  const [card, setCard] = useState('TD Visa')
  const [knownCards, setKnownCards] = useState<string[]>(['TD Visa'])
  const [period, setPeriodState] = useState(defaultPeriod())
  const [names, setNames] = useState<[string, string]>(['Me', 'Partner'])
  const [meIndex, setMeIndex] = useState(0)
  const [text, setText] = useState('')
  const [parseError, setParseError] = useState<string | null>(null)
  const [summary, setSummary] = useState<MergeSummary | null>(null)
  const [ledger, setLedger] = useState<LedgerRow[]>([])
  const [rules, setRules] = useState<MerchantRule[]>([])
  const [ranges, setRanges] = useState<CoverageRange[]>([])
  const [blocks, setBlocks] = useState<TdBlock[]>([])
  const [threshold, setThresholdState] = useState(0)
  const [defaultUnknown, setDefaultUnknownState] = useState(1)
  const [excludePatterns, setExcludePatterns] = useState<string[]>(EXCLUDE_DEFAULT)
  const [amazonText, setAmazonText] = useState('')
  const [amazonContext, setAmazonContext] = useState<AmazonContext>(emptyAmazonContext)
  const [message, setMessage] = useState('Loading this browser\'s private draft…')
  const [hydrated, setHydrated] = useState(false)
  const [groupBy, setGroupBy] = useState<'day' | 'merchant'>('day')
  const [onlyUndecided, setOnlyUndecided] = useState(false)
  const [confirmedTotals, setConfirmedTotals] = useState(false)

  const amazonMatches = useMemo(function () {
    return matchAmazonOrders(ledger, amazonContext.orders)
  }, [ledger, amazonContext.orders])

  function sessionState(): PrivateSessionState {
    return {
      period, names, meIndex,
      cards: Array.from(new Set([card].concat(knownCards).concat(ledger.map(function (row) { return row.card }))).values()).filter(Boolean),
      threshold, defaultUnknown, rules, excludePatterns, txns: ledger, ranges, blocks,
      amazonContext, view: { groupBy, onlyUndecided, cursor: 0 }, confirmedTotals,
    }
  }

  function loadState(loaded: PrivateSessionState): void {
    setPeriodState(loaded.period)
    setNames(loaded.names)
    setMeIndex(loaded.meIndex)
    setKnownCards(loaded.cards.length ? loaded.cards : ['TD Visa'])
    setCard(loaded.cards[0] || 'TD Visa')
    setThresholdState(loaded.threshold)
    setDefaultUnknownState(loaded.defaultUnknown)
    setExcludePatterns(loaded.excludePatterns.length ? loaded.excludePatterns : EXCLUDE_DEFAULT)
    setRules(loaded.rules)
    setLedger(applyRules(countOccurrences(loaded.txns), loaded.rules, loaded.threshold, loaded.defaultUnknown))
    setRanges(loaded.ranges)
    setBlocks(loaded.blocks)
    setAmazonContext(loaded.amazonContext)
    setGroupBy(loaded.view?.groupBy || 'day')
    setOnlyUndecided(loaded.view?.onlyUndecided === true)
    setConfirmedTotals(loaded.confirmedTotals === true)
    setSummary(null)
  }

  useEffect(function () {
    try {
      const raw = window.localStorage.getItem(scopeKey)
      if (raw) {
        const loaded = readSession(JSON.parse(raw))
        if (loaded) { loadState(loaded); setMessage('Private draft restored from this browser.') }
        else setMessage('Saved data was unreadable; a fresh private draft opened.')
      } else setMessage('No saved private draft for this account and household yet.')
    } catch { setMessage('Browser storage could not be read; use a private session download as backup.') }
    setHydrated(true)
  }, [scopeKey])

  useEffect(function () {
    if (!hydrated) return
    const timer = window.setTimeout(function () {
      try {
        window.localStorage.setItem(scopeKey, JSON.stringify(createSessionSnapshot(sessionState())))
        setMessage('Private draft auto-saved in this browser.')
      } catch { setMessage('Auto-save is unavailable; download a private session file to keep this work.') }
    }, 150)
    return function () { window.clearTimeout(timer) }
  }, [amazonContext, blocks, card, confirmedTotals, defaultUnknown, excludePatterns, groupBy, hydrated, knownCards, ledger, meIndex, names, onlyUndecided, period, ranges, rules, scopeKey, threshold])

  function setPeriod(next: string): void {
    if (!/^\d{4}-\d{2}$/.test(next) || next === period) return
    if (ledger.length && !window.confirm('Start ' + next + ' with a clean monthly workspace? Names, cards, and rules stay.')) return
    setPeriodState(next); setLedger([]); setRanges([]); setBlocks([]); setAmazonContext(emptyAmazonContext()); setConfirmedTotals(false); setSummary(null)
  }

  function parse(): boolean {
    setParseError(null)
    if (!text.trim()) { setParseError('Paste a statement first.'); return false }
    const cardLabel = card.trim() || 'Card'
    const parsed = parsePaste(text, bank, { year: +period.slice(0, 4), today: new Date().toISOString().slice(0, 10), card: cardLabel, excludes: excludePatterns })
    const violations = balanceViolations(parsed.rows)
    if (violations.length) { setParseError('Import refused: an amount matches TD\'s running balance. Re-copy the original columns.'); return false }
    if (bank === 'td' && !parsed.tabs) { setParseError('Import refused: TD statement text must retain tab-separated columns.'); return false }
    const merged = mergeImport(ledger, parsed.rows, period)
    const next = applyRules(countOccurrences(merged.txns.map(promote)), rules, threshold, defaultUnknown)
    setLedger(next); setKnownCards(function (current) { return Array.from(new Set(current.concat(cardLabel))) })
    setRanges(function (current) { return current.concat(parsed.ranges) }); setBlocks(function (current) { return current.concat(parsed.blocks) })
    setSummary({ added: merged.added, existingDupes: merged.existingDupes, pasteDupes: merged.pasteDupes, postedUpgrades: merged.postedUpgrades, outOfPeriod: merged.outOfPeriod.length })
    setText(''); setConfirmedTotals(false); return true
  }

  function decide(rowId: string, share: number, remember = false): void {
    const row = ledger.find(function (candidate) { return candidate.id === rowId })
    if (!row || row.amount < 0) return
    const nextRules = remember ? rememberRule(rules, row, share) : rules
    setRules(nextRules)
    const decided = ledger.map(function (candidate) { return candidate.id === rowId ? { ...candidate, share, decided: true, auto: false } : candidate })
    setLedger(applyRules(decided, nextRules, threshold, defaultUnknown)); setConfirmedTotals(false)
  }

  function forgetRule(rule: MerchantRule): void {
    const next = removeRule(rules, rule); setRules(next); setLedger(applyRules(ledger, next, threshold, defaultUnknown))
  }

  function reapplyRules(): void {
    setLedger(applyRules(countOccurrences(ledger), rules, threshold, defaultUnknown))
    setConfirmedTotals(false)
  }

  function setThreshold(value: number): void {
    const next = Number.isFinite(value) && value >= 0 ? value : 0
    setThresholdState(next); setLedger(applyRules(ledger, rules, next, defaultUnknown))
  }

  function setDefaultUnknown(value: number): void {
    const next = value === 0.5 ? 0.5 : 1
    setDefaultUnknownState(next); setLedger(applyRules(ledger, rules, threshold, next))
  }

  function correctAmount(rowId: string, value: number): void {
    setLedger(correctLedgerAmount(ledger, rowId, value)); setConfirmedTotals(false)
  }

  function parseAmazon(): void {
    if (!amazonText.trim()) { setMessage('Paste fictional Amazon order text first.'); return }
    const parsed = parseAmazonOrders(amazonText)
    if (!parsed.orders.length) { setMessage('No complete Amazon orders were found; nothing changed.'); return }
    setAmazonContext({ ...parsed, decisions: {} }); setAmazonText(''); setMessage('Normalized Amazon evidence saved privately; raw paste discarded.')
  }

  function setAmazonDecision(rowId: string, decision?: AmazonDecision): void {
    setAmazonContext(function (current) {
      const decisions = { ...current.decisions }; if (decision) decisions[rowId] = decision; else delete decisions[rowId]
      return { ...current, decisions }
    })
  }

  function confirmAmazon(rowId: string, orderId: string): void {
    if (amazonConfirmationConflict(rowId, orderId, amazonMatches, amazonContext.decisions)) { setMessage('That fictional order is already confirmed for another charge.'); return }
    setAmazonDecision(rowId, { status: 'confirmed', orderId })
  }

  function projection() {
    return buildSharedExport({ toolVersion: WEBAPP_TOOL_VERSION, period, owner: (names[meIndex] || 'Me').trim() || 'Me', txns: ledger })
  }

  function saveSession(): void { downloadJson('split-session-' + period + '.json', createSessionSnapshot(sessionState())) }
  async function loadSession(file: File): Promise<void> {
    try { const loaded = readSession(JSON.parse(await file.text())); if (!loaded) throw new Error(); loadState(loaded); setMessage('Private session loaded and auto-save resumed.') }
    catch { setMessage('That file is not a readable Split Ledger private session; nothing changed.') }
  }
  function saveShared(): void { const value = projection(); downloadJson('split-' + period + '-' + safeFilePart(value.owner) + '.json', value) }

  function erasePrivateDraft(): void {
    deleteScopedPrivateDraft(window.localStorage, scopeKey)
    setHydrated(false)
    setLedger([]); setRules([]); setRanges([]); setBlocks([]); setAmazonContext(emptyAmazonContext())
    setKnownCards(['TD Visa']); setCard('TD Visa'); setNames(['Me', 'Partner']); setMeIndex(0)
    setThresholdState(0); setDefaultUnknownState(1); setExcludePatterns(EXCLUDE_DEFAULT)
    setText(''); setAmazonText(''); setConfirmedTotals(false); setSummary(null); setParseError(null)
    setMessage('This account-and-household private draft was deleted from this browser. Auto-save is paused until reload.')
  }

  const posted = ledger.filter(function (row) { return row.amount > 0 && !row.pending })
  const undecidedCount = posted.filter(function (row) { return !row.decided }).length
  return {
    bank, setBank, card, setCard, knownCards, setKnownCards, period, setPeriod, names, setNames, meIndex, setMeIndex,
    text, setText, parseError, summary, ledger, rules, ranges, blocks, threshold, setThreshold,
    defaultUnknown, setDefaultUnknown, excludePatterns, setExcludePatterns, amazonText, setAmazonText,
    amazonContext, setAmazonContext, amazonMatches, message, groupBy, setGroupBy, onlyUndecided,
    setOnlyUndecided, confirmedTotals, setConfirmedTotals, postedCount: posted.length, undecidedCount,
    parse, decide, forgetRule, reapplyRules, correctAmount, parseAmazon, setAmazonDecision, confirmAmazon,
    projection, saveSession, loadSession, saveShared, erasePrivateDraft,
  }
}

export type PrivateWorkspace = ReturnType<typeof usePrivateWorkspace>
