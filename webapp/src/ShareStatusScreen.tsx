import type { PeriodWorkflow, WorkflowEvent, WorkflowStatus } from '../shared/workflow'
import type { PrivateWorkspace } from './usePrivateWorkspace'

const LABELS: Record<WorkflowStatus, string> = { draft: 'Draft', ready: 'Ready to submit', submitted: 'Submitted', replaced: 'Replaced', withdrawn: 'Withdrawn', 'partner-ready': 'Both submissions ready', stale: 'Shared status changed — review needed', closing: 'Closing', 'retryable-error': 'Retryable error', closed: 'Closed', 'recovery-required': 'Recovery required' }

export function when(iso: string): string {
  return new Date(iso).toLocaleString('en-CA', { dateStyle: 'medium', timeStyle: 'short' })
}

function monthName(period: string): string { return new Date(period + '-01T12:00:00').toLocaleDateString('en-CA', { month: 'long', year: 'numeric' }) }

const ACTION_TEXT: Record<WorkflowEvent['action'], string> = { submit: 'submitted', replace: 'replaced their submission', withdraw: 'withdrew their submission', close: 'closed the month', restore: 'restored the archive' }

/** Plain-language explanation of the latest server-recorded handover event. */
export function describeEvent(workflow: PeriodWorkflow): string | null {
  const event = workflow.lastEvent
  const participants = workflow.participants
  if (!event || !participants) return null
  const who = event.actorRole === null ? 'A previous participant' : event.actorRole === participants.me.role ? 'You' : participants.partner?.alias || 'Your partner'
  return who + ' ' + ACTION_TEXT[event.action] + ' (version ' + event.version + ', ' + when(event.at) + ').'
}

/** Who is expected to act next, from the server's view of both submissions. */
export function nextStep(workflow: PeriodWorkflow): string {
  const me = workflow.participants?.me
  const partner = workflow.participants?.partner
  const partnerName = partner?.alias || 'your partner'
  const coordinatorName = me?.role === 'coordinator' ? 'you' : partner?.role === 'coordinator' ? partner.alias : 'the coordinator'
  if (workflow.status === 'closed') return 'Nothing: this month is closed.'
  if (workflow.status === 'recovery-required') return 'Recovery is needed before anyone can act on this month.'
  if (workflow.mine && workflow.partner) return 'Both submissions are ready. ' + (coordinatorName === 'you' ? 'You review the settlement and close the month.' : coordinatorName + ' reviews the settlement and closes the month.')
  if (workflow.mine) return 'Waiting for ' + partnerName + ' to submit.'
  if (workflow.partner) return 'Your submission is needed.'
  return 'Whoever submits first hands the month to the other.'
}

