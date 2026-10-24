import { fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { HouseholdPairing } from '../shared/pairing'
import { fictionalPartnerProjection } from './testing/fictionalFixtures'
import { FIXTURE_ALIASES, PairedFixtureServer } from './testing/PairedFixtureServer'
import Workspace from './Workspace'

const FIXTURE_PAIRING: HouseholdPairing = {
  state: 'paired',
  householdName: 'Fictional Household',
  coordinator: { role: 'coordinator', alias: FIXTURE_ALIASES.coordinator, joinedAt: '2026-08-01T00:00:00.000Z' },
  partner: { role: 'partner', alias: FIXTURE_ALIASES.partner, joinedAt: '2026-08-01T00:00:00.000Z' },
  viewer: { kind: 'participant', role: 'partner', alias: FIXTURE_ALIASES.partner },
  connected: 2,
  recoveryRequiredPeriods: [],
}

const CLOCK = function () { return '2026-08-01T09:30:00.000Z' }

/** Renders the partner's browser, imports two fictional BMO rows, and decides them 50/50. */
async function preparePartner(user: ReturnType<typeof userEvent.setup>, server: PairedFixtureServer, intervalMs: number) {
  const view = render(<Workspace scopeKey={'paired-partner-' + intervalMs} gateway={server.as('partner')} connected now={CLOCK} statusCheckIntervalMs={intervalMs} />)
  await user.click(screen.getByRole('tab', { name: 'Import' }))
  await user.click(screen.getByRole('button', { name: 'Load fictional BMO sample' }))
  await user.click(screen.getByRole('button', { name: 'Parse and add' }))
  expect(await screen.findByText(/Added 2/)).toBeVisible()
  await user.click(screen.getByRole('tab', { name: 'Review' }))
  for (const merchant of ['Sample Grocer', 'Sample Pharmacy']) {
    const article = screen.getByText(merchant).closest('article')!
    await user.click(within(article).getByRole('button', { name: '50/50' }))
  }
  await user.click(screen.getByRole('tab', { name: 'Share / Status' }))
  return view
}

describe('paired two-person workspace', function () {
  it('hands the month over visibly, orients both viewers identically, and lets only the coordinator close', async function () {
    const user = userEvent.setup()
    const server = new PairedFixtureServer(CLOCK)
    const partnerView = await preparePartner(user, server, 60_000)
    expect(screen.getByRole('heading', { name: 'Nothing submitted yet' })).toBeVisible()
    expect(screen.getByText('Your submission as Fictional B')).toBeVisible()

    await user.click(screen.getByRole('button', { name: 'Submit shared projection' }))
    expect(await screen.findByRole('heading', { name: 'Waiting for Fictional A' })).toBeVisible()
    expect(screen.getByText(/Waiting for Fictional A to submit\./)).toBeVisible()
    expect(screen.getByText(/Version 1 · submitted/)).toBeVisible()
    expect(screen.getByText(/^I submitted July 2026 in Split Ledger\. Your turn when you have 15 minutes: http/)).toBeVisible()
    expect(screen.getByRole('button', { name: 'Copy message' })).toBeVisible()
    expect(screen.getByRole('link', { name: 'Email' }).getAttribute('href')).toMatch(/^mailto:\?subject=Split%20Ledger%3A%20your%20turn%20for%20July%202026&body=I%20submitted/)

    server.submit('coordinator', fictionalPartnerProjection('2026-07'), null, 'submit')
    await user.click(screen.getByRole('button', { name: 'Check latest status' }))
    expect((await screen.findAllByText('Both submissions ready')).length).toBeGreaterThanOrEqual(1)
    expect(screen.getByText(/Shared status updated while you were here\. Fictional A submitted \(version 2/)).toBeVisible()
    expect(screen.getByText(/Fictional A: version 2, submitted/)).toBeVisible()
    expect(screen.getByText(/Fictional A reviews the settlement and closes the month/)).toBeVisible()
    expect(screen.getByText(/Both sides are in, so you can review and close it/)).toBeVisible()
    expect(screen.getByText(/Last checked/)).toBeVisible()

    await user.click(screen.getByRole('button', { name: 'Continue to Settle' }))
    expect(screen.getByRole('heading', { name: 'Fictional B pays Fictional A $16.79' })).toBeVisible()
    expect(screen.queryByRole('button', { name: 'Close month and archive' })).not.toBeInTheDocument()
    expect(screen.getByText(function (_content, element) { return element?.tagName === 'P' && /Only the coordinator, Fictional A, can close this month/.test(element.textContent || '') })).toBeVisible()
    expect(screen.getByText('Waiting for Fictional A to close')).toBeVisible()
    partnerView.unmount()

    render(<Workspace scopeKey="paired-coordinator" gateway={server.as('coordinator')} connected now={CLOCK} statusCheckIntervalMs={60_000} />)
    fireEvent.change(screen.getByLabelText('Header reconciliation month'), { target: { value: '2026-07' } })
    await user.click(screen.getByRole('tab', { name: 'Share / Status' }))
    expect((await screen.findAllByText('Both submissions ready')).length).toBeGreaterThanOrEqual(1)
    expect(screen.getByText('Your submission as Fictional A')).toBeVisible()
    expect(screen.getByText(/Fictional B: version 1, submitted/)).toBeVisible()
    expect(screen.getByText(/You review the settlement and close the month/)).toBeVisible()
    expect(screen.queryByRole('button', { name: 'Copy message' })).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Continue to Settle' }))
    expect(screen.getByRole('heading', { name: 'Fictional B pays Fictional A $16.79' })).toBeVisible()
    expect(screen.getByRole('button', { name: 'Close month and archive' })).toBeInTheDocument()
    expect(screen.queryByText(/Only the coordinator/)).not.toBeInTheDocument()
  }, 20000)

  it('recovers from a real stale conflict without losing private work or getting stuck', async function () {
    const user = userEvent.setup()
    const server = new PairedFixtureServer(CLOCK)
    await preparePartner(user, server, 60_000)
    await user.click(screen.getByRole('button', { name: 'Submit shared projection' }))
    await screen.findByRole('heading', { name: 'Waiting for Fictional A' })

    // The coordinator acts in another browser; this tab still believes version 1 is current.
    server.submit('coordinator', fictionalPartnerProjection('2026-07'), null, 'submit')
    await user.click(screen.getByRole('button', { name: 'Withdraw' }))
    expect((await screen.findAllByText(/Shared status changed/)).length).toBeGreaterThanOrEqual(1)
    expect(screen.getByText(/Your private draft in this browser is safe and unchanged/)).toBeVisible()
    expect(screen.getByRole('button', { name: 'Withdraw' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Replace submission' })).toBeDisabled()
    // The rejected withdrawal was not replayed: the partner submission still stands.
    expect(server.view('2026-07', 'partner').mine).not.toBeNull()

    await user.click(screen.getByRole('button', { name: 'Load latest shared status' }))
    expect(await screen.findByText(/Loaded the latest shared status\. Your private draft was not changed\. Fictional A submitted \(version 2/)).toBeVisible()
    expect(screen.queryByText(/Shared status changed/)).not.toBeInTheDocument()
    expect((await screen.findAllByText('Both submissions ready')).length).toBeGreaterThanOrEqual(1)
    expect(screen.getByRole('button', { name: 'Withdraw' })).toBeEnabled()

    // Explicit retry, then an ordinary same-tab resubmit: neither becomes stale.
    await user.click(screen.getByRole('button', { name: 'Withdraw' }))
    expect(await screen.findByText('Withdrawn')).toBeVisible()
    expect(screen.getByText(/Version 3/)).toBeVisible()
    expect(screen.getByText(/Your submission is needed\./)).toBeVisible()
    await user.click(screen.getByRole('button', { name: 'Submit shared projection' }))
    expect((await screen.findAllByText('Both submissions ready')).length).toBeGreaterThanOrEqual(1)
    expect(screen.getByText(/Version 4 · submitted/)).toBeVisible()
    expect(screen.queryByText(/Shared status changed/)).not.toBeInTheDocument()

    // The private ledger in this browser never moved.
    await user.click(screen.getByRole('tab', { name: 'Review' }))
    expect(screen.getByText('Sample Grocer')).toBeVisible()
    expect(screen.getByText('Sample Pharmacy')).toBeVisible()
  }, 20000)

  it('checks the server automatically while visible and never writes on its own', async function () {
    const user = userEvent.setup()
    const server = new PairedFixtureServer(CLOCK)
    await preparePartner(user, server, 40)
    await user.click(screen.getByRole('button', { name: 'Submit shared projection' }))
    await screen.findByRole('heading', { name: 'Waiting for Fictional A' })
    const writesAfterSubmit = server.writes
    const readsAfterSubmit = server.reads

    server.submit('coordinator', fictionalPartnerProjection('2026-07'), null, 'submit')
    expect((await screen.findAllByRole('heading', { name: 'Both submissions ready' }, { timeout: 3000 })).length).toBeGreaterThanOrEqual(1)
    expect(screen.getByText(/Shared status updated while you were here\. Fictional A submitted/)).toBeVisible()
    expect(server.writes).toBe(writesAfterSubmit + 1)
    expect(server.reads).toBeGreaterThan(readsAfterSubmit)

    // Leaving the watched screens stops the checks.
    await user.click(screen.getByRole('tab', { name: 'Setup' }))
    const readsOnSetup = server.reads
    await new Promise(function (resolve) { setTimeout(resolve, 150) })
    expect(server.reads).toBe(readsOnSetup)
    expect(server.writes).toBe(writesAfterSubmit + 1)
  }, 20000)

  it('greets Review with the server-bound aliases once paired, never a name typed in Setup', async function () {
    const user = userEvent.setup()
    const server = new PairedFixtureServer(CLOCK)
    render(<Workspace scopeKey="paired-review-identity" gateway={server.as('partner')} connected pairing={FIXTURE_PAIRING} now={CLOCK} statusCheckIntervalMs={60_000} />)

    await user.click(screen.getByRole('tab', { name: 'Review' }))
    expect(screen.getByText('Decide how each purchase should be shared between Fictional B and Fictional A.')).toBeVisible()

    // Renaming the private Setup fields must not change what Review, or the masthead, say.
    await user.click(screen.getByRole('tab', { name: 'Setup' }))
    await user.clear(screen.getByLabelText('First person'))
    await user.type(screen.getByLabelText('First person'), 'Renamed Locally')
    expect(document.querySelector('.who')?.textContent).toContain('Fictional B')
    expect(document.querySelector('.who')?.textContent).not.toContain('Renamed Locally')

    await user.click(screen.getByRole('tab', { name: 'Review' }))
    expect(screen.getByText('Decide how each purchase should be shared between Fictional B and Fictional A.')).toBeVisible()
    expect(screen.queryByText(/Renamed Locally/)).not.toBeInTheDocument()
  })

  it('falls back to the typed Setup names in Review before any pairing exists', async function () {
    const user = userEvent.setup()
    const server = new PairedFixtureServer(CLOCK)
    render(<Workspace scopeKey="unpaired-review-identity" gateway={server.as('partner')} connected now={CLOCK} statusCheckIntervalMs={60_000} />)
    await user.click(screen.getByRole('tab', { name: 'Review' }))
    expect(screen.getByText('Decide how each purchase should be shared between Me and Partner.')).toBeVisible()
  })

  it('after closing, offers the coordinator a ready message and a private backup reminder', async function () {
    const user = userEvent.setup()
    Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: vi.fn(function () { return 'blob:fictional' }) })
    Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: vi.fn() })
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function () {})
    const server = new PairedFixtureServer(CLOCK)
    server.submit('partner', fictionalPartnerProjection('2026-07'), null, 'submit')
    server.submit('coordinator', fictionalPartnerProjection('2026-07'), null, 'submit')
    await server.as('coordinator').close('2026-07', server.view('2026-07', 'coordinator').version)
    render(<Workspace scopeKey="paired-closed-coordinator" gateway={server.as('coordinator')} connected now={CLOCK} statusCheckIntervalMs={60_000} />)
    fireEvent.change(screen.getByLabelText('Header reconciliation month'), { target: { value: '2026-07' } })
    await user.click(screen.getByRole('tab', { name: 'Settle' }))
    expect(await screen.findByText(/^July 2026 is closed in Split Ledger: (Fictional A and Fictional B are square|.+ pays .+ \$[\d.]+)\. http/)).toBeVisible()
    expect(screen.getByText(/Keep a private backup\./)).toBeVisible()
    await user.click(screen.getByRole('button', { name: 'Download private session' }))
    expect(screen.getByText(/Private backup downloaded for this month/)).toBeVisible()
  })
})
