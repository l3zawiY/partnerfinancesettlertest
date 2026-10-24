import { buildMonthArchive, type MonthArchive } from '../shared/formats'
import { canClose, preCloseChecks } from '../shared/preClose'
import type { PeriodWorkflow } from '../shared/workflow'
import { describeEvent, endSentence, when } from './ShareStatusScreen'
import type { PrivateWorkspace } from './usePrivateWorkspace'
import { downloadJson } from './usePrivateWorkspace'

function money(value: number): string { return new Intl.NumberFormat('en-CA', { style: 'currency', currency: 'CAD' }).format(value) }
function monthName(period: string): string { return new Date(period + '-01T12:00:00').toLocaleDateString('en-CA', { month: 'long' }) }

/**
 * The same deterministic preview the Worker will archive. When the server supplied the
 * paired participants, payer `a` is always the coordinator and payer `b` the partner,
 * whichever of them is looking at the screen; only the fictional fixture without
 * participants falls back to "me first".
 */
export function archiveFor(workspace: PrivateWorkspace, workflow: PeriodWorkflow): MonthArchive | null {
  if (!workflow.mine || !workflow.partner) return null
  const participants = workflow.participants
  if (participants && participants.partner) {
    const coordinatorFirst = participants.me.role === 'coordinator'
    const coordinatorAlias = coordinatorFirst ? participants.me.alias : participants.partner.alias
    const partnerAlias = coordinatorFirst ? participants.partner.alias : participants.me.alias
    return buildMonthArchive({ toolVersion: '0.0.0-experiment', period: workspace.period, people: { a: coordinatorAlias, b: partnerAlias }, mine: (coordinatorFirst ? workflow.mine : workflow.partner).projection.items, theirs: (coordinatorFirst ? workflow.partner : workflow.mine).projection.items })
  }
  return buildMonthArchive({ toolVersion: '0.0.0-experiment', period: workspace.period, people: { a: workspace.names[workspace.meIndex] || 'Me', b: workspace.names[workspace.meIndex === 0 ? 1 : 0] || 'Partner' }, mine: workflow.mine.projection.items, theirs: workflow.partner.projection.items })
}

