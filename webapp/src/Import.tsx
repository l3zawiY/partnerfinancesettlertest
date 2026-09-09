import { useState } from 'react'
import { balanceViolations, EXCLUDE_DEFAULT, parsePaste, type EngineRow } from '../shared/engine'
import { mergeImport } from '../shared/importMerge'
import { applyRules, countOccurrences, rememberRule, type MerchantRule } from '../shared/rules'
import { toLedgerRow, type LedgerRow } from '../shared/refunds'

/**
 * Batch 4a ported the parser; Batch 4b adds the rest of "Import": dedup against what is
 * already on the ledger, merchant rules, refund pairing, and a review screen to decide
 * shares. Everything here is local React state — there is no persistence across a reload
 * yet (autosave/session loading is Batch 4c), and there is deliberately still no submit
 * button. Amazon order matching is also Batch 4c; nothing here reads or writes Amazon data.
 */

function promoteToLedger(row: EngineRow | LedgerRow): LedgerRow {
  return 'creditKind' in row ? (row as LedgerRow) : toLedgerRow(row)
}

interface MergeSummary {
  added: number
  existingDupes: number
  pasteDupes: number
  postedUpgrades: number
  outOfPeriod: number
}

function defaultPeriod(): string {
  return new Date().toISOString().slice(0, 7)
}

function shareLabel(row: LedgerRow): string {
  if (row.share === null) return 'Excluded'
  if (row.share === 1) return 'Private'
  if (row.share === 0) return 'Fully shared'
  return 'Shared ' + Math.round((1 - row.share) * 100) + '%'
}

/**
 * A credit row is never manually decided — pairRefunds() always resolves it, either by
 * inheriting the matched charge's share or by excluding it (share: null), matching v1's
 * `reviewProvenance`/allocation text at index.html:2280 and :2360-2363. Offering 50/50 or
 * Private buttons on a credit row, as an earlier version of this component did, implied a
 * decision the review model doesn't actually let a person make.
 */
function creditTreatment(row: LedgerRow): string {
  if (row.creditKind === 'non-spending') return 'Excluded: cashback and rewards are not expenditure.'
  if (row.pairedLabel) {
    return row.partialRefund
      ? 'Offsets part of the matched purchase using its split.'
      : 'Offsets the matched purchase using its split.'
  }
  if (row.creditKind === 'ambiguous') return 'Excluded until one matching purchase is clear.'
  return 'Excluded because no confident purchase match was found.'
}

