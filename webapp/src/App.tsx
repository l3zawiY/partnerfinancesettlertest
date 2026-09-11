import { OrganizationSwitcher, Show, SignInButton, UserButton, useAuth } from '@clerk/react'
import { useEffect, useMemo, useState } from 'react'
import { draftStorageKey } from '../shared/session'
import { getAuthenticatedIdentity, getHousehold, NoActiveHouseholdError } from './api'
import Workspace from './Workspace'
import { ApiWorkflowGateway } from './workflow/ApiWorkflowGateway'

type Connection = 'checking' | 'ready' | 'no-household' | 'error'

function SignedInApplication() {
  const { getToken, userId, orgId } = useAuth()
  const [connection, setConnection] = useState<Connection>('checking')
  useEffect(function () {
    let active = true
    setConnection('checking')
    Promise.all([getAuthenticatedIdentity(getToken), getHousehold(getToken)])
      .then(function () { if (active) setConnection('ready') })
      .catch(function (error) { if (active) setConnection(error instanceof NoActiveHouseholdError ? 'no-household' : 'error') })
    return function () { active = false }
  }, [getToken, orgId])

  const gateway = useMemo(function () {
    return userId && orgId ? new ApiWorkflowGateway(getToken) : null
  }, [getToken, userId, orgId])

  return <>
    <div className="account-bar"><div className="account-inner"><span className="experiment-label">Web-service experiment · fictional data only</span><span className="account-spacer" /><div className="account"><span>{connection === 'ready' ? 'Household authorized · signing out does not erase this browser’s private draft' : connection === 'checking' ? 'Checking access…' : connection === 'no-household' ? 'Choose a household' : 'Connection unavailable'}</span><OrganizationSwitcher hidePersonal /><UserButton /></div></div></div>
    {gateway && userId && orgId ? <Workspace key={userId + orgId} scopeKey={draftStorageKey(userId, orgId)} gateway={gateway} administration={gateway} connected householdReady={connection === 'ready'} /> : <div className="signed-out-card"><p className="eyebrow">Household required</p><h1>Select or join a household</h1><p>If you created this household, invite your partner from Clerk. If you were invited, accept that invitation and select the existing household—do not create a second one.</p><p className="fine-print">Clerk proves membership. The Worker separately enforces which household records that verified membership may use.</p></div>}
  </>
}

export default function App() {
  return <><Show when="signed-out"><main className="signed-out-card"><div className="signed-out-brand"><span className="brand-mark" aria-hidden="true">S</span><strong>Split Ledger</strong></div><p className="eyebrow">Web-service experiment</p><h1>Settle a month together</h1><p>Sign in to open the household workspace. Use fictional data only during this experiment.</p><SignInButton mode="modal"><button className="primary" type="button">Sign in</button></SignInButton></main></Show><Show when="signed-in"><SignedInApplication /></Show></>
}
