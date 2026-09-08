import { Show, SignInButton, UserButton, useAuth } from '@clerk/react'
import { useEffect, useState } from 'react'
import { getAuthenticatedIdentity } from './api'

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

export default function App() {
  return (
    <main className="page-shell">
      <section className="auth-card">
        <div className="brand-mark" aria-hidden="true">S</div>
        <p className="eyebrow">Web-service experiment · Batch 1</p>
        <h1>Split Ledger</h1>
        <p className="lede">
          The first architectural slice connects a React frontend, Clerk identity, and a
          protected Cloudflare Worker. No financial data is involved.
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
            <BackendConnection />
          </div>
        </Show>
      </section>
    </main>
  )
}
