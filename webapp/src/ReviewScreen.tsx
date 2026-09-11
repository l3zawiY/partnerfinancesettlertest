import { useState } from 'react'
import { amountEdited, canEditAmount } from '../shared/amountCorrection'
import { hasRule, ruleFor } from '../shared/rules'
import AmazonEvidence from './AmazonEvidence'
import type { PrivateWorkspace } from './usePrivateWorkspace'

function money(value: number): string { return new Intl.NumberFormat('en-CA', { style: 'currency', currency: 'CAD' }).format(value) }
function shareLabel(row: PrivateWorkspace['ledger'][number]): string {
  if (!row.decided) return 'Needs a decision before this month can settle'
  if (row.share === null) return 'Excluded'
  if (row.share === 1) return 'Private'
  if (row.share === 0) return 'Partner bears all'
  return 'Shared ' + Math.round((1 - row.share) * 100) + '% to partner'
}
function creditTreatment(row: PrivateWorkspace['ledger'][number]): string {
  if (row.creditKind === 'non-spending') return 'Excluded: cashback and rewards are not expenditure.'
  if (row.pairedLabel) return (row.partialRefund ? 'Offsets part of ' : 'Offsets ') + row.pairedLabel + ' using its split.'
  if (row.creditKind === 'ambiguous') return 'Excluded until one matching purchase is clear.'
  return 'Excluded because no confident purchase match was found.'
}

const PRESETS = [{ label: 'Mine', share: 1 }, { label: '70/30', share: 0.7 }, { label: '50/50', share: 0.5 }, { label: '30/70', share: 0.3 }, { label: 'Theirs', share: 0 }]

