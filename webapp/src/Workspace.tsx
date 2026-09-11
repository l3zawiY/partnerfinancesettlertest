import { useEffect, useState } from 'react'
import { localDraftStatus, type PeriodWorkflow, type WorkflowAdministrationGateway, type WorkflowCapabilities, type WorkflowGateway, type WorkflowStatus } from '../shared/workflow'
import ImportScreen from './Import'
import ReviewScreen from './ReviewScreen'
import RulesFilesScreen from './RulesFilesScreen'
import SettleScreen from './SettleScreen'
import SetupScreen from './SetupScreen'
import ShareStatusScreen from './ShareStatusScreen'
import { fictionalPartnerProjection } from './testing/fictionalFixtures'
import { downloadJson, usePrivateWorkspace } from './usePrivateWorkspace'
import type { FictionalWorkflowControls } from './workflow/LocalWorkflowGateway'

export type ScreenName = 'setup' | 'import' | 'review' | 'share' | 'settle' | 'files'
const PRIMARY_SCREENS: { id: Exclude<ScreenName, 'files'>; label: string }[] = [
  { id: 'setup', label: 'Setup' }, { id: 'import', label: 'Import' }, { id: 'review', label: 'Review' },
  { id: 'share', label: 'Share / Status' }, { id: 'settle', label: 'Settle' },
]

