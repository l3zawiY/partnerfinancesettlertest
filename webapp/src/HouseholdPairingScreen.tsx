import { useState, type FormEvent } from 'react'
import { isSafeAlias, isSafeHouseholdName, type HouseholdPairing } from '../shared/pairing'

/**
 * The Clerk invitation surface, injected so the screen can be tested without Clerk. The
 * email address travels to Clerk only; Split Ledger's own API never receives it.
 */
export interface InvitationSurface {
  invite(emailAddress: string): Promise<void>
  pending: { id: string; emailAddress: string; status: string }[]
  refresh(): Promise<void>
}

const PRIVACY_TEXT = 'Each person keeps their complete bank history, private purchases, rules, and Amazon evidence in their own browser. The household shares only decided purchase lines: date, merchant, category, amount, and payer share.'

function when(iso: string): string {
  return new Date(iso).toLocaleString('en-CA', { dateStyle: 'medium', timeStyle: 'short' })
}

/** The identical privacy-safe household summary both participants see. */
export function PairingSummary({ pairing }: { pairing: HouseholdPairing }) {
  const you = pairing.viewer.kind === 'participant' ? pairing.viewer.role : null
  return <div className="pairing-summary" data-testid="pairing-summary">
    <p className="connected-pill" aria-label="Connection state">{pairing.connected} of 2 connected{pairing.state === 'coordinator-only' ? ' — waiting for partner' : ''}</p>
    {pairing.householdName ? <h2>{pairing.householdName}</h2> : null}
    <dl className="pairing-roles">
      <div><dt>Coordinator</dt><dd>{pairing.coordinator ? <>{pairing.coordinator.alias}{you === 'coordinator' ? <span className="tag">you</span> : null}<small>Closes each month · joined {when(pairing.coordinator.joinedAt)}</small></> : 'Not set up'}</dd></div>
      <div><dt>Partner</dt><dd>{pairing.partner ? <>{pairing.partner.alias}{you === 'partner' ? <span className="tag">you</span> : null}<small>Submits and reviews · joined {when(pairing.partner.joinedAt)}</small></> : 'Vacant'}</dd></div>
    </dl>
    {pairing.recoveryRequiredPeriods.length ? <p className="notice warn" role="status">Recovery required for {pairing.recoveryRequiredPeriods.join(', ')}: these months carry submissions made before the household was paired, and they cannot be matched to the current coordinator and partner safely. Nothing was changed or deleted. Contact support before working on these months.</p> : null}
  </div>
}

function InitializeForm(props: { busy: boolean; onInitialize: (householdName: string, alias: string) => void }) {
  const [householdName, setHouseholdName] = useState('')
  const [alias, setAlias] = useState('')
  const [acknowledged, setAcknowledged] = useState(false)
  const valid = isSafeHouseholdName(householdName) && isSafeAlias(alias) && acknowledged
  function submit(event: FormEvent) { event.preventDefault(); if (valid) props.onInitialize(householdName, alias) }
  return <form className="pairing-form" onSubmit={submit}>
    <label className="field"><span>Household name (privacy-safe, shown to both of you)</span><input value={householdName} maxLength={60} onChange={(event) => setHouseholdName(event.target.value)} placeholder="For example: Our apartment" /></label>
    <label className="field"><span>Your alias (no email address)</span><input value={alias} maxLength={40} onChange={(event) => setAlias(event.target.value)} placeholder="How your partner will see you" /></label>
    {householdName.includes('@') || alias.includes('@') ? <p className="notice warn">Aliases and household names cannot contain an email address.</p> : null}
    <label className="ack"><input type="checkbox" checked={acknowledged} onChange={(event) => setAcknowledged(event.target.checked)} /> I understand that as coordinator I am the one who closes each month. This role stays with my account.</label>
    <div className="button-row"><button className="btn primary" type="submit" disabled={!valid || props.busy}>Set up this household</button></div>
  </form>
}

function JoinForm(props: { pairing: HouseholdPairing; busy: boolean; onJoin: (alias: string) => void }) {
  const [alias, setAlias] = useState('')
  const valid = isSafeAlias(alias)
  function submit(event: FormEvent) { event.preventDefault(); if (valid) props.onJoin(alias) }
  return <form className="pairing-form" onSubmit={submit}>
    <label className="field"><span>Your alias (no email address)</span><input value={alias} maxLength={40} onChange={(event) => setAlias(event.target.value)} placeholder="How the coordinator will see you" /></label>
    {alias.includes('@') ? <p className="notice warn">Aliases cannot contain an email address.</p> : null}
    <div className="button-row"><button className="btn primary" type="submit" disabled={!valid || props.busy}>Join as partner</button></div>
    <p className="fine-print">Joining binds your account to the partner role for this household permanently. Only the two paired accounts can read or change shared monthly records.</p>
  </form>
}