export default function ReviewScreen({ workspace, onContinue }: { workspace: PrivateWorkspace; onContinue: () => void }) {
  const [custom, setCustom] = useState<Record<string, string>>({})
  const [correction, setCorrection] = useState<Record<string, string>>({})
  const [details, setDetails] = useState<Record<string, boolean>>({})
  const visible = workspace.ledger.filter(function (row) { return !workspace.onlyUndecided || (row.amount > 0 && !row.pending && !row.decided) }).slice().sort(function (a, b) { return a.date < b.date ? -1 : 1 })
  const groups = new Map<string, typeof visible>()
  visible.forEach(function (row) { const key = workspace.groupBy === 'merchant' ? row.key : row.date; groups.set(key, (groups.get(key) || []).concat(row)) })
  const decidedCount = workspace.postedCount - workspace.undecidedCount
  const percent = workspace.postedCount ? Math.round(decidedCount / workspace.postedCount * 100) : 0
  const shared = workspace.projection().items
  const sharedSpend = shared.reduce(function (sum, row) { return sum + row.amount }, 0)
  const currentClaim = shared.reduce(function (sum, row) { return sum + row.amount * (1 - row.share) }, 0)
  const privateCount = workspace.ledger.filter(function (row) { return row.amount > 0 && row.decided && row.share === 1 }).length
  return <section className="screen screen-frame review-page" aria-labelledby="review-title"><div className="review-grid"><main>
    <header className="review-heading"><div><p className="eyebrow">{workspace.period} · Review</p><h1 id="review-title" className="page-title">Review transactions</h1><p className="page-subtitle">Decide how each purchase should be shared between {workspace.names[0]} and {workspace.names[1]}.</p></div><div className="review-kpis" aria-label="Review progress"><div className="review-kpi"><strong>{decidedCount} <span>of {workspace.postedCount}</span></strong><small>decided</small></div><div className="review-kpi remaining"><strong>{workspace.undecidedCount}</strong><small>remaining</small></div></div></header>
    <div className="review-toolbar"><div className="review-toolbar-left"><div className="toggle-set" aria-label="Transaction grouping"><button aria-pressed={workspace.groupBy === 'day'} onClick={() => workspace.setGroupBy('day')}>Group by day</button><button aria-pressed={workspace.groupBy === 'merchant'} onClick={() => workspace.setGroupBy('merchant')}>Merchant</button></div><div className="toggle-set" aria-label="Transaction visibility"><button aria-pressed={workspace.onlyUndecided} onClick={() => workspace.setOnlyUndecided(true)}>Undecided {workspace.undecidedCount}</button><button aria-pressed={!workspace.onlyUndecided} onClick={() => workspace.setOnlyUndecided(false)}>All transactions</button></div></div><button className="toolbar-action" onClick={workspace.reapplyRules}>↻ Reapply rules</button></div>
    <div className="ledger-card"><div className="ledger-columns"><span>Transaction</span><span>Amount</span><span>Share between you</span><span /></div>{visible.length ? Array.from(groups.entries()).map(function ([key, rows]) { return <section className="ledger-group" key={key}><h2><span>{workspace.groupBy === 'merchant' ? rows[0]?.merchant : key}</span><small>{rows.length} row{rows.length === 1 ? '' : 's'}</small></h2>{rows.map(function (row) {
      const saved = hasRule(workspace.rules, row); const savedRule = ruleFor(workspace.rules, row); const open = details[row.id] === true
      return <article className={'txn ' + (!row.decided && row.amount > 0 ? 'undecided' : '')} key={row.id}>
        <div className="txn-copy"><strong className="merchant-name">{row.merchant}</strong><span className="txn-meta">{row.date} · {row.card} <span className="category-tag">{row.category}</span></span><span className={'allocation ' + (!row.decided ? 'warn-text' : '')}>{shareLabel(row)}{row.auto ? ' · automatic' : ''}</span>{amountEdited(row) ? <span className="tag">edited</span> : null}{saved && savedRule ? <button className="rule-chip" title="Forget this merchant rule" onClick={() => workspace.forgetRule(savedRule)}>✦ saved rule ×</button> : null}</div>
        <div className={row.amount < 0 ? 'money credit' : 'money'}>{money(row.amount)}</div>
        <div className="share-cell">{row.amount < 0 ? <p className="credit-treatment">{creditTreatment(row)}</p> : <><div className="share-presets">{PRESETS.map(function (preset) { return <button key={preset.label} aria-pressed={row.decided && row.share === preset.share} onClick={() => workspace.decide(row.id, preset.share)}>{preset.label}</button> })}</div><div className="custom-row"><label>Custom payer %<input aria-label={'Custom payer share for ' + row.merchant} type="number" min="0" max="100" value={custom[row.id] || ''} onChange={(event) => setCustom({ ...custom, [row.id]: event.target.value })} /></label><button onClick={() => { const value = Number(custom[row.id]); if (Number.isFinite(value) && value >= 0 && value <= 100) workspace.decide(row.id, value / 100) }}>Apply custom</button>{row.decided && !saved && !row.bnpl ? <button aria-label={'Remember this split for ' + row.merchant} onClick={() => workspace.decide(row.id, row.share as number, true)}>✦ Remember</button> : null}{row.bnpl ? <small>Instalments cannot create rules.</small> : null}</div></>}</div>
        <button className="details-toggle" aria-expanded={open} onClick={() => setDetails({ ...details, [row.id]: !open })}>Details</button>
        {open ? <div className="txn-detail"><div><span>Imported card</span><strong>{row.card}</strong></div><div><span>Category</span><strong>{row.category}</strong></div><div><span>Decision</span><strong>{shareLabel(row)}</strong></div></div> : null}
        {open && canEditAmount(row) ? <div className="correction"><span>Bank value {money(row.originalAmount ?? row.amount)}</span><input aria-label={'Corrected amount for ' + row.merchant} value={correction[row.id] || ''} onChange={(event) => setCorrection({ ...correction, [row.id]: event.target.value })} /><button onClick={() => { const value = Number(correction[row.id]); if (Number.isFinite(value) && Math.abs(value) >= .01) workspace.correctAmount(row.id, value) }}>Correct amount</button></div> : null}
        {open ? <AmazonEvidence row={row} workspace={workspace} /> : null}
      </article>
    })}</section> }) : <p className="empty">Nothing here yet. Import a card to begin Review.</p>}</div>
  </main><aside className="review-rail"><div className="review-rail-title"><span>Reconciliation</span><span aria-hidden="true">•••</span></div><section className="review-summary"><div className="progress-line"><span>Month progress</span><strong>{percent}%</strong></div><div className="progress-track" aria-label={percent + '% decided'}><i style={{ width: percent + '%' }} /></div><div className="progress-meta"><span>{decidedCount} of {workspace.postedCount} decided</span><span>{workspace.undecidedCount} remaining</span></div><div className="progress-submeta"><span>{privateCount} private transactions</span><span>{workspace.rules.length} remembered rule{workspace.rules.length === 1 ? '' : 's'}</span></div><div className="rail-divider" /><div className="rail-value"><span>Your qualifying shared spending</span><strong>{money(sharedSpend)}</strong></div><div className="rail-value"><span>Current net claim</span><strong className="claim">{money(currentClaim)}</strong></div><div className="rail-value"><span>Final settlement</span><strong className="claim">Available after checks</strong></div><p className="rail-guidance">The final settlement is calculated after both privacy-filtered projections are ready.</p><button className="continue-btn" onClick={onContinue}>{workspace.undecidedCount ? 'Review remaining decisions' : 'Continue to Share / Status'} <span aria-hidden="true">›</span></button></section><details className="review-helper" open><summary>Helpful for review</summary><p>○ Details reveal supporting context</p><p>◇ Saved rules appear beside merchants</p><p>□ Credits never receive ownership controls</p></details></aside></div></section>
}
