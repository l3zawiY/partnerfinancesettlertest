import {
  OrganizationSwitcher,
  Show,
  SignInButton,
  UserButton,
  useAuth,
} from '@clerk/react'
import { useEffect, useState } from 'react'
import type { HouseholdResponse } from '../shared/api'
import { getAuthenticatedIdentity, getHousehold, NoActiveHouseholdError } from './api'

type ConnectionState =
  | { status: 'checking' }
  | { status: 'connected'; userId: string }
  | { status: 'error'; message: string }

function BackendConnection() {
  const { getToken } = useAuth()
  const [connection, setConnection] = useState<ConnectionState>({ status: 'checking' })

  useEffect(() => {
    let active = true

    getAuthenticatedIdentity(getToken)
      .then((identity) => {
        if (active) setConnection({ status: 'connected', userId: identity.userId })
      })
      .catch((error: unknown) => {
        const message = error instanceof Error ? error.message : 'Unknown connection error.'
        if (active) setConnection({ status: 'error', message })
      })

    return () => {
      active = false
    }
  }, [getToken])

  if (connection.status === 'checking') {
    return <p className="status status-pending">Checking the protected backend…</p>
  }

  if (connection.status === 'error') {
    return <p className="status status-error">{connection.message}</p>
  }

  return (
    <div className="status status-success">
      <strong>Authentication verified</strong>
      <span>The Worker accepted your Clerk session.</span>
      <code>{connection.userId}</code>
    </div>
  )
}

type HouseholdState =
  | { status: 'checking' }
  | { status: 'ready'; household: HouseholdResponse }
  | { status: 'no-household' }
  | { status: 'error'; message: string }

function HouseholdPanel() {
  const { getToken, orgId } = useAuth()
  const [state, setState] = useState<HouseholdState>({ status: 'checking' })

  // Re-runs when the active organization changes, so switching household reloads the
  // household the server is willing to show for the new session.
  useEffect(() => {
    let active = true
    setState({ status: 'checking' })

    getHousehold(getToken)
      .then((household) => {
        if (active) setState({ status: 'ready', household })
      })
      .catch((error: unknown) => {
        if (!active) return
        if (error instanceof NoActiveHouseholdError) {
          setState({ status: 'no-household' })
          return
        }
        const message = error instanceof Error ? error.message : 'Unknown household error.'
        setState({ status: 'error', message })
      })

    return () => {
      active = false
    }
  }, [getToken, orgId])

  if (state.status === 'checking') {
    return <p className="status status-pending">Checking your household…</p>
  }

  if (state.status === 'no-household') {
    return (
      <p className="status status-pending">
        No household selected. Create or choose one above to continue.
      </p>
    )
  }

  if (state.status === 'error') {
    return <p className="status status-error">{state.message}</p>
  }

  return (
    <div className="status status-success">
      <strong>Household authorized</strong>
      <span>
        The Worker matched this session to one household and returned only its records.
      </span>
      <code>{state.household.householdId}</code>
      <span className="household-meta">
        {state.household.notes.length} shared test record
        {state.household.notes.length === 1 ? '' : 's'} · created{' '}
        {state.household.createdAt.slice(0, 10)}
      </span>
    </div>
  )
}

export default function App() {
  return (
    <main className="page-shell">
      <section className="auth-card">
        <div className="brand-mark" aria-hidden="true">S</div>
        <p className="eyebrow">Web-service experiment · Batch 2</p>
        <h1>Split Ledger</h1>
        <p className="lede">
          The frontend, Clerk identity, and a protected Cloudflare Worker are connected,
          and the Worker now decides which household a session may read. No financial data
          is involved.
        </p>

        <Show when="signed-out">
          <div className="signed-out">
            <p>Sign in to test the protected application boundary.</p>
            <SignInButton mode="modal">
              <button className="primary-button" type="button">Sign in</button>
            </SignInButton>
          </div>
        </Show>

        <Show when="signed-in">
          <div className="signed-in">
            <div className="account-row">
              <span>Clerk session active</span>
              <UserButton />
            </div>
            <div className="account-row">
              <span>Household</span>
              <OrganizationSwitcher hidePersonal />
            </div>
            <BackendConnection />
            <HouseholdPanel />
          </div>
        </Show>
      </section>
    </main>
  )
}