export default function ShareStatusScreen(props: {
  workspace: PrivateWorkspace; workflow: PeriodWorkflow; displayStatus: WorkflowStatus; busy: boolean; connected?: boolean
  onSubmit: () => void; onReplace: () => void; onWithdraw: () => void; onPartner?: () => void; onStale?: () => void; onRecover: () => void; onContinue: () => void
  lastChecked?: string | null; checking?: boolean; onCheckLatest?: () => void; changeNotice?: string | null
}) {
  const projection = props.workspace.projection()
  const workflow = props.workflow
  const submitted = !!workflow.mine
  const locked = workflow.status === 'closed' || workflow.status === 'recovery-required'
  const partnerName = workflow.participants?.partner?.alias || 'your partner'
  const explanation = describeEvent(workflow)
  const handoverHeading = workflow.status === 'closed'
    ? 'Month closed'
    : workflow.status === 'recovery-required'
      ? 'Recovery required'
      : workflow.mine && workflow.partner
        ? 'Both submissions ready'
        : workflow.partner
          ? partnerName + ' submitted ' + monthName(workflow.period)
          : workflow.mine
            ? 'Waiting for ' + partnerName
            : 'Nothing submitted yet'
  return <section className="screen screen-frame share-page" aria-labelledby="share-title"><header className="page-heading"><div><p className="eyebrow">{props.workspace.period} · Share / Status</p><h1 id="share-title" className="page-title">Share only what you decided</h1><p className="page-subtitle">Review the privacy-filtered projection, submit it to hand the month to {partnerName}, and see who is expected to act next.</p></div><span className="fiction-pill">{props.connected ? 'Local API · fictional data only' : 'Fictional local simulation'}</span></header>
    <div className="share-grid"><main className="share-main"><section className="panel submission-card"><div className="submission-heading"><div><p className="eyebrow">Your submission{workflow.participants ? ' as ' + workflow.participants.me.alias : ''}</p><h2>{LABELS[props.displayStatus]}</h2></div><span>Version {workflow.version}{workflow.mine ? ' · submitted ' + when(workflow.mine.submittedAt) : ''}</span></div>
      {workflow.status === 'stale' ? <div className="notice warn" role="status"><strong>Shared status changed after this screen loaded.</strong> {workflow.staleReason} Your private draft in this browser is safe and unchanged. Load the latest shared status, review it, then retry your action if you still want it.</div> : null}
      {workflow.status === 'recovery-required' ? <p className="notice warn" role="status">{workflow.recoveryReason}</p> : null}
      {props.changeNotice ? <p className="notice good" role="status">{props.changeNotice}</p> : null}
      <div className="button-row">{locked ? null : !submitted || workflow.status === 'withdrawn' ? <button className="btn primary" disabled={props.busy || workflow.status === 'stale' || props.workspace.undecidedCount > 0 || !props.workspace.ledger.length} onClick={props.onSubmit}>Submit shared projection</button> : <><button className="btn primary" disabled={props.busy || workflow.status === 'stale' || props.workspace.undecidedCount > 0} onClick={props.onReplace}>Replace submission</button><button className="btn ghost" disabled={props.busy || workflow.status === 'stale'} onClick={props.onWithdraw}>Withdraw</button></>}{workflow.status === 'stale' ? <button className="btn primary" onClick={props.onRecover} disabled={props.busy}>Load latest shared status</button> : null}</div>
      {props.workspace.undecidedCount && !locked ? <p className="fine-print">Submission and replacement are unavailable because {props.workspace.undecidedCount} posted purchase(s) still need a decision.</p> : null}
      {workflow.participants ? <p className="fine-print">Your shared identity is the alias <strong>{workflow.participants.me.alias}</strong> bound to your account by the server. The Worker labels this submission with it; a name typed in Setup cannot change that.</p> : null}</section>
      <details className="panel shared-preview" open><summary><span><strong>Exact shared-data preview</strong><small>Entirely private transactions and supporting evidence are absent.</small></span><span className="summary-chevron" aria-hidden="true">›</span></summary><div className="preview-body"><p className="privacy-callout">Only date, merchant, category, amount, payer share, and an optional edited flag cross the workflow gateway. Card labels, raw descriptions, rules, unfinished decisions, products, order IDs, and Amazon decisions stay private.</p><div className="table-scroll"><table><thead><tr><th>Date</th><th>Merchant</th><th>Amount</th><th>Payer share</th></tr></thead><tbody>{projection.items.map(function (item) { return <tr key={item.date + item.merchant}><td>{item.date}</td><td>{item.merchant}</td><td>${item.amount.toFixed(2)}</td><td>{Math.round(item.share * 100)}%</td></tr> })}</tbody></table></div>{!projection.items.length ? <p className="empty">No shared rows in the current projection.</p> : null}</div></details>
    </main><aside className="share-rail"><section className="panel partner-card handover-card"><p className="eyebrow">Handover</p><h2>{handoverHeading}</h2>
      <p className="next-step"><strong>Next:</strong> {nextStep(workflow)}</p>
      {workflow.partner ? <p>{partnerName}: version {workflow.partner.version}, submitted {when(workflow.partner.submittedAt)}.</p> : props.connected ? <p>{partnerName} has no current submission for this month.</p> : submitted ? <p>Your fictional submission is ready for the partner simulation.</p> : <p>Submit your shared projection first; the fictional partner response follows it.</p>}
      {explanation ? <p className="fine-print">Latest change: {explanation}</p> : null}
      {props.onCheckLatest ? <div className="button-row"><button className="btn ghost" onClick={props.onCheckLatest} disabled={props.checking}>{props.checking ? 'Checking…' : 'Check latest status'}</button><span className="fine-print">{props.lastChecked ? 'Last checked ' + when(props.lastChecked) + '. Checked automatically while this page is visible.' : 'Not checked yet.'}</span></div> : null}
      {props.onPartner ? <button className="btn primary continue-full" onClick={props.onPartner} disabled={!submitted || !!workflow.partner || locked}>Simulate fictional partner submission</button> : null}</section>{props.onStale ? <section className="panel simulation"><h2>Recovery demonstration</h2><p>Model a version changing while you review—the kind of response a real API may return.</p><button className="btn ghost continue-full" onClick={props.onStale} disabled={!workflow.mine || locked}>Simulate partner change (stale)</button></section> : null}<button className="continue-btn" onClick={props.onContinue} disabled={!workflow.mine || !workflow.partner}>Continue to Settle <span aria-hidden="true">›</span></button></aside></div>
  </section>
}