export default function Import() {
  const [bank, setBank] = useState<'td' | 'bmo' | 'generic'>('td')
  const [card, setCard] = useState('TD Visa')
  const [period, setPeriod] = useState(defaultPeriod())
  const [text, setText] = useState('')
  const [parseError, setParseError] = useState<string | null>(null)
  const [summary, setSummary] = useState<MergeSummary | null>(null)
  const [ledger, setLedger] = useState<LedgerRow[]>([])
  const [rules, setRules] = useState<MerchantRule[]>([])
  const [customShareDraft, setCustomShareDraft] = useState<Record<string, string>>({})
  const [rememberDraft, setRememberDraft] = useState<Record<string, boolean>>({})

  function handleParse(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setParseError(null)

    if (!text.trim()) {
      setParseError('Paste a statement first.')
      return
    }

    const today = new Date().toISOString().slice(0, 10)
    const parsed = parsePaste(text, bank, {
      year: +period.slice(0, 4) || new Date().getUTCFullYear(),
      today,
      card: card.trim() || 'Card',
      excludes: EXCLUDE_DEFAULT,
    })

    const violations = balanceViolations(parsed.rows)
    if (violations.length > 0) {
      setParseError(
        'Refused: ' +
          violations.length +
          ' row(s) have an amount identical to the running balance — the columns were ' +
          'likely misread. Nothing was added. Re-copy the table without reformatting it.',
      )
      return
    }
    if (bank === 'td' && !parsed.tabs) {
      setParseError(
        'Refused: no tab characters found. TD needs the tab-separated copy straight from ' +
          'the page — without columns there is no way to tell the amount from the running balance.',
      )
      return
    }

    const merged = mergeImport(ledger, parsed.rows, period)
    const promoted = merged.txns.map(promoteToLedger)
    const counted = countOccurrences(promoted)
    const decided = applyRules(counted, rules, 0, 1)

    setLedger(decided)
    setSummary({
      added: merged.added,
      existingDupes: merged.existingDupes,
      pasteDupes: merged.pasteDupes,
      postedUpgrades: merged.postedUpgrades,
      outOfPeriod: merged.outOfPeriod.length,
    })
    setText('')
  }

  function decide(rowId: string, share: number) {
    const row = ledger.find((r) => r.id === rowId)
    if (!row) return

    let nextRules = rules
    if (rememberDraft[rowId]) {
      nextRules = rememberRule(rules, row, share)
      setRules(nextRules)
    }

    const withDecision = ledger.map((r) =>
      r.id === rowId ? { ...r, share, decided: true, auto: false } : r,
    )
    setLedger(applyRules(withDecision, nextRules, 0, 1))
    setCustomShareDraft((prev) => ({ ...prev, [rowId]: '' }))
  }

  function applyCustomShare(rowId: string) {
    const raw = customShareDraft[rowId]
    const value = Number(raw)
    if (!raw || !Number.isFinite(value) || value < 0 || value > 1) return
    decide(rowId, value)
  }

  const undecidedCount = ledger.filter((r) => !r.decided).length

  return (
    <div className="entries-panel">
      <p className="lede" style={{ margin: '0 0 14px', fontSize: 14 }}>
        Paste a statement below. Parsing, deduplication, rules, and refund pairing all
        happen on this device only — nothing here is sent anywhere. This ledger lives in
        memory only and is lost on reload; saving a draft is not built yet.
      </p>
      <form className="entry-form" onSubmit={handleParse}>
        <select value={bank} onChange={(event) => setBank(event.target.value as typeof bank)}>
          <option value="td">TD</option>
          <option value="bmo">BMO</option>
          <option value="generic">Generic / other</option>
        </select>
        <input
          type="text"
          placeholder="Card label (e.g. TD Visa)"
          value={card}
          onChange={(event) => setCard(event.target.value)}
        />
        <input
          type="month"
          value={period}
          onChange={(event) => setPeriod(event.target.value || defaultPeriod())}
        />
        <textarea
          rows={8}
          placeholder="Paste statement text here"
          value={text}
          onChange={(event) => setText(event.target.value)}
        />
        <button className="primary-button" type="submit">
          Parse and merge into ledger
        </button>
        {parseError ? <p className="status status-error">{parseError}</p> : null}
      </form>

      {summary ? (
        <p className="settlement-summary" style={{ marginBottom: 14 }}>
          Added {summary.added}, {summary.existingDupes} already on the ledger,{' '}
          {summary.pasteDupes} repeated within the paste, {summary.postedUpgrades} pending
          rows upgraded to posted, {summary.outOfPeriod} outside {period}.
        </p>
      ) : null}

      {ledger.length === 0 ? (
        <p className="status status-pending">No rows on the ledger yet.</p>
      ) : (
        <>
          <p className="household-meta" style={{ marginBottom: 8 }}>
            {ledger.length} row{ledger.length === 1 ? '' : 's'}, {undecidedCount} undecided
          </p>
          <ul className="entry-list ledger-list">
            {ledger
              .slice()
              .sort((a, b) => (a.date < b.date ? 1 : -1))
              .map((row) => (
                <li key={row.id} className="ledger-row">
                  <div className="ledger-row-main">
                    <span>
                      {row.date} · {row.merchant}
                      <span className="household-meta"> {row.category}</span>
                      {row.amount < 0 && row.pairedLabel ? (
                        <span className="household-meta">
                          {' '}
                          · refund of {row.pairedLabel}
                          {row.weakPair ? ' (weak match)' : ''}
                        </span>
                      ) : null}
                    </span>
                    <span>
                      {row.amount < 0 ? '-' : ''}${Math.abs(row.amount).toFixed(2)}
                    </span>
                  </div>
                  {row.amount < 0 ? (
                    // A credit is never manually decided — pairRefunds() already resolved
                    // it, either by inheriting its matched charge's split or by excluding
                    // it. Offering decide buttons here would suggest a choice the review
                    // model doesn't give a person on a credit row.
                    <p className="household-meta ledger-row-credit">{creditTreatment(row)}</p>
                  ) : (
                    <div className="ledger-row-decision">
                      <span className={row.decided ? 'status-success' : 'status-pending'}>
                        {shareLabel(row)}
                        {row.auto ? ' (auto)' : ''}
                      </span>
                      <button type="button" onClick={() => decide(row.id, 0.5)}>
                        50/50
                      </button>
                      <button type="button" onClick={() => decide(row.id, 1)}>
                        Private
                      </button>
                      <input
                        type="number"
                        min="0"
                        max="1"
                        step="0.05"
                        placeholder="share"
                        value={customShareDraft[row.id] ?? ''}
                        onChange={(event) =>
                          setCustomShareDraft((prev) => ({ ...prev, [row.id]: event.target.value }))
                        }
                      />
                      <button type="button" onClick={() => applyCustomShare(row.id)}>
                        Apply
                      </button>
                      <label>
                        <input
                          type="checkbox"
                          checked={!!rememberDraft[row.id]}
                          onChange={(event) =>
                            setRememberDraft((prev) => ({ ...prev, [row.id]: event.target.checked }))
                          }
                        />
                        remember
                      </label>
                    </div>
                  )}
                </li>
              ))}
          </ul>
        </>
      )}
    </div>
  )
}
