import { useState } from 'react'
import type { PeriodWorkflow } from '../shared/workflow'

export interface HandoverText { subject: string; body: string }

function monthLabel(period: string): string { return new Date(period + '-01T12:00:00').toLocaleDateString('en-CA', { month: 'long', year: 'numeric' }) }

/**
 * WEB-034: a ready-to-send message after this person's submission, when the other person
 * has something to do. Null when nothing needs saying (for example the coordinator after
 * both submitted, who acts next themself).
 */
export function turnMessage(workflow: PeriodWorkflow, address: string): HandoverText | null {
  const me = workflow.participants?.me
  if (!me || !workflow.mine || workflow.status === 'closed' || workflow.status === 'recovery-required' || workflow.status === 'stale') return null
  const month = monthLabel(workflow.period)
  if (!workflow.partner) return { subject: 'Split Ledger: your turn for ' + month, body: 'I submitted ' + month + ' in Split Ledger. Your turn when you have 15 minutes: ' + address }
  if (me.role === 'partner') return { subject: 'Split Ledger: ' + month + ' is ready to close', body: 'I submitted ' + month + ' in Split Ledger. Both sides are in, so you can review and close it: ' + address }
  return null
}

/** WEB-034: the coordinator's message after closing, with the settlement line. */
export function closedMessage(period: string, result: string, address: string): HandoverText {
  const month = monthLabel(period)
  return { subject: 'Split Ledger: ' + month + ' is closed', body: month + ' is closed in Split Ledger: ' + result + '. ' + address }
}

/** Copy, Share (where the browser offers it), or Email. The app itself sends nothing. */
export function HandoverMessage({ message, label }: { message: HandoverText; label: string }) {
  const [note, setNote] = useState<string | null>(null)
  const canShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function'
  async function copy(): Promise<void> {
    try { await navigator.clipboard.writeText(message.body); setNote('Copied. Paste it wherever you two usually talk.') }
    catch { setNote('Copying was blocked; select the message and copy it.') }
  }
  async function share(): Promise<void> {
    try { await navigator.share({ title: message.subject, text: message.body }); setNote(null) }
    catch { /* the person closed the share panel */ }
  }
  const mail = 'mailto:?subject=' + encodeURIComponent(message.subject) + '&body=' + encodeURIComponent(message.body)
  return <div className="handover-message">
    <p className="eyebrow">{label}</p>
    <p className="handover-text">{message.body}</p>
    <div className="button-row"><button className="btn" onClick={() => void copy()}>Copy message</button>{canShare ? <button className="btn ghost" onClick={() => void share()}>Share</button> : null}<a className="btn ghost" href={mail}>Email</a></div>
    {note ? <p className="fine-print" role="status">{note}</p> : null}
    <p className="fine-print">Split Ledger sends nothing itself and stores no contact details.</p>
  </div>
}