function InvitePanel(props: { invitations: InvitationSurface }) {
  const [emailAddress, setEmailAddress] = useState('')
  const [sending, setSending] = useState(false)
  const [note, setNote] = useState<string | null>(null)
  async function send(event: FormEvent) {
    event.preventDefault()
    if (!emailAddress.includes('@')) return
    setSending(true); setNote(null)
    try { await props.invitations.invite(emailAddress); setEmailAddress(''); setNote('Invitation sent through Clerk. Your partner accepts it, selects this household, then chooses Join as partner.') }
    catch (error) { setNote(error instanceof Error ? error.message : 'The invitation could not be sent.') }
    finally { setSending(false) }
  }
  return <section className="panel invite-card">
    <p className="eyebrow">Invite partner</p>
    <h2>Invite exactly one partner</h2>
    <p>The invitation email goes through Clerk, the sign-in service. It grants household membership only; your partner still has to choose <strong>Join as partner</strong> here before any shared record is visible to them.</p>
    <form className="pairing-form" onSubmit={send}>
      <label className="field"><span>Partner’s email address</span><input type="email" value={emailAddress} onChange={(event) => setEmailAddress(event.target.value)} placeholder="partner@example.com" /></label>
      <div className="button-row"><button className="btn primary" type="submit" disabled={sending || !emailAddress.includes('@')}>Send invitation</button><button className="btn ghost" type="button" onClick={() => void props.invitations.refresh()}>Check invitation status</button></div>
    </form>
    {note ? <p className="notice good" role="status">{note}</p> : null}
    {props.invitations.pending.length ? <ul className="invitation-list" aria-label="Pending invitations">{props.invitations.pending.map(function (invitation) { return <li key={invitation.id}><span>{invitation.emailAddress}</span><span className="status-chip warn">{invitation.status}</span></li> })}</ul> : <p className="fine-print">No pending invitation. Email addresses are held by Clerk only and are never stored in Split Ledger’s shared records.</p>}
  </section>
}

export default function HouseholdPairingScreen(props: {
  pairing: HouseholdPairing | null
  error: string | null
  busy: boolean
  onInitialize: (householdName: string, alias: string) => void
  onJoin: (alias: string) => void
  onRefresh: () => void
  invitations?: InvitationSurface
}) {
  const pairing = props.pairing
  const viewer = pairing?.viewer
  const isCoordinator = viewer?.kind === 'participant' && viewer.role === 'coordinator'
  return <main className="pairing-page" aria-labelledby="pairing-title">
    <div className="pairing-card">
      <p className="eyebrow">Household pairing</p>
      {!pairing ? <><h1 id="pairing-title">Checking who is paired…</h1><p>{props.error || 'Loading the household pairing from the server.'}</p></> : null}

      {pairing?.state === 'uninitialized' ? <>
        <h1 id="pairing-title">Split Ledger is not set up for this household yet</h1>
        {viewer?.kind === 'member' && viewer.canInitialize
          ? <><p>You are an administrator of this household. Setting it up makes your account the stable <strong>coordinator</strong>: you invite one partner, and you are the one who closes each month. Both of you keep your private ledgers in your own browsers.</p><p className="fine-print">{PRIVACY_TEXT}</p><InitializeForm busy={props.busy} onInitialize={props.onInitialize} /></>
          : <p>Only a household administrator can set it up. Ask the person who created this household in the sign-in service to open Split Ledger and choose <strong>Set up this household</strong>, or check that you selected the intended household above.</p>}
      </> : null}

      {pairing?.state === 'coordinator-only' ? <>
        <h1 id="pairing-title">{isCoordinator ? 'Waiting for your partner' : 'You are invited to pair with ' + (pairing.coordinator?.alias || 'the coordinator')}</h1>
        <PairingSummary pairing={pairing} />
        {isCoordinator ? <>{props.invitations ? <InvitePanel invitations={props.invitations} /> : <p>Invite your partner from the household members page in the sign-in service, then wait for them to choose <strong>Join as partner</strong>.</p>}</> : null}
        {viewer?.kind === 'member' && viewer.canJoinAsPartner ? <><p><strong>{pairing.coordinator?.alias}</strong> set up the household <strong>{pairing.householdName}</strong> and is waiting for a partner. Confirm this is the household you were invited to before joining.</p><p className="fine-print">{PRIVACY_TEXT}</p><JoinForm pairing={pairing} busy={props.busy} onJoin={props.onJoin} /></> : null}
      </> : null}

      {pairing?.state === 'paired' ? <>
        <h1 id="pairing-title">{viewer?.kind === 'participant' ? 'Household paired' : 'This household already has two participants'}</h1>
        <PairingSummary pairing={pairing} />
        {viewer?.kind === 'member' ? <p>Household membership in the sign-in service does not grant access to shared financial records. Only the coordinator and partner above can see or change monthly submissions, settlements, and archives. If you expected to be one of them, check that you selected the intended household, or contact support.</p> : null}
      </> : null}

      {props.error && pairing ? <p className="notice error" role="alert">{props.error}</p> : null}
      <div className="button-row pairing-actions"><button className="btn ghost" type="button" onClick={props.onRefresh} disabled={props.busy}>Check latest pairing</button></div>
    </div>
  </main>
}