export default function Workspace(props: { scopeKey: string; gateway: WorkflowGateway; administration?: WorkflowAdministrationGateway; simulation?: FictionalWorkflowControls; connected?: boolean; householdReady?: boolean }) {
  const workspace = usePrivateWorkspace(props.scopeKey)
  const [screen, setScreen] = useState<ScreenName>('setup')
  const [workflow, setWorkflow] = useState<PeriodWorkflow>({ period: workspace.period, status: 'draft', version: 0, mine: null, partner: null })
  const [busy, setBusy] = useState(false)
  const [workflowMessage, setWorkflowMessage] = useState<string | null>(null)
  const [capabilities, setCapabilities] = useState<WorkflowCapabilities | undefined>(undefined)

  useEffect(function () {
    let active = true
    setBusy(true)
    void props.gateway.getPeriodStatus(workspace.period)
      .then(function (next) { if (active) { setWorkflow(next); setWorkflowMessage(null) } })
      .catch(function (error) { if (active) setWorkflowMessage(error instanceof Error ? error.message : 'The workflow service is unavailable.') })
      .finally(function () { if (active) setBusy(false) })
    return function () { active = false }
  }, [props.gateway, workspace.period])

  useEffect(function () {
    let active = true
    if (!props.administration) { setCapabilities(undefined); return function () { active = false } }
    void props.administration.getCapabilities().then(function (value) { if (active) setCapabilities(value) }).catch(function () { if (active) setCapabilities({ canAdministerSharedHistory: false }) })
    return function () { active = false }
  }, [props.administration])

  async function run(action: () => Promise<PeriodWorkflow>): Promise<PeriodWorkflow | null> {
    setBusy(true); setWorkflowMessage(null)
    try { const next = await action(); setWorkflow(next); return next }
    catch (error) { setWorkflowMessage(error instanceof Error ? error.message : 'The fictional workflow action failed.'); return null }
    finally { setBusy(false) }
  }

  function submit(): void { const projection = workspace.projection(); void run(() => props.gateway.submit({ projection, expectedVersion: workflow.mine ? workflow.version : null })) }
  function replace(): void { const projection = workspace.projection(); void run(() => props.gateway.replace({ projection, expectedVersion: workflow.version })) }
  function withdraw(): void { void run(() => props.gateway.withdraw(workspace.period, workflow.version)) }
  function partnerReady(): void { if (props.simulation) void run(() => props.simulation!.makePartnerReady(workspace.period, fictionalPartnerProjection(workspace.period))) }
  function stale(): void { if (props.simulation) void run(() => props.simulation!.makeStale(workspace.period)) }
  function recover(): void {
    if (props.simulation) void run(() => props.simulation!.recoverFromStale(workspace.period))
    else void run(() => props.gateway.getPeriodStatus(workspace.period))
  }
  function failClose(): void { if (props.simulation) void props.simulation.failNextClose(workspace.period).then(function () { setWorkflowMessage('The next close will return a fictional retryable error.') }) }
  function close(): void {
    setWorkflow({ ...workflow, status: 'closing' })
    void run(() => props.gateway.close(workspace.period, workflow.version)).then(function (next) {
      if (next?.status === 'closed' && next.archive) downloadJson('split-' + workspace.period + '-archive.json', next.archive)
    })
  }

  const derived = workflow.status === 'draft' && !workflow.mine
    ? localDraftStatus(workspace.ledger.length > 0, workspace.undecidedCount)
    : workflow.status
  const displayStatus = derived as WorkflowStatus

  const me = workspace.names[workspace.meIndex] || 'Me'
  const partner = workspace.names[workspace.meIndex === 0 ? 1 : 0] || 'Partner'
  return <>
    <header className="masthead"><div className="mast-inner">
      <div className="brand"><span className="brand-mark" aria-hidden="true">S</span><strong>Split Ledger</strong></div>
      <label className="period-pill"><span className="sr-only">Reconciliation month</span><input aria-label="Header reconciliation month" type="month" value={workspace.period} onChange={(event) => workspace.setPeriod(event.target.value)} /></label>
      <span className="mast-spacer" />
      <div className="who"><span className="identity-dot" aria-hidden="true" /><span>You are <strong>{me}</strong></span><span className="identity-separator">·</span><span>Settling with <strong>{partner}</strong></span></div>
      <span className="mast-divider" aria-hidden="true" />
      <nav className="steps" role="tablist" aria-label="Monthly workflow">{PRIMARY_SCREENS.map(function (item) { return <button role="tab" aria-label={item.label} aria-selected={screen === item.id} key={item.id} onClick={() => setScreen(item.id)}>{item.label}</button> })}</nav>
    </div></header>
    <div className="application-shell">
      {workflowMessage ? <p className="notice warn global-notice" role="status">{workflowMessage}</p> : null}
      {screen === 'setup' ? <SetupScreen workspace={workspace} householdReady={props.householdReady !== false} connected={!!props.connected} /> : null}
      {screen === 'import' ? <ImportScreen workspace={workspace} onContinue={() => setScreen('review')} /> : null}
      {screen === 'review' ? <ReviewScreen workspace={workspace} onContinue={() => workspace.undecidedCount ? workspace.setOnlyUndecided(true) : setScreen('share')} /> : null}
      {screen === 'share' ? <ShareStatusScreen workspace={workspace} workflow={workflow} displayStatus={displayStatus} busy={busy} connected={!!props.connected} onSubmit={submit} onReplace={replace} onWithdraw={withdraw} onPartner={props.simulation ? partnerReady : undefined} onStale={props.simulation ? stale : undefined} onRecover={recover} onContinue={() => setScreen('settle')} /> : null}
      {screen === 'settle' ? <SettleScreen workspace={workspace} workflow={workflow} busy={busy} connected={!!props.connected} onClose={close} onFailNextClose={props.simulation ? failClose : undefined} onRecoverStale={recover} /> : null}
      {screen === 'files' ? <RulesFilesScreen workspace={workspace} administration={props.administration} capabilities={capabilities} connected={!!props.connected} /> : null}
    </div>
    <footer className="app-footer"><div className="footer-inner"><span>{props.connected ? 'Local API · fictional data only' : 'Fictional local workflow'}</span><button aria-current={screen === 'files' ? 'page' : undefined} onClick={() => setScreen('files')}>Rules &amp; Files</button><span>Private import and review remain in this browser.</span></div></footer>
  </>
}
