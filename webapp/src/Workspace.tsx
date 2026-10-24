import { environmentLabels } from './environment'
import { useCallback, useEffect, useRef, useState } from 'react'
import type { HouseholdPairing } from '../shared/pairing'
import { localDraftStatus, type PeriodWorkflow, type WorkflowAdministrationGateway, type WorkflowCapabilities, type WorkflowGateway, type WorkflowStatus } from '../shared/workflow'
import { viewerAliases } from './identity'
import ImportScreen from './Import'
import ReviewScreen from './ReviewScreen'
import RulesFilesScreen from './RulesFilesScreen'
import SettleScreen from './SettleScreen'
import SetupScreen from './SetupScreen'
import ShareStatusScreen, { describeEvent } from './ShareStatusScreen'
import { fictionalPartnerProjection } from './testing/fictionalFixtures'
import { downloadJson, usePrivateWorkspace } from './usePrivateWorkspace'
import type { FictionalWorkflowControls } from './workflow/LocalWorkflowGateway'

export type ScreenName = 'setup' | 'import' | 'review' | 'share' | 'settle' | 'files'
const PRIMARY_SCREENS: { id: Exclude<ScreenName, 'files'>; label: string }[] = [
  { id: 'setup', label: 'Setup' }, { id: 'import', label: 'Import' }, { id: 'review', label: 'Review' },
  { id: 'share', label: 'Share / Status' }, { id: 'settle', label: 'Settle' },
]

/** Share / Status and Settle re-check the server this often while the page is visible. */
export const STATUS_CHECK_INTERVAL_MS = 20_000

