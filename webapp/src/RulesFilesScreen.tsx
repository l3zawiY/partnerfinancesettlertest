import { useState } from 'react'
import { buildWebDiagnostic } from '../shared/diagnostic'
import { runSelfTest, type SelfTestResult } from '../shared/selfTest'
import { WEBAPP_TOOL_VERSION } from '../shared/session'
import { recentApiStatuses } from './api'
import { deployment } from './environment'
import { isHouseholdArchiveBundle } from '../shared/formats'
import type { WorkflowAdministrationGateway, WorkflowCapabilities, WorkflowExportReceipt } from '../shared/workflow'
import { logActivity } from './logbook'
import { downloadJson, type PrivateWorkspace } from './usePrivateWorkspace'

function ruleLabel(share: number): string { return share === 1 ? 'mine' : share === 0 ? 'theirs' : Math.round(share * 100) + '/' + Math.round((1 - share) * 100) }

export interface SupportContext {
  pairing: { connected: number; role: 'coordinator' | 'partner' | 'member' | 'none' }
  workflow: { status: string; version: number }
}


function storageFacts(scopeKey: string): { available: boolean; months: number } {
  try {
    let months = 0
    for (let index = 0; index < window.localStorage.length; index++) if (window.localStorage.key(index)?.startsWith(scopeKey + '.month.')) months++
    return { available: true, months }
  } catch { return { available: false, months: 0 } }
}

