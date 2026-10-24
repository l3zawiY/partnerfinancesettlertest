import { OrganizationSwitcher, Show, SignInButton, UserButton, useAuth } from '@clerk/react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import type { HouseholdPairing } from '../shared/pairing'
import { draftStorageKey } from '../shared/session'
import { getAuthenticatedIdentity, getHousehold, NoActiveHouseholdError } from './api'
import HouseholdPairingScreen from './HouseholdPairingScreen'
import { ApiPairingGateway } from './pairing/ApiPairingGateway'
import { useClerkInvitations } from './useClerkInvitations'
import Workspace from './Workspace'
import { ApiWorkflowGateway } from './workflow/ApiWorkflowGateway'

type Connection = 'checking' | 'ready' | 'no-household' | 'error'

function PairingWithClerkInvitations(props: { pairing: HouseholdPairing | null; error: string | null; busy: boolean; onInitialize: (householdName: string, alias: string) => void; onJoin: (alias: string) => void; onRefresh: () => void }) {
  const invitations = useClerkInvitations()
  return <HouseholdPairingScreen {...props} invitations={invitations} />
}

function accountStatus(connection: Connection, pairing: HouseholdPairing | null): string {
  if (connection === 'checking') return 'Checking access…'
  if (connection === 'no-household') return 'Choose a household'
  if (connection === 'error') return 'Connection unavailable'
  if (!pairing) return 'Checking household pairing…'
  if (pairing.state === 'paired' && pairing.viewer.kind === 'participant') return pairing.householdName + ' · 2 of 2 connected · you are the ' + pairing.viewer.role
  if (pairing.state === 'paired') return 'Household already has two participants'
  if (pairing.state === 'coordinator-only') return (pairing.householdName || 'Household') + ' · 1 of 2 connected'
  return 'Household not set up yet'
}

function SignedInApplication() {
  const { getToken, userId, orgId } = useAuth()
  const [connection, setConnection] = useState<Connection>('checking')
  const [pairing, setPairing] = useState<HouseholdPairing | null>(null)
  const [pairingError, setPairingError] = useState<string | null>(null)
  const [pairingBusy, setPairingBusy] = useState(false)

  useEffect(function () {
    let active = true
    setConnection('checking')
    setPairing(null)
    Promise.all([getAuthenticatedIdentity(getToken), getHousehold(getToken)])
      .then(function () { if (active) setConnection('ready') })
      .catch(function (error) { if (active) setConnection(error instanceof NoActiveHouseholdError ? 'no-household' : 'error') })
    return function () { active = false }
  }, [getToken, orgId])

  const gateway = useMemo(function () {
    return userId && orgId ? new ApiWorkflowGateway(getToken) : null
  }, [getToken, userId, orgId])
  const pairingGateway = useMemo(function () {
    return userId && orgId ? new ApiPairingGateway(getToken) : null
  }, [getToken, userId, orgId])

  const runPairing = useCallback(function (action: () => Promise<HouseholdPairing>) {
    setPairingBusy(true); setPairingError(null)
    return action()
      .then(function (next) { setPairing(next) })
      .catch(function (error) { setPairingError(error instanceof Error ? error.message : 'The household pairing service is unavailable.') })
      .finally(function () { setPairingBusy(false) })
  }, [])

  useEffect(function () {
    if (connection !== 'ready' || !pairingGateway) return
    void runPairing(function () { return pairingGateway.getPairing() })
  }, [connection, pairingGateway, runPairing])

  const pairedParticipant = pairing?.state === 'paired' && pairing.viewer.kind === 'participant' ? pairing : null

  return <>
    <div className="account-bar"><div className="account-inner"><span className="experiment-label">Web-service experiment · fictional data only</span><span className="account-spacer" /><div className="account"><span>{accountStatus(connection, pairing)}</span><OrganizationSwitcher hidePersonal /><UserButton /></div></div></div>
    {!gateway || !userId || !orgId
      ? <div className="signed-out-card"><p className="eyebrow">Household required</p><h1>Select or join a household</h1><p>If you created this household, invite your partner from Clerk. If you were invited, accept that invitation and select the existing household—do not create a second one.</p><p className="fine-print">Clerk proves membership. The Worker separately enforces which household records that verified membership may use.</p></div>
      : connection !== 'ready'
        ? <div className="signed-out-card"><p className="eyebrow">{connection === 'checking' ? 'Checking access' : 'Household access'}</p><h1>{connection === 'checking' ? 'Checking access…' : connection === 'no-household' ? 'Select or join a household' : 'Connection unavailable'}</h1><p>{connection === 'error' ? 'The local Worker did not answer. Restart the development server and reload.' : 'Choose the intended household in the switcher above.'}</p></div>
        : pairedParticipant && pairingGateway
          ? <Workspace key={userId + orgId} scopeKey={draftStorageKey(userId, orgId)} gateway={gateway} administration={gateway} connected householdReady pairing={pairedParticipant} onRefreshPairing={() => runPairing(function () { return pairingGateway.getPairing() })} />
          : <PairingWithClerkInvitations pairing={pairing} error={pairingError} busy={pairingBusy} onInitialize={(householdName, alias) => void runPairing(function () { return pairingGateway!.initialize(householdName, alias) })} onJoin={(alias) => void runPairing(function () { return pairingGateway!.joinAsPartner(alias) })} onRefresh={() => void runPairing(function () { return pairingGateway!.getPairing() })} />}
  </>
}

export default function App() {
  return <><Show when="signed-out"><main className="signed-out-card"><div className="signed-out-brand"><span className="brand-mark" aria-hidden="true">S</span><strong>Split Ledger</strong></div><p className="eyebrow">Web-service experiment</p><h1>Settle a month together</h1><p>Sign in to open the household workspace. Use fictional data only during this experiment.</p><SignInButton mode="modal"><button className="primary" type="button">Sign in</button></SignInButton></main></Show><Show when="signed-in"><SignedInApplication /></Show></>
}