export default function Workspace(props: { scopeKey: string; gateway: WorkflowGateway; administration?: WorkflowAdministrationGateway; simulation?: FictionalWorkflowControls; connected?: boolean; householdReady?: boolean; pairing?: HouseholdPairing; onRefreshPairing?: () => void; now?: () => string; statusCheckIntervalMs?: number }) {
  const workspace = usePrivateWorkspace(props.scopeKey)
  const [screen, setScreen] = useState<ScreenName>('setup')
  const [workflow, setWorkflow] = useState<PeriodWorkflow>({ period: workspace.period, status: 'draft', version: 0, mine: null, partner: null })
  const [busy, setBusy] = useState(false)
  const [workflowMessage, setWorkflowMessage] = useState<string | null>(null)
  const [capabilities, setCapabilities] = useState<WorkflowCapabilities | undefined>(undefined)
  const [lastChecked, setLastChecked] = useState<string | null>(null)
  const [checking, setChecking] = useState(false)
  const [changeNotice, setChangeNotice] = useState<string | null>(null)
  // One request at a time: a background check never overlaps a mutation or another check,
  // so a poll can neither issue a duplicate write nor overwrite a fresher response.
  const inFlight = useRef(false)
  const workflowRef = useRef(workflow)
  useEffect(function () { workflowRef.current = workflow }, [workflow])
  const now = props.now || function () { return new Date().toISOString() }

  useEffect(function () {
    let active = true
    setBusy(true); inFlight.current = true
    setChangeNotice(null); setLastChecked(null)
    void props.gateway.getPeriodStatus(workspace.period)
      .then(function (next) { if (active) { setWorkflow(next); setWorkflowMessage(null); setLastChecked(now()) } })
      .catch(function (error) { if (active) setWorkflowMessage(error instanceof Error ? error.message : 'The workflow service is unavailable.') })
      .finally(function () { inFlight.current = false; if (active) setBusy(false) })
    return function () { active = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.gateway, workspace.period])

  /**
   * Read the authoritative shared status. Never a write. Replaces the screen's workflow
   * only when the server reports a different version or status, or when the screen is in
   * a recoverable stale/error state, and explains the change in ordinary language.
   */
  const checkLatest = useCallback(async function (manual: boolean): Promise<void> {
    if (inFlight.current) return
    inFlight.current = true; setChecking(true)
    try {
      const next = await props.gateway.getPeriodStatus(workspace.period)
      const previous = workflowRef.current
      setLastChecked(now())
      const recovering = previous.status === 'stale' || previous.status === 'retryable-error'
      const changed = next.version !== previous.version || next.status !== previous.status
      if (recovering) {
        setWorkflow(next)
        setChangeNotice('Loaded the latest shared status. Your private draft was not changed. ' + (describeEvent(next) || 'Version ' + next.version + ' is current.') + (previous.status === 'stale' ? ' Review it, then retry your action if you still want it.' : ''))
      } else if (changed) {
        setWorkflow(next)
        setChangeNotice('Shared status updated while you were here. ' + (describeEvent(next) || 'Version ' + next.version + ' is now current.'))
      } else if (manual) {
        setChangeNotice('No change since your last check.')
      }
      setWorkflowMessage(null)
    } catch (error) {
      setWorkflowMessage(error instanceof Error ? error.message : 'The workflow service is unavailable.')
    } finally {
      inFlight.current = false; setChecking(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.gateway, workspace.period])

  const watching = screen === 'share' || screen === 'settle'
  useEffect(function () {
    if (!watching) return
    const interval = props.statusCheckIntervalMs ?? STATUS_CHECK_INTERVAL_MS
    const visible = function () { return document.visibilityState === 'visible' }
    const tick = function () { if (visible()) void checkLatest(false) }
    const id = window.setInterval(tick, interval)
    window.addEventListener('focus', tick)
    document.addEventListener('visibilitychange', tick)
    void checkLatest(false)
    return function () { window.clearInterval(id); window.removeEventListener('focus', tick); document.removeEventListener('visibilitychange', tick) }
  }, [watching, checkLatest, props.statusCheckIntervalMs])

  useEffect(function () {
    let active = true
    if (!props.administration) { setCapabilities(undefined); return function () { active = false } }
    void props.administration.getCapabilities().then(function (value) { if (active) setCapabilities(value) }).catch(function () { if (active) setCapabilities({ canAdministerSharedHistory: false }) })
    return function () { active = false }
  }, [props.administration])

  async function run(action: () => Promise<PeriodWorkflow>): Promise<PeriodWorkflow | null> {
    setBusy(true); setWorkflowMessage(null); setChangeNotice(null); inFlight.current = true
    try { const next = await action(); setWorkflow(next); setLastChecked(now()); return next }
    catch (error) { setWorkflowMessage(error instanceof Error ? error.message : 'The fictional workflow action failed.'); return null }
    finally { inFlight.current = false; setBusy(false) }
  }

  function submit(): void { const projection = workspace.projection(); void run(() => props.gateway.submit({ projection, expectedVersion: workflow.mine ? workflow.version : null })) }
  function replace(): void { const projection = workspace.projection(); void run(() => props.gateway.replace({ projection, expectedVersion: workflow.version })) }
  function withdraw(): void { void run(() => props.gateway.withdraw(workspace.period, workflow.version)) }
  function partnerReady(): void { if (props.simulation) void run(() => props.simulation!.makePartnerReady(workspace.period, fictionalPartnerProjection(workspace.period))) }
  function stale(): void { if (props.simulation) void run(() => props.simulation!.makeStale(workspace.period)) }
  function recover(): void {
    if (props.simulation) { void run(() => props.simulation!.recoverFromStale(workspace.period)).then(function () { setChangeNotice('Loaded the latest fictional shared status. Your private draft was not changed.') }) }
    else void checkLatest(true)
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

  // Server-bound aliases are the shared identity; locally typed names are presentation only.
  // The same helper feeds every screen that greets the person by name, so none of them can
  // drift back to a typed name once the household is paired.
  const { me, partner } = viewerAliases(props.pairing, workspace.names, workspace.meIndex)
  const pairedMe = props.pairing?.state === 'paired' && props.pairing.viewer.kind === 'participant' ? me : null
  const setIdentity = workspace.setIdentity
  useEffect(function () { setIdentity(pairedMe ? { me: pairedMe, partner } : null) }, [pairedMe, partner, setIdentity])
  const viewer = props.pairing?.viewer.kind === 'participant' ? props.pairing.viewer : null
  return <>
    <header className="masthead"><div className="mast-inner">
      <div className="brand"><span className="brand-mark" aria-hidden="true">S</span><strong>Split Ledger</strong></div>
      <label className="period-pill"><span className="sr-only">Reconciliation month</span><input aria-label="Header reconciliation month" type="month" value={workspace.period} onChange={(event) => workspace.setPeriod(event.target.value)} /></label>
      <span className="mast-spacer" />
      <div className="who"><span className="identity-dot" aria-hidden="true" /><span>You are <strong>{me}</strong>{viewer ? <> ({viewer.role})</> : null}</span><span className="identity-separator">·</span><span>Settling with <strong>{partner}</strong></span></div>
      <span className="mast-divider" aria-hidden="true" />
      <nav className="steps" role="tablist" aria-label="Monthly workflow">{PRIMARY_SCREENS.map(function (item) { return <button role="tab" aria-label={item.label} aria-selected={screen === item.id} key={item.id} onClick={() => setScreen(item.id)}>{item.label}</button> })}</nav>
    </div></header>
    <div className="application-shell">
      {workflowMessage ? <p className="notice warn global-notice" role="status">{workflowMessage}</p> : null}
      {workspace.tabNotice ? <p className="notice global-notice" role="status">{workspace.tabNotice} <button className="btn ghost" onClick={workspace.dismissTabNotice}>Dismiss</button></p> : null}
      {screen === 'setup' ? <SetupScreen workspace={workspace} householdReady={props.householdReady !== false} connected={!!props.connected} pairing={props.pairing} onRefreshPairing={props.onRefreshPairing} /> : null}
      {screen === 'import' ? <ImportScreen workspace={workspace} onContinue={() => setScreen('review')} /> : null}
      {screen === 'review' ? <ReviewScreen workspace={workspace} pairing={props.pairing} onContinue={() => workspace.undecidedCount ? workspace.setOnlyUndecided(true) : setScreen('share')} /> : null}
      {screen === 'share' ? <ShareStatusScreen workspace={workspace} workflow={workflow} displayStatus={displayStatus} busy={busy} connected={!!props.connected} onSubmit={submit} onReplace={replace} onWithdraw={withdraw} onPartner={props.simulation ? partnerReady : undefined} onStale={props.simulation ? stale : undefined} onRecover={recover} onContinue={() => setScreen('settle')} lastChecked={lastChecked} checking={checking} onCheckLatest={() => void checkLatest(true)} changeNotice={changeNotice} /> : null}
      {screen === 'settle' ? <SettleScreen workspace={workspace} workflow={workflow} busy={busy} connected={!!props.connected} onClose={close} onFailNextClose={props.simulation ? failClose : undefined} onRecoverStale={recover} lastChecked={lastChecked} checking={checking} onCheckLatest={() => void checkLatest(true)} /> : null}
      {screen === 'files' ? <RulesFilesScreen workspace={workspace} administration={props.administration} capabilities={capabilities} connected={!!props.connected} support={{ pairing: { connected: props.pairing?.connected ?? 0, role: viewer ? viewer.role : props.pairing ? 'member' : 'none' }, workflow: { status: workflow.status, version: workflow.version } }} /> : null}
    </div>
    <footer className="app-footer"><div className="footer-inner"><span>{props.connected ? environmentLabels().footer : 'Fictional local workflow'}</span><button aria-current={screen === 'files' ? 'page' : undefined} onClick={() => setScreen('files')}>Rules &amp; Files</button><span>Private import and review remain in this browser.</span></div></footer>
  </>
}