export default function RulesFilesScreen({ workspace, administration, capabilities, connected = false, support }: { workspace: PrivateWorkspace; administration?: WorkflowAdministrationGateway; capabilities?: WorkflowCapabilities; connected?: boolean; support?: SupportContext }) {
  const [selfTests, setSelfTests] = useState<SelfTestResult[] | null>(null)
  const [diagnosticText, setDiagnosticText] = useState<string | null>(null)
  const [supportMessage, setSupportMessage] = useState<string | null>(null)

  function selfTest(): SelfTestResult[] { const results = runSelfTest(); setSelfTests(results); logActivity('self_test_run', { count: results.filter(function (result) { return !result.ok }).length }); return results }

  async function copyDiagnostic(): Promise<void> {
    const storage = storageFacts(workspace.scopeKey)
    const report = buildWebDiagnostic({
      applicationVersion: WEBAPP_TOOL_VERSION, deployment: deployment(), userAgent: navigator.userAgent,
      storageAvailable: storage.available, privateMonths: storage.months,
      rows: workspace.ledger, rules: workspace.rules.length, cards: workspace.knownCards.length,
      amazonOrders: workspace.amazonContext.orders.length, amazonDecisions: Object.keys(workspace.amazonContext.decisions).length,
      groupBy: workspace.groupBy, onlyUndecided: workspace.onlyUndecided,
      pairing: support?.pairing || { connected: 0, role: 'none' }, workflow: support?.workflow || { status: 'draft', version: 0 },
      recentApiStatuses, selfTests: selfTests || selfTest(),
    })
    const text = JSON.stringify(report, null, 2)
    logActivity('diagnostic_copied')
    setDiagnosticText(text)
    try { await navigator.clipboard.writeText(text); setSupportMessage('Safe diagnostic copied. Paste it into your support chat; it holds no names, months, merchants, or amounts.') }
    catch { setSupportMessage('Copying was blocked by the browser. Select the report below and copy it.') }
  }

  const [receipt, setReceipt] = useState<WorkflowExportReceipt | null>(null)
  const [confirmation, setConfirmation] = useState('')
  const [privateConfirmation, setPrivateConfirmation] = useState('')
  const [cancelConfirmation, setCancelConfirmation] = useState('')
  const [cancelPeriod, setCancelPeriod] = useState('')
  const [sharedMessage, setSharedMessage] = useState('No shared-history action has run in this browser session.')
  const mayAdminister = capabilities?.canAdministerSharedHistory !== false

  async function exportShared(): Promise<void> {
    if (!administration) return
    try {
      const next = await administration.exportClosedArchives(); setReceipt(next)
      downloadJson('split-ledger-household-archives.json', next.bundle)
      setSharedMessage(!next.deletionToken ? 'Downloaded closed archives.' : next.openPeriods.length ? 'Downloaded closed archives. Deletion remains blocked by open period(s): ' + next.openPeriods.join(', ') + '.' : 'Downloaded closed archives. You can delete shared history in the next 15 minutes.')
    } catch (error) { setSharedMessage(error instanceof Error ? error.message : 'Shared archive export failed.') }
  }

  async function restoreShared(file: File): Promise<void> {
    if (!administration) return
    try {
      const value: unknown = JSON.parse(await file.text())
      if (!isHouseholdArchiveBundle(value)) throw new Error('That file is not a valid closed-household archive bundle.')
      const result = await administration.restoreClosedArchives(value)
      setSharedMessage('Restored ' + result.restoredPeriods + ' closed period(s). Refresh their period to view the server record.')
    } catch (error) { setSharedMessage(error instanceof Error ? error.message : 'Shared archive restore failed.') }
  }

  async function deleteShared(): Promise<void> {
    if (!administration || !receipt?.deletionToken) return
    try {
      const result = await administration.deleteSharedHistory(receipt.deletionToken, confirmation)
      setReceipt(null); setConfirmation('')
      setSharedMessage('Deleted ' + result.deletedPeriods + ' shared workflow period(s). Private browser drafts and the Clerk household were not changed.')
    } catch (error) { setSharedMessage(error instanceof Error ? error.message : 'Shared-history deletion failed.') }
  }

  async function cancelAbandoned(): Promise<void> {
    if (!administration || !cancelPeriod) return
    try {
      const result = await administration.cancelAbandonedPeriod(cancelPeriod, cancelConfirmation)
      setReceipt(null); setCancelPeriod(''); setCancelConfirmation('')
      setSharedMessage('Cancelled abandoned open period ' + result.cancelledPeriod + '. Export again before deleting shared history.')
    } catch (error) { setSharedMessage(error instanceof Error ? error.message : 'Abandoned-period cancellation failed.') }
  }

  return <section className="screen screen-frame files-page" aria-labelledby="files-title"><header className="page-heading"><div><p className="eyebrow">Private settings and recovery</p><h1 id="files-title" className="page-title">Rules &amp; Files</h1><p className="page-subtitle">Manage infrequent local settings, remembered merchants, and portable recovery files.</p></div></header><div className="files-grid"><main className="settings-main">
    <section className="settings-section"><h2 className="section-title">Auto-default small unknowns</h2><p className="help">These are the same cautious defaults shown in Setup.</p><div className="row-two"><label className="field"><span>Threshold ($)</span><input type="number" min="0" value={workspace.threshold} onChange={(event) => workspace.setThreshold(Number(event.target.value))} /></label><label className="field"><span>Assign them to</span><select value={workspace.defaultUnknown} onChange={(event) => workspace.setDefaultUnknown(Number(event.target.value))}><option value={1}>All mine (conservative)</option><option value={0.5}>50/50</option></select></label></div></section>
    <section className="settings-section"><h2 className="section-title">Excluded line patterns</h2><p className="help">Lines containing any of these phrases are treated as non-purchases. One phrase per line.</p><textarea aria-label="Excluded line patterns, one per line" rows={8} value={workspace.excludePatterns.join('\n')} onChange={(event) => workspace.setExcludePatterns(event.target.value.split(/\r?\n/).filter(Boolean))} /></section>
    {connected ? <section className="settings-section logbook-section"><h2 className="section-title">What the pilot logbook records</h2><p className="help">To find and fix problems during the pilot, the service keeps a short logbook for 180 days, in a database separate from your shared months. It records errors (the screen, the kind of error, where in the code, and a reference code shown in the error message) and actions with their time, your role, and the month: importing a statement and how many rows, submitting and roughly how long it took, Apply to group clicks, closing a month, the self-test, and downloads. It never records merchants, amounts, names, emails, card labels, or the text of an error. Both of you are recorded the same way.</p></section> : null}
    <section className="settings-section support-section"><h2 className="section-title">Check and support</h2><p className="help">Run the self-test after an update or before a new month: it checks the calculations in this browser with built-in fictional statements; only the number of failed checks goes to the pilot logbook. The safe diagnostic describes this app and browser for support without names, months, merchants, or amounts.</p><div className="button-row"><button className="btn" onClick={selfTest}>Run self-test</button><button className="btn ghost" onClick={() => void copyDiagnostic()}>Copy safe diagnostic report</button></div>{selfTests ? (selfTests.every(function (test) { return test.ok }) ? <p className="notice good" role="status">Self-test passed: {selfTests.length} of {selfTests.length} checks.</p> : <div className="notice warn" role="status"><p>Self-test found a problem: {selfTests.filter(function (test) { return !test.ok }).length} of {selfTests.length} checks failed. Do not settle a month in this browser; copy the safe diagnostic report for support.</p><ul>{selfTests.filter(function (test) { return !test.ok }).map(function (test) { return <li key={test.id}>{test.id} {test.label}: expected {test.expected}, got {test.actual}</li> })}</ul></div>) : null}{supportMessage ? <p className="fine-print" role="status">{supportMessage}</p> : null}{diagnosticText ? <label className="field"><span>Safe diagnostic report</span><textarea aria-label="Safe diagnostic report" readOnly rows={8} value={diagnosticText} onFocus={(event) => event.currentTarget.select()} /></label> : null}</section>
    <section className="settings-section"><h2 className="section-title">Private save, restore, and deletion</h2><p className="help">A private session contains the full ledger, card labels, rules, and normalized Amazon products. Keep it in private storage. Each month keeps its own private draft in this browser, so changing the month never erases work. Signing out does not erase it from this browser.</p><div className="button-row"><button className="btn primary" onClick={workspace.saveSession}>Download private session</button><label className="btn ghost file-button">Load private session<input type="file" accept=".json" onChange={(event) => { const file = event.target.files?.[0]; if (file) void workspace.loadSession(file); event.target.value = '' }} /></label></div><p className="fine-print">{workspace.message}</p><div className="danger-zone"><h3>Delete this private browser draft</h3><p>This permanently erases every month's private draft for this account and selected household. It does not delete another scope, shared D1 archives, or the Clerk account.</p><label className="field"><span>Type DELETE PRIVATE DRAFT</span><input value={privateConfirmation} onChange={(event) => setPrivateConfirmation(event.target.value)} /></label><button className="btn danger" disabled={privateConfirmation !== 'DELETE PRIVATE DRAFT'} onClick={() => { workspace.erasePrivateDraft(); setPrivateConfirmation('') }}>Delete this private browser draft</button></div></section>
    {administration ? <section className="settings-section shared-recovery"><h2 className="section-title">Shared household recovery</h2><p className="help">This separate file contains the closed privacy-filtered archives stored by the service. It never contains private rows, card labels, rules, or Amazon evidence.</p><div className="button-row"><button className="btn primary" onClick={() => void exportShared()}>Download closed shared archives</button><label className={'btn ghost file-button' + (!mayAdminister ? ' disabled-control' : '')}>Restore closed shared archives<input type="file" accept=".json" disabled={!mayAdminister} onChange={(event) => { const file = event.target.files?.[0]; if (file) void restoreShared(file); event.target.value = '' }} /></label></div>{!mayAdminister ? <p className="fine-print">Archive export is available to every member. Restore, abandoned-period cancellation, and deletion are for the coordinator only.</p> : null}{receipt?.openPeriods.length && mayAdminister ? <div className="danger-zone"><h3>Cancel an abandoned open period</h3><p>Withdraw every participant submission first. This removes only the selected empty open workflow so it cannot block shared-history deletion.</p><select aria-label="Abandoned open period" value={cancelPeriod} onChange={(event) => setCancelPeriod(event.target.value)}><option value="">Choose an open period</option>{receipt.openPeriods.map(function (period) { return <option key={period}>{period}</option> })}</select><label className="field"><span>Type CANCEL ABANDONED PERIOD</span><input value={cancelConfirmation} onChange={(event) => setCancelConfirmation(event.target.value)} /></label><button className="btn danger" disabled={!cancelPeriod || cancelConfirmation !== 'CANCEL ABANDONED PERIOD'} onClick={() => void cancelAbandoned()}>Cancel selected abandoned period</button></div> : null}<div className="danger-zone"><h3>Delete shared workflow history</h3><p>This deletes D1 workflow records only. It does not delete private browser drafts or the Clerk organization. Export first; only the coordinator can continue.</p><label className="field"><span>Type DELETE SHARED HISTORY</span><input disabled={!mayAdminister} value={confirmation} onChange={(event) => setConfirmation(event.target.value)} /></label><button className="btn danger" disabled={!mayAdminister || !receipt || !!receipt.openPeriods.length || confirmation !== 'DELETE SHARED HISTORY'} onClick={() => void deleteShared()}>Delete shared workflow history</button></div><p className="notice" role="status">{sharedMessage}</p></section> : <section className="settings-section"><h2 className="section-title">Shared household recovery</h2><p className="help">{connected ? 'The shared workflow service is unavailable.' : 'Shared D1 administration is hidden in the fictional UI fixture.'}</p></section>}
  </main><aside className="files-rail"><section><h2 className="section-title">Remembered merchants</h2><p className="help">Built only when you deliberately remember a split.</p><div className="panel">{workspace.rules.length ? <ul className="rule-list">{workspace.rules.map(function (rule) { return <li key={rule.type + rule.pattern}><span>{rule.label}{rule.type === 'family' ? ' · family' : ''}</span><span>{ruleLabel(rule.share)} <button aria-label={'Remove rule for ' + rule.label} onClick={() => workspace.forgetRule(rule)}>Remove</button></span></li> })}</ul> : <p className="empty">No rules yet—they build only when you deliberately remember a split.</p>}</div></section><section><h2 className="section-title">Portable shared file</h2><p className="help">The same allowlisted projection shown in Share / Status.</p><div className="panel"><button className="btn ghost continue-full" onClick={workspace.saveShared}>Download shared file</button></div></section></aside></div></section>
}
