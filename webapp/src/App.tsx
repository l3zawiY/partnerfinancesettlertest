import {
  OrganizationSwitcher,
  Show,
  SignInButton,
  UserButton,
  useAuth,
} from '@clerk/react'
import { useEffect, useState } from 'react'
import type { HouseholdResponse, SharedEntriesListResponse } from '../shared/api'
import {
  getAuthenticatedIdentity,
  getHousehold,
  listSharedEntries,
  NoActiveHouseholdError,
  submitSharedEntry,
} from './api'
import Import from './Import'

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

const centsFormatter = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
})

function formatCents(cents: number): string {
  return centsFormatter.format(cents / 100)
}

function directionLabel(direction: SharedEntriesListResponse['settlement']['direction']): string {
  if (direction === 'square') return 'Square — nothing owed either way.'
  if (direction === 'second_owes_first') return 'The second submitter owes the first.'
  if (direction === 'first_owes_second') return 'The first submitter owes the second.'
  return 'Undetermined — needs exactly two submitters to settle.'
}

type EntriesState =
  | { status: 'checking' }
  | { status: 'ready'; list: SharedEntriesListResponse }
  | { status: 'no-household' }
  | { status: 'error'; message: string }

/**
 * Batch 3's vertical slice: submit and list one fictional shared entry per household,
 * with the server-computed settlement shown alongside. Money here is fictional and never
 * reaches an export or archive; it exists to prove the browser-to-D1 path.
 */
function SharedEntriesPanel() {
  const { getToken, orgId } = useAuth()
  const [state, setState] = useState<EntriesState>({ status: 'checking' })
  const [merchant, setMerchant] = useState('')
  const [amount, setAmount] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)

  function reload() {
    let active = true
    setState({ status: 'checking' })

    listSharedEntries(getToken)
      .then((list) => {
        if (active) setState({ status: 'ready', list })
      })
      .catch((error: unknown) => {
        if (!active) return
        if (error instanceof NoActiveHouseholdError) {
          setState({ status: 'no-household' })
          return
        }
        const message = error instanceof Error ? error.message : 'Unknown entries error.'
        setState({ status: 'error', message })
      })

    return () => {
      active = false
    }
  }

  // Re-runs when the active organization changes, same as HouseholdPanel: switching
  // household must show that household's entries, not the previous one's.
  useEffect(reload, [getToken, orgId])

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSubmitError(null)

    const dollars = Number(amount)
    if (!merchant.trim() || !Number.isFinite(dollars) || dollars <= 0) {
      setSubmitError('Enter a merchant name and a positive amount.')
      return
    }

    setSubmitting(true)
    try {
      const list = await submitSharedEntry(getToken, {
        id: crypto.randomUUID(),
        date: new Date().toISOString().slice(0, 10),
        merchant: merchant.trim(),
        category: 'Fictional',
        amountCents: Math.round(dollars * 100),
        share: 0.5,
      })
      setState({ status: 'ready', list })
      setMerchant('')
      setAmount('')
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : 'Submission failed.')
    } finally {
      setSubmitting(false)
    }
  }

  if (state.status === 'checking') {
    return <p className="status status-pending">Checking shared entries…</p>
  }

  if (state.status === 'no-household') {
    return null
  }

  if (state.status === 'error') {
    return <p className="status status-error">{state.message}</p>
  }

  const { entries, settlement } = state.list

  return (
    <div className="entries-panel">
      <form className="entry-form" onSubmit={handleSubmit}>
        <input
          type="text"
          placeholder="Fictional merchant"
          value={merchant}
          onChange={(event) => setMerchant(event.target.value)}
          disabled={submitting}
        />
        <input
          type="number"
          step="0.01"
          min="0"
          placeholder="Amount"
          value={amount}
          onChange={(event) => setAmount(event.target.value)}
          disabled={submitting}
        />
        <button className="primary-button" type="submit" disabled={submitting}>
          {submitting ? 'Submitting…' : 'Submit fictional entry (share 0.5)'}
        </button>
        {submitError ? <p className="status status-error">{submitError}</p> : null}
      </form>

      {entries.length === 0 ? (
        <p className="status status-pending">No fictional entries submitted yet.</p>
      ) : (
        <ul className="entry-list">
          {entries.map((entry) => (
            <li key={entry.id}>
              <span>{entry.merchant}</span>
              <span>{formatCents(entry.amountCents)}</span>
            </li>
          ))}
        </ul>
      )}

      <p className="settlement-summary">
        {directionLabel(settlement.direction)}
        {settlement.netCents !== null ? ' ' + formatCents(settlement.netCents) : ''}
      </p>
    </div>
  )
}

export default function App() {
  return (
    <main className="page-shell">
      <section className="auth-card">
        <div className="brand-mark" aria-hidden="true">S</div>
        <p className="eyebrow">Web-service experiment · Batch 4a</p>
        <h1>Split Ledger</h1>
        <p className="lede">
          The frontend, Clerk identity, and a protected Cloudflare Worker are connected. The
          Worker stores and settles fictional shared entries for a household, and the
          browser can now parse a pasted bank statement locally using the same parsing
          engine as the v1 offline tool.
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
            <SharedEntriesPanel />
            <Import />
          </div>
        </Show>
      </section>
    </main>
  )
}
