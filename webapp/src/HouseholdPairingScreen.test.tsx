import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { HouseholdPairing } from '../shared/pairing'
import HouseholdPairingScreen, { type InvitationSurface } from './HouseholdPairingScreen'

const NOW = '2026-09-01T00:00:00.000Z'
const uninitializedAdmin: HouseholdPairing = { state: 'uninitialized', householdName: null, coordinator: null, partner: null, viewer: { kind: 'member', canInitialize: true, canJoinAsPartner: false }, connected: 0, recoveryRequiredPeriods: [] }
const coordinatorOnly: HouseholdPairing = { state: 'coordinator-only', householdName: 'Fictional Household', coordinator: { role: 'coordinator', alias: 'Fictional A', joinedAt: NOW }, partner: null, viewer: { kind: 'participant', role: 'coordinator', alias: 'Fictional A' }, connected: 1, recoveryRequiredPeriods: [] }
const invitedMember: HouseholdPairing = { ...coordinatorOnly, viewer: { kind: 'member', canInitialize: false, canJoinAsPartner: true } }
const paired: HouseholdPairing = { ...coordinatorOnly, state: 'paired', partner: { role: 'partner', alias: 'Fictional B', joinedAt: NOW }, viewer: { kind: 'participant', role: 'partner', alias: 'Fictional B' }, connected: 2 }

function handlers() { return { onInitialize: vi.fn(), onJoin: vi.fn(), onRefresh: vi.fn() } }

describe('household pairing screen', function () {
  it('lets an administrator set up the household only after acknowledging the coordinator role', async function () {
    const user = userEvent.setup()
    const on = handlers()
    render(<HouseholdPairingScreen pairing={uninitializedAdmin} error={null} busy={false} {...on} />)
    expect(screen.getByRole('heading', { name: /not set up for this household yet/ })).toBeVisible()
    const setUp = screen.getByRole('button', { name: 'Set up this household' })
    await user.type(screen.getByLabelText(/Household name/), 'Fictional Household')
    await user.type(screen.getByLabelText(/Your alias/), 'person@example.com')
    expect(screen.getByText(/cannot contain an email address/)).toBeVisible()
    expect(setUp).toBeDisabled()
    await user.clear(screen.getByLabelText(/Your alias/))
    await user.type(screen.getByLabelText(/Your alias/), 'Fictional A')
    expect(setUp).toBeDisabled()
    await user.click(screen.getByLabelText(/I understand that as coordinator/))
    expect(setUp).toBeEnabled()
    await user.click(setUp)
    expect(on.onInitialize).toHaveBeenCalledWith('Fictional Household', 'Fictional A')
  })

  it('tells a non-administrator to ask the administrator and offers no setup form', function () {
    render(<HouseholdPairingScreen pairing={{ ...uninitializedAdmin, viewer: { kind: 'member', canInitialize: false, canJoinAsPartner: false } }} error={null} busy={false} {...handlers()} />)
    expect(screen.getByText(/Only a household administrator can set it up/)).toBeVisible()
    expect(screen.queryByRole('button', { name: 'Set up this household' })).not.toBeInTheDocument()
  })

  it('shows the coordinator 1 of 2 connected and sends the invitation only through the Clerk surface', async function () {
    const user = userEvent.setup()
    const invitations: InvitationSurface = { invite: vi.fn(async () => {}), pending: [{ id: 'inv_1', emailAddress: 'partner@example.com', status: 'pending' }], refresh: vi.fn(async () => {}) }
    render(<HouseholdPairingScreen pairing={coordinatorOnly} error={null} busy={false} {...handlers()} invitations={invitations} />)
    expect(screen.getByRole('heading', { name: 'Waiting for your partner' })).toBeVisible()
    expect(screen.getByLabelText('Connection state')).toHaveTextContent('1 of 2 connected — waiting for partner')
    expect(screen.getByText('Fictional A')).toBeVisible()
    expect(screen.getByText('Vacant')).toBeVisible()
    const list = screen.getByRole('list', { name: 'Pending invitations' })
    expect(within(list).getByText('partner@example.com')).toBeVisible()
    await user.type(screen.getByLabelText(/Partner’s email address/), 'second@example.com')
    await user.click(screen.getByRole('button', { name: 'Send invitation' }))
    expect(invitations.invite).toHaveBeenCalledWith('second@example.com')
    expect(await screen.findByText(/Invitation sent through Clerk/)).toBeVisible()
    await user.click(screen.getByRole('button', { name: 'Check invitation status' }))
    expect(invitations.refresh).toHaveBeenCalled()
    expect(screen.queryByRole('button', { name: 'Join as partner' })).not.toBeInTheDocument()
  })

  it('shows the invited member who is offering the pairing and joins with an explicit alias', async function () {
    const user = userEvent.setup()
    const on = handlers()
    render(<HouseholdPairingScreen pairing={invitedMember} error={null} busy={false} {...on} />)
    expect(screen.getByRole('heading', { name: 'You are invited to pair with Fictional A' })).toBeVisible()
    expect(screen.getByText(/keeps their complete bank history/)).toBeVisible()
    const join = screen.getByRole('button', { name: 'Join as partner' })
    expect(join).toBeDisabled()
    await user.type(screen.getByLabelText(/Your alias/), 'Fictional B')
    await user.click(join)
    expect(on.onJoin).toHaveBeenCalledWith('Fictional B')
    expect(screen.queryByText(/Send invitation/)).not.toBeInTheDocument()
  })

  it('shows both participants the same 2 of 2 summary and refuses a third member plainly', function () {
    const { unmount } = render(<HouseholdPairingScreen pairing={paired} error={null} busy={false} {...handlers()} />)
    expect(screen.getByLabelText('Connection state')).toHaveTextContent('2 of 2 connected')
    expect(screen.getByText('Fictional Household')).toBeVisible()
    expect(screen.getByText('Fictional A')).toBeVisible()
    expect(screen.getByText('Fictional B')).toBeVisible()
    expect(screen.getByText('you')).toBeVisible()
    unmount()
    render(<HouseholdPairingScreen pairing={{ ...paired, viewer: { kind: 'member', canInitialize: false, canJoinAsPartner: false } }} error="This household already has two Split Ledger participants." busy={false} {...handlers()} />)
    expect(screen.getByRole('heading', { name: 'This household already has two participants' })).toBeVisible()
    expect(screen.getByText(/does not grant access to shared financial records/)).toBeVisible()
    expect(screen.queryByRole('button', { name: 'Join as partner' })).not.toBeInTheDocument()
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
  })

  it('surfaces recovery-required months without changing anything and offers a manual recheck', async function () {
    const user = userEvent.setup()
    const on = handlers()
    render(<HouseholdPairingScreen pairing={{ ...paired, recoveryRequiredPeriods: ['2026-06'] }} error={null} busy={false} {...on} />)
    expect(screen.getByRole('status')).toHaveTextContent(/Recovery required for 2026-06/)
    expect(screen.getByRole('status')).toHaveTextContent(/Nothing was changed or deleted/)
    await user.click(screen.getByRole('button', { name: 'Check latest pairing' }))
    expect(on.onRefresh).toHaveBeenCalled()
  })
})