export default function SettleScreen(props: { workspace: PrivateWorkspace; workflow: PeriodWorkflow; busy: boolean; connected?: boolean; onClose: () => void; onFailNextClose?: () => void; onRecoverStale: () => void; lastChecked?: string | null; checking?: boolean; onCheckLatest?: () => void }) {
  const workflow = props.workflow
  const checks = preCloseChecks({ ledger: props.workspace.ledger, workflow, totalsConfirmed: props.workspace.confirmedTotals, currentProjection: props.workspace.projection() })
  const archive = archiveFor(props.workspace, workflow)
  const participants = workflow.participants
  // Only the stable coordinator closes. The fictional fixture without participants keeps
  // the old single-actor behaviour so the deterministic UI test still exercises close.
  const mayClose = !participants || participants.me.role === 'coordinator'
  const coordinatorAlias = participants ? (participants.me.role === 'coordinator' ? participants.me.alias : participants.partner?.alias || 'the coordinator') : null
  const ready = !!archive && canClose(checks, workflow) && mayClose
  const authoritative = workflow.archive
  const settlement = authoritative?.settlement || archive?.settlement
  const people = authoritative?.people || archive?.people
  const aName = people?.a || (participants ? (participants.me.role === 'coordinator' ? participants.me.alias : participants.partner?.alias || 'Coordinator') : props.workspace.names[props.workspace.meIndex] || 'You')
  const bName = people?.b || (participants ? (participants.me.role === 'partner' ? participants.me.alias : participants.partner?.alias || 'Partner') : props.workspace.names[props.workspace.meIndex === 0 ? 1 : 0] || 'Partner')
  const rows = authoritative
    ? authoritative.items.map(function (item) { return { date: item.date, merchant: item.merchant, amount: item.amount, share: item.shareOfPayer, payer: item.payer === 'a' ? aName : bName } })
    : (archive?.items || []).map(function (item) { return { date: item.date, merchant: item.merchant, amount: item.amount, share: item.shareOfPayer, payer: item.payer === 'a' ? aName : bName } })
  const result = settlement ? settlement.direction === 'square' ? aName + ' and ' + bName + ' are square' : settlement.direction === 'b_owes_a' ? bName + ' pays ' + aName + ' ' + money(settlement.net) : aName + ' pays ' + bName + ' ' + money(settlement.net) : 'Both current submissions are needed'
  const explanation = describeEvent(workflow)
  return <section className="screen screen-frame settle-page" aria-labelledby="settle-title"><header className="page-heading"><div><p className="eyebrow">{props.workspace.period} · Settle</p><h1 id="settle-title" className="page-title">Settle {monthName(props.workspace.period)}</h1><p className="page-subtitle">Review both shared submissions, complete the checks, then {mayClose ? 'close the month when everything agrees' : 'let ' + coordinatorAlias + ' close the month when everything agrees'}.</p></div><span className="fiction-pill">{props.connected ? 'Local API · fictional data only' : 'Fictional local simulation'}</span></header>
    <div className="settle-grid"><main className="settle-main"><section className={'settlement-hero ' + (workflow.status === 'closed' ? 'closed' : ready ? 'ready' : 'attention')}><div className="hero-heading"><div><p className="eyebrow">{workflow.status === 'closed' ? 'Month closed' : ready ? 'Ready to close' : mayClose ? 'Not ready to close' : 'Waiting for ' + coordinatorAlias + ' to close'}</p><h2>{result}</h2><p>{workflow.status === 'retryable-error' ? workflow.errorMessage : workflow.status === 'stale' ? 'Shared status changed after this screen loaded. ' + (workflow.staleReason || '') + ' Your private draft is safe; load the latest shared status and review the settlement again.' : workflow.status === 'recovery-required' ? workflow.recoveryReason : 'This is the net result after offsetting the two privacy-filtered claims.'}</p></div><span className="hero-mark" aria-hidden="true">{workflow.status === 'closed' || ready ? '✓' : '!'}</span></div>{settlement ? <div className="hero-breakdown"><div><span>{bName} owes {aName}</span><strong>{money(settlement.aClaim)}</strong><small>{aName}-paid purchases</small></div><div><span>{aName} owes {bName}</span><strong className="theirs-value">{money(settlement.bClaim)}</strong><small>{bName}-paid purchases</small></div><div><span>Offset</span><strong className="offset-value">{money(settlement.net)}</strong><small>Net transfer</small></div></div> : null}{workflow.status === 'stale' ? <button className="btn primary" onClick={props.onRecoverStale} disabled={props.busy}>Load latest shared status</button> : null}</section>
      <details className="panel submitted-sides"><summary><span><strong>Both submitted sides</strong><small>These are the privacy-filtered rows used for the result above.</small></span><span className="summary-chevron" aria-hidden="true">›</span></summary><div className="preview-body"><div className="table-scroll"><table><thead><tr><th>Date</th><th>Merchant</th><th>Paid by</th><th>Amount</th><th>Owed to payer</th></tr></thead><tbody>{rows.map(function (row) { return <tr key={row.payer + row.date + row.merchant}><td>{row.date}</td><td>{row.merchant}</td><td>{row.payer}</td><td>{money(row.amount)}</td><td>{money(row.amount * (1 - row.share))}</td></tr> })}</tbody></table></div>{rows.some(function (row) { return ![0, .5, 1].includes(row.share) }) ? <p className="notice warn">Asymmetric shares are present. Confirm both people agreed before close.</p> : null}</div></details>
      <details className="panel settle-check-card" open><summary><span><strong>Settlement checks</strong><small>{ready ? 'Automatic checks and explicit acknowledgements are complete.' : 'Review every prerequisite before close.'}</small></span><span className="summary-chevron" aria-hidden="true">›</span></summary><div className="checks">{checks.map(function (check) { return <div className={check.passed ? 'check pass' : 'check warn'} key={check.id}><span>{check.passed ? '✓' : '!'}</span><div><strong>{check.label}</strong><small>{check.detail}</small></div></div> })}</div><p className="fine-print">Money is converted to integer cents. Exact half-cent claims round away from zero once per row, then the rounded claims are summed.</p><label className="ack"><input type="checkbox" checked={props.workspace.confirmedTotals} onChange={(event) => props.workspace.setConfirmedTotals(event.target.checked)} /> I checked the private count and net against my bank.</label></details>
    </main><aside className="settle-rail"><section className="panel close-card"><p className="eyebrow">{props.workspace.period}</p><h2>{workflow.status === 'closed' ? 'Month closed' : ready ? 'Ready to close' : mayClose ? 'Waiting for checks' : 'Coordinator closes'}</h2>
      {workflow.status === 'closed' && workflow.archive
        ? <><p>Closed with {workflow.archive.items.length} shared item(s){workflow.closedAt ? ' on ' + when(workflow.closedAt) : ''}{workflow.closedBy ? ' by the ' + workflow.closedBy + (participants ? ' (' + (participants.me.role === workflow.closedBy ? 'you' : participants.partner?.alias || 'your partner') + ')' : '') : ''}. The Worker-created archive is immutable and identical for both participants.</p><button className="btn ghost continue-full" onClick={() => downloadJson('split-' + props.workspace.period + '-archive.json', workflow.archive)}>Download fresh archive</button></>
        : mayClose
          ? <><p>{props.connected ? 'The Worker rechecks your coordinator role, both current submissions, and the version, then creates the final archive. This does not send money.' : 'Closing finalizes this fictional record. It does not send money or confirm a bank transfer.'}</p><button className="btn primary continue-full" disabled={!ready || props.busy} onClick={props.onClose}>{workflow.status === 'retryable-error' ? 'Retry close safely' : props.busy ? 'Closing…' : 'Close month and archive'}</button>{props.onFailNextClose ? <button className="btn ghost continue-full" onClick={props.onFailNextClose} disabled={!ready}>Make next close fail (fictional)</button> : null}</>
          : <p>Only the coordinator, <strong>{coordinatorAlias}</strong>, can close this month. You can inspect both sides here and still replace or withdraw your own submission from Share / Status until the month is closed.</p>}
      {explanation ? <p className="fine-print">Latest change: {explanation}</p> : null}
      {props.onCheckLatest ? <div className="button-row"><button className="btn ghost" onClick={props.onCheckLatest} disabled={props.checking}>{props.checking ? 'Checking…' : 'Check latest status'}</button><span className="fine-print">{props.lastChecked ? endSentence('Last checked ' + when(props.lastChecked)) : 'Not checked yet.'}</span></div> : null}
    </section><section className="panel agreement-card"><h2>Agreement</h2><p>If the results disagree, review the period, people, versions, and asymmetric shares before proceeding.</p></section></aside></div>
  </section>
}
